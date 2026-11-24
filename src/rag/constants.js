/**
 * @file src/rag/constants.js
 * @description Lightweight constants, option normalizers, and schema validation for RAG semantic chunking.
 * Zero external validation libraries - pure JavaScript validation.
 * Part of paper-drift - https://github.com/Sooriya04/Paper-Drift
 */

export const DEFAULT_MAX_CHUNK_CHARS = 1500;
export const DEFAULT_MIN_CHUNK_CHARS = 150;

export const BLOCK_TYPES = Object.freeze({
  HEADING: 'heading',
  PARAGRAPH: 'paragraph',
  TABLE: 'table',
  MATH: 'math'
});

/**
 * Normalizes user-supplied chunking options with fallback defaults.
 *
 * @param {Object} [options={}] - Options passed via API or function call.
 * @returns {{ maxChunkChars: number, minChunkChars: number }}
 */
export function normalizeChunkOptions(options = {}) {
  const rawMax = options.max_chunk_chars !== undefined
    ? options.max_chunk_chars
    : options.maxChunkChars;

  let maxChunkChars = DEFAULT_MAX_CHUNK_CHARS;
  if (rawMax !== undefined && rawMax !== null && rawMax !== '') {
    const parsed = Number(rawMax);
    if (!Number.isNaN(parsed) && parsed > 50) {
      maxChunkChars = Math.floor(parsed);
    }
  }

  const rawMin = options.min_chunk_chars !== undefined
    ? options.min_chunk_chars
    : options.minChunkChars;

  let minChunkChars = DEFAULT_MIN_CHUNK_CHARS;
  if (rawMin !== undefined && rawMin !== null && rawMin !== '') {
    const parsed = Number(rawMin);
    if (!Number.isNaN(parsed) && parsed >= 0 && parsed < maxChunkChars) {
      minChunkChars = Math.floor(parsed);
    }
  }

  return { maxChunkChars, minChunkChars };
}

/**
 * Validates a chunk object against the expected RAG semantic chunk schema.
 * Expected schema:
 * {
 *   chunk_id: string,
 *   section: string,
 *   page: number (positive integer),
 *   content: string (non-empty),
 *   has_math: boolean,
 *   has_table: boolean
 * }
 *
 * @param {any} chunk
 * @returns {boolean} True if chunk matches schema, false otherwise.
 */
export function isValidChunk(chunk) {
  if (!chunk || typeof chunk !== 'object' || Array.isArray(chunk)) {
    return false;
  }

  if (typeof chunk.chunk_id !== 'string' || chunk.chunk_id.trim().length === 0) {
    return false;
  }

  if (typeof chunk.section !== 'string' || chunk.section.trim().length === 0) {
    return false;
  }

  if (typeof chunk.page !== 'number' || !Number.isInteger(chunk.page) || chunk.page < 1) {
    return false;
  }

  if (typeof chunk.content !== 'string' || chunk.content.trim().length === 0) {
    return false;
  }

  if (typeof chunk.has_math !== 'boolean') {
    return false;
  }

  if (typeof chunk.has_table !== 'boolean') {
    return false;
  }

  return true;
}
