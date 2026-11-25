/**
 * @file src/rag/index.js
 * @description High-level semantic RAG chunking engine for paper-drift.
 * Extracts AST-aware atomic blocks and packages them into pre-sliced RAG chunks
 * with guaranteed mathematical and tabular integrity.
 * Part of paper-drift - https://github.com/Sooriya04/Paper-Drift
 */

import fs from 'fs';
import mupdf from 'mupdf';
import { parsePageRange } from '../converter.js';
import { extractPageVectorsAndText } from '../vectors/walker.js';
import { rulesFromVector } from '../vectors/rules.js';
import { reconstructTables } from '../tables/grid.js';
import { reconstructPageMath } from '../math/detector.js';
import { detectPageFigures, maskFigureContent } from '../images/figures.js';
import { extractPageAtomicBlocks } from './blocks.js';
import { packAtomicBlocksIntoChunks } from './packer.js';
import { normalizeChunkOptions, DEFAULT_MAX_CHUNK_CHARS } from './constants.js';

export {
  normalizeChunkOptions,
  DEFAULT_MAX_CHUNK_CHARS,
  extractPageAtomicBlocks,
  packAtomicBlocksIntoChunks
};

/**
 * Parses a PDF into semantic, citation-grounded RAG chunks.
 *
 * @param {string|Buffer|Uint8Array} input - PDF file path or binary buffer
 * @param {Object} [options={}] - Chunking options
 * @param {string} [options.pages='all'] - Page range (e.g. '1-5', '1', 'all')
 * @param {number|string} [options.max_chunk_chars=1500] - Maximum chunk character threshold
 * @param {number|string} [options.min_chunk_chars=150] - Minimum chunk character threshold
 * @returns {Promise<Array<{ chunk_id: string, section: string, page: number, content: string, has_math: boolean, has_table: boolean }>>}
 */
export async function chunkPdfForRag(input, options = {}) {
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

  let doc;
  try {
    doc = mupdf.Document.openDocument(pdfBuffer, 'application/pdf');
  } catch (err) {
    throw new Error(`Failed to open PDF document: ${err.message}`);
  }

  try {
    const totalPages = doc.countPages();
    const pageRangeStr = options.pages || options.pageRange || 'all';
    const targetIndices = parsePageRange(pageRangeStr, totalPages);

    if (targetIndices.length === 0) {
      throw new Error(`No matching pages found for page range: "${pageRangeStr}" (Document has ${totalPages} pages).`);
    }

    const allBlocks = [];

    for (let step = 0; step < targetIndices.length; step++) {
      const pageIndex = targetIndices[step];
      const pageNumber = pageIndex + 1;
      const page = doc.loadPage(pageIndex);

      try {
        const bounds = page.getBounds();
        const width = bounds[2] - bounds[0];
        const height = bounds[3] - bounds[1];

        const { lines, vectors } = extractPageVectorsAndText(page);

        const figures = detectPageFigures({ bounds, lines, vectors });
        const { lines: cleanLines, vectors: cleanVectors } = maskFigureContent(lines, vectors, figures);

        const rules = [];
        for (const v of cleanVectors) {
          rules.push(...rulesFromVector(v));
        }

        const tables = reconstructTables(rules, cleanLines, width, height);
        const { mathItems, claimedLineIndices } = reconstructPageMath(cleanLines, cleanVectors, width, height);

        const pageData = {
          pageNumber,
          width,
          height,
          lines: cleanLines,
          tables,
          mathItems,
          claimedLineIndices
        };

        const pageBlocks = extractPageAtomicBlocks(pageData);
        allBlocks.push(...pageBlocks);
      } finally {
        try {
          page.destroy();
        } catch {}
      }
    }

    return packAtomicBlocksIntoChunks(allBlocks, options);
  } finally {
    try {
      doc.destroy();
    } catch {}
  }
}
