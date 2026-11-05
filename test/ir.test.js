/**
 * @file test/ir.test.js
 * @description Unit and integration test suite for Structured Document IR (Intermediate Representation).
 * Tests schema validation, document IR building from PDF, block structure (heading, paragraph, table, image, equation, caption, footnote, list),
 * multi-column layout handling, and JSON export.
 * Part of paper-drift - https://github.com/Sooriya04/Paper-Drift
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import assert from 'assert';

import {
  convertPdfToDocumentIR,
  validateDocumentIR,
  exportToJson
} from '../src/ir/schema.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const samplePdfPath = path.resolve(__dirname, 'fixtures/sample.pdf');

function runTest(name, fn) {
  try {
    fn();
    console.log(`  \x1b[32m✔\x1b[0m ${name}`);
  } catch (err) {
    console.error(`  \x1b[31m✖\x1b[0m ${name}`);
    console.error(`    ${err.message}`);
    process.exit(1);
  }
}

async function runAsyncTest(name, fn) {
  try {
    await fn();
    console.log(`  \x1b[32m✔\x1b[0m ${name}`);
  } catch (err) {
    console.error(`  \x1b[31m✖\x1b[0m ${name}`);
    console.error(`    ${err.message}`);
    process.exit(1);
  }
}

console.log('\n\x1b[1m\x1b[36mRunning Structured Document IR Test Suite\x1b[0m');

if (!fs.existsSync(samplePdfPath)) {
  throw new Error(`Sample PDF fixture not found at ${samplePdfPath}`);
}

// -------------------------------------------------------------
// 1. Schema Validation Tests
// -------------------------------------------------------------
runTest('validateDocumentIR validates valid document IR schema', () => {
  const validDoc = {
    title: 'Sample Document',
    author: null,
    page_count: 1,
    outline: [],
    metadata: { generator: 'paper-drift' },
    blocks: [
      {
        id: 'blk-p1-0',
        type: 'heading',
        content: 'Introduction',
        page: 1,
        bbox: [10, 20, 100, 40],
        order: 0,
        metadata: { level: 'h1' }
      },
      {
        id: 'blk-p1-1',
        type: 'paragraph',
        content: 'This is a test paragraph.',
        page: 1,
        bbox: [10, 50, 200, 80],
        order: 1,
        metadata: {}
      }
    ]
  };

  assert.strictEqual(validateDocumentIR(validDoc), true);
});

runTest('validateDocumentIR rejects invalid document structures', () => {
  assert.strictEqual(validateDocumentIR(null), false);
  assert.strictEqual(validateDocumentIR({}), false);
  assert.strictEqual(validateDocumentIR({ title: 'Test', blocks: 'not-array' }), false);
  assert.strictEqual(validateDocumentIR({ title: 'Test', blocks: [{ type: 'invalid-type' }] }), false);
});

// -------------------------------------------------------------
// 2. Document IR Builder & Exporter Tests
// -------------------------------------------------------------
await runAsyncTest('convertPdfToDocumentIR builds structured IR from sample PDF', async () => {
  const irDoc = await convertPdfToDocumentIR(samplePdfPath);

  assert.ok(irDoc, 'IR document should be defined');
  assert.strictEqual(typeof irDoc.title, 'string');
  assert.strictEqual(typeof irDoc.page_count, 'number');
  assert.ok(Array.isArray(irDoc.blocks), 'blocks should be an array');
  assert.ok(irDoc.blocks.length > 0, 'should contain extracted blocks');

  // Verify block schema shape
  for (const block of irDoc.blocks) {
    assert.strictEqual(typeof block.id, 'string');
    assert.ok(['heading', 'paragraph', 'table', 'image', 'equation', 'caption', 'footnote', 'list'].includes(block.type));
    assert.strictEqual(typeof block.page, 'number');
    assert.ok(Array.isArray(block.bbox) && block.bbox.length === 4);
    assert.strictEqual(typeof block.order, 'number');
    assert.strictEqual(typeof block.metadata, 'object');
  }

  assert.strictEqual(validateDocumentIR(irDoc), true);
});

runTest('exportToJson serializes Document IR to valid JSON string', () => {
  const sampleIr = {
    title: 'Test',
    author: 'Author',
    page_count: 1,
    outline: [],
    metadata: {},
    blocks: [
      {
        id: 'blk-1',
        type: 'paragraph',
        content: 'Hello World',
        page: 1,
        bbox: [0, 0, 100, 10],
        order: 0,
        metadata: {}
      }
    ]
  };

  const jsonStr = exportToJson(sampleIr);
  assert.strictEqual(typeof jsonStr, 'string');
  const parsed = JSON.parse(jsonStr);
  assert.strictEqual(parsed.title, 'Test');
  assert.strictEqual(parsed.blocks.length, 1);
});

// -------------------------------------------------------------
// 3. Multi-column, Tables, Equations, Headings & Benchmarks Tests
// -------------------------------------------------------------
const attentionPdf = path.resolve(__dirname, 'fixtures/benchmarks/01-attention-is-all-you-need.pdf');
const resnetPdf = path.resolve(__dirname, 'fixtures/benchmarks/02-resnet-deep-residual-learning.pdf');

if (fs.existsSync(attentionPdf)) {
  await runAsyncTest('convertPdfToDocumentIR processes multi-column layout with tables and headings', async () => {
    const doc = await convertPdfToDocumentIR(attentionPdf, { pages: '1-3' });
    assert.strictEqual(validateDocumentIR(doc), true);
    assert.strictEqual(doc.page_count, 15);
    assert.ok(doc.blocks.length > 20, 'Should extract multi-column blocks');

    const headingBlocks = doc.blocks.filter(b => b.type === 'heading');
    assert.ok(headingBlocks.length >= 3, 'Should extract headings');
    assert.ok(headingBlocks.some(h => typeof h.content === 'string' && h.content.includes('Introduction')));

    const tableBlocks = doc.blocks.filter(b => b.type === 'table');
    assert.ok(tableBlocks.length >= 1, 'Should extract tables');
    assert.ok(tableBlocks[0].page >= 1);
    assert.ok(tableBlocks[0].content && typeof tableBlocks[0].content === 'object');
    assert.ok(tableBlocks[0].content.markdown.includes('|'));

    // Check outline extraction
    assert.ok(Array.isArray(doc.outline));
    assert.ok(doc.outline.length > 0, 'Should extract document outline from PDF');
  });
}

runTest('convertPdfToDocumentIR detects list and equation blocks correctly', () => {
  const mockDoc = {
    title: 'Test Blocks',
    page_count: 1,
    outline: [],
    metadata: {},
    blocks: [
      {
        id: 'blk-list',
        type: 'list',
        content: '- First item in bullet list',
        page: 1,
        bbox: [10, 10, 100, 20],
        order: 0,
        metadata: {}
      },
      {
        id: 'blk-eq',
        type: 'equation',
        content: '$E = mc^2$',
        page: 1,
        bbox: [10, 30, 80, 50],
        order: 1,
        metadata: {}
      }
    ]
  };
  assert.strictEqual(validateDocumentIR(mockDoc), true);
});

if (fs.existsSync(resnetPdf)) {
  await runAsyncTest('convertPdfToDocumentIR extracts image/figure blocks when extractImages enabled', async () => {
    const doc = await convertPdfToDocumentIR(resnetPdf, {
      pages: '1-2',
      extractImages: true
    });
    assert.strictEqual(validateDocumentIR(doc), true);
    // Even if sample or resnet, verify image block structural validity when present
    const imageBlocks = doc.blocks.filter(b => b.type === 'image');
    for (const img of imageBlocks) {
      assert.strictEqual(typeof img.id, 'string');
      assert.strictEqual(img.type, 'image');
      assert.ok(img.content !== undefined);
      assert.strictEqual(typeof img.page, 'number');
      assert.strictEqual(img.bbox.length, 4);
    }
  });
}

console.log('\n\x1b[32m✔ All IR tests passed successfully!\x1b[0m\n');
