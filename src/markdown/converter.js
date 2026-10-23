/**
 * @file src/markdown/converter.js
 * @description Direct WebAssembly PDF to GitHub Flavored Markdown (GFM) conversion engine.
 * Converts academic papers and enterprise documents directly into clean, token-efficient Markdown
 * with spatial reading order, GFM pipe tables, LaTeX math restoration, and typography detection.
 * Part of paper-drift - https://github.com/Sooriya04/Paper-Drift
 */

import mupdf from 'mupdf';
import fs from 'fs';
import path from 'path';
import { parsePageRange } from '../converter.js';
import { resolveReadingOrder } from '../spatial/reading-order.js';
import { reconstructTableFromLines } from '../tables/reconstructor.js';
import { mapUnicodeToLatex, normalizeMathIndices } from '../math/index.js';

/**
 * Converts a structured page JSON representation into clean, structured Markdown.
 *
 * @param {Object} pageJson - Parsed JSON from `page.toStructuredText().asJSON()`
 * @param {number} widthPt - Page width in points
 * @param {number} heightPt - Page height in points
 * @param {Object} [options={}]
 * @returns {{ markdown: string, tablesCount: number, headingsCount: number }}
 */
export function pageToMarkdown(pageJson, widthPt, heightPt, options = {}) {
  const spatial = resolveReadingOrder(pageJson, widthPt, heightPt);
  const blocks = spatial.blocks || [];

  if (blocks.length === 0) {
    return { markdown: '', tablesCount: 0, headingsCount: 0 };
  }

  // Calculate median body font size across all lines on this page
  const fontSizes = [];
  for (const b of blocks) {
    for (const l of (b.lines || [])) {
      if (l.font?.size) fontSizes.push(l.font.size);
    }
  }
  fontSizes.sort((a, b) => a - b);
  const medianFontSize = fontSizes.length > 0 ? fontSizes[Math.floor(fontSizes.length / 2)] : 10.0;

  const mdSections = [];
  let tablesCount = 0;
  let headingsCount = 0;

  let i = 0;
  while (i < blocks.length) {
    const block = blocks[i];
    const lines = block.lines || [];
    if (lines.length === 0) {
      i++;
      continue;
    }

    const blockText = lines.map(l => l.text).join(' ').trim();

    // 1. Check for Table Caption (e.g. "Table 1: ...", "Table 2. ...", "TABLE I: ...")
    if (/^(Table|TABLE)\s+([0-9]+|[IVXLCDM]+)[:.]/i.test(blockText)) {
      mdSections.push(`**${blockText}**`);

      // Look ahead to collect consecutive table rows/blocks directly beneath this caption
      const tableLines = [];
      let j = i + 1;
      let lastBlockBottom = block.bbox.y + block.bbox.h;

      while (j < blocks.length) {
        const nextB = blocks[j];
        const nextLines = nextB.lines || [];
        if (nextLines.length === 0) { j++; continue; }

        // Stop if vertical gap between blocks exceeds standard table row spacing (> 20pt)
        const gap = nextB.bbox.y - lastBlockBottom;
        if (tableLines.length > 0 && gap > 20) {
          break;
        }

        // Stop if next block is a full-width paragraph sentence (> 240pt with > 8 words)
        const isParagraph = nextLines.some(l => (l.bbox?.w || 0) > 240 && (l.text || '').split(' ').length > 8);
        if (isParagraph) {
          break;
        }

        tableLines.push(...nextLines);
        lastBlockBottom = nextB.bbox.y + nextB.bbox.h;
        j++;
      }

      if (tableLines.length >= 4) {
        const tableMd = reconstructTableFromLines(tableLines);
        if (tableMd) {
          mdSections.push(tableMd);
          tablesCount++;
          i = j;
          continue;
        }
      }

      i++;
      continue;
    }

    // 2. Check for Table Grid within a single block
    if (lines.length >= 4 && !lines.some(l => (l.bbox?.w || 0) > 250 && (l.text || '').split(' ').length > 8)) {
      const tableMd = reconstructTableFromLines(lines);
      if (tableMd) {
        mdSections.push(tableMd);
        tablesCount++;
        i++;
        continue;
      }
    }

    // 3. Check for Display Math Equations (e.g. PE(pos, 2i) = sin(...) or expressions ending in equation tags (1))
    const isFormula = (
      lines.length <= 3 &&
      (/=\s*(sin|cos|tan|softmax|exp|\sum|\int|arg)/i.test(blockText) ||
       /PE\(/i.test(blockText) ||
       /\(\d+\)$/.test(blockText) && /[=+\-·×/]/.test(blockText))
    );

    if (isFormula) {
      let formulaText = mapUnicodeToLatex(blockText);
      formulaText = formulaText.replace(/\((\d+)\)$/, '\\tag{$1}');
      mdSections.push(`$$\n${formulaText}\n$$`);
      i++;
      continue;
    }

    // 4. Check for Document Typography & Headings
    const firstLine = lines[0];
    const fontSize = firstLine.font?.size || medianFontSize;
    const isBold = firstLine.font?.weight >= 700 || /bold/i.test(firstLine.font?.family || '');
    const isNumberedHeading = /^(\d+(\.\d+)*)\s+[A-Z]/.test(blockText);

    if (fontSize >= medianFontSize * 1.45) {
      mdSections.push(`# ${blockText}`);
      headingsCount++;
    } else if (fontSize >= medianFontSize * 1.15 || isNumberedHeading) {
      mdSections.push(`## ${blockText}`);
      headingsCount++;
    } else if (fontSize >= medianFontSize * 1.05 && isBold && blockText.length < 80) {
      mdSections.push(`### ${blockText}`);
      headingsCount++;
    } else if (/^[•–\-*]\s+/.test(blockText)) {
      // Unordered list item
      mdSections.push(`- ${blockText.replace(/^[•–\-*]\s+/, '')}`);
    } else {
      // 5. Standard body paragraph
      const formattedPara = lines
        .map(l => l.text)
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim();

      if (formattedPara) {
        mdSections.push(formattedPara);
      }
    }

    i++;
  }

  return {
    markdown: mdSections.join('\n\n'),
    tablesCount,
    headingsCount
  };
}

/**
 * Converts a PDF buffer or file path directly into GitHub Flavored Markdown (GFM).
 *
 * @param {string|Buffer|Uint8Array} input - File path or binary buffer of the PDF.
 * @param {Object} [options={}] - Conversion options.
 * @param {string|number[]} [options.pageRange='all'] - Page range to process (e.g. "1-5", "2,4", "all").
 * @param {function} [options.onProgress] - Optional progress callback `({ current, total, pageNumber }) => void`.
 * @returns {Promise<{ markdown: string, pages: Array<Object>, totalPages: number, pagesProcessed: number, durationMs: number }>}
 */
export async function convertPdfToMarkdown(input, options = {}) {
  const startTime = Date.now();
  const pageRangeStr = options.pages !== undefined ? options.pages : (options.pageRange || 'all');

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

  const pagesMarkdown = [];
  const processedPages = [];

  for (let step = 0; step < targetIndices.length; step++) {
    const pageIndex = targetIndices[step];
    const pageNumber = pageIndex + 1;

    if (typeof options.onProgress === 'function') {
      options.onProgress({
        current: step + 1,
        total: targetIndices.length,
        pageNumber,
        totalPages
      });
    }

    const page = doc.loadPage(pageIndex);
    const bounds = page.getBounds();
    const widthPt = bounds[2] - bounds[0];
    const heightPt = bounds[3] - bounds[1];

    const structuredText = page.toStructuredText();
    const pageJson = JSON.parse(structuredText.asJSON());

    const result = pageToMarkdown(pageJson, widthPt, heightPt, options);

    processedPages.push({
      pageNumber,
      width: widthPt,
      height: heightPt,
      tablesCount: result.tablesCount,
      headingsCount: result.headingsCount,
      markdown: result.markdown
    });

    if (result.markdown) {
      pagesMarkdown.push(result.markdown);
    }
  }

  const fullMarkdown = pagesMarkdown.join('\n\n---\n\n');

  return {
    markdown: fullMarkdown,
    pages: processedPages,
    totalPages,
    pagesProcessed: targetIndices.length,
    durationMs: Date.now() - startTime
  };
}
