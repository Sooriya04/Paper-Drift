/**
 * @file src/images/raster.js
 * @description Embedded raster image extraction and processing from PDF pages using MuPDF WebAssembly.
 * Handles soft-mask alpha compositing, pixel hashing, deduplication, uniform color filtering, and PNG/JPEG encoding.
 * Part of paper-drift - https://github.com/Sooriya04/Paper-Drift
 */

import { createHash } from 'crypto';
import mupdf from 'mupdf';

export const MIN_PIXELS = 40;
export const MIN_POINTS = 30;
export const MAX_REPEAT_PAGES = 2;
export const SMALL_IMAGE_PAGE_SHARE = 0.15;
export const UNIFORM_SPREAD = 16;
export const SAMPLE_PIXELS = 4096;
export const JPEG_THRESHOLD_BYTES = 250 * 1024;
export const JPEG_WIN_RATIO = 0.6;
export const JPEG_QUALITY = 85;

/**
 * Converts an image to an RGB Pixmap without alpha.
 * @param {Object} image - MuPDF Image instance
 * @returns {Object} MuPDF Pixmap instance (caller must destroy)
 */
export function toRgbPixmap(image) {
  const pixmap = image.toPixmap();
  if (pixmap.getNumberOfComponents() === 3 && !pixmap.getAlpha()) {
    return pixmap;
  }
  try {
    return pixmap.convertToColorSpace(mupdf.ColorSpace.DeviceRGB, false);
  } finally {
    pixmap.destroy();
  }
}

/**
 * Tests whether an image is nearly a single flat color (e.g. drop shadow, solid block, overlay).
 * @param {Object} pixmap - MuPDF Pixmap instance
 * @returns {boolean}
 */
export function isUniform(pixmap) {
  const width = pixmap.getWidth();
  const height = pixmap.getHeight();
  const stride = pixmap.getStride();
  const channels = pixmap.getNumberOfComponents();
  const pixels = pixmap.getPixels();
  const step = Math.max(1, Math.floor((width * height) / SAMPLE_PIXELS));
  const min = [255, 255, 255];
  const max = [0, 0, 0];

  for (let index = 0; index < width * height; index += step) {
    const offset = Math.floor(index / width) * stride + (index % width) * channels;
    for (let channel = 0; channel < 3; channel++) {
      const value = pixels[offset + channel];
      min[channel] = Math.min(min[channel], value);
      max[channel] = Math.max(max[channel], value);
    }
  }

  return max.every((val, channel) => val - min[channel] <= UNIFORM_SPREAD);
}

/**
 * Computes a SHA-1 hex hash of a pixmap's raw pixel data for deduplication across pages.
 * @param {Object} pixmap - MuPDF Pixmap instance
 * @returns {string} SHA-1 hex string
 */
export function hashPixmap(pixmap) {
  return createHash('sha1').update(pixmap.getPixels()).digest('hex');
}

/**
 * Combines an RGB pixmap with its soft mask (alpha channel) into an RGBA pixmap.
 * @param {Object} base - Base RGB Pixmap
 * @param {Object} mask - Mask Image instance
 * @returns {Object} RGBA Pixmap (caller must destroy)
 */
export function compositeWithMask(base, mask) {
  const width = base.getWidth();
  const height = base.getHeight();
  const maskPixmap = typeof mask.toPixmap === 'function' ? mask.toPixmap() : mask;
  const shouldDestroyMask = maskPixmap !== mask && typeof maskPixmap.destroy === 'function';
  const output = new mupdf.Pixmap(mupdf.ColorSpace.DeviceRGB, [0, 0, width, height], true);
  output.clear(255);

  try {
    const maskWidth = maskPixmap.getWidth();
    const maskHeight = maskPixmap.getHeight();
    const maskStride = maskPixmap.getStride();
    const maskChannels = maskPixmap.getNumberOfComponents();
    const baseStride = base.getStride();
    const outputStride = output.getStride();
    const source = base.getPixels();
    const alpha = maskPixmap.getPixels();
    const target = output.getPixels();

    for (let y = 0; y < height; y++) {
      const maskRow = Math.floor((y * maskHeight) / height) * maskStride;
      for (let x = 0; x < width; x++) {
        const from = y * baseStride + x * 3;
        const to = y * outputStride + x * 4;
        target[to] = source[from];
        target[to + 1] = source[from + 1];
        target[to + 2] = source[from + 2];
        target[to + 3] = alpha[maskRow + Math.floor((x * maskWidth) / width) * maskChannels + maskChannels - 1];
      }
    }
  } finally {
    if (shouldDestroyMask) {
      maskPixmap.destroy();
    }
  }

  return output;
}

/**
 * Encodes a pixmap to PNG, or JPEG if photographic and significantly smaller.
 * @param {Object} pixmap - MuPDF Pixmap instance
 * @returns {{ bytes: Buffer, extension: 'png'|'jpg', width: number, height: number }}
 */
export function encodePixmap(pixmap) {
  const width = pixmap.getWidth();
  const height = pixmap.getHeight();
  const pngBytes = Buffer.from(pixmap.asPNG());
  if (pngBytes.length < JPEG_THRESHOLD_BYTES) {
    return { bytes: pngBytes, extension: 'png', width, height };
  }

  try {
    const jpegBytes = Buffer.from(pixmap.asJPEG(JPEG_QUALITY, false));
    if (jpegBytes.length < pngBytes.length * JPEG_WIN_RATIO) {
      return { bytes: jpegBytes, extension: 'jpg', width, height };
    }
  } catch {
    // Fall back to PNG if JPEG encoding is not supported for this color format
  }

  return { bytes: pngBytes, extension: 'png', width, height };
}

/**
 * Decodes and encodes an image, compositing its soft mask if one exists.
 * @param {Object} image - MuPDF Image instance
 * @returns {{ bytes: Buffer, extension: 'png'|'jpg', width: number, height: number }}
 */
export function encodeImage(image) {
  const base = toRgbPixmap(image);
  try {
    const mask = image.getMask();
    if (!mask) {
      const encoded = encodePixmap(base);
      return { ...encoded, width: base.getWidth(), height: base.getHeight() };
    }

    const composite = compositeWithMask(base, mask);
    try {
      const encoded = encodePixmap(composite);
      return { ...encoded, width: composite.getWidth(), height: composite.getHeight() };
    } finally {
      composite.destroy();
    }
  } finally {
    base.destroy();
  }
}

/**
 * Walks a MuPDF page and collects all embedded raster images with their bounding boxes.
 *
 * @param {Object} page - MuPDF Page instance
 * @param {number} pageIndex - Zero-indexed page number
 * @returns {Array<Object>} List of candidate image placements
 */
export function readPageRasterImages(page, pageIndex) {
  const images = [];

  try {
    page.toStructuredText('preserve-images').walk({
      onImageBlock(bbox, transform, image) {
        images.push({
          pageIndex,
          pageNumber: pageIndex + 1,
          bbox: [bbox[0], bbox[1], bbox[2], bbox[3]],
          widthPt: bbox[2] - bbox[0],
          heightPt: bbox[3] - bbox[1],
          image
        });
      }
    });
  } catch {
    // Ignore structured walk failure on unusual pages
  }

  return images;
}
