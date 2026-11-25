/**
 * @file src/rag/packer.js
 * @description Boundary-aware semantic chunk packing engine.
 * Packs atomic blocks into RAG chunks without slicing formulas or tables.
 * Part of paper-drift - https://github.com/Sooriya04/Paper-Drift
 */

import { BLOCK_TYPES, normalizeChunkOptions, isValidChunk } from './constants.js';

/**
 * Splits an oversized prose string into natural sentence-level segments.
 * Correctly preserves internal decimal numbers (e.g. 28.4 BLEU, 3.5 days)
 * by only breaking on punctuation followed by whitespace or end-of-string.
 */
function splitOversizedParagraph(text, maxChars) {
  const sentences = text.match(/(?:[^.!?]|\.(?!\s)|!(?!\s)|\?(?!\s))+[.!?]+(?:\s+|$)|.+$/g) || [text];
  const slices = [];
  let buffer = '';

  for (const s of sentences) {
    const trimmed = s.trim();
    if (!trimmed) continue;
    if (buffer.length > 0 && (buffer.length + trimmed.length + 1) > maxChars) {
      slices.push(buffer.trim());
      buffer = trimmed;
    } else {
      buffer += (buffer.length > 0 ? ' ' : '') + trimmed;
    }
  }

  if (buffer.trim().length > 0) {
    slices.push(buffer.trim());
  }
  return slices;
}

/**
 * Packs a sequential list of atomic layout blocks into semantic RAG chunks.
 *
 * @param {Array<Object>} blocks - Atomic blocks from extractPageAtomicBlocks
 * @param {Object} [options={}] - Chunking options
 * @returns {Array<{ chunk_id: string, section: string, page: number, content: string, has_math: boolean, has_table: boolean }>}
 */
export function packAtomicBlocksIntoChunks(blocks = [], options = {}) {
  const { maxChunkChars, minChunkChars } = normalizeChunkOptions(options);
  const chunks = [];

  let chunkCounter = 1;
  let activeSection = 'Document';
  let activePage = 1;
  let chunkStartPage = 1;
  let currentBuffer = [];
  let currentLen = 0;
  let currentHasMath = false;
  let currentHasTable = false;

  function flushChunk() {
    if (currentBuffer.length === 0) return;
    const content = currentBuffer.join('\n\n').trim();
    if (content.length > 0) {
      const chunk = {
        chunk_id: `chunk-${chunkCounter++}`,
        section: activeSection,
        page: chunkStartPage,
        content,
        has_math: currentHasMath,
        has_table: currentHasTable
      };
      if (isValidChunk(chunk)) {
        chunks.push(chunk);
      }
    }
    currentBuffer.length = 0;
    currentLen = 0;
    currentHasMath = false;
    currentHasTable = false;
  }

  function appendToBuffer(text, page, hasMath = false, hasTable = false) {
    if (currentBuffer.length === 0) {
      chunkStartPage = page || activePage;
    }
    currentBuffer.push(text.trim());
    currentLen += text.length + 2;
    if (hasMath) currentHasMath = true;
    if (hasTable) currentHasTable = true;
  }

  for (const block of blocks) {
    if (!block || !block.content) continue;
    const blockPage = block.page || activePage;

    // Headings trigger boundary flush and update section context
    if (block.type === BLOCK_TYPES.HEADING) {
      if (currentLen >= minChunkChars) {
        flushChunk();
      }
      activeSection = block.section || block.content || activeSection;
      activePage = blockPage;
      continue;
    }

    // Page change flush: Preserve accurate citation page grounding when previous buffer is adequate
    if (currentBuffer.length > 0 && blockPage !== chunkStartPage && currentLen >= minChunkChars) {
      flushChunk();
    }

    const blockLen = block.content.length;

    // Atomic blocks (tables, math) are NEVER sliced
    if (block.isAtomic) {
      if (currentLen > 0 && (currentLen + blockLen + 2) > maxChunkChars) {
        flushChunk();
      }
      appendToBuffer(block.content, blockPage, Boolean(block.has_math), Boolean(block.has_table));
      continue;
    }

    // Prose paragraphs: If single paragraph exceeds max threshold, split at sentence boundaries
    if (blockLen > maxChunkChars) {
      flushChunk();
      const subParagraphs = splitOversizedParagraph(block.content, maxChunkChars);
      for (const sub of subParagraphs) {
        appendToBuffer(sub, blockPage);
        flushChunk();
      }
      continue;
    }

    // Normal prose packing
    if (currentLen > 0 && (currentLen + blockLen + 2) > maxChunkChars) {
      flushChunk();
    }
    appendToBuffer(block.content, blockPage);
  }

  flushChunk();
  return chunks;
}
