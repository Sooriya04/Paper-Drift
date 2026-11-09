/**
 * @file src/images/figures.js
 * @description Vector figure, chart, and diagram detection and high-DPI sub-region rendering using MuPDF WebAssembly.
 * Clusters vector curves, shapes, and captions, isolates diagram bounding boxes, and renders cropped assets via DrawDevice.
 * Part of paper-drift - https://github.com/Sooriya04/Paper-Drift
 */

import mupdf from 'mupdf';
import { isThinRule, runningPageThreshold } from '../vectors/rules.js';
import { encodePixmap } from './raster.js';

export const MIN_SHAPE_SIZE = 3;
export const MIN_IMAGE_POINTS = 30;
export const MIN_CURVES = 3;
export const MIN_IMAGES = 2;
export const MIN_FIGURE_WIDTH = 100;
export const MIN_FIGURE_HEIGHT = 60;
export const MIN_DRAWN_SHARE = 0.25;
export const MAX_BOX_PAGE_SHARE = 0.85;
export const MAX_FIGURE_PAGE_SHARE = 0.8;
export const CLUSTER_GAP = 6;
export const TEXT_GAP = 4;
export const TITLE_GAP = 36;
export const TITLE_WIDTH_RATIO = 0.9;
export const TITLE_CENTRE_RATIO = 0.1;
export const MIN_BODY_LINE_WIDTH = 100;
export const BODY_WIDTH_RATIO = 0.85;
export const MAX_BODY_LINES = 1;
export const PADDING = 4;
export const RENDER_TARGET_PIXELS = 2000;
export const MAX_RENDER_SCALE = 4.0;
export const CAPTION_START_REGEX = /^(table|figure|fig\.|chart|exhibit|panel)\s+[A-Z]?\d+[a-z]?[:.]/i;

function boxOf([left, top, right, bottom]) {
  return { left, top, right, bottom };
}

function width(box) {
  return box.right - box.left;
}

function height(box) {
  return box.bottom - box.top;
}

function union(a, b) {
  return {
    left: Math.min(a.left, b.left),
    top: Math.min(a.top, b.top),
    right: Math.max(a.right, b.right),
    bottom: Math.max(a.bottom, b.bottom)
  };
}

function touches(a, b, gap = CLUSTER_GAP) {
  return a.left - gap < b.right &&
         a.right + gap > b.left &&
         a.top - gap < b.bottom &&
         a.bottom + gap > b.top;
}

function centreInside(box, region, gap = 0) {
  const x = (box.left + box.right) / 2;
  const y = (box.top + box.bottom) / 2;
  return x >= region.left - gap &&
         x <= region.right + gap &&
         y >= region.top - gap &&
         y <= region.bottom + gap;
}

function shapeKey(kind, box) {
  return `${kind}:${[box.left, box.top, box.right, box.bottom].map(v => Math.round(v)).join(',')}`;
}

/**
 * Filter shapes that represent diagram graphics (curves, boxes, images) excluding thin table rules and full page fills.
 */
function contentShapes(shapes, bounds) {
  const pageArea = (bounds[2] - bounds[0]) * (bounds[3] - bounds[1]);
  return shapes.filter(shape => {
    const w = width(shape);
    const h = height(shape);
    if (shape.kind === 'image') {
      return Math.min(w, h) >= MIN_IMAGE_POINTS;
    }
    if (isThinRule(w, h) || (w < MIN_SHAPE_SIZE && h < MIN_SHAPE_SIZE)) {
      return false;
    }
    return shape.kind !== 'box' || (w * h) < pageArea * MAX_BOX_PAGE_SHARE;
  });
}

/**
 * Groups nearby vector shapes and image blocks using union-find clustering.
 */
function clusterShapes(shapes) {
  const parent = shapes.map((_, idx) => idx);

  function find(idx) {
    let root = idx;
    while (root !== parent[root]) {
      root = parent[root];
    }
    let curr = idx;
    while (curr !== root) {
      const next = parent[curr];
      parent[curr] = root;
      curr = next;
    }
    return root;
  }

  function unionIdx(i, j) {
    const rootI = find(i);
    const rootJ = find(j);
    if (rootI !== rootJ) parent[rootI] = rootJ;
  }

  for (let i = 0; i < shapes.length; i++) {
    for (let j = i + 1; j < shapes.length; j++) {
      if (touches(shapes[i], shapes[j], CLUSTER_GAP)) {
        unionIdx(i, j);
      }
    }
  }

  const clusters = new Map();
  shapes.forEach((shape, index) => {
    const root = find(index);
    if (!clusters.has(root)) {
      clusters.set(root, { box: { ...shape }, drawn: null, curves: 0, images: 0, density: 0 });
    }
    const cluster = clusters.get(root);
    cluster.box = union(cluster.box, shape);
    if (shape.kind !== 'box') {
      cluster.drawn = cluster.drawn ? union(cluster.drawn, shape) : { ...shape };
    }
    cluster.curves += shape.kind === 'curve' ? 1 : 0;
    cluster.images += shape.kind === 'image' ? 1 : 0;
    cluster.density = Math.max(cluster.density, shape.density || 0);
  });

  return Array.from(clusters.values());
}

function bodyLineWidth(lines) {
  const widths = lines.map(width).filter(v => v >= MIN_BODY_LINE_WIDTH).sort((a, b) => a - b);
  return widths.length > 0 ? widths[Math.floor(widths.length / 2)] : 0;
}

function bodyLeftEdge(lines) {
  const counts = new Map();
  for (const line of lines) {
    if (width(line) >= MIN_BODY_LINE_WIDTH) {
      const key = Math.round(line.left);
      counts.set(key, (counts.get(key) || 0) + 1);
    }
  }
  let best = null;
  for (const [left, count] of counts) {
    if (!best || count > best.count) {
      best = { left, count };
    }
  }
  return best ? best.left : null;
}

/**
 * Associates a title or caption line situated immediately above or below the figure.
 * Prioritizes explicit figure/table caption labels and collects wrapped multi-line captions.
 */
export function findFigureTitleOrCaption(box, lines) {
  let region = Array.isArray(box) ? boxOf(box) : box;
  let caption = null;
  const captionLines = [];

  const normLines = lines.map(line => {
    if (line.left !== undefined && line.top !== undefined && line.right !== undefined && line.bottom !== undefined) {
      return line;
    }
    if (Array.isArray(line.bbox)) {
      return { ...line, ...boxOf(line.bbox) };
    }
    return line;
  });

  const centre = (region.left + region.right) / 2;

  // 1. Look for explicit figure/table caption line below first
  const candidateBelow = normLines
    .filter(line => line.top >= region.bottom - 4 &&
                    line.top <= region.bottom + TITLE_GAP &&
                    CAPTION_START_REGEX.test((line.text || '').trim()))
    .sort((a, b) => a.top - b.top)[0];

  // 2. Look for explicit figure/table caption line above
  const candidateAboveExplicit = normLines
    .filter(line => line.bottom <= region.top + 4 &&
                    line.bottom >= region.top - TITLE_GAP &&
                    CAPTION_START_REGEX.test((line.text || '').trim()))
    .sort((a, b) => b.bottom - a.bottom)[0];

  // 3. Look for centered title line above
  const candidateAboveTitle = normLines
    .filter(line => line.bottom <= region.top + 2 &&
                    line.bottom >= region.top - TITLE_GAP &&
                    width(line) <= width(region) * TITLE_WIDTH_RATIO &&
                    Math.abs((line.left + line.right) / 2 - centre) <= width(region) * TITLE_CENTRE_RATIO)
    .sort((a, b) => b.bottom - a.bottom)[0];

  const primaryCaptionLine = candidateBelow || candidateAboveExplicit || candidateAboveTitle;

  if (primaryCaptionLine) {
    caption = primaryCaptionLine.text.trim();
    region = union(region, primaryCaptionLine);
    captionLines.push(primaryCaptionLine);

    // If caption starts with Figure/Table and was below, collect contiguous wrapped continuation lines
    if (primaryCaptionLine === candidateBelow) {
      let lastLine = primaryCaptionLine;
      const sortedRemaining = normLines
        .filter(l => l.top >= lastLine.bottom - 2 && l.top <= lastLine.bottom + 12 && l !== primaryCaptionLine)
        .sort((a, b) => a.top - b.top);

      for (const continuation of sortedRemaining) {
        const text = (continuation.text || '').trim();
        // Stop if line starts a new section, another caption, or is too far indented
        if (CAPTION_START_REGEX.test(text) || /^\d+\.?\s+[A-Z]/.test(text)) break;
        if (Math.abs(continuation.left - primaryCaptionLine.left) > 30 && Math.abs(continuation.right - primaryCaptionLine.right) > 30) {
          // Gutter break or column mismatch
          break;
        }
        caption += ' ' + text;
        region = union(region, continuation);
        captionLines.push(continuation);
        lastLine = continuation;
        if (captionLines.length >= 4) break; // Limit continuation to 3 extra lines
      }
    }
  }

  return { region, caption, captionLines };
}

/**
 * Detects vector diagram regions across a page.
 *
 * @param {Object} pageData - Page data containing bounds, lines, vectors, and contentImages
 * @returns {Array<Object>} List of detected figure bounding boxes with metadata
 */
export function detectPageFigures(pageData) {
  const { bounds, lines, vectors, contentImages = [] } = pageData;
  const pageArea = (bounds[2] - bounds[0]) * (bounds[3] - bounds[1]);

  const shapes = contentImages.map(img => ({
    kind: 'image',
    left: img.bbox[0],
    top: img.bbox[1],
    right: img.bbox[2],
    bottom: img.bbox[3],
    density: img.density || 1,
    key: shapeKey('image', boxOf(img.bbox))
  }));

  for (const v of vectors) {
    const isBox = v.flags?.isRectangle;
    const kind = isBox ? 'box' : 'curve';
    const box = boxOf(v.bbox);
    shapes.push({ kind, ...box, key: shapeKey(kind, box) });
  }

  const content = contentShapes(shapes, bounds);
  const clusters = clusterShapes(content);
  const bodyWidth = bodyLineWidth(lines);
  const bodyLeft = bodyLeftEdge(lines);
  const figures = [];

  for (const cluster of clusters) {
    if (cluster.curves < MIN_CURVES && cluster.images < MIN_IMAGES) {
      continue;
    }
    const cWidth = width(cluster.box);
    const cHeight = height(cluster.box);

    if (cWidth < MIN_FIGURE_WIDTH || cHeight < MIN_FIGURE_HEIGHT) {
      continue;
    }
    if (cWidth * cHeight > pageArea * MAX_FIGURE_PAGE_SHARE) {
      continue;
    }
    if (cluster.drawn) {
      const drawnArea = width(cluster.drawn) * height(cluster.drawn);
      if (drawnArea < cWidth * cHeight * MIN_DRAWN_SHARE) {
        continue;
      }
    }

    const insideLines = lines.filter(line => centreInside(line, cluster.box, TEXT_GAP));
    const bodyLines = bodyWidth > 0 ? insideLines.filter(line => width(line) >= bodyWidth * BODY_WIDTH_RATIO).length : 0;
    if (bodyLines > MAX_BODY_LINES || (cluster.curves === 0 && insideLines.length > 0)) {
      continue;
    }

    const intrudes = bodyLeft !== null && insideLines.some(line =>
      Math.abs(line.left - bodyLeft) <= 2 && !content.some(shape => centreInside(line, shape))
    );
    if (intrudes) continue;

    const { region, caption, captionLines } = findFigureTitleOrCaption(cluster.box, lines);

    figures.push({
      bbox: [
        Math.max(bounds[0], region.left - PADDING),
        Math.max(bounds[1], region.top - PADDING),
        Math.min(bounds[2], region.right + PADDING),
        Math.min(bounds[3], region.bottom + PADDING)
      ],
      caption: caption || null,
      density: cluster.density,
      insideLines: [...insideLines, ...captionLines]
    });
  }

  return figures;
}

/**
 * Renders a cropped sub-region of a page to high-resolution PNG bytes using MuPDF's DrawDevice.
 *
 * @param {Object} page - MuPDF Page instance
 * @param {number[]} bbox - [left, top, right, bottom] in page points
 * @param {number} [targetScale=2.0] - Render scale
 * @returns {{ bytes: Buffer, extension: 'png'|'jpg', width: number, height: number }}
 */
export function renderFigureRegion(page, bbox, targetScale = 2.0) {
  const [left, top, right, bottom] = bbox;
  const w = right - left;
  const h = bottom - top;

  const wanted = Math.max(RENDER_TARGET_PIXELS / Math.max(w, h), targetScale);
  const scale = Math.max(1.5, Math.min(MAX_RENDER_SCALE, wanted));

  const scaleMatrix = mupdf.Matrix.scale(scale, scale);
  const transformed = mupdf.Rect.transform(bbox, scaleMatrix);

  const minX = Math.floor(transformed[0]);
  const minY = Math.floor(transformed[1]);
  const maxX = Math.ceil(transformed[2]);
  const maxY = Math.ceil(transformed[3]);
  const pixelWidth = Math.max(1, maxX - minX);
  const pixelHeight = Math.max(1, maxY - minY);

  // Fast clipping: translate to origin [0, 0, pixelWidth, pixelHeight]
  // Allows DrawDevice to clip out-of-bounds vectors instantly and saves memory
  const renderMatrix = mupdf.Matrix.concat(scaleMatrix, mupdf.Matrix.translate(-minX, -minY));
  const rect = [0, 0, pixelWidth, pixelHeight];

  const pixmap = new mupdf.Pixmap(mupdf.ColorSpace.DeviceRGB, rect, false);
  pixmap.clear(255); // Opaque white background for figures

  const device = new mupdf.DrawDevice(renderMatrix, pixmap);
  try {
    page.run(device, mupdf.Matrix.identity);
    device.close();
    const encoded = encodePixmap(pixmap);
    return {
      ...encoded,
      width: pixmap.getWidth(),
      height: pixmap.getHeight()
    };
  } finally {
    device.destroy();
    pixmap.destroy();
  }
}
