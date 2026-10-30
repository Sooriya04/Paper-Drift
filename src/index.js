/**
 * @file src/index.js
 * @description Main library entrypoint for paper-drift.
 * High-performance WebAssembly PDF engine: high-res Image rendering (Base64/PNG),
 * standalone HTML export, publication-grade GFM Markdown conversion, and spatial reading order layout analysis.
 * Part of paper-drift - https://github.com/Sooriya04/Paper-Drift
 */

export { convertPdfToImages, streamPdfPages, convertPdfToHtml, parsePageRange } from './converter.js';
export { convertPdfToMarkdown } from './markdown/converter.js';
export { extractPdfImages } from './images/extractor.js';
export { extractPageLinks, buildDocumentDestinations, applyLinksToLine, findDestinationAnchors, formatDestinationSlug } from './links/extractor.js';
export { resolveReadingOrder, recursiveXyCut } from './spatial/reading-order.js';

import { convertPdfToImages, streamPdfPages, convertPdfToHtml, parsePageRange } from './converter.js';
import { convertPdfToMarkdown } from './markdown/converter.js';
import { extractPdfImages } from './images/extractor.js';
import { extractPageLinks, buildDocumentDestinations, applyLinksToLine, findDestinationAnchors, formatDestinationSlug } from './links/extractor.js';
import { resolveReadingOrder, recursiveXyCut } from './spatial/reading-order.js';

export default {
  convertPdfToImages,
  streamPdfPages,
  convertPdfToHtml,
  convertPdfToMarkdown,
  extractPdfImages,
  extractPageLinks,
  buildDocumentDestinations,
  applyLinksToLine,
  findDestinationAnchors,
  formatDestinationSlug,
  parsePageRange,
  resolveReadingOrder,
  recursiveXyCut
};
