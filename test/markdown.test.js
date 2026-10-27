/**
 * @file test/markdown.test.js
 * @description Comprehensive unit and end-to-end test suite for direct PDF to Markdown conversion.
 * Part of paper-drift - https://github.com/Sooriya04/Paper-Drift
 */

import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import { convertPdfToMarkdown } from '../src/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const resultsDir = path.join(__dirname, 'results/markdown-test');

// Pre-run cleanup of test results directory
if (fs.existsSync(resultsDir)) {
  fs.rmSync(resultsDir, { recursive: true, force: true });
}
fs.mkdirSync(resultsDir, { recursive: true });

console.log('\nRunning Direct PDF to Markdown Test Suite');

// Test 1: Programmatic conversion of sample.pdf
{
  const samplePdf = path.join(__dirname, 'fixtures/sample.pdf');
  const result = await convertPdfToMarkdown(samplePdf);

  assert(typeof result.markdown === 'string', 'result.markdown should be a string');
  assert(result.markdown.length > 0, 'result.markdown should not be empty');
  assert(result.totalPages >= 1, 'totalPages should be at least 1');
  assert(result.pagesProcessed >= 1, 'pagesProcessed should be at least 1');
  assert(typeof result.durationMs === 'number', 'durationMs should be a number');

  fs.writeFileSync(path.join(resultsDir, 'sample.md'), result.markdown);

  const numericPagesResult = await convertPdfToMarkdown(samplePdf, { pages: 1 });
  assert.strictEqual(numericPagesResult.pagesProcessed, 1, 'Should process exactly 1 page when pages: 1 is passed');

  console.log('  ✔ convertPdfToMarkdown converts sample.pdf to valid Markdown');
}

// Test 2: Programmatic conversion with page range & table reconstruction (Attention paper Page 6)
{
  const attentionPdf = path.join(__dirname, 'fixtures/benchmarks/01-attention-is-all-you-need.pdf');
  if (fs.existsSync(attentionPdf)) {
    const result = await convertPdfToMarkdown(attentionPdf, {
      pageRange: '6'
    });

    assert(result.pagesProcessed === 1, 'Should process exactly 1 page');
    assert(result.markdown.includes('Table 1'), 'Markdown should preserve Table 1 caption');
    assert(result.markdown.includes('| Layer Type | Complexity per Layer |'), 'Markdown should contain Table 1 GFM headers');
    assert(result.markdown.includes('Self-Attention'), 'Markdown should contain Table 1 row content');
    assert(result.markdown.includes('O(n² · d)'), 'Markdown should restore math exponents as clean Unicode in tables');
    assert(result.markdown.includes('## 4 Why Self-Attention'), 'Markdown should detect section headings');

    fs.writeFileSync(path.join(resultsDir, 'attention-page6.md'), result.markdown);
    console.log('  ✔ convertPdfToMarkdown reconstructs tables, headings, and LaTeX math on Page 6');

    // Test 2b: Test Page 4 for display math LaTeX fraction, figure extraction, and prose preservation
    const assetsDir = path.join(resultsDir, 'attention-page4_assets');
    const p4Result = await convertPdfToMarkdown(attentionPdf, {
      pageRange: '4',
      assetsDir
    });

    assert(p4Result.markdown.includes('\\text{Attention}(Q, K, V ) = \\text{softmax}\\left(\\frac{Q K^T}{\\sqrt{d_k}} \\right) V \\tag{1}'),
      'Should accurately reconstruct compound display LaTeX equation with fraction and tag');
    assert(p4Result.markdown.includes('![Figure 2:'), 'Should insert figure markdown image tag');
    assert(!p4Result.markdown.includes('$$\ni=1 qiki'), 'Prose footnotes should not be falsely treated as display equations');
    assert(fs.existsSync(path.join(assetsDir, 'figure-p4-1.png')), 'Embedded figure should be extracted to assets directory');

    fs.writeFileSync(path.join(resultsDir, 'attention-page4.md'), p4Result.markdown);
    console.log('  ✔ convertPdfToMarkdown reconstructs compound LaTeX equations, extracts figures, and preserves footnotes on Page 4');
  } else {
    console.log('  ⚠ Attention paper benchmark fixture skipped (fixture not found)');
  }
}

// Test 3: CLI execution with --format md
{
  const samplePdf = path.join(__dirname, 'fixtures/sample.pdf');
  const cliOutput = path.join(resultsDir, 'cli-sample.md');
  const cliScript = path.join(__dirname, '../bin/cli.js');

  execSync(`node "${cliScript}" "${samplePdf}" "${cliOutput}" --format md`, {
    stdio: 'pipe',
    encoding: 'utf-8'
  });

  assert(fs.existsSync(cliOutput), 'CLI markdown output file should exist');
  const content = fs.readFileSync(cliOutput, 'utf-8');
  assert(content.length > 0, 'CLI markdown output should not be empty');

  console.log('  ✔ CLI successfully converts PDF to Markdown via --format md');
}

console.log('\n✔ All Direct PDF to Markdown tests passed successfully!\n');
