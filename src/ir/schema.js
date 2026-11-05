/**
 * @file src/ir/schema.js
 * @description Lightweight Structured Document IR (Intermediate Representation) schema definition,
 * validation, builder, and JSON exporter for paper-drift.
 * Produces clean, bbox-free, agent-first JSON optimized for LLMs, RAG, and AI agents.
 * Part of paper-drift - https://github.com/Sooriya04/Paper-Drift
 */

import fs from 'fs';
import path from 'path';
import mupdf from 'mupdf';
import { extractPageVectorsAndText } from '../vectors/walker.js';
import { rulesFromVector, filterContentRules } from '../vectors/rules.js';
import { reconstructTables } from '../tables/grid.js';
import { parsePageRange } from '../converter.js';
import { recursiveXyCut } from '../spatial/reading-order.js';
import { extractPdfImages } from '../images/extractor.js';
import {
  extractPageLinks,
  applyLinksToLine
} from '../links/extractor.js';

/**
 * Validates a document IR object against the minimal page-based schema.
 * Enforces:
 * - Top-level `metadata` object with exactly `{ title: string, pageCount: number }`
 * - Top-level `pages` array: `[{ page: number, content: string }, ...]`
 *
 * @param {Object} doc - Document IR object to validate.
 * @returns {boolean} True if valid according to schema, false otherwise.
 */
export function validateDocumentIR(doc) {
  if (!doc || typeof doc !== 'object') return false;
  if (!doc.metadata || typeof doc.metadata !== 'object') return false;
  if (typeof doc.metadata.title !== 'string') return false;
  if (typeof doc.metadata.pageCount !== 'number') return false;
  const metaKeys = Object.keys(doc.metadata);
  if (metaKeys.length !== 2 || !metaKeys.includes('title') || !metaKeys.includes('pageCount')) {
    return false;
  }
  if (!Array.isArray(doc.pages)) return false;

  for (const pageObj of doc.pages) {
    if (!pageObj || typeof pageObj !== 'object') return false;
    if (typeof pageObj.page !== 'number') return false;
    if (typeof pageObj.content !== 'string') return false;
    const pageKeys = Object.keys(pageObj);
    if (pageKeys.length !== 2 || !pageKeys.includes('page') || !pageKeys.includes('content')) {
      return false;
    }
  }

  return true;
}

/**
 * Serializes a Document IR object into a formatted JSON string.
 *
 * @param {Object} docIR - Document IR object.
 * @returns {string} Pretty-printed JSON string representation.
 */
export function exportToJson(docIR) {
  return JSON.stringify(docIR, null, 2);
}

/**
 * Converts a PDF buffer or file path into a lightweight, normalized Structured Document IR.
 * Performs reading-order spatial sorting, typography classification, anchor & slug resolution,
 * table and image extraction, and outline normalization while omitting bounding boxes.
 *
 * @param {string|Buffer|Uint8Array} input - File path or binary buffer of the PDF.
 * @param {Object} [options={}] - Conversion options.
 * @returns {Promise<Object>} Lightweight Structured Document IR object.
 */
export async function convertPdfToDocumentIR(input, options = {}) {
  const pageRangeStr = options.pages !== undefined ? options.pages : (options.pageRange || 'all');
  const enableTables = options.tables !== false;
  const stripRepeatedLines = options.stripRepeatedLines !== false;
  const enableLinks = options.links !== false;
  const extractImagesOption = options.extractImages !== false;

  let pdfBuffer;
  let docTitle = options.title || 'Document';

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

  const doc = mupdf.Document.openDocument(pdfBuffer, 'application/pdf');
  try {
    const totalPages = doc.countPages();
    const targetIndices = parsePageRange(pageRangeStr, totalPages);

    if (targetIndices.length === 0) {
      throw new Error(`No matching pages found for page range: "${pageRangeStr}" (Document has ${totalPages} pages).`);
    }

    const rawPagesData = [];
    for (let step = 0; step < targetIndices.length; step++) {
      const pageIndex = targetIndices[step];
      const pageNumber = pageIndex + 1;

      const page = doc.loadPage(pageIndex);
      try {
        const bounds = page.getBounds();
        const width = bounds[2] - bounds[0];
        const height = bounds[3] - bounds[1];

        const { lines, vectors } = extractPageVectorsAndText(page);
        const links = enableLinks ? extractPageLinks(page, doc) : [];

        const rules = [];
        for (const v of vectors) {
          rules.push(...rulesFromVector(v));
        }

        rawPagesData.push({
          index: pageIndex,
          pageIndex,
          pageNumber,
          bounds,
          width,
          height,
          lines,
          vectors,
          rules,
          links
        });
      } finally {
        try {
          page.destroy();
        } catch {}
      }
    }

    // Extract images and figures if enabled
    let imageExtractionResult = null;
    if (extractImagesOption) {
      let imagesDir = null;
      let linkPrefix = 'assets';
      if (typeof extractImagesOption === 'object' && extractImagesOption !== null) {
        imagesDir = extractImagesOption.dir || null;
        linkPrefix = extractImagesOption.linkPrefix !== undefined
          ? extractImagesOption.linkPrefix
          : (imagesDir ? path.basename(imagesDir) : 'assets');
      }

      imageExtractionResult = await extractPdfImages(input, {
        pages: pageRangeStr,
        dir: imagesDir,
        linkPrefix,
        scale: options.scale || 2.0,
        pagesData: rawPagesData
      });
    }

    const contentRulesByPage = stripRepeatedLines
      ? filterContentRules(rawPagesData)
      : new Map(rawPagesData.map(p => [p.index, p.rules]));

    const pages = [];

    for (let i = 0; i < rawPagesData.length; i++) {
      const pData = rawPagesData[i];
      const validRules = contentRulesByPage.get(pData.index) || [];

      let pageTables = [];
      if (enableTables) {
        pageTables = reconstructTables(validRules, pData.lines, pData.width, pData.height);
      }

      // Extracted images and figures for this page
      const pageImages = (imageExtractionResult?.byPage.get(pData.pageNumber)) || [];

      // Claim lines belonging to tables and vector figures so prose does not duplicate them
      const claimedLines = new Set([
        ...pageTables.flatMap(t => t.linesInside),
        ...pageImages.flatMap(img => img.insideLines || [])
      ]);

      const proseLines = pData.lines.filter(l => !claimedLines.has(l));

      // Construct temporary spatial blocks for reading-order sorting
      const blocksToOrder = [
        ...proseLines.map(l => ({
          bbox: { x: l.left, y: l.top, w: l.width, h: l.height },
          type: 'line',
          data: l
        })),
        ...pageTables.map(t => ({
          bbox: {
            x: t.bbox[0],
            y: t.bbox[1],
            w: t.bbox[2] - t.bbox[0],
            h: t.bbox[3] - t.bbox[1]
          },
          type: 'table',
          data: t
        })),
        ...pageImages.map(img => ({
          bbox: {
            x: img.bbox[0],
            y: img.bbox[1],
            w: img.bbox[2] - img.bbox[0],
            h: img.bbox[3] - img.bbox[1]
          },
          type: 'image',
          data: img
        }))
      ];

      // Recursively partition and order content items via XY-Cut
      const contentItems = recursiveXyCut(blocksToOrder, 0, 0, pData.width, pData.height);
      const pageTextParts = [];

      for (const item of contentItems) {
        if (item.type === 'table') {
          const t = item.data;
          if (t && t.markdown) {
            const tableMd = t.markdown.trim();
            if (tableMd) {
              pageTextParts.push(tableMd);
            }
          }
        } else if (item.type === 'image') {
          const img = item.data;
          if (img && img.caption) {
            const cap = img.caption.trim();
            if (cap) {
              pageTextParts.push(cap);
            }
          }
        } else {
          const line = item.data;
          const formattedText = enableLinks ? applyLinksToLine(line, pData.links) : line.text;
          const text = (formattedText || '').trim();
          if (text) {
            pageTextParts.push(text);
          }
        }
      }

      pages.push({
        page: pData.pageNumber,
        content: pageTextParts.join('\n')
      });
    }

    return {
      metadata: {
        title: docTitle,
        pageCount: totalPages
      },
      pages
    };
  } finally {
    try {
      doc.destroy();
    } catch {}
  }
}
