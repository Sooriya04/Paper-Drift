/**
 * @file src/index.js
 * @description Main library entrypoint for paper-drift.
 * High-performance WebAssembly PDF engine: high-res Image rendering (Base64/PNG),
 * standalone HTML export, publication-grade GFM Markdown conversion, spatial reading order layout analysis,
 * and Structured Document IR.
 * Part of paper-drift - https://github.com/Sooriya04/Paper-Drift
 */

import {
  convertPdfToImages,
  streamPdfPages,
  convertPdfToHtml,
  parsePageRange,
  renderRegion,
  DisplayListCache
} from './converter.js';
import { convertPdfToMarkdown } from './markdown/converter.js';
import { extractPdfImages } from './images/extractor.js';
import { extractPageLinks, buildDocumentDestinations, applyLinksToLine, findDestinationAnchors, formatDestinationSlug } from './links/extractor.js';
import { resolveReadingOrder, recursiveXyCut } from './spatial/reading-order.js';
import { convertPdfToDocumentIR, validateDocumentIR, exportToJson } from './ir/schema.js';
import {
  cleanLigatures,
  repairHyphenation,
  normalizeWhitespace,
  filterRunningHeadersFooters,
  normalizePageText
} from './normalization/text.js';
import {
  extractScientificMetadata,
  validateScientificMetadata,
  SCIENTIFIC_METADATA_VERSION
} from './metadata/index.js';

export {
  convertPdfToImages,
  streamPdfPages,
  convertPdfToHtml,
  parsePageRange,
  renderRegion,
  DisplayListCache,
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
  exportToJson,
  cleanLigatures,
  repairHyphenation,
  normalizeWhitespace,
  filterRunningHeadersFooters,
  normalizePageText,
  extractScientificMetadata,
  validateScientificMetadata,
  SCIENTIFIC_METADATA_VERSION
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
  renderRegion,
  DisplayListCache,
  resolveReadingOrder,
  recursiveXyCut,
  convertPdfToDocumentIR,
  validateDocumentIR,
  exportToJson,
  cleanLigatures,
  repairHyphenation,
  normalizeWhitespace,
  filterRunningHeadersFooters,
  normalizePageText,
  extractScientificMetadata,
  validateScientificMetadata,
  SCIENTIFIC_METADATA_VERSION
};
