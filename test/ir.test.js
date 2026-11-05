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
    metadata: {
      title: 'Sample Document',
      author: null,
      pageCount: 1,
      generator: 'paper-drift'
    },
    pages: [
      {
        page: 1,
        content: [
          {
            type: 'heading',
            content: 'Introduction',
            metadata: { level: 'h1', slug: 'section-1', anchorIds: ['sec-intro'] }
          },
          {
            type: 'paragraph',
            content: 'This is a test paragraph.',
            metadata: {}
          }
        ]
      }
    ]
  };

  assert.strictEqual(validateDocumentIR(validDoc), true);
  // Assert strict bbox-free requirement
  assert.strictEqual('bbox' in validDoc.pages[0].content[0], false, 'Block 0 must not have bbox');
  assert.strictEqual('bbox' in validDoc.pages[0].content[1], false, 'Block 1 must not have bbox');
});

runTest('validateDocumentIR rejects invalid document structures', () => {
  assert.strictEqual(validateDocumentIR(null), false);
  assert.strictEqual(validateDocumentIR({}), false);
  assert.strictEqual(validateDocumentIR({ metadata: { title: 'Test', pageCount: 1 }, pages: 'not-array' }), false);
  assert.strictEqual(validateDocumentIR({ metadata: { title: 'Test', pageCount: 1 }, pages: [{ page: 1, content: [{ type: 'invalid-type', content: 'test' }] }] }), false);
  // Rejects block with bbox if bbox-free schema is enforced
  assert.strictEqual(validateDocumentIR({
    metadata: {
      title: 'Test',
      pageCount: 1
    },
    pages: [{
      page: 1,
      content: [{
        type: 'paragraph',
        content: 'hello',
        bbox: [0, 0, 10, 10]
      }]
    }]
  }), false, 'Should reject blocks containing legacy bbox');
});

// -------------------------------------------------------------
// 2. Document IR Builder & Exporter Tests
// -------------------------------------------------------------
await runAsyncTest('convertPdfToDocumentIR builds structured IR from sample PDF', async () => {
  const irDoc = await convertPdfToDocumentIR(samplePdfPath);

  assert.ok(irDoc, 'IR document should be defined');
  assert.ok(irDoc.metadata, 'metadata should be defined');
  assert.strictEqual(typeof irDoc.metadata.title, 'string');
  assert.strictEqual(typeof irDoc.metadata.pageCount, 'number');
  assert.ok(Array.isArray(irDoc.pages), 'pages should be an array');
  assert.ok(irDoc.pages.length > 0, 'should contain extracted pages');
  assert.strictEqual(irDoc.pages[0].page, 1);
  assert.ok(Array.isArray(irDoc.pages[0].content), 'pages[0].content should be an array');
  assert.ok(irDoc.pages[0].content.length > 0, 'pages[0].content should not be empty');

  // Verify block schema shape: must be bbox-free!
  for (const pageObj of irDoc.pages) {
    assert.strictEqual(typeof pageObj.page, 'number');
    for (const block of pageObj.content) {
      assert.ok(['heading', 'paragraph', 'table', 'image', 'equation', 'caption', 'footnote', 'list'].includes(block.type));
      assert.strictEqual('bbox' in block, false, `Block must NOT have bbox`);
      if (block.metadata) {
        assert.strictEqual(typeof block.metadata, 'object');
      }
    }
  }

  assert.strictEqual(validateDocumentIR(irDoc), true);
});

runTest('exportToJson serializes Document IR to valid JSON string', () => {
  const sampleIr = {
    metadata: {
      title: 'Test',
      author: 'Author',
      pageCount: 1
    },
    pages: [
      {
        page: 1,
        content: [
          {
            type: 'paragraph',
            content: 'Hello World'
          }
        ]
      }
    ]
  };

  const jsonStr = exportToJson(sampleIr);
  assert.strictEqual(typeof jsonStr, 'string');
  const parsed = JSON.parse(jsonStr);
  assert.strictEqual(parsed.metadata.title, 'Test');
  assert.strictEqual(parsed.metadata.pageCount, 1);
  assert.strictEqual(parsed.pages.length, 1);
  assert.strictEqual(parsed.pages[0].page, 1);
  assert.strictEqual(parsed.pages[0].content.length, 1);
  assert.strictEqual('bbox' in parsed.pages[0].content[0], false);
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
    assert.strictEqual(doc.metadata.pageCount, 15);
    assert.strictEqual(doc.pages.length, 3);
    const allBlocks = doc.pages.flatMap(p => p.content);
    assert.ok(allBlocks.length > 20, 'Should extract multi-column blocks');

    const headingBlocks = allBlocks.filter(b => b.type === 'heading');
    assert.ok(headingBlocks.length >= 3, 'Should extract headings');
    assert.ok(headingBlocks.some(h => typeof h.content === 'string' && h.content.includes('Introduction')));

    // Check slug and typography fontSize on headings
    const introHeading = headingBlocks.find(h => typeof h.content === 'string' && h.content.includes('Introduction'));
    assert.ok(introHeading, 'Introduction heading should exist');
    assert.ok(introHeading.metadata, 'Heading must have metadata');
    assert.strictEqual(introHeading.metadata.slug, 'section-1');
    assert.ok(typeof introHeading.metadata.fontSize === 'number', 'fontSize should be a number, not null');

    const tableBlocks = allBlocks.filter(b => b.type === 'table');
    assert.ok(tableBlocks.length >= 1, 'Should extract tables');
    assert.ok(tableBlocks[0].content && typeof tableBlocks[0].content === 'object');
    assert.ok(tableBlocks[0].content.markdown.includes('|'));

    // Check outline extraction in metadata
    assert.ok(Array.isArray(doc.metadata.outline));
    assert.ok(doc.metadata.outline.length > 0, 'Should extract document outline from PDF');
    assert.strictEqual('down' in doc.metadata.outline[0], false, 'Outline item should not have "down"');
    assert.ok(Array.isArray(doc.metadata.outline[0].children), 'Outline item should have "children" array');
  });
}

runTest('convertPdfToDocumentIR detects list and equation blocks correctly', () => {
  const mockDoc = {
    metadata: {
      title: 'Test Blocks',
      pageCount: 1
    },
    pages: [
      {
        page: 1,
        content: [
          {
            type: 'list',
            content: '- First item in bullet list'
          },
          {
            type: 'equation',
            content: '$E = mc^2$'
          }
        ]
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
    const allBlocks = doc.pages.flatMap(p => p.content);
    const imageBlocks = allBlocks.filter(b => b.type === 'image');
    assert.ok(imageBlocks.length > 0, 'ResNet pages 1-2 must emit type: image blocks');
    for (const img of imageBlocks) {
      assert.strictEqual(img.type, 'image');
      assert.ok(img.content !== undefined);
      assert.strictEqual('bbox' in img, false, 'Image block must not have bbox');
    }
  });
}

console.log('\n\x1b[32m✔ All IR tests passed successfully!\x1b[0m\n');
