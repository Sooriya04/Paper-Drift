/**
 * @file test/spatial.test.js
 * @description Automated tests for Phase 2: Multi-column spatial reading order and Recursive XY-Cut.
 * Validates dynamic layout decomposition without hardcoded formats or dropped content.
 * Part of paper-drift - https://github.com/Sooriya04/Paper-Drift
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import mupdf from 'mupdf';
import { resolveReadingOrder, recursiveXyCut } from '../src/spatial/reading-order.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function assert(condition, message) {
  if (!condition) {
    throw new Error(message || 'Assertion failed');
  }
}

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

console.log('\n\x1b[1m\x1b[36mRunning Spatial Reading Order Test Suite\x1b[0m');

// 1. Synthetic 2-column test with zero hardcoding
runTest('recursiveXyCut sorts 2-column blocks in natural reading order (col 1 -> col 2)', () => {
  const blocks = [
    // Column 2 top
    { bbox: { x: 320, y: 100, w: 200, h: 50 }, lines: [{ text: 'Right column paragraph 1' }] },
    // Column 1 top
    { bbox: { x: 50, y: 100, w: 200, h: 50 }, lines: [{ text: 'Left column paragraph 1' }] },
    // Column 1 bottom
    { bbox: { x: 50, y: 200, w: 200, h: 50 }, lines: [{ text: 'Left column paragraph 2' }] },
    // Column 2 bottom
    { bbox: { x: 320, y: 200, w: 200, h: 50 }, lines: [{ text: 'Right column paragraph 2' }] },
    // Top banner spanning across both columns
    { bbox: { x: 50, y: 20, w: 470, h: 40 }, lines: [{ text: 'Document Title Banner' }] }
  ];

  const ordered = recursiveXyCut(blocks);
  assert(ordered.length === 5, 'Must preserve all 5 blocks without dropping any');

  const texts = ordered.map(b => b.lines[0].text);

  // Expected natural human reading order:
  // 1. Document Title Banner
  // 2. Left column paragraph 1
  // 3. Left column paragraph 2
  // 4. Right column paragraph 1
  // 5. Right column paragraph 2
  assert(texts[0] === 'Document Title Banner', 'Banner must come first');
  assert(texts[1] === 'Left column paragraph 1', 'Left col paragraph 1 must precede col 2');
  assert(texts[2] === 'Left column paragraph 2', 'Left col paragraph 2 must precede col 2');
  assert(texts[3] === 'Right column paragraph 1', 'Right col paragraph 1 must follow left column');
  assert(texts[4] === 'Right column paragraph 2', 'Right col paragraph 2 must come last');
});

// 2. Synthetic 1-column single page test
runTest('recursiveXyCut preserves simple single-column top-to-bottom layout', () => {
  const blocks = [
    { bbox: { x: 50, y: 300, w: 500, h: 30 }, lines: [{ text: 'Paragraph 3' }] },
    { bbox: { x: 50, y: 100, w: 500, h: 30 }, lines: [{ text: 'Paragraph 1' }] },
    { bbox: { x: 50, y: 200, w: 500, h: 30 }, lines: [{ text: 'Paragraph 2' }] }
  ];

  const ordered = recursiveXyCut(blocks);
  const texts = ordered.map(b => b.lines[0].text);

  assert(texts[0] === 'Paragraph 1', 'Must sort top-to-bottom');
  assert(texts[1] === 'Paragraph 2', 'Must sort top-to-bottom');
  assert(texts[2] === 'Paragraph 3', 'Must sort top-to-bottom');
});

// 3. Real PDF test on sample.pdf
const samplePath = path.resolve(__dirname, 'fixtures/sample.pdf');
if (fs.existsSync(samplePath)) {
  runTest('resolveReadingOrder parses test/fixtures/sample.pdf without dropping content', () => {
    const buf = fs.readFileSync(samplePath);
    const doc = mupdf.Document.openDocument(buf, 'application/pdf');
    const page = doc.loadPage(0);
    const bounds = page.getBounds();
    const json = JSON.parse(page.toStructuredText().asJSON());

    const result = resolveReadingOrder(json, bounds[2] - bounds[0], bounds[3] - bounds[1]);
    const rawCount = json.blocks.filter(b => b.type === 'text').length;

    assert(result.blocks.length === rawCount, `Must retain all ${rawCount} text blocks`);
    assert(result.text.includes('paper-drift Document Parser'), 'Must retain title text');
    assert(result.columnsDetected === 1, 'Sample document should be detected as 1 column');
  });
}

// 4. Synthetic 3-column test with banner and page number footer
runTest('recursiveXyCut sorts 3-column blocks and spanning elements correctly', () => {
  const banner = { bbox: { x: 50, y: 20, w: 500, h: 30 }, lines: [{ text: 'Tri-Column Header Banner' }] };
  const col1Top = { bbox: { x: 50, y: 70, w: 140, h: 40 }, lines: [{ text: 'Col 1 Top' }] };
  const col1Bot = { bbox: { x: 50, y: 120, w: 140, h: 40 }, lines: [{ text: 'Col 1 Bot' }] };
  const col2Top = { bbox: { x: 230, y: 70, w: 140, h: 40 }, lines: [{ text: 'Col 2 Top' }] };
  const col2Bot = { bbox: { x: 230, y: 120, w: 140, h: 40 }, lines: [{ text: 'Col 2 Bot' }] };
  const col3Top = { bbox: { x: 410, y: 70, w: 140, h: 40 }, lines: [{ text: 'Col 3 Top' }] };
  const col3Bot = { bbox: { x: 410, y: 120, w: 140, h: 40 }, lines: [{ text: 'Col 3 Bot' }] };
  const footer = { bbox: { x: 295, y: 500, w: 10, h: 10 }, lines: [{ text: '1' }] };

  // Shuffled input order
  const shuffled = [col2Bot, col3Top, banner, col1Bot, footer, col2Top, col3Bot, col1Top];
  const ordered = recursiveXyCut(shuffled);
  assert(ordered.length === 8, 'Must preserve all 8 blocks');

  const texts = ordered.map(b => b.lines[0].text);
  assert(texts[0] === 'Tri-Column Header Banner', 'Banner must come first');
  assert(texts[1] === 'Col 1 Top', 'Col 1 Top should precede others');
  assert(texts[2] === 'Col 1 Bot', 'Col 1 Bot should precede Col 2');
  assert(texts[3] === 'Col 2 Top', 'Col 2 Top should follow Col 1');
  assert(texts[4] === 'Col 2 Bot', 'Col 2 Bot should follow Col 2 Top');
  assert(texts[5] === 'Col 3 Top', 'Col 3 Top should follow Col 2');
  assert(texts[6] === 'Col 3 Bot', 'Col 3 Bot should follow Col 3 Top');
  assert(texts[7] === '1', 'Footer must come last');
});

// 5. Mixed layout test: Spanning banner, 2 columns, spanning figure, followed by 2 columns
runTest('recursiveXyCut partitions mixed spanning figures cleanly across 2-column flow', () => {
  const title = { bbox: { x: 50, y: 20, w: 500, h: 30 }, lines: [{ text: 'Mixed Layout Paper' }] };
  const topCol1 = { bbox: { x: 50, y: 70, w: 230, h: 50 }, lines: [{ text: 'Top Col 1' }] };
  const topCol2 = { bbox: { x: 320, y: 70, w: 230, h: 50 }, lines: [{ text: 'Top Col 2' }] };
  const spanningFigure = { bbox: { x: 50, y: 140, w: 500, h: 60 }, lines: [{ text: 'Figure 1: Full width architecture diagram' }] };
  const botCol1 = { bbox: { x: 50, y: 220, w: 230, h: 50 }, lines: [{ text: 'Bottom Col 1' }] };
  const botCol2 = { bbox: { x: 320, y: 220, w: 230, h: 50 }, lines: [{ text: 'Bottom Col 2' }] };

  const shuffled = [botCol2, topCol2, spanningFigure, botCol1, title, topCol1];
  const ordered = recursiveXyCut(shuffled);

  const texts = ordered.map(b => b.lines[0].text);
  assert(texts[0] === 'Mixed Layout Paper', 'Title first');
  assert(texts[1] === 'Top Col 1', 'Top Col 1 precedes Top Col 2');
  assert(texts[2] === 'Top Col 2', 'Top Col 2 precedes Spanning Figure');
  assert(texts[3] === 'Figure 1: Full width architecture diagram', 'Spanning Figure cleanly separates bands');
  assert(texts[4] === 'Bottom Col 1', 'Bottom Col 1 precedes Bottom Col 2');
  assert(texts[5] === 'Bottom Col 2', 'Bottom Col 2 comes last');
});

// 6. Inline overlapping elements (e.g. math terms) test
runTest('recursiveXyCut sorts horizontally overlapping inline symbols left-to-right', () => {
  const sym1 = { bbox: { x: 100, y: 150, w: 20, h: 14 }, lines: [{ text: 'f(x)' }] };
  const sym2 = { bbox: { x: 130, y: 151, w: 10, h: 12 }, lines: [{ text: '=' }] };
  const sym3 = { bbox: { x: 150, y: 149, w: 30, h: 15 }, lines: [{ text: 'x^2' }] };

  const shuffled = [sym3, sym1, sym2];
  const ordered = recursiveXyCut(shuffled);
  const texts = ordered.map(b => b.lines[0].text);
  assert(texts[0] === 'f(x)' && texts[1] === '=' && texts[2] === 'x^2', 'Must sort inline symbols left-to-right');
});

// 7. Real benchmark PDFs validation
const benchmarks = [
  { name: 'Attention is All You Need', file: 'fixtures/benchmarks/01-attention-is-all-you-need.pdf' },
  { name: 'Deep Residual Learning (ResNet)', file: 'fixtures/benchmarks/02-resnet-deep-residual-learning.pdf' },
  { name: 'LoRA: Low-Rank Adaptation', file: 'fixtures/benchmarks/03-lora-low-rank-adaptation.pdf' }
];

for (const bm of benchmarks) {
  const bmPath = path.resolve(__dirname, bm.file);
  if (fs.existsSync(bmPath)) {
    runTest(`resolveReadingOrder accurately parses ${bm.name} preserving all content`, () => {
      const buf = fs.readFileSync(bmPath);
      const doc = mupdf.Document.openDocument(buf, 'application/pdf');
      const count = Math.min(doc.countPages(), 3);
      for (let p = 0; p < count; p++) {
        const page = doc.loadPage(p);
        const bounds = page.getBounds();
        const json = JSON.parse(page.toStructuredText().asJSON());
        const rawCount = json.blocks.filter(b => b.type === 'text').length;
        const res = resolveReadingOrder(json, bounds[2] - bounds[0], bounds[3] - bounds[1]);
        assert(res.blocks.length === rawCount, `Page ${p + 1}: expected ${rawCount} blocks, got ${res.blocks.length}`);
        assert(typeof res.text === 'string' && res.text.length > 0, `Page ${p + 1}: text must not be empty`);
        assert(res.columnsDetected >= 1 && res.columnsDetected <= 3, `Page ${p + 1}: valid column count`);
      }
    });
  }
}

console.log('\n\x1b[32m✔ All spatial tests passed successfully!\x1b[0m\n');
