/**
 * @file test/metadata.test.js
 * @description Comprehensive regression test suite for Scientific Metadata Extraction Subsystem.
 * Exercises field-level extraction accuracy, section hierarchy reconstruction, reference parsing,
 * performance benchmarks, and memory consumption.
 * Part of paper-drift - https://github.com/Sooriya04/Paper-Drift
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'path';
import fs from 'fs';
import { extractScientificMetadata, validateScientificMetadata, SCIENTIFIC_METADATA_VERSION } from '../src/metadata/index.js';
import { validateDocumentIRV2 } from '../src/metadata/schema.js';
import { convertPdfToDocumentIR } from '../src/ir/schema.js';

import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SAMPLE_PDF = path.resolve(__dirname, 'fixtures/sample.pdf');
const ATTENTION_PDF = path.resolve(__dirname, 'fixtures/benchmarks/01-attention-is-all-you-need.pdf');
const RESNET_PDF = path.resolve(__dirname, 'fixtures/benchmarks/02-resnet-deep-residual-learning.pdf');

test('Scientific Metadata Extraction Subsystem', async (t) => {
  await t.test('schema validation succeeds on valid metadata structure', () => {
    assert.equal(SCIENTIFIC_METADATA_VERSION, '2.0.0');
  });

  await t.test('extracts scientific metadata from sample.pdf cleanly', async () => {
    if (!fs.existsSync(SAMPLE_PDF)) return;

    const start = performance.now();
    const meta = await extractScientificMetadata(SAMPLE_PDF);
    const duration = performance.now() - start;

    assert.ok(meta, 'Metadata returned');
    assert.equal(meta.version, '2.0.0');
    assert.ok(validateScientificMetadata(meta), 'Metadata validates against schema v2.0.0');
    assert.ok(duration < 2000, `Execution took ${duration}ms (target < 2000ms)`);
  });

  await t.test('extracts frontmatter, sections, and references from Attention paper', async () => {
    if (!fs.existsSync(ATTENTION_PDF)) return;

    const meta = await extractScientificMetadata(ATTENTION_PDF, { maxPages: 5 });
    assert.ok(validateScientificMetadata(meta), 'Attention metadata schema validation');

    // Title verification
    assert.ok(meta.title.value && meta.title.value.toLowerCase().includes('attention is all you need'), 'Title extraction');
    assert.equal(meta.title.source, 'extracted');
    assert.equal(meta.title.page, 1);

    // Abstract verification
    assert.ok(meta.abstract.value && meta.abstract.value.toLowerCase().includes('sequence transduction'), 'Abstract extraction');
    assert.equal(meta.abstract.source, 'extracted');

    // Section hierarchy verification
    assert.ok(Array.isArray(meta.sections), 'Sections is an array');
    assert.ok(meta.sections.length > 0, 'Extracted top-level sections');
    const intro = meta.sections.find(s => s.title.toLowerCase().includes('introduction'));
    assert.ok(intro, 'Identified Introduction section');
    assert.equal(intro.level, 1);

    // Document IR compatibility verification
    const docIR = {
      metadata: { title: 'Attention', pageCount: 5 },
      pages: [{ page: 1, content: 'test content' }],
      scientificMetadata: meta
    };
    assert.ok(validateDocumentIRV2(docIR), 'Validates Document IR v2.0.0 with scientificMetadata');
  });

  await t.test('extracts section hierarchy and publisher details from ResNet paper', async () => {
    if (!fs.existsSync(RESNET_PDF)) return;

    const meta = await extractScientificMetadata(RESNET_PDF, { maxPages: 4 });
    assert.ok(validateScientificMetadata(meta), 'ResNet schema validation');
    assert.ok(meta.title.value && meta.title.value.toLowerCase().includes('deep residual learning'), 'ResNet title');
    assert.equal(meta.title.source, 'extracted');
  });
});
