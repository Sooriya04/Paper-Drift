/**
 * @file src/index.js
 * @description Main library entrypoint for paper-drift.
 * High-performance WebAssembly PDF engine: high-res Image rendering (Base64/PNG),
 * standalone HTML export, publication-grade GFM Markdown conversion, spatial reading order layout analysis,
 * and Structured Document IR.
 * Part of paper-drift - https://github.com/Sooriya04/Paper-Drift
 */

import { convertPdfToImages, streamPdfPages, convertPdfToHtml, parsePageRange } from './converter.js';
import { convertPdfToMarkdown } from './markdown/converter.js';
import { extractPdfImages } from './images/extractor.js';
import { extractPageLinks, buildDocumentDestinations, applyLinksToLine, findDestinationAnchors, formatDestinationSlug } from './links/extractor.js';
import { resolveReadingOrder, recursiveXyCut } from './spatial/reading-order.js';
import { convertPdfToDocumentIR, validateDocumentIR, exportToJson } from './ir/schema.js';

export {
  convertPdfToImages,
  streamPdfPages,
  convertPdfToHtml,
  parsePageRange,
  convertPdfToMarkdown,
  extractPdfImages,
  extractPageLinks,
  buildDocumentDestinations,
  applyLinksToLine,
  findDestinationAnchors,
  formatDestinationSlug,
  resolveReadingOrder,
  recursiveXyCut,
  convertPdfToDocumentIR,
  validateDocumentIR,
  exportToJson
};

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
  recursiveXyCut,
  convertPdfToDocumentIR,
  validateDocumentIR,
  exportToJson
};
