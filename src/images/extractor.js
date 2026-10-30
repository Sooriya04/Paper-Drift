/**
 * @file src/images/extractor.js
 * @description Document-level Image & Figure Extraction Engine for paper-drift.
 * Orchestrates embedded raster image extraction, vector diagram region cropping,
 * watermark/logo deduplication, and markdown asset generation.
 * Part of paper-drift - https://github.com/Sooriya04/Paper-Drift
 */

import fs from 'fs';
import path from 'path';
import mupdf from 'mupdf';
import { parsePageRange } from '../converter.js';
import { extractPageVectorsAndText } from '../vectors/walker.js';
import {
  readPageRasterImages,
  encodeImage,
  hashPixmap,
  isUniform,
  toRgbPixmap,
  MIN_PIXELS,
  MIN_POINTS,
  MAX_REPEAT_PAGES,
  SMALL_IMAGE_PAGE_SHARE
} from './raster.js';
import { detectPageFigures, renderFigureRegion } from './figures.js';

function boxOverlap(a, b) {
  return a[0] < b[2] && a[2] > b[0] && a[1] < b[3] && a[3] > b[1];
}

/**
 * Extracts content images and drawn figures from a PDF document.
 *
 * @param {string|Buffer|Uint8Array} input - File path or binary buffer of the PDF
 * @param {Object} [options={}] - Extraction options
 * @param {string} [options.dir] - Directory to write extracted image files into (optional)
 * @param {string} [options.linkPrefix] - Path prefix for markdown image links
 * @param {string|number[]} [options.pages='all'] - Page range specification
 * @param {boolean} [options.extractRaster=true] - Whether to extract embedded raster images
 * @param {boolean} [options.extractFigures=true] - Whether to detect and crop vector diagrams
 * @param {number} [options.scale=2.0] - DPI scale factor for rendered vector figures
 * @param {function} [options.onProgress] - Optional progress callback
 * @returns {Promise<{
 *   byPage: Map<number, Array<Object>>,
 *   assets: Array<Object>,
 *   totalImages: number,
 *   totalFigures: number,
 *   totalPages: number,
 *   pagesProcessed: number,
 *   durationMs: number
 * }>}
 */
export async function extractPdfImages(input, options = {}) {
  const startTime = Date.now();
  const extractRaster = options.extractRaster !== false;
  const extractFigures = options.extractFigures !== false;
  const scale = typeof options.scale === 'number' ? options.scale : 2.0;
  const pageRangeStr = options.pages !== undefined ? options.pages : (options.pageRange || 'all');
  const targetDir = options.dir ? path.resolve(process.cwd(), options.dir) : null;
  const linkPrefix = options.linkPrefix !== undefined ? options.linkPrefix : (options.dir ? options.dir.replace(/\\/g, '/') : '');

  let pdfBuffer;
  if (typeof input === 'string') {
    if (!fs.existsSync(input)) {
      throw new Error(`File not found: ${input}`);
    }
    pdfBuffer = fs.readFileSync(input);
  } else if (Buffer.isBuffer(input) || input instanceof Uint8Array) {
    pdfBuffer = input;
  } else {
    throw new TypeError('Input must be a valid file path string, Buffer, or Uint8Array.');
  }

  const doc = mupdf.Document.openDocument(pdfBuffer, 'application/pdf');
  const totalPages = doc.countPages();
  const targetIndices = parsePageRange(pageRangeStr, totalPages);

  if (targetIndices.length === 0) {
    throw new Error(`No matching pages found for page range: "${pageRangeStr}" (Document has ${totalPages} pages).`);
  }

  if (targetDir && !fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }

  // 1. First pass: Collect candidate raster images across all target pages
  const rawPlacements = [];
  const pagesData = [];

  for (let step = 0; step < targetIndices.length; step++) {
    const pageIndex = targetIndices[step];
    const pageNumber = pageIndex + 1;

    if (typeof options.onProgress === 'function') {
      options.onProgress({
        phase: 'reading',
        current: step + 1,
        total: targetIndices.length,
        pageNumber,
        totalPages
      });
    }

    const page = doc.loadPage(pageIndex);
    const bounds = page.getBounds();
    const { lines, vectors } = extractPageVectorsAndText(page);

    const pageImages = extractRaster ? readPageRasterImages(page, pageIndex) : [];
    for (const img of pageImages) {
      img.page = page;
      img.bounds = bounds;
      rawPlacements.push(img);
    }

    pagesData.push({
      page,
      pageIndex,
      pageNumber,
      bounds,
      lines,
      vectors,
      rasterImages: pageImages
    });
  }

  // 2. Filter & Deduplicate raster images across pages (drops repetitive logos & watermarks)
  const registry = new Map();
  for (const placement of rawPlacements) {
    const { image, bbox, bounds } = placement;
    if (Math.min(image.getWidth(), image.getHeight()) < MIN_PIXELS) continue;
    if (Math.min(bbox[2] - bbox[0], bbox[3] - bbox[1]) < MIN_POINTS) continue;

    const rgbPix = toRgbPixmap(image);
    try {
      const hash = hashPixmap(rgbPix);
      if (!registry.has(hash)) {
        registry.set(hash, {
          pages: new Set(),
          uniform: isUniform(rgbPix),
          small: true
        });
      }
      placement.hash = hash;
    } finally {
      rgbPix.destroy();
    }

    const entry = registry.get(placement.hash);
    entry.pages.add(placement.pageIndex);
    const pageArea = (bounds[2] - bounds[0]) * (bounds[3] - bounds[1]);
    const imgArea = (bbox[2] - bbox[0]) * (bbox[3] - bbox[1]);
    entry.small = entry.small && imgArea < pageArea * SMALL_IMAGE_PAGE_SHARE;
  }

  const validRasterPlacements = rawPlacements.filter(p => {
    const entry = p.hash ? registry.get(p.hash) : null;
    return entry &&
           !entry.uniform &&
           entry.pages.size <= MAX_REPEAT_PAGES &&
           !(entry.small && entry.pages.size > 1);
  });

  // Group valid raster placements by page
  const validRasterByPage = new Map();
  for (const p of validRasterPlacements) {
    if (!validRasterByPage.has(p.pageIndex)) {
      validRasterByPage.set(p.pageIndex, []);
    }
    validRasterByPage.get(p.pageIndex).push(p);
  }

  // 3. Detect and extract vector figures & raster images per page
  const byPage = new Map();
  const assets = [];
  let totalImagesCount = 0;
  let totalFiguresCount = 0;

  for (const pData of pagesData) {
    const pagePlacements = [];
    const validRaster = validRasterByPage.get(pData.pageIndex) || [];

    // Detect vector figures on this page
    let detectedFigures = [];
    if (extractFigures) {
      detectedFigures = detectPageFigures({
        bounds: pData.bounds,
        lines: pData.lines,
        vectors: pData.vectors,
        contentImages: validRaster
      });
    }

    // Exclude raster images that are entirely encompassed by detected vector figures
    const standaloneRaster = validRaster.filter(r =>
      !detectedFigures.some(f => boxOverlap(r.bbox, f.bbox))
    );

    // Process vector figures
    let figureIndex = 0;
    for (const fig of detectedFigures) {
      figureIndex++;
      totalFiguresCount++;

      const rendered = renderFigureRegion(pData.page, fig.bbox, scale);
      const name = `p${String(pData.pageNumber).padStart(2, '0')}-f${String(figureIndex).padStart(2, '0')}.${rendered.extension}`;
      const filePath = targetDir ? path.join(targetDir, name) : null;
      const link = linkPrefix ? `${linkPrefix.replace(/\/+$/, '')}/${name}` : name;

      if (targetDir) {
        fs.writeFileSync(filePath, rendered.bytes);
      }

      const altText = fig.caption ? fig.caption : `Page ${pData.pageNumber} Figure ${figureIndex}`;

      const assetInfo = {
        type: 'figure',
        pageNumber: pData.pageNumber,
        pageIndex: pData.pageIndex,
        bbox: fig.bbox,
        filename: name,
        filePath,
        link,
        alt: altText,
        caption: fig.caption || null,
        width: rendered.width,
        height: rendered.height,
        bytes: rendered.bytes,
        sizeKb: parseFloat((rendered.bytes.length / 1024).toFixed(1)),
        insideLines: fig.insideLines || []
      };

      assets.push(assetInfo);
      pagePlacements.push(assetInfo);
    }

    // Process standalone raster images
    let imageIndex = 0;
    for (const r of standaloneRaster) {
      imageIndex++;
      totalImagesCount++;

      const encoded = encodeImage(r.image);
      const name = `p${String(pData.pageNumber).padStart(2, '0')}-${String(imageIndex).padStart(2, '0')}.${encoded.extension}`;
      const filePath = targetDir ? path.join(targetDir, name) : null;
      const link = linkPrefix ? `${linkPrefix.replace(/\/+$/, '')}/${name}` : name;

      if (targetDir) {
        fs.writeFileSync(filePath, encoded.bytes);
      }

      const altText = `Page ${pData.pageNumber} Image ${imageIndex}`;

      const assetInfo = {
        type: 'image',
        pageNumber: pData.pageNumber,
        pageIndex: pData.pageIndex,
        bbox: r.bbox,
        filename: name,
        filePath,
        link,
        alt: altText,
        caption: null,
        width: encoded.width,
        height: encoded.height,
        bytes: encoded.bytes,
        sizeKb: parseFloat((encoded.bytes.length / 1024).toFixed(1)),
        insideLines: []
      };

      assets.push(assetInfo);
      pagePlacements.push(assetInfo);
    }

    // Sort page placements in top-to-bottom reading order
    pagePlacements.sort((a, b) => a.bbox[1] - b.bbox[1] || a.bbox[0] - b.bbox[0]);
    byPage.set(pData.pageNumber, pagePlacements);
  }

  return {
    byPage,
    assets,
    totalImages: totalImagesCount,
    totalFigures: totalFiguresCount,
    totalPages,
    pagesProcessed: targetIndices.length,
    durationMs: Date.now() - startTime
  };
}
