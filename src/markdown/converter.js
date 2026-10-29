/**
 * @file src/markdown/converter.js
 * @description High-level WebAssembly PDF to Markdown conversion engine.
 * Combines MuPDF vector walking, geometric table extraction, dynamic typography, and Remark AST normalization.
 * Part of paper-drift - https://github.com/Sooriya04/Paper-Drift
 */

import fs from 'fs';
import mupdf from 'mupdf';
import { extractPageVectorsAndText } from '../vectors/walker.js';
import { rulesFromVector, filterContentRules } from '../vectors/rules.js';
import { reconstructTables } from '../tables/grid.js';
import { calculateBodyFontSizeMode, classifyTypography } from './typography.js';
import { normalizeMarkdown } from './normalizer.js';
import { parsePageRange } from '../converter.js';
import { recursiveXyCut } from '../spatial/reading-order.js';

/**
 * Converts a PDF buffer or file path into publication-grade GitHub Flavored Markdown (GFM).
 *
 * @param {string|Buffer|Uint8Array} input - File path or binary buffer of the PDF.
 * @param {Object} [options={}] - Conversion options.
 * @param {string|number|number[]} [options.pages='all'] - Page range specification (e.g. "1-5", "2,4", "all").
 * @param {string|number|number[]} [options.pageRange='all'] - Legacy alias for `pages`.
 * @param {boolean} [options.tables=true] - Whether to reconstruct vector tables into GFM pipe tables.
 * @param {boolean} [options.stripRepeatedLines=true] - Whether to drop running headers/footers in margins.
 * @param {function} [options.onProgress] - Optional progress callback.
 * @returns {Promise<{ markdown: string, totalPages: number, pagesProcessed: number, tablesCount: number, durationMs: number }>}
 */
export async function convertPdfToMarkdown(input, options = {}) {
  const startTime = Date.now();
  const pageRangeStr = options.pages !== undefined ? options.pages : (options.pageRange || 'all');
  const enableTables = options.tables !== false;
  const stripRepeatedLines = options.stripRepeatedLines !== false;

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
  const totalPages = doc.countPages();
  const targetIndices = parsePageRange(pageRangeStr, totalPages);

  if (targetIndices.length === 0) {
    throw new Error(`No matching pages found for page range: "${pageRangeStr}" (Document has ${totalPages} pages).`);
  }

  // 1. First pass: Walk all target pages to collect text lines and vector strokes
  const rawPagesData = [];
  for (let step = 0; step < targetIndices.length; step++) {
    const pageIndex = targetIndices[step];
    const pageNumber = pageIndex + 1;

    if (typeof options.onProgress === 'function') {
      options.onProgress({
        phase: 'reading',
        current: step + 1,
        total: targetIndices.length,
        pageNumber,
        totalPages
      });
    }

    const page = doc.loadPage(pageIndex);
    const bounds = page.getBounds();
    const width = bounds[2] - bounds[0];
    const height = bounds[3] - bounds[1];

    const { lines, vectors } = extractPageVectorsAndText(page);

    const rules = [];
    for (const v of vectors) {
      rules.push(...rulesFromVector(v));
    }

    rawPagesData.push({
      index: pageIndex,
      pageNumber,
      bounds,
      width,
      height,
      lines,
      rules
    });
  }

  // 2. Filter out recurring margin rules (running headers / footers)
  const contentRulesByPage = stripRepeatedLines
    ? filterContentRules(rawPagesData)
    : new Map(rawPagesData.map(p => [p.index, p.rules]));

  // Calculate global body font mode across all lines in the document
  const allLines = rawPagesData.flatMap(p => p.lines);
  const bodyMode = calculateBodyFontSizeMode(allLines);

  const documentMarkdownBlocks = [];
  let totalTablesCount = 0;

  // 3. Process each page: Extract tables, resolve reading flow, and apply typography
  for (let i = 0; i < rawPagesData.length; i++) {
    const pData = rawPagesData[i];
    const validRules = contentRulesByPage.get(pData.index) || [];

    // Extract tables
    let pageTables = [];
    if (enableTables) {
      pageTables = reconstructTables(validRules, pData.lines, pData.width, pData.height);
      totalTablesCount += pageTables.length;
    }

    // Set of lines claimed by tables so they are not duplicated in prose
    const claimedLines = new Set(pageTables.flatMap(t => t.linesInside));

    // Remaining prose lines
    const proseLines = pData.lines.filter(l => !claimedLines.has(l));

    // Combine prose blocks and table regions into unified reading order blocks
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
      }))
    ];

    // Spatially order all items preserving multi-column reading flow
    const contentItems = recursiveXyCut(blocksToOrder, 0, 0, pData.width, pData.height);

    // Build markdown for this page
    const pageMarkdownParts = [];
    let currentParagraph = [];
    let currentList = [];
    let lastLine = null;

    function flushParagraph() {
      if (currentParagraph.length > 0) {
        pageMarkdownParts.push(currentParagraph.join(' '));
        currentParagraph = [];
      }
    }

    function flushList() {
      if (currentList.length > 0) {
        pageMarkdownParts.push(currentList.join('\n'));
        currentList = [];
      }
    }

    function flushAll() {
      flushParagraph();
      flushList();
    }

    for (const item of contentItems) {
      if (item.type === 'table') {
        flushAll();
        lastLine = null;
        pageMarkdownParts.push(item.data.markdown);
      } else {
        const line = item.data;
        const text = line.text.trim();
        if (!text) continue;

        const role = classifyTypography(line, bodyMode, pData.height);

        if (role === 'title') {
          flushAll();
          pageMarkdownParts.push(`# ${text}`);
          lastLine = null;
        } else if (role === 'h1') {
          flushAll();
          pageMarkdownParts.push(`## ${text}`);
          lastLine = null;
        } else if (role === 'h2') {
          flushAll();
          pageMarkdownParts.push(`### ${text}`);
          lastLine = null;
        } else if (role === 'caption') {
          flushAll();
          pageMarkdownParts.push(`> **${text}**`);
          lastLine = null;
        } else if (role === 'footnote') {
          flushAll();
          pageMarkdownParts.push(`*${text}*`);
          lastLine = null;
        } else {
          // Standard body line or list item
          const isListItem = /^[-*•]\s+/.test(text) || /^\d+\.\s+/.test(text);

          if (isListItem) {
            flushParagraph();
            const normalizedItem = text.replace(/^[•*]\s+/, '- ');
            currentList.push(normalizedItem);
            lastLine = null;
          } else {
            flushList();

            // Check if vertical gap, preceding colon, or column switch indicates a paragraph break
            const lineBottom = lastLine ? (lastLine.bottom || (lastLine.top + lastLine.height)) : null;
            const lineGap = (lastLine && lineBottom !== null) ? (line.top - lineBottom) : 0;
            const isSignificantGap = lastLine && lineGap > Math.max(6, bodyMode * 0.5);
            const prevEndedWithColon = lastLine && (lastLine.text || '').trim().endsWith(':');
            const isColumnSwitch = lastLine && (line.top < lastLine.top - 10 || Math.abs(line.left - lastLine.left) > pData.width * 0.25);

            if (isSignificantGap || prevEndedWithColon || isColumnSwitch) {
              flushParagraph();
            }

            currentParagraph.push(text);
            lastLine = line;
          }
        }
      }
    }

    flushAll();

    if (pageMarkdownParts.length > 0) {
      documentMarkdownBlocks.push(pageMarkdownParts.join('\n\n'));
    }
  }

  const rawDocumentMarkdown = documentMarkdownBlocks.join('\n\n');

  // 4. Normalize through Unified / Remark AST
  const normalizedMarkdown = await normalizeMarkdown(rawDocumentMarkdown);

  return {
    markdown: normalizedMarkdown,
    totalPages,
    pagesProcessed: targetIndices.length,
    tablesCount: totalTablesCount,
    durationMs: Date.now() - startTime
  };
}
