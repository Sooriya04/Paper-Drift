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

console.log('\n\x1b[32m✔ All spatial tests passed successfully!\x1b[0m\n');
