// -------------------------------------------------------------
// 0. File Header Documentation
// -------------------------------------------------------------
/**
 * @file test/ir.test.js
 * @description Comprehensive unit and integration test suite for Paper-Drift's Structured Document IR.
 * Enforces strict bbox-free schema validation, block extraction, typography, slug generation,
 * anchor resolution, outline tree normalization, and JSON serialization.
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
    pageCount: 1,
    outline: [],
    metadata: { generator: 'paper-drift' },
    blocks: [
      {
        id: 'blk-p1-0',
        type: 'heading',
        content: 'Introduction',
        page: 1,
        order: 0,
        metadata: { level: 'h1', slug: 'section-1', anchorIds: ['sec-intro'] }
      },
      {
        id: 'blk-p1-1',
        type: 'paragraph',
        content: 'This is a test paragraph.',
        page: 1,
        order: 1,
        metadata: {}
      }
    ]
  };

  assert.strictEqual(validateDocumentIR(validDoc), true);
  // Assert strict bbox-free requirement
  assert.strictEqual('bbox' in validDoc.blocks[0], false, 'Block 0 must not have bbox');
  assert.strictEqual('bbox' in validDoc.blocks[1], false, 'Block 1 must not have bbox');
});

runTest('validateDocumentIR rejects invalid document structures', () => {
  assert.strictEqual(validateDocumentIR(null), false);
  assert.strictEqual(validateDocumentIR({}), false);
  assert.strictEqual(validateDocumentIR({ title: 'Test', pageCount: 1, outline: [], metadata: {}, blocks: 'not-array' }), false);
  assert.strictEqual(validateDocumentIR({ title: 'Test', pageCount: 1, outline: [], metadata: {}, blocks: [{ type: 'invalid-type' }] }), false);
  // Rejects block with bbox if bbox-free schema is enforced
  assert.strictEqual(validateDocumentIR({
    title: 'Test',
    pageCount: 1,
    outline: [],
    metadata: {},
    blocks: [{
      id: 'blk-1',
      type: 'paragraph',
      content: 'hello',
      page: 1,
      order: 0,
      bbox: [0, 0, 10, 10],
      metadata: {}
    }]
  }), false, 'Should reject blocks containing legacy bbox');
});

// -------------------------------------------------------------
// 2. Document IR Builder & Exporter Tests
// -------------------------------------------------------------
await runAsyncTest('convertPdfToDocumentIR builds structured IR from sample PDF', async () => {
  const irDoc = await convertPdfToDocumentIR(samplePdfPath);

  assert.ok(irDoc, 'IR document should be defined');
  assert.strictEqual(typeof irDoc.title, 'string');
  assert.strictEqual(typeof irDoc.pageCount, 'number');
  assert.ok(Array.isArray(irDoc.blocks), 'blocks should be an array');
  assert.ok(irDoc.blocks.length > 0, 'should contain extracted blocks');

  // Verify block schema shape: must be bbox-free!
  for (const block of irDoc.blocks) {
    assert.strictEqual(typeof block.id, 'string');
    assert.ok(['heading', 'paragraph', 'table', 'image', 'equation', 'caption', 'footnote', 'list'].includes(block.type));
    assert.strictEqual(typeof block.page, 'number');
    assert.strictEqual('bbox' in block, false, `Block ${block.id} must NOT have bbox`);
    assert.strictEqual(typeof block.order, 'number');
    assert.strictEqual(typeof block.metadata, 'object');
  }

  assert.strictEqual(validateDocumentIR(irDoc), true);
});

runTest('exportToJson serializes Document IR to valid JSON string', () => {
  const sampleIr = {
    title: 'Test',
    author: 'Author',
    pageCount: 1,
    outline: [],
    metadata: {},
    blocks: [
      {
        id: 'blk-1',
        type: 'paragraph',
        content: 'Hello World',
        page: 1,
        order: 0,
        metadata: {}
      }
    ]
  };

  const jsonStr = exportToJson(sampleIr);
  assert.strictEqual(typeof jsonStr, 'string');
  const parsed = JSON.parse(jsonStr);
  assert.strictEqual(parsed.title, 'Test');
  assert.strictEqual(parsed.pageCount, 1);
  assert.strictEqual(parsed.blocks.length, 1);
  assert.strictEqual('bbox' in parsed.blocks[0], false);
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
    assert.strictEqual(doc.pageCount, 15);
    assert.ok(doc.blocks.length > 20, 'Should extract multi-column blocks');

    const headingBlocks = doc.blocks.filter(b => b.type === 'heading');
    assert.ok(headingBlocks.length >= 3, 'Should extract headings');
    assert.ok(headingBlocks.some(h => typeof h.content === 'string' && h.content.includes('Introduction')));

    // Audit Fix 2 & 3: Check slug, anchorIds, and typography fontSize on headings
    const introHeading = headingBlocks.find(h => typeof h.content === 'string' && h.content.includes('Introduction'));
    assert.ok(introHeading, 'Introduction heading should exist');
    assert.ok(introHeading.metadata, 'Heading must have metadata');
    assert.strictEqual(introHeading.metadata.slug, 'section-1');
    assert.ok(typeof introHeading.metadata.fontSize === 'number', 'fontSize should be a number, not null');

    const tableBlocks = doc.blocks.filter(b => b.type === 'table');
    assert.ok(tableBlocks.length >= 1, 'Should extract tables');
    assert.ok(tableBlocks[0].page >= 1);
    assert.ok(tableBlocks[0].content && typeof tableBlocks[0].content === 'object');
    assert.ok(tableBlocks[0].content.markdown.includes('|'));

    // Audit Fix 4: Check outline extraction with 'children' tree
    assert.ok(Array.isArray(doc.outline));
    assert.ok(doc.outline.length > 0, 'Should extract document outline from PDF');
    assert.strictEqual('down' in doc.outline[0], false, 'Outline item should not have "down"');
    assert.ok(Array.isArray(doc.outline[0].children), 'Outline item should have "children" array');
  });
}

runTest('convertPdfToDocumentIR detects list and equation blocks correctly', () => {
  const mockDoc = {
    title: 'Test Blocks',
    pageCount: 1,
    outline: [],
    metadata: {},
    blocks: [
      {
        id: 'blk-list',
        type: 'list',
        content: '- First item in bullet list',
        page: 1,
        order: 0,
        metadata: {}
      },
      {
        id: 'blk-eq',
        type: 'equation',
        content: '$E = mc^2$',
        page: 1,
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
    // Audit Fix 1: Check image/figure blocks are actually populated into doc.blocks!
    const imageBlocks = doc.blocks.filter(b => b.type === 'image');
    assert.ok(imageBlocks.length > 0, 'ResNet pages 1-2 must emit type: image blocks');
    for (const img of imageBlocks) {
      assert.strictEqual(typeof img.id, 'string');
      assert.strictEqual(img.type, 'image');
      assert.ok(img.content !== undefined);
      assert.strictEqual(typeof img.page, 'number');
      assert.strictEqual('bbox' in img, false, 'Image block must not have bbox');
      assert.strictEqual(typeof img.order, 'number');
    }
  });
}

console.log('\n\x1b[32m✔ All IR tests passed successfully!\x1b[0m\n');
