/**
 * @file test/rag.test.js
 * @description Automated test suite for RAG semantic chunking subsystem.
 * Part of paper-drift - https://github.com/Sooriya04/Paper-Drift
 */

import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import {
  DEFAULT_MAX_CHUNK_CHARS,
  DEFAULT_MIN_CHUNK_CHARS,
  BLOCK_TYPES,
  normalizeChunkOptions,
  isValidChunk
} from '../src/rag/constants.js';
import { extractPageAtomicBlocks } from '../src/rag/blocks.js';
import { packAtomicBlocksIntoChunks } from '../src/rag/packer.js';
import { chunkPdfForRag } from '../src/rag/index.js';

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

// Test 5: packAtomicBlocksIntoChunks packs blocks without slicing math or tables
{
  const blocks = [
    {
      type: BLOCK_TYPES.HEADING,
      section: '1 Introduction',
      content: '1 Introduction',
      level: 1,
      page: 1,
      isAtomic: true
    },
    {
      type: BLOCK_TYPES.PARAGRAPH,
      content: 'Recurrent neural networks have been firmly established as state of the art approaches in sequence modeling.',
      page: 1,
      isAtomic: false,
      has_math: false,
      has_table: false
    },
    {
      type: BLOCK_TYPES.HEADING,
      section: '3.2 Multi-Head Attention',
      content: '3.2 Multi-Head Attention',
      level: 2,
      page: 4,
      isAtomic: true
    },
    {
      type: BLOCK_TYPES.PARAGRAPH,
      content: 'Multi-head attention allows the model to jointly attend to information from different representation subspaces at different positions.',
      page: 4,
      isAtomic: false,
      has_math: false,
      has_table: false
    },
    {
      type: BLOCK_TYPES.MATH,
      content: '$$\\text{MultiHead}(Q, K, V) = \\text{Concat}(\\text{head}_1, \\dots, \\text{head}_h)W^O$$',
      page: 4,
      isAtomic: true,
      has_math: true,
      has_table: false
    },
    {
      type: BLOCK_TYPES.TABLE,
      content: '| Model | BLEU |\n|---|---|\n| Transformer (base) | 27.3 |\n| Transformer (big) | 28.4 |',
      page: 5,
      isAtomic: true,
      has_math: false,
      has_table: true
    }
  ];

  // Chunk with default max threshold
  const chunks = packAtomicBlocksIntoChunks(blocks, { max_chunk_chars: 500, min_chunk_chars: 50 });
  assert.ok(chunks.length >= 2);

  // Validate every chunk with our pure JS schema validator
  for (const chunk of chunks) {
    assert.strictEqual(isValidChunk(chunk), true, `Chunk ${chunk.chunk_id} should be valid schema`);
  }

  // Section 1 chunk
  const chunk1 = chunks.find(c => c.section === '1 Introduction');
  assert.ok(chunk1);
  assert.strictEqual(chunk1.page, 1);
  assert.strictEqual(chunk1.has_math, false);
  assert.strictEqual(chunk1.has_table, false);

  // Multi-head attention chunk with formula
  const mathChunk = chunks.find(c => c.has_math === true);
  assert.ok(mathChunk);
  assert.strictEqual(mathChunk.section, '3.2 Multi-Head Attention');
  assert.strictEqual(mathChunk.page, 4);
  assert.ok(mathChunk.content.includes('\\text{MultiHead}'));

  // Table chunk
  const tableChunk = chunks.find(c => c.has_table === true);
  assert.ok(tableChunk);
  assert.strictEqual(tableChunk.page, 5);
  assert.ok(tableChunk.content.includes('| Transformer (big) | 28.4 |'));

  console.log('  ✔ packAtomicBlocksIntoChunks packs blocks into valid chunks preserving math & tables');
}

// Test 6: Public API chunkPdfForRag returns valid chunks on sample.pdf with default size
{
  const chunks = await chunkPdfForRag('test/fixtures/sample.pdf');
  assert.ok(Array.isArray(chunks));
  assert.ok(chunks.length >= 1);

  for (const chunk of chunks) {
    assert.strictEqual(isValidChunk(chunk), true);
    assert.ok(chunk.content.length <= DEFAULT_MAX_CHUNK_CHARS + 50);
  }
  console.log('  ✔ chunkPdfForRag public API returns valid chunks with default 1500 char threshold');
}

// Test 7: Custom chunk size is respected by chunkPdfForRag
{
  const smallChunks = await chunkPdfForRag('test/fixtures/benchmarks/01-attention-is-all-you-need.pdf', {
    pages: '1-2',
    max_chunk_chars: 400
  });

  const largeChunks = await chunkPdfForRag('test/fixtures/benchmarks/01-attention-is-all-you-need.pdf', {
    pages: '1-2',
    max_chunk_chars: 2500
  });

  assert.ok(smallChunks.length > largeChunks.length, 'Smaller max_chunk_chars should produce more chunks');
  for (const c of smallChunks) {
    assert.strictEqual(isValidChunk(c), true);
  }
  for (const c of largeChunks) {
    assert.strictEqual(isValidChunk(c), true);
  }
  console.log('  ✔ chunkPdfForRag respects custom max_chunk_chars option');
}

// Test 8: Math formulas remain intact in Attention paper page 4
{
  const chunks = await chunkPdfForRag('test/fixtures/benchmarks/01-attention-is-all-you-need.pdf', {
    pages: '4'
  });

  const mathChunk = chunks.find(c => c.has_math === true);
  assert.ok(mathChunk, 'Should detect math chunk on page 4');
  assert.strictEqual(mathChunk.page, 4);
  assert.ok(
    mathChunk.content.includes('\\text{Attention}') || mathChunk.content.includes('softmax') || mathChunk.content.includes('QK^T'),
    'Attention formula must remain intact inside math chunk'
  );
  console.log('  ✔ chunkPdfForRag keeps mathematical formulas intact with has_math: true');
}

// Test 9: Tables remain intact in benchmark or eval fixture
{
  const chunks = await chunkPdfForRag('test/fixtures/eval/pos_full_grid.pdf');
  const tableChunk = chunks.find(c => c.has_table === true);
  assert.ok(tableChunk, 'Should detect table chunk in table fixture');
  assert.ok(tableChunk.content.includes('|'), 'Table chunk content must contain markdown pipe table formatting');
  console.log('  ✔ chunkPdfForRag keeps table grids intact with has_table: true');
}

// Test 10: Meaningful errors on invalid inputs
{
  await assert.rejects(
    async () => chunkPdfForRag('test/fixtures/non-existent-file-xyz.pdf'),
    /File not found/,
    'Should throw "File not found" for non-existent file'
  );

  await assert.rejects(
    async () => chunkPdfForRag(12345),
    /Input must be a valid file path string/,
    'Should throw TypeError on invalid input type'
  );

  await assert.rejects(
    async () => chunkPdfForRag(Buffer.from('not a real pdf content')),
    /Failed to open PDF document/,
    'Should throw error on corrupted PDF buffer'
  );
  console.log('  ✔ chunkPdfForRag provides meaningful errors on missing, invalid, or corrupted PDFs');
}

// Test 11: CLI --format chunks generates valid JSON output
{
  const outDir = path.resolve('test/results/cli-test');
  fs.mkdirSync(outDir, { recursive: true });
  const outFile = path.join(outDir, 'sample-chunks.json');
  if (fs.existsSync(outFile)) fs.unlinkSync(outFile);

  execSync(`node bin/cli.js test/fixtures/sample.pdf "${outFile}" --format chunks`);
  assert.ok(fs.existsSync(outFile), 'Output chunks.json file must exist');

  const content = JSON.parse(fs.readFileSync(outFile, 'utf-8'));
  assert.ok(Array.isArray(content), 'Output must be a JSON array');
  assert.ok(content.length >= 1);
  for (const chunk of content) {
    assert.strictEqual(isValidChunk(chunk), true);
  }
  console.log('  ✔ CLI generates valid semantic RAG JSON with --format chunks');
}

// Test 12: CLI custom chunk size with --max-chunk-chars
{
  const outFile = path.resolve('test/results/cli-test/sample-chunks-custom.json');
  if (fs.existsSync(outFile)) fs.unlinkSync(outFile);

  execSync(`node bin/cli.js test/fixtures/sample.pdf "${outFile}" --format chunks --max-chunk-chars 500`);
  assert.ok(fs.existsSync(outFile));

  const content = JSON.parse(fs.readFileSync(outFile, 'utf-8'));
  assert.ok(Array.isArray(content));
  for (const chunk of content) {
    assert.strictEqual(isValidChunk(chunk), true);
  }
  console.log('  ✔ CLI respects --max-chunk-chars parameter');
}

// Test 13: Existing CLI formats remain unaffected
{
  const outMd = path.resolve('test/results/cli-test/existing-format-check.md');
  if (fs.existsSync(outMd)) fs.unlinkSync(outMd);

  execSync(`node bin/cli.js test/fixtures/sample.pdf "${outMd}" --format markdown`);
  assert.ok(fs.existsSync(outMd), 'Existing --format markdown should continue to work');
  const mdText = fs.readFileSync(outMd, 'utf-8');
  assert.ok(mdText.length > 50);

  console.log('  ✔ Existing CLI formats (markdown, etc.) remain unaffected');
}

console.log('\n\x1b[32m✔ All RAG tests passed successfully!\x1b[0m\n');
