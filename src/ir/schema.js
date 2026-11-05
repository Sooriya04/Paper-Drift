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
import { calculateBodyFontSizeMode, classifyTypography } from '../markdown/typography.js';
import { parsePageRange } from '../converter.js';
import { recursiveXyCut } from '../spatial/reading-order.js';
import { extractPdfImages } from '../images/extractor.js';
import {
  extractPageLinks,
  buildDocumentDestinations,
  applyLinksToLine,
  findDestinationAnchors
} from '../links/extractor.js';

/**
 * Validates a document IR object against the required lightweight, bbox-free schema structure.
 * Enforces Document schema: { title, author, pageCount, outline, metadata, blocks }
 * and Block schema: { id, type, content, page, order, metadata? } with NO bbox.
 *
 * @param {Object} doc - Document IR object to validate.
 * @returns {boolean} True if valid according to schema, false otherwise.
 */
export function validateDocumentIR(doc) {
  if (!doc || typeof doc !== 'object') return false;
  if (typeof doc.title !== 'string') return false;
  if (typeof doc.pageCount !== 'number') return false;
  if (!Array.isArray(doc.outline)) return false;
  if (!doc.metadata || typeof doc.metadata !== 'object') return false;
  if (!Array.isArray(doc.blocks)) return false;

  const validTypes = new Set([
    'heading',
    'paragraph',
    'table',
    'image',
    'equation',
    'caption',
    'footnote',
    'list'
  ]);

  for (const block of doc.blocks) {
    if (!block || typeof block !== 'object') return false;
    if (typeof block.id !== 'string') return false;
    if (!validTypes.has(block.type)) return false;
    if (block.content === undefined || block.content === null) return false;
    if (typeof block.page !== 'number') return false;
    // Bbox-free assertion: bounding boxes and spatial coordinates are omitted
    if ('bbox' in block) return false;
    if (typeof block.order !== 'number') return false;
    if (block.metadata !== undefined && (typeof block.metadata !== 'object' || block.metadata === null)) return false;
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
 * Recursively normalizes MuPDF outline tree nodes to match the standard TypeScript outline schema.
 * Replaces MuPDF's C pointer `down` array with standard AST `children`.
 *
 * @param {Array<Object>} items - Array of MuPDF outline items.
 * @returns {Array<Object>} Normalized outline tree with `children`.
 */
function normalizeOutlineTree(items) {
  if (!Array.isArray(items)) return [];
  return items.map(item => ({
    title: item.title || '',
    uri: item.uri || undefined,
    page: item.page !== undefined ? item.page : undefined,
    open: item.open !== undefined ? Boolean(item.open) : undefined,
    children: item.down ? normalizeOutlineTree(item.down) : []
  }));
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

    const documentDestinations = enableLinks ? buildDocumentDestinations(doc, targetIndices) : new Map();

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

    const allLines = rawPagesData.flatMap(p => p.lines);
    const bodyMode = calculateBodyFontSizeMode(allLines);

    const blocks = [];
    let globalOrder = 0;
    const claimedAnchorIds = new Set();

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

      for (const item of contentItems) {
        if (item.type === 'table') {
          const t = item.data;
          blocks.push({
            id: `blk-p${pData.pageNumber}-${globalOrder}`,
            type: 'table',
            content: {
              markdown: t.markdown,
              rows: t.rows || [],
              columns: t.cols || []
            },
            page: pData.pageNumber,
            order: globalOrder++,
            metadata: { tableType: t.type || 'grid' }
          });
        } else if (item.type === 'image') {
          const img = item.data;
          blocks.push({
            id: `blk-p${pData.pageNumber}-${globalOrder}`,
            type: 'image',
            content: {
              type: img.type || 'image',
              link: img.link || '',
              alt: img.alt || 'Image',
              caption: img.caption || null,
              width: img.width || 0,
              height: img.height || 0
            },
            page: pData.pageNumber,
            order: globalOrder++,
            metadata: {
              filename: img.filename || null,
              sizeKb: img.sizeKb || null
            }
          });
        } else {
          const line = item.data;
          const pageDests = documentDestinations.get(pData.index) || [];
          const anchorTags = enableLinks ? findDestinationAnchors(line, pageDests, claimedAnchorIds) : '';
          const anchorMatches = anchorTags ? Array.from(anchorTags.matchAll(/id="([^"]+)"/g)).map(m => m[1]) : [];

          const formattedText = enableLinks ? applyLinksToLine(line, pData.links) : line.text;
          const text = (formattedText || '').trim();
          if (!text) continue;

          const role = classifyTypography(line, bodyMode, pData.height);
          let irType = 'paragraph';
          const metadata = {};

          if (role === 'title') {
            irType = 'heading';
            metadata.level = 'title';
          } else if (role === 'h1') {
            irType = 'heading';
            metadata.level = 'h1';
            const secMatch = line.text.trim().match(/^(\d+(?:\.\d+)*)\.?\s+/);
            if (secMatch) {
              const secId = `section-${secMatch[1].replace(/\./g, '-')}`;
              metadata.slug = secId;
              if (!claimedAnchorIds.has(secId)) {
                claimedAnchorIds.add(secId);
              }
            }
          } else if (role === 'h2') {
            irType = 'heading';
            metadata.level = 'h2';
            const secMatch = line.text.trim().match(/^(\d+(?:\.\d+)*)\.?\s+/);
            if (secMatch) {
              const prefix = secMatch[1].includes('.') ? 'subsection' : 'section';
              const secId = `${prefix}-${secMatch[1].replace(/\./g, '-')}`;
              metadata.slug = secId;
              if (!claimedAnchorIds.has(secId)) {
                claimedAnchorIds.add(secId);
              }
            }
          } else if (role === 'caption') {
            irType = 'caption';
          } else if (role === 'footnote') {
            irType = 'footnote';
          } else if (/^[-*•]\s+/.test(text) || /^\d+\.\s+/.test(text)) {
            irType = 'list';
          } else if (/^[\\$].*[\\$]$/.test(text) || /^[A-Z][a-z]?\s*=\s*/.test(text) && text.length < 30) {
            // Ponytail: heuristic classification for standalone inline/display equations
            // Upgrade path: robust LaTeX math OCR detector
            irType = 'equation';
          }

          blocks.push({
            id: `blk-p${pData.pageNumber}-${globalOrder}`,
            type: irType,
            content: text,
            page: pData.pageNumber,
            order: globalOrder++,
            metadata: {
              font: line.font || null,
              fontSize: line.font?.size || null,
              ...(anchorMatches.length > 0 ? { anchorIds: anchorMatches } : {}),
              ...metadata
            }
          });
        }
      }
    }

    let docAuthor = null;
    try {
      const metaAuthor = doc.getMetaData('info:Author');
      if (metaAuthor && typeof metaAuthor === 'string') {
        docAuthor = metaAuthor.trim();
      }
    } catch {}

    let docOutline = [];
    try {
      const rawOutline = doc.loadOutline();
      if (Array.isArray(rawOutline)) {
        docOutline = normalizeOutlineTree(rawOutline);
      }
    } catch {}

    return {
      title: docTitle,
      author: docAuthor,
      pageCount: totalPages,
      outline: docOutline,
      metadata: {
        generator: 'paper-drift',
        scale: options.scale || 2.0,
        createdAt: new Date().toISOString()
      },
      blocks
    };
  } finally {
    try {
      doc.destroy();
    } catch {}
  }
}
