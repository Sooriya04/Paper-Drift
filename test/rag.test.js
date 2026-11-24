/**
 * @file test/rag.test.js
 * @description Automated test suite for RAG semantic chunking subsystem.
 * Part of paper-drift - https://github.com/Sooriya04/Paper-Drift
 */

import assert from 'node:assert';
import {
  DEFAULT_MAX_CHUNK_CHARS,
  DEFAULT_MIN_CHUNK_CHARS,
  BLOCK_TYPES,
  normalizeChunkOptions,
  isValidChunk
} from '../src/rag/constants.js';

console.log('\nRunning RAG Semantic Chunking Subsystem Test Suite');

// Test 1: Default option normalization
{
  const opts = normalizeChunkOptions();
  assert.strictEqual(opts.maxChunkChars, DEFAULT_MAX_CHUNK_CHARS);
  assert.strictEqual(opts.minChunkChars, DEFAULT_MIN_CHUNK_CHARS);
  console.log('  ✔ normalizeChunkOptions uses defaults when no options provided');
}

// Test 2: Custom options in camelCase and snake_case
{
  const camel = normalizeChunkOptions({ maxChunkChars: 800, minChunkChars: 100 });
  assert.strictEqual(camel.maxChunkChars, 800);
  assert.strictEqual(camel.minChunkChars, 100);

  const snake = normalizeChunkOptions({ max_chunk_chars: '1200', min_chunk_chars: '50' });
  assert.strictEqual(snake.maxChunkChars, 1200);
  assert.strictEqual(snake.minChunkChars, 50);

  // Fallback on invalid values
  const invalid = normalizeChunkOptions({ max_chunk_chars: 'foo', min_chunk_chars: -20 });
  assert.strictEqual(invalid.maxChunkChars, DEFAULT_MAX_CHUNK_CHARS);
  assert.strictEqual(invalid.minChunkChars, DEFAULT_MIN_CHUNK_CHARS);
  console.log('  ✔ normalizeChunkOptions parses both camelCase and snake_case options and sanitizes bad input');
}

// Test 3: isValidChunk validation
{
  const validChunk = {
    chunk_id: 'chunk-1',
    section: '3.2 Multi-Head Attention',
    page: 4,
    content: 'Multi-head attention allows the model to jointly attend...',
    has_math: true,
    has_table: false
  };
  assert.strictEqual(isValidChunk(validChunk), true);

  // Missing chunk_id
  assert.strictEqual(isValidChunk({ ...validChunk, chunk_id: '' }), false);
  // Missing section
  assert.strictEqual(isValidChunk({ ...validChunk, section: '   ' }), false);
  // Invalid page
  assert.strictEqual(isValidChunk({ ...validChunk, page: 0 }), false);
  assert.strictEqual(isValidChunk({ ...validChunk, page: -1 }), false);
  assert.strictEqual(isValidChunk({ ...validChunk, page: '4' }), false);
  // Missing content
  assert.strictEqual(isValidChunk({ ...validChunk, content: '' }), false);
  // Missing booleans
  assert.strictEqual(isValidChunk({ ...validChunk, has_math: 'true' }), false);
  assert.strictEqual(isValidChunk({ ...validChunk, has_table: null }), false);
  // Non-objects
  assert.strictEqual(isValidChunk(null), false);
  assert.strictEqual(isValidChunk([]), false);
  assert.strictEqual(isValidChunk('chunk'), false);

  console.log('  ✔ isValidChunk accurately validates chunk schema without external libraries');
}

console.log('\n\x1b[32m✔ All Phase 1 RAG tests passed successfully!\x1b[0m\n');
