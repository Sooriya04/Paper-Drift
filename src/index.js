/**
 * @file src/index.js
 * @description Main library entrypoint for paper-drift.
 * High-performance WebAssembly PDF engine: high-res Image rendering (Base64/PNG),
 * standalone HTML export, publication-grade GFM Markdown conversion, and spatial reading order layout analysis.
 * Part of paper-drift - https://github.com/Sooriya04/Paper-Drift
 */

export { convertPdfToImages, streamPdfPages, convertPdfToHtml, parsePageRange } from './converter.js';
export { convertPdfToMarkdown } from './markdown/converter.js';
export { resolveReadingOrder, recursiveXyCut } from './spatial/reading-order.js';

import { convertPdfToImages, streamPdfPages, convertPdfToHtml, parsePageRange } from './converter.js';
import { convertPdfToMarkdown } from './markdown/converter.js';
import { resolveReadingOrder, recursiveXyCut } from './spatial/reading-order.js';

export default {
  convertPdfToImages,
  streamPdfPages,
  convertPdfToHtml,
  convertPdfToMarkdown,
  parsePageRange,
  resolveReadingOrder,
  recursiveXyCut
};
