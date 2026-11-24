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
import { extractPageAtomicBlocks } from '../src/rag/blocks.js';

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

// Test 4: extractPageAtomicBlocks partitions headings, paragraphs, tables, and math
{
  const mockPageData = {
    pageNumber: 3,
    width: 600,
    height: 800,
    lines: [
      { text: '3.2 Multi-Head Attention', top: 100, left: 50, width: 250, height: 14, font: { isBold: true, size: 14 } },
      { text: 'Multi-head attention allows the model to attend', top: 130, left: 50, width: 300, height: 10, font: { isBold: false, size: 10 } },
      { text: 'to information at different positions.', top: 145, left: 50, width: 280, height: 10, font: { isBold: false, size: 10 } }
    ],
    mathItems: [
      {
        bbox: [50, 180, 450, 220],
        markdown: '$$\\text{Attention}(Q, K, V) = \\text{softmax}\\left(\\frac{QK^T}{\\sqrt{d_k}}\\right)V$$'
      }
    ],
    tables: [
      {
        bbox: [50, 240, 500, 320],
        markdown: '| Model | BLEU |\n|---|---|\n| Transformer | 28.4 |',
        linesInside: []
      }
    ]
  };

  const blocks = extractPageAtomicBlocks(mockPageData);
  assert.strictEqual(blocks.length, 4);

  // 1. Heading block
  assert.strictEqual(blocks[0].type, BLOCK_TYPES.HEADING);
  assert.strictEqual(blocks[0].content, '3.2 Multi-Head Attention');
  assert.strictEqual(blocks[0].level, 2);
  assert.strictEqual(blocks[0].page, 3);
  assert.strictEqual(blocks[0].isAtomic, true);

  // 2. Paragraph block
  assert.strictEqual(blocks[1].type, BLOCK_TYPES.PARAGRAPH);
  assert.ok(blocks[1].content.includes('Multi-head attention allows'));
  assert.strictEqual(blocks[1].page, 3);
  assert.strictEqual(blocks[1].has_math, false);
  assert.strictEqual(blocks[1].has_table, false);

  // 3. Math block (Atomic)
  assert.strictEqual(blocks[2].type, BLOCK_TYPES.MATH);
  assert.ok(blocks[2].content.includes('\\text{Attention}'));
  assert.strictEqual(blocks[2].isAtomic, true);
  assert.strictEqual(blocks[2].has_math, true);
  assert.strictEqual(blocks[2].has_table, false);

  // 4. Table block (Atomic)
  assert.strictEqual(blocks[3].type, BLOCK_TYPES.TABLE);
  assert.ok(blocks[3].content.includes('| Model | BLEU |'));
  assert.strictEqual(blocks[3].isAtomic, true);
  assert.strictEqual(blocks[3].has_table, true);
  assert.strictEqual(blocks[3].has_math, false);

  console.log('  ✔ extractPageAtomicBlocks accurately structures headings, prose, math, and tables');
}

console.log('\n\x1b[32m✔ All Phase 1 RAG tests passed successfully!\x1b[0m\n');
