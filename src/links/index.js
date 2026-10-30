/**
 * @file src/links/index.js
 * @description Main export barrel for paper-drift Hyperlink and Citation Reference Engine.
 * Part of paper-drift - https://github.com/Sooriya04/Paper-Drift
 */

export {
  formatDestinationSlug,
  extractPageLinks,
  buildDocumentDestinations,
  applyLinksToLine,
  findDestinationAnchors
} from './extractor.js';
