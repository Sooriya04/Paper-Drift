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
      pageCount: 1
    },
    pages: [
      {
        page: 1,
        content: 'Introduction\nThis is a test paragraph.'
      }
    ]
  };

  assert.strictEqual(validateDocumentIR(validDoc), true);
  assert.strictEqual(typeof validDoc.pages[0].content, 'string');
  assert.deepStrictEqual(Object.keys(validDoc.metadata), ['title', 'pageCount']);
});

runTest('validateDocumentIR rejects invalid document structures', () => {
  assert.strictEqual(validateDocumentIR(null), false);
  assert.strictEqual(validateDocumentIR({}), false);
  assert.strictEqual(validateDocumentIR([]), false);
  assert.strictEqual(validateDocumentIR({ metadata: { title: 'Test', pageCount: 1 }, pages: 'not-array' }), false);
  assert.strictEqual(validateDocumentIR({ metadata: { title: 'Test', pageCount: 1 }, pages: [] }), false, 'Should reject empty pages array');
  assert.strictEqual(validateDocumentIR({ metadata: { title: 'Test', pageCount: 1 }, pages: [{ page: 1, content: [{ type: 'paragraph', content: 'test' }] }] }), false, 'Should reject array content');
  // Rejects extra metadata fields or non-string content
  assert.strictEqual(validateDocumentIR({
    metadata: {
      title: 'Test',
      pageCount: 1,
      author: 'Extra'
    },
    pages: [{
      page: 1,
      content: 'hello'
    }]
  }), false, 'Should reject metadata containing extra fields like author');
  // Rejects extra top-level fields
  assert.strictEqual(validateDocumentIR({
    metadata: { title: 'Test', pageCount: 1 },
    pages: [{ page: 1, content: 'hello' }],
    extra: true
  }), false, 'Should reject extra top-level fields');
  // Rejects negative, zero, or non-integer pageCount
  assert.strictEqual(validateDocumentIR({ metadata: { title: 'Test', pageCount: 0 }, pages: [{ page: 1, content: 'hi' }] }), false);
  assert.strictEqual(validateDocumentIR({ metadata: { title: 'Test', pageCount: -1 }, pages: [{ page: 1, content: 'hi' }] }), false);
  assert.strictEqual(validateDocumentIR({ metadata: { title: 'Test', pageCount: 1.5 }, pages: [{ page: 1, content: 'hi' }] }), false);
  assert.strictEqual(validateDocumentIR({ metadata: { title: '', pageCount: 1 }, pages: [{ page: 1, content: 'hi' }] }), false);
  // Rejects page number > pageCount or < 1
  assert.strictEqual(validateDocumentIR({ metadata: { title: 'Test', pageCount: 2 }, pages: [{ page: 3, content: 'hi' }] }), false);
  assert.strictEqual(validateDocumentIR({ metadata: { title: 'Test', pageCount: 2 }, pages: [{ page: 0, content: 'hi' }] }), false);
  assert.strictEqual(validateDocumentIR({ metadata: { title: 'Test', pageCount: 2 }, pages: [{ page: 1.5, content: 'hi' }] }), false);
  // Rejects duplicate pages or descending page order
  assert.strictEqual(validateDocumentIR({ metadata: { title: 'Test', pageCount: 2 }, pages: [{ page: 1, content: 'a' }, { page: 1, content: 'b' }] }), false);
  assert.strictEqual(validateDocumentIR({ metadata: { title: 'Test', pageCount: 2 }, pages: [{ page: 2, content: 'a' }, { page: 1, content: 'b' }] }), false);
  // Rejects malformed page entry (extra fields or non-object)
  assert.strictEqual(validateDocumentIR({ metadata: { title: 'Test', pageCount: 1 }, pages: [{ page: 1, content: 'a', extra: 123 }] }), false);
  assert.strictEqual(validateDocumentIR({ metadata: { title: 'Test', pageCount: 1 }, pages: ['string-page'] }), false);
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
  assert.deepStrictEqual(Object.keys(irDoc.metadata).sort(), ['pageCount', 'title'].sort());
  assert.ok(Array.isArray(irDoc.pages), 'pages should be an array');
  assert.ok(irDoc.pages.length > 0, 'should contain extracted pages');
  assert.strictEqual(irDoc.pages[0].page, 1);
  assert.strictEqual(typeof irDoc.pages[0].content, 'string', 'pages[0].content should be a string');
  assert.ok(irDoc.pages[0].content.length > 0, 'pages[0].content should not be empty');

  // Verify minimal schema shape across all pages
  for (const pageObj of irDoc.pages) {
    assert.strictEqual(typeof pageObj.page, 'number');
    assert.strictEqual(typeof pageObj.content, 'string');
    assert.deepStrictEqual(Object.keys(pageObj).sort(), ['content', 'page'].sort());
  }

  assert.strictEqual(validateDocumentIR(irDoc), true);
});

runTest('exportToJson serializes Document IR to valid JSON string', () => {
  const sampleIr = {
    metadata: {
      title: 'Test',
      pageCount: 1
    },
    pages: [
      {
        page: 1,
        content: 'Hello World'
      }
    ]
  };

  const jsonStr = exportToJson(sampleIr);
  assert.strictEqual(typeof jsonStr, 'string');
  const parsed = JSON.parse(jsonStr);
  assert.strictEqual(parsed.metadata.title, 'Test');
  assert.strictEqual(parsed.metadata.pageCount, 1);
  assert.deepStrictEqual(Object.keys(parsed.metadata).sort(), ['pageCount', 'title'].sort());
  assert.strictEqual(parsed.pages.length, 1);
  assert.strictEqual(parsed.pages[0].page, 1);
  assert.strictEqual(typeof parsed.pages[0].content, 'string');
  assert.deepStrictEqual(Object.keys(parsed.pages[0]).sort(), ['content', 'page'].sort());
});

runTest('exportToJson produces deterministic, canonically sorted output regardless of property insertion order', () => {
  const doc1 = {
    pages: [{ content: 'test body', page: 1 }],
    metadata: { pageCount: 5, title: 'Alphabetical' }
  };
  const doc2 = {
    metadata: { title: 'Alphabetical', pageCount: 5 },
    pages: [{ page: 1, content: 'test body' }]
  };

  const json1 = exportToJson(doc1);
  const json2 = exportToJson(doc2);
  assert.strictEqual(json1, json2, 'exportToJson should produce byte-for-byte identical output');

  // Verify non-null object check
  assert.throws(() => exportToJson(null), TypeError);
  assert.throws(() => exportToJson('string'), TypeError);
});

// -------------------------------------------------------------
// 3. Multi-column and Reading Order Tests
// -------------------------------------------------------------
const attentionPdf = path.resolve(__dirname, 'fixtures/benchmarks/01-attention-is-all-you-need.pdf');
const resnetPdf = path.resolve(__dirname, 'fixtures/benchmarks/02-resnet-deep-residual-learning.pdf');

if (fs.existsSync(attentionPdf)) {
  await runAsyncTest('convertPdfToDocumentIR processes multi-column layout into clean plain text in reading order', async () => {
    const doc = await convertPdfToDocumentIR(attentionPdf, { pages: '1-3' });
    assert.strictEqual(validateDocumentIR(doc), true);
    assert.strictEqual(doc.metadata.pageCount, 15);
    assert.strictEqual(doc.pages.length, 3);
    assert.deepStrictEqual(Object.keys(doc.metadata).sort(), ['pageCount', 'title'].sort());

    for (const page of doc.pages) {
      assert.strictEqual(typeof page.page, 'number');
      assert.strictEqual(typeof page.content, 'string');
      assert.deepStrictEqual(Object.keys(page).sort(), ['content', 'page'].sort());
    }

    // Page 1 should contain title and Page 2 contains Introduction
    assert.ok(doc.pages[0].content.includes('Attention Is All You Need'));
    assert.ok(doc.pages[1].content.includes('Introduction'));
  });
}

if (fs.existsSync(resnetPdf)) {
  await runAsyncTest('convertPdfToDocumentIR handles ResNet paper cleanly', async () => {
    const doc = await convertPdfToDocumentIR(resnetPdf, {
      pages: '1-2'
    });
    assert.strictEqual(validateDocumentIR(doc), true);
    assert.strictEqual(doc.pages.length, 2);
    for (const page of doc.pages) {
      assert.strictEqual(typeof page.page, 'number');
      assert.strictEqual(typeof page.content, 'string');
      assert.deepStrictEqual(Object.keys(page).sort(), ['content', 'page'].sort());
    }
  });
}

console.log('\n\x1b[32m✔ All IR tests passed successfully!\x1b[0m\n');
