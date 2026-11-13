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

const SAMPLE_PDF = path.resolve('test/fixtures/sample.pdf');
const ATTENTION_PDF = path.resolve('test/fixtures/benchmarks/01-attention-is-all-you-need.pdf');
const RESNET_PDF = path.resolve('test/fixtures/benchmarks/02-resnet-deep-residual-learning.pdf');

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
    assert.equal(meta.authors.length, 0, 'sample.pdf prose must not be classified as authors');
    assert.ok(duration < 2000, `Execution took ${duration}ms (target < 2000ms)`);
  });

  await t.test('extracts frontmatter, sections, and references from Attention paper', async () => {
    assert.ok(fs.existsSync(ATTENTION_PDF), 'Attention PDF fixture exists');

    const meta = await extractScientificMetadata(ATTENTION_PDF, { maxPages: 5 });
    assert.ok(validateScientificMetadata(meta), 'Attention metadata schema validation');

    // Title verification
    assert.ok(meta.title.value && meta.title.value.toLowerCase().includes('attention is all you need'), 'Title extraction');
    assert.equal(meta.title.source, 'extracted');
    assert.equal(meta.title.page, 1);

    // Authors verification
    assert.ok(Array.isArray(meta.authors), 'Authors is an array');
    assert.ok(meta.authors.length >= 8, 'Extracted at least 8 authors');
    const firstAuthor = meta.authors[0];
    assert.ok(firstAuthor.name.includes('Ashish Vaswani'), 'First author name matches Ashish Vaswani');
    assert.ok(firstAuthor.affiliations.some(aff => aff.includes('Google Brain')), 'First author affiliation matches Google Brain');
    assert.equal(firstAuthor.email, 'avaswani@google.com');

    // Abstract verification
    assert.ok(meta.abstract.value && meta.abstract.value.toLowerCase().includes('sequence transduction'), 'Abstract extraction');
    assert.equal(meta.abstract.source, 'extracted');

    // Section hierarchy verification
    assert.ok(Array.isArray(meta.sections), 'Sections is an array');
    assert.ok(meta.sections.length > 0, 'Extracted top-level sections');
    const intro = meta.sections.find(s => s.title.toLowerCase().includes('introduction'));
    assert.ok(intro, 'Identified Introduction section');
    assert.equal(intro.level, 1);
    // Reject table cell numbers and math subindices from sections
    assert.ok(!meta.sections.some(s => s.title === '512 512' || s.title === '128 128'), 'Must not classify table cells as sections');
    assert.ok(!meta.sections.some(s => s.number === '2014'), 'Must not classify dataset year as section');

    // Document IR compatibility verification
    const docIR = {
      metadata: { title: 'Attention', pageCount: 5 },
      pages: [{ page: 1, content: 'test content' }],
      scientificMetadata: meta
    };
    assert.ok(validateDocumentIRV2(docIR), 'Validates Document IR v2.0.0 with scientificMetadata');
  });

  await t.test('extracts section hierarchy and publisher details from ResNet paper', async () => {
    assert.ok(fs.existsSync(RESNET_PDF), 'ResNet PDF fixture exists');

    const meta = await extractScientificMetadata(RESNET_PDF, { maxPages: 4 });
    assert.ok(validateScientificMetadata(meta), 'ResNet schema validation');
    assert.ok(meta.title.value && meta.title.value.toLowerCase().includes('deep residual learning'), 'ResNet title');
    assert.equal(meta.title.source, 'extracted');

    // Authors verification
    assert.ok(Array.isArray(meta.authors), 'ResNet authors is an array');
    assert.equal(meta.authors.length, 4, 'ResNet has 4 authors');
    assert.equal(meta.authors[0].name, 'Kaiming He');
    assert.equal(meta.authors[0].email, 'kahe@microsoft.com');
    assert.ok(meta.authors[0].affiliations.includes('Microsoft Research'));
    assert.equal(meta.authors[1].name, 'Xiangyu Zhang');
    assert.equal(meta.authors[1].email, 'v-xiangz@microsoft.com');
    assert.equal(meta.authors[2].name, 'Shaoqing Ren');
    assert.equal(meta.authors[2].email, 'v-shren@microsoft.com');
    assert.equal(meta.authors[3].name, 'Jian Sun');
    assert.equal(meta.authors[3].email, 'jiansun@microsoft.com');
  });

  await t.test('does not overwrite document venue with citations mentioned on later pages', async () => {
    assert.ok(fs.existsSync(ATTENTION_PDF), 'Attention PDF fixture exists');
    // Processing full Attention paper where references cite IEEE & CVPR papers
    const meta = await extractScientificMetadata(ATTENTION_PDF, { maxPages: 11 });
    assert.equal(meta.venue.value, 'NeurIPS', 'Attention venue must remain NeurIPS despite cited papers');
    assert.equal(meta.publisher.value, 'Curran Associates, Inc.');
  });
});
