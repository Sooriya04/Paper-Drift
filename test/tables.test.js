/**
 * @file test/tables.test.js
 * @description Comprehensive unit and integration test suite for geometric table reconstruction.
 * Part of paper-drift - https://github.com/Sooriya04/Paper-Drift
 */

import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import mupdf from 'mupdf';
import {
  reconstructTableFromLines,
  formatTableCell,
  foldHeaders
} from '../src/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const resultsDir = path.join(__dirname, 'results/tables-test');

// Clean and prepare output directory for this test run
if (fs.existsSync(resultsDir)) {
  fs.rmSync(resultsDir, { recursive: true, force: true });
}
fs.mkdirSync(resultsDir, { recursive: true });

console.log('\nRunning Table Reconstruction Test Suite');

// Test 1: formatTableCell handles exponents and math
{
  const sc1 = formatTableCell('2.3 · 1019');
  assert.strictEqual(sc1, '2.3 · 10¹⁹', 'Scientific notation should be formatted with clean Unicode superscripts');

  const sc2 = formatTableCell('1.4 · 1020');
  assert.strictEqual(sc2, '1.4 · 10²⁰');

  const bo1 = formatTableCell('O(n2 · d)');
  assert.strictEqual(bo1, 'O(n² · d)', 'Big-O notation should format variable exponents with clean superscripts');

  const pipeEsc = formatTableCell('A | B');
  assert.strictEqual(pipeEsc, 'A \\| B', 'Pipes should be escaped');

  const newlineCell = formatTableCell('First line\nsecond line\r\nthird');
  assert.strictEqual(newlineCell, 'First line second line third', 'Newlines inside cells must be normalized to spaces');

  console.log('  ✔ formatTableCell restores scientific notation, big-O math, and escapes pipes');
}

// Test 2: foldHeaders merges multi-tier header rows
{
  const headers = [
    ['', 'BLEU', 'BLEU', 'Cost', 'Cost'],
    ['Model', 'EN-DE', 'EN-FR', 'EN-DE', 'EN-FR']
  ];
  const folded = foldHeaders(headers, 5);
  assert.strictEqual(folded[0], 'Model');
  assert.strictEqual(folded[1], 'BLEU EN-DE');
  assert.strictEqual(folded[2], 'BLEU EN-FR');
  assert.strictEqual(folded[3], 'Cost EN-DE');
  assert.strictEqual(folded[4], 'Cost EN-FR');

  console.log('  ✔ foldHeaders successfully combines hierarchical multi-tier column headers');
}

// Test 3: Synthetic grid reconstruction
{
  const syntheticLines = [
    // Header
    { text: 'Architecture', bbox: { x: 100, y: 50, w: 60, h: 10 } },
    { text: 'Top-1', bbox: { x: 200, y: 50, w: 30, h: 10 } },
    { text: 'Top-5', bbox: { x: 300, y: 50, w: 30, h: 10 } },
    // Row 1
    { text: 'ResNet-18', bbox: { x: 100, y: 70, w: 50, h: 10 } },
    { text: '69.8', bbox: { x: 200, y: 70, w: 25, h: 10 } },
    { text: '89.0', bbox: { x: 300, y: 70, w: 25, h: 10 } },
    // Row 2
    { text: 'ResNet-50', bbox: { x: 100, y: 90, w: 50, h: 10 } },
    { text: '76.1', bbox: { x: 200, y: 90, w: 25, h: 10 } },
    { text: '92.9', bbox: { x: 300, y: 90, w: 25, h: 10 } }
  ];

  const tableMd = reconstructTableFromLines(syntheticLines);
  assert(tableMd !== null, 'Reconstructed table should not be null');
  assert(tableMd.includes('| Architecture | Top-1 | Top-5 |'), 'Header row should match');
  assert(tableMd.includes('| :--- | :--- | :--- |'), 'Separator row should match');
  assert(tableMd.includes('| ResNet-18 | 69.8 | 89.0 |'), 'Data row 1 should match');
  assert(tableMd.includes('| ResNet-50 | 76.1 | 92.9 |'), 'Data row 2 should match');

  fs.writeFileSync(path.join(resultsDir, 'synthetic-table.md'), tableMd);
  console.log('  ✔ reconstructTableFromLines correctly assembles synthetic 3-column table');
}

// Test 3b: Rejection of false positive prose paragraphs with inline citations
{
  const paragraphLines = [
    { text: 'In this work we propose the Transformer, a model architecture', bbox: { x: 50, y: 100, w: 200, h: 10 } },
    { text: 'eschewing recurrence and relying entirely on attention', bbox: { x: 50, y: 115, w: 180, h: 10 } },
    { text: '[1].', bbox: { x: 232, y: 115, w: 15, h: 10 } },
    { text: 'Experiments on two machine translation tasks show these models', bbox: { x: 50, y: 130, w: 200, h: 10 } },
    { text: 'to be superior in quality while being more parallelizable.', bbox: { x: 50, y: 145, w: 195, h: 10 } }
  ];

  const falseTable = reconstructTableFromLines(paragraphLines);
  assert.strictEqual(falseTable, null, 'Normal text paragraph with citation fragment must NOT be converted to a table');
  console.log('  ✔ reconstructTableFromLines correctly rejects prose paragraphs with citations');
}

// Test 4: Real benchmark: Table 1 on Attention Is All You Need (Page 6)
{
  const fixturePath = path.join(__dirname, 'fixtures/benchmarks/01-attention-is-all-you-need.pdf');
  if (fs.existsSync(fixturePath)) {
    const pdfBuf = fs.readFileSync(fixturePath);
    const doc = mupdf.Document.openDocument(pdfBuf, 'application/pdf');
    const page = doc.loadPage(5); // Page 6 (0-indexed 5)
    const json = JSON.parse(page.toStructuredText().asJSON());

    // Find block containing Table 1 lines
    const tableBlock = json.blocks.find(b =>
      b.type === 'text' &&
      b.lines.some(l => l.text.includes('Layer Type')) &&
      b.lines.some(l => l.text.includes('Self-Attention'))
    );

    assert(tableBlock, 'Table 1 block should be detected on Page 6');
    const tableMd = reconstructTableFromLines(tableBlock.lines);
    assert(tableMd !== null, 'Reconstructed Table 1 should not be null');
    assert(tableMd.includes('Layer Type'), 'Table 1 should contain "Layer Type"');
    assert(tableMd.includes('Complexity per Layer'), 'Table 1 should contain "Complexity per Layer"');
    assert(tableMd.includes('Sequential Operations'), 'Table 1 should contain folded "Sequential Operations"');
    assert(tableMd.includes('Maximum Path Length'), 'Table 1 should contain "Maximum Path Length"');
    assert(tableMd.includes('O(n² · d)'), 'Table 1 should restore math exponents as clean Unicode');

    fs.writeFileSync(path.join(resultsDir, 'attention-table1.md'), tableMd);
    console.log('  ✔ reconstructTableFromLines successfully reconstructs Table 1 from Attention paper');

    // Test Table 3 multi-block table reconstruction on Page 9
    const page9 = doc.loadPage(8);
    const json9 = JSON.parse(page9.toStructuredText().asJSON());
    const table3Lines = [];
    for (let b = 1; b <= 9; b++) {
      if (json9.blocks[b]) table3Lines.push(...json9.blocks[b].lines);
    }
    const table3Md = reconstructTableFromLines(table3Lines);
    assert(table3Md !== null, 'Table 3 should reconstruct successfully');
    assert(table3Md.includes('dmodel'), 'Table 3 should contain dmodel column');
    assert(table3Md.includes('Pdrop'), 'Table 3 should contain Pdrop column');
    assert(table3Md.includes('train steps'), 'Table 3 should contain train steps');
    assert(!table3Md.includes('Column 1'), 'Table 3 should not contain synthetic Column 1 header');
    console.log('  ✔ reconstructTableFromLines successfully reconstructs complex multi-block Table 3');
  } else {
    console.log('  ⚠ Attention paper benchmark fixture skipped (fixture not found)');
  }
}

console.log('\n✔ All Table Reconstruction tests passed successfully!\n');
