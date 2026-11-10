/**
 * @file src/metadata/index.js
 * @description Main entry point for the Scientific Metadata Extraction Subsystem.
 * Integrates Header/Frontmatter, Section Hierarchy, and Reference Extraction.
 * Part of paper-drift - https://github.com/Sooriya04/Paper-Drift
 */

import fs from 'fs';
import path from 'path';
import mupdf from 'mupdf';
import { extractPageVectorsAndText } from '../vectors/walker.js';
import { extractPageLinks } from '../links/extractor.js';
import { extractScientificHeader } from './header.js';
import { reconstructSectionHierarchy } from './sections.js';
import { extractStructuredReferences } from './references.js';
import { validateScientificMetadata, SCIENTIFIC_METADATA_VERSION } from './schema.js';

export {
  SCIENTIFIC_METADATA_VERSION,
  validateScientificMetadata
};

/**
 * Extracts comprehensive scientific metadata from a PDF file or buffer.
 *
 * @param {string|Buffer|Uint8Array} input - PDF path or binary buffer
 * @param {Object} [options={}] - Options
 * @returns {Promise<Object>} Structured scientific metadata object conforming to schema v2.0.0
 */
export async function extractScientificMetadata(input, options = {}) {
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
  try {
    const totalPages = doc.countPages();
    const rawPagesData = [];

    // Process all or bounded pages
    const maxPages = options.maxPages || totalPages;
    for (let pageIndex = 0; pageIndex < maxPages; pageIndex++) {
      const page = doc.loadPage(pageIndex);
      try {
        const bounds = page.getBounds();
        const width = bounds[2] - bounds[0];
        const height = bounds[3] - bounds[1];
        const { lines, vectors } = extractPageVectorsAndText(page);
        const links = extractPageLinks(page, doc);

        rawPagesData.push({
          pageIndex,
          pageNumber: pageIndex + 1,
          bounds,
          width,
          height,
          lines,
          vectors,
          links
        });
      } finally {
        try {
          page.destroy();
        } catch {}
      }
    }

    // 1. Extract Frontmatter Header (Title, Authors, Abstract, etc.)
    const header = extractScientificHeader(rawPagesData, null);

    // 2. Reconstruct Section Hierarchy Tree
    const sections = reconstructSectionHierarchy(rawPagesData, null);

    // 3. Extract Structured References
    const references = extractStructuredReferences(rawPagesData);

    const result = {
      ...header,
      sections,
      references
    };

    return result;
  } finally {
    try {
      doc.destroy();
    } catch {}
  }
}
