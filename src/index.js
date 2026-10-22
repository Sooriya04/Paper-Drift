/**
 * @file src/index.js
 * @description Main library entrypoint for paper-drift.
 * Exports programmatic APIs for parsing and converting PDF documents without headless Chromium.
 * Part of paper-drift - https://github.com/Sooriya04/Paper-Drift
 */

export { convertPdfToHtml, parsePageRange } from './converter.js';
export { resolveReadingOrder, recursiveXyCut } from './spatial/reading-order.js';

import { convertPdfToHtml, parsePageRange } from './converter.js';
import { resolveReadingOrder, recursiveXyCut } from './spatial/reading-order.js';

export default {
  convertPdfToHtml,
  parsePageRange,
  resolveReadingOrder,
  recursiveXyCut
};
