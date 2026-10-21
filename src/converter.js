/**
 * @file src/converter.js
 * @description Core WebAssembly PDF conversion engine using MuPDF WASM.
 * Extracts structured text and renders crisp background layers without headless Chromium.
 * Part of paper-drift - https://github.com/Sooriya04/Paper-Drift
 */

import mupdf from 'mupdf';
import fs from 'fs';
import path from 'path';
import { buildHtmlDocument } from './utils/html-template.js';

/**
 * Parses page range string (e.g. "all", "1-3", "1,3,5") into sorted 0-indexed page indices.
 * @param {string|number[]} range - Target page specification.
 * @param {number} totalPages - Total page count in document.
 * @returns {number[]} 0-indexed page numbers.
 */
export function parsePageRange(range, totalPages) {
  if (!range || range === 'all') {
    return Array.from({ length: totalPages }, (_, i) => i);
  }

  if (Array.isArray(range)) {
    return range.map(p => p - 1).filter(p => p >= 0 && p < totalPages);
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
 * Converts a PDF buffer or file path into a standalone high-fidelity HTML document.
 *
 * @param {string|Buffer|Uint8Array} input - File path or binary buffer of the PDF.
 * @param {Object} [options={}] - Conversion options.
 * @param {number} [options.scale=2.0] - DPI scale for background rendering (2.0 = Retina).
 * @param {boolean} [options.withBg=true] - Whether to render lossless background image layer.
 * @param {string|number[]} [options.pageRange='all'] - Page range to process.
 * @param {string} [options.title] - Document title in HTML head.
 * @param {function} [options.onProgress] - Optional progress callback `({ current, total, pageIndex }) => void`.
 * @returns {Promise<{ html: string, totalPages: number, pagesProcessed: number, durationMs: number }>}
 */
export async function convertPdfToHtml(input, options = {}) {
  const startTime = Date.now();
  const scale = typeof options.scale === 'number' ? options.scale : 2.0;
  const withBg = options.withBg !== false;
  const pageRangeStr = options.pageRange || 'all';

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

    // Extract structured HTML text layer
    const structuredText = page.toStructuredText();
    const rawHtmlText = structuredText.asHTML();

    const pageMarkup = `  <!-- Page ${pageNumber} -->
  <article class="pdf-page" id="page-${pageNumber}" style="width: ${widthPt.toFixed(1)}pt; height: ${heightPt.toFixed(1)}pt;" data-page="${pageNumber}">
${bgImgTag}    <div class="pdf-text-layer">
      ${rawHtmlText}
    </div>
  </article>`;

    pagesHtml.push(pageMarkup);
  }

  const finalHtml = buildHtmlDocument({
    title: docTitle,
    pagesHtml,
    options: { withBg }
  });

  return {
    html: finalHtml,
    totalPages,
    pagesProcessed: targetIndices.length,
    durationMs: Date.now() - startTime
  };
}
