/**
 * @file src/index.js
 * @description Main library entrypoint for paper-drift.
 * Exports programmatic APIs for direct Markdown conversion, PDF-to-HTML rendering,
 * GFM table reconstruction, multi-column spatial reading order, and LaTeX math restoration.
 * Part of paper-drift - https://github.com/Sooriya04/Paper-Drift
 */

export { convertPdfToHtml, parsePageRange } from './converter.js';
export { convertPdfToMarkdown, pageToMarkdown } from './markdown/index.js';
export { reconstructTableFromLines, formatTableCell, foldHeaders } from './tables/index.js';
export { resolveReadingOrder, recursiveXyCut } from './spatial/reading-order.js';
export {
  restoreLineMath,
  restoreBlockMath,
  formatInlineMath,
  mapUnicodeToLatex,
  normalizeMathIndices,
  isMathFont,
  containsMathSymbols,
  ALL_MATH_SYMBOLS
} from './math/index.js';

import { convertPdfToHtml, parsePageRange } from './converter.js';
import { convertPdfToMarkdown, pageToMarkdown } from './markdown/index.js';
import { reconstructTableFromLines, formatTableCell, foldHeaders } from './tables/index.js';
import { resolveReadingOrder, recursiveXyCut } from './spatial/reading-order.js';
import {
  restoreLineMath,
  restoreBlockMath,
  formatInlineMath,
  mapUnicodeToLatex
} from './math/index.js';

export default {
  convertPdfToHtml,
  convertPdfToMarkdown,
  pageToMarkdown,
  reconstructTableFromLines,
  formatTableCell,
  foldHeaders,
  parsePageRange,
  resolveReadingOrder,
  recursiveXyCut,
  restoreLineMath,
  restoreBlockMath,
  formatInlineMath,
  mapUnicodeToLatex
};
