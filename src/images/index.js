/**
 * @file src/images/index.js
 * @description Main export entry for paper-drift Image & Figure extraction engine.
 * Part of paper-drift - https://github.com/Sooriya04/Paper-Drift
 */

export { extractPdfImages } from './extractor.js';
export {
  readPageRasterImages,
  encodeImage,
  encodePixmap,
  toRgbPixmap,
  compositeWithMask,
  isUniform,
  hashPixmap
} from './raster.js';
export {
  detectPageFigures,
  findFigureTitleOrCaption,
  renderFigureRegion
} from './figures.js';
