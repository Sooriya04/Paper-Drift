/**
 * @file src/converter.js
 * @description Core WebAssembly PDF conversion engine using MuPDF WASM and recursive XY-Cut spatial ordering.
 * Resolves multi-column reading orders dynamically while preserving pixel-perfect visual fidelity.
 * Part of paper-drift - https://github.com/Sooriya04/Paper-Drift
 */

import mupdf from 'mupdf';
import fs from 'fs';
import path from 'path';
import { buildHtmlDocument } from './utils/html-template.js';
import { resolveReadingOrder } from './spatial/reading-order.js';

/**
 * Parses page range string (e.g. "all", "1-3", "1,3,5") into sorted 0-indexed page indices.
 * @param {string|number[]} range - Target page specification.
 * @param {number} totalPages - Total page count in document.
 * @returns {number[]} 0-indexed page numbers.
 */
export function parsePageRange(range, totalPages) {
  if (range === undefined || range === null || range === '' || range === 'all') {
    return Array.from({ length: totalPages }, (_, i) => i);
  }

  if (typeof range === 'number') {
    if (range >= 1 && range <= totalPages) {
      return [range - 1];
    }
    return [];
  }

  if (Array.isArray(range)) {
    return range
      .map(p => Number(p) - 1)
      .filter(p => !isNaN(p) && p >= 0 && p < totalPages);
  }

  const indices = new Set();
  const parts = String(range).split(',');

  for (const part of parts) {
    const trimmed = part.trim();
    if (trimmed.includes('-')) {
      const [start, end] = trimmed.split('-').map(Number);
      if (!isNaN(start) && !isNaN(end)) {
        for (let p = Math.max(1, start); p <= Math.min(totalPages, end); p++) {
          indices.add(p - 1);
        }
      }
    } else {
      const p = parseInt(trimmed, 10);
      if (!isNaN(p) && p >= 1 && p <= totalPages) {
        indices.add(p - 1);
      }
    }
  }

  return Array.from(indices).sort((a, b) => a - b);
}

/**
 * Converts a PDF buffer or file path into high-resolution images and Base64 strings.
 *
 * @param {string|Buffer|Uint8Array} input - File path or binary buffer of the PDF.
 * @param {Object} [options={}] - Conversion options.
 * @param {number} [options.scale=2.0] - DPI scale factor (e.g. 2.0 = Retina 144 DPI, 3.0 = 216 DPI).
 * @param {string|number[]} [options.pages='all'] - Target page specification (e.g. "1-3", "2,4", "all").
 * @param {function} [options.onProgress] - Optional progress callback `({ current, total, pageNumber, totalPages }) => void`.
 * @returns {Promise<{ pages: Array<Object>, totalPages: number, pagesProcessed: number, durationMs: number }>}
 */
export async function convertPdfToImages(input, options = {}) {
  const startTime = Date.now();
  const scale = typeof options.scale === 'number' ? options.scale : 2.0;
  const pageRangeStr = options.pages !== undefined ? options.pages : (options.pageRange || 'all');

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

  const pages = [];

  for (let step = 0; step < targetIndices.length; step++) {
    const pageIndex = targetIndices[step];
    const pageNumber = pageIndex + 1;

    if (typeof options.onProgress === 'function') {
      options.onProgress({
        current: step + 1,
        total: targetIndices.length,
        pageNumber,
        totalPages
      });
    }

    const page = doc.loadPage(pageIndex);
    const bounds = page.getBounds();
    const widthPt = bounds[2] - bounds[0];
    const heightPt = bounds[3] - bounds[1];

    const alpha = options.transparent === true || options.noBg === true || options.withBg === false;
    const matrix = mupdf.Matrix.scale(scale, scale);
    const pixmap = page.toPixmap(matrix, mupdf.ColorSpace.DeviceRGB, alpha, true);
    const pngBuffer = Buffer.from(pixmap.asPNG());
    const rawBase64 = pngBuffer.toString('base64');
    const dataUrl = `data:image/png;base64,${rawBase64}`;

    let pageText = '';
    try {
      const st = page.toStructuredText();
      const stJson = JSON.parse(st.asJSON());
      pageText = (stJson.blocks || [])
        .filter(b => b.lines)
        .flatMap(b => b.lines)
        .map(l => l.text)
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim();
    } catch {
      // Ignore text extraction failure in image mode
    }

    pages.push({
      pageNumber,
      width: Math.round(widthPt * scale),
      height: Math.round(heightPt * scale),
      widthPt,
      heightPt,
      scale,
      buffer: pngBuffer,
      base64: rawBase64,
      dataUrl,
      text: pageText
    });
  }

  return {
    pages,
    totalPages,
    pagesProcessed: targetIndices.length,
    durationMs: Date.now() - startTime
  };
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Converts a PDF buffer or file path into a standalone high-fidelity HTML document with spatial reading order.
 *
 * @param {string|Buffer|Uint8Array} input - File path or binary buffer of the PDF.
 * @param {Object} [options={}] - Conversion options.
 * @param {number} [options.scale=2.0] - DPI scale for background rendering (2.0 = Retina).
 * @param {boolean} [options.withBg=true] - Whether to render lossless background image layer.
 * @param {string|number[]} [options.pageRange='all'] - Page range to process.
 * @param {string} [options.title] - Document title in HTML head.
 * @param {string} [options.format='html'] - Target output format ('html', 'text', 'json').
 * @param {function} [options.onProgress] - Optional progress callback `({ current, total, pageIndex }) => void`.
 * @returns {Promise<{ html: string, text: string, pages: Array<Object>, totalPages: number, pagesProcessed: number, durationMs: number }>}
 */
export async function convertPdfToHtml(input, options = {}) {
  const startTime = Date.now();
  const scale = typeof options.scale === 'number' ? options.scale : 2.0;
  const withBg = options.withBg !== false;
  const pageRangeStr = options.pages !== undefined ? options.pages : (options.pageRange || 'all');

  let pdfBuffer;
  let docTitle = options.title || 'Converted Document';

  if (typeof input === 'string') {
    if (!fs.existsSync(input)) {
      throw new Error(`File not found: ${input}`);
    }
    pdfBuffer = fs.readFileSync(input);
    docTitle = options.title || path.basename(input, path.extname(input));
  } else if (Buffer.isBuffer(input) || input instanceof Uint8Array) {
    pdfBuffer = input;
  } else {
    throw new TypeError('Input must be a valid file path string, Buffer, or Uint8Array.');
  }

  // Load PDF via WebAssembly (MuPDF binary)
  const doc = mupdf.Document.openDocument(pdfBuffer, 'application/pdf');
  const totalPages = doc.countPages();
  const targetIndices = parsePageRange(pageRangeStr, totalPages);

  if (targetIndices.length === 0) {
    throw new Error(`No matching pages found for page range: "${pageRangeStr}" (Document has ${totalPages} pages).`);
  }

  const pagesHtml = [];
  const processedPages = [];
  const documentTextBlocks = [];

  for (let step = 0; step < targetIndices.length; step++) {
    const pageIndex = targetIndices[step];
    const pageNumber = pageIndex + 1;

    if (typeof options.onProgress === 'function') {
      options.onProgress({
        current: step + 1,
        total: targetIndices.length,
        pageNumber,
        totalPages
      });
    }

    const page = doc.loadPage(pageIndex);
    const bounds = page.getBounds();
    const widthPt = bounds[2] - bounds[0];
    const heightPt = bounds[3] - bounds[1];

    let bgImgTag = '';
    if (withBg) {
      const matrix = mupdf.Matrix.scale(scale, scale);
      const pixmap = page.toPixmap(matrix, mupdf.ColorSpace.DeviceRGB, false, true);
      const pngBase64 = Buffer.from(pixmap.asPNG()).toString('base64');
      bgImgTag = `    <img src="data:image/png;base64,${pngBase64}" class="pdf-bg-layer" alt="Page ${pageNumber} Background" />\n`;
    }

    // Extract structured JSON and resolve spatial reading order
    const structuredText = page.toStructuredText();
    const pageJson = JSON.parse(structuredText.asJSON());
    const spatialResult = resolveReadingOrder(pageJson, widthPt, heightPt);

    // Build spatially ordered DOM text layer
    let textLayerHtml = '';
    for (const block of spatialResult.blocks) {
      for (const line of (block.lines || [])) {
        const fontSize = line.font?.size || line.bbox?.h || 12;
        const fontFamily = line.font?.family ? `${line.font.family}, sans-serif` : 'sans-serif';
        const fontWeight = line.font?.weight || 'normal';
        const fontStyle = line.font?.style || 'normal';
        const left = line.bbox?.x ?? line.x ?? 0;
        const top = line.bbox?.y ?? (line.y - fontSize) ?? 0;
        const height = line.bbox?.h ?? fontSize;

        const escaped = escapeHtml(line.text || '');
        textLayerHtml += `      <p class="pdf-line" style="position: absolute; left: ${left.toFixed(1)}pt; top: ${top.toFixed(1)}pt; font-size: ${fontSize.toFixed(1)}pt; font-family: ${fontFamily}; font-weight: ${fontWeight}; font-style: ${fontStyle}; height: ${height.toFixed(1)}pt; line-height: 1;">${escaped}</p>\n`;
      }
    }

    const pageMarkup = `  <!-- Page ${pageNumber} -->
  <article class="pdf-page" id="page-${pageNumber}" style="width: ${widthPt.toFixed(1)}pt; height: ${heightPt.toFixed(1)}pt;" data-page="${pageNumber}">
${bgImgTag}    <div class="pdf-text-layer">
${textLayerHtml}    </div>
  </article>`;

    pagesHtml.push(pageMarkup);

    processedPages.push({
      pageNumber,
      width: widthPt,
      height: heightPt,
      columnsDetected: spatialResult.columnsDetected,
      blocksCount: spatialResult.blocks.length,
      text: spatialResult.text
    });

    if (spatialResult.text) {
      documentTextBlocks.push(spatialResult.text);
    }
  }

  const finalHtml = buildHtmlDocument({
    title: docTitle,
    pagesHtml,
    options: { withBg }
  });

  const fullText = documentTextBlocks.join('\n\n--- Page Break ---\n\n');

  return {
    html: finalHtml,
    text: fullText,
    pages: processedPages,
    totalPages,
    pagesProcessed: targetIndices.length,
    durationMs: Date.now() - startTime
  };
}
