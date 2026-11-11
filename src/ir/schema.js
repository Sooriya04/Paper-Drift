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
import { reconstructTables, linkMultiPageTables } from '../tables/grid.js';
import { parsePageRange } from '../converter.js';
import { recursiveXyCut } from '../spatial/reading-order.js';
import { extractPdfImages } from '../images/extractor.js';
import {
  extractPageLinks,
  applyLinksToLine
} from '../links/extractor.js';
import { normalizePageText, filterRunningHeadersFooters } from '../normalization/text.js';
import { reconstructPageMath, toLaTeX, toMathML } from '../math/index.js';

/**
 * Validates a document IR object against the minimal page-based schema.
 * Enforces:
 * - Exactly `{ metadata, pages }` top-level structure
 * - Top-level `metadata` object with exactly `{ title: string, pageCount: number }` (pageCount is positive integer)
 * - Top-level `pages` non-empty array: `[{ page: number, content: string, tables?: TableIR[] }, ...]`
 * - Each page entry must have a valid positive integer `page` <= `metadata.pageCount` and `content` string
 * - Pages must be unique and in ascending order without duplicate page numbers
 * - If optional `tables` array is present on a page, validates each table structure
 *
 * @param {Object} doc - Document IR object to validate.
 * @returns {boolean} True if valid according to schema, false otherwise.
 */
export function validateDocumentIR(doc) {
  if (!doc || typeof doc !== 'object' || Array.isArray(doc)) return false;

  const topKeys = Object.keys(doc);
  if (topKeys.length !== 2 || !topKeys.includes('metadata') || !topKeys.includes('pages')) {
    return false;
  }

  if (!doc.metadata || typeof doc.metadata !== 'object' || Array.isArray(doc.metadata)) return false;
  if (typeof doc.metadata.title !== 'string' || doc.metadata.title.trim().length === 0) return false;
  if (typeof doc.metadata.pageCount !== 'number' || !Number.isInteger(doc.metadata.pageCount) || doc.metadata.pageCount < 1) {
    return false;
  }

  const metaKeys = Object.keys(doc.metadata);
  if (metaKeys.length !== 2 || !metaKeys.includes('title') || !metaKeys.includes('pageCount')) {
    return false;
  }

  if (!Array.isArray(doc.pages) || doc.pages.length === 0) return false;

  const seenPages = new Set();
  let prevPage = 0;

  for (const pageObj of doc.pages) {
    if (!pageObj || typeof pageObj !== 'object' || Array.isArray(pageObj)) return false;
    if (typeof pageObj.page !== 'number' || !Number.isInteger(pageObj.page) || pageObj.page < 1 || pageObj.page > doc.metadata.pageCount) {
      return false;
    }
    if (typeof pageObj.content !== 'string') return false;

    // Disallow duplicate pages and ensure ascending page order
    if (seenPages.has(pageObj.page) || pageObj.page < prevPage) {
      return false;
    }
    seenPages.add(pageObj.page);
    prevPage = pageObj.page;

    const pageKeys = Object.keys(pageObj);
    const validPageKeys = ['page', 'content', 'tables', 'math'];
    for (const k of pageKeys) {
      if (!validPageKeys.includes(k)) return false;
    }

    if (pageObj.tables !== undefined) {
      if (!Array.isArray(pageObj.tables)) return false;
      for (const t of pageObj.tables) {
        if (!t || typeof t !== 'object') return false;
        if (typeof t.rows !== 'number' || typeof t.cols !== 'number') return false;
        if (t.cells && !Array.isArray(t.cells)) return false;
      }
    }

    if (pageObj.math !== undefined) {
      if (!Array.isArray(pageObj.math)) return false;
      for (const m of pageObj.math) {
        if (!m || typeof m !== 'object') return false;
        if (typeof m.type !== 'string' || typeof m.latex !== 'string' || typeof m.mathml !== 'string') return false;
      }
    }
  }

  return true;
}

/**
 * Serializes a Document IR object into a deterministic, formatted JSON string.
 * Canonicalizes key ordering (metadata before pages; title before pageCount; page before content before tables)
 * to ensure deterministic output for diffs, caching, and downstream LLM tools.
 *
 * @param {Object} docIR - Document IR object.
 * @returns {string} Pretty-printed, deterministically sorted JSON string representation.
 */
export function exportToJson(docIR) {
  if (!docIR || typeof docIR !== 'object') {
    throw new TypeError('Document IR must be a non-null object.');
  }

  function canonicalize(val) {
    if (val === null || typeof val !== 'object') return val;
    if (Array.isArray(val)) return val.map(canonicalize);
    const sorted = {};
    for (const k of Object.keys(val).sort()) {
      sorted[k] = canonicalize(val[k]);
    }
    return sorted;
  }

  const ordered = {};
  if (docIR.metadata && typeof docIR.metadata === 'object' && !Array.isArray(docIR.metadata)) {
    ordered.metadata = {
      title: docIR.metadata.title,
      pageCount: docIR.metadata.pageCount,
      ...canonicalize(Object.fromEntries(
        Object.entries(docIR.metadata).filter(([k]) => k !== 'title' && k !== 'pageCount')
      ))
    };
  }

  if (Array.isArray(docIR.pages)) {
    ordered.pages = docIR.pages.map(p => {
      if (!p || typeof p !== 'object' || Array.isArray(p)) return p;
      const pageEntry = {
        page: p.page,
        content: p.content
      };
      if (p.tables !== undefined) {
        pageEntry.tables = canonicalize(p.tables);
      }
      for (const k of Object.keys(p).sort()) {
        if (k !== 'page' && k !== 'content' && k !== 'tables') {
          pageEntry[k] = canonicalize(p[k]);
        }
      }
      return pageEntry;
    });
  }

  for (const k of Object.keys(docIR).sort()) {
    if (k !== 'metadata' && k !== 'pages') {
      ordered[k] = canonicalize(docIR[k]);
    }
  }

  return JSON.stringify(ordered, null, 2);
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

      // Reconstruct page math
      const { mathItems, claimedLineIndices } = reconstructPageMath(pData.lines, pData.vectors, pData.width, pData.height);

      // Extracted images and figures for this page
      const pageImages = (imageExtractionResult?.byPage.get(pData.pageNumber)) || [];

      // Claim lines belonging to tables, vector figures, and math so prose does not duplicate them
      const claimedLines = new Set([
        ...pageTables.flatMap(t => t.linesInside),
        ...pageImages.flatMap(img => img.insideLines || []),
        ...Array.from(claimedLineIndices).map(idx => pData.lines[idx])
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
        })),
        ...mathItems.map(m => ({
          bbox: {
            x: m.bbox[0],
            y: m.bbox[1],
            w: m.bbox[2] - m.bbox[0],
            h: m.bbox[3] - m.bbox[1]
          },
          type: 'math',
          data: m
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
        } else if (item.type === 'math') {
          const m = item.data;
          if (m && m.markdown) {
            pageTextParts.push(m.markdown);
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

      const rawPageContent = pageTextParts.join('\n');
      const normalizedContent = options.normalize !== false ? normalizePageText(rawPageContent) : rawPageContent;

      const pageEntry = {
        page: pData.pageNumber,
        content: normalizedContent
      };

      if (options.structuredTables && pageTables.length > 0) {
        pageEntry.tables = pageTables.map((t, tIdx) => ({
          id: `table-${pData.pageNumber}-${tIdx + 1}`,
          bbox: t.bbox,
          rows: t.geometry?.rows || t.matrix?.length || 0,
          cols: t.geometry?.cols || t.matrix?.[0]?.length || 0,
          markdown: t.markdown,
          cells: t.cells || [],
          headers: t.headers,
          continuation: t.continuation
        }));
      }

      if (options.structuredMath && mathItems.length > 0) {
        pageEntry.math = mathItems.map(m => ({
          type: 'math',
          latex: toLaTeX(m.node),
          mathml: toMathML(m.node),
          bbox: m.bbox,
          equationNumber: m.node.label || null
        }));
      }

      pages.push(pageEntry);
    }

    // Link multi-page tables across pages if structuredTables enabled
    if (options.structuredTables) {
      linkMultiPageTables(pages);
    }

    const finalPages = (options.stripHeadersFooters !== false && pages.length > 1)
      ? filterRunningHeadersFooters(pages)
      : pages;

    return {
      metadata: {
        title: docTitle,
        pageCount: totalPages
      },
      pages: finalPages
    };
  } finally {
    try {
      doc.destroy();
    } catch {}
  }
}
