/**
 * @file test/vectors.test.js
 * @description Automated test suite for vector path walker and page furniture filter.
 * Validates ruling line detection, stroked rectangle decomposition, margin filtering, and MuPDF WASM vector extraction.
 * Part of paper-drift - https://github.com/Sooriya04/Paper-Drift
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import * as mupdf from 'mupdf';

import {
  isThinRule,
  rulesFromVector,
  inMargin,
  runningPageThreshold,
  filterContentRules,
  MAX_RULE_THICKNESS,
  MIN_RULE_LENGTH,
  MARGIN_BAND
} from '../src/vectors/rules.js';
import { extractPageVectorsAndText } from '../src/vectors/walker.js';

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

console.log('\n\x1b[1m\x1b[36mRunning Vector Layout & Furniture Filter Test Suite\x1b[0m');

// ==========================================
// Suite 1: isThinRule Dimension Validation
// ==========================================
runTest('isThinRule identifies horizontal thin rules within thickness and length thresholds', () => {
  // Standard horizontal thin rules
  assert(isThinRule(100, 1), '100x1 horizontal rule should be true');
  assert(isThinRule(500, 0.5), '500x0.5 hairline rule should be true');
  assert(isThinRule(MIN_RULE_LENGTH, MAX_RULE_THICKNESS), 'Exact boundary (8x4) should be true');
  assert(isThinRule(20, 0), 'Zero-thickness line stroke (20x0) should be true');

  // Negative dimension robustness
  assert(isThinRule(-150, -1), 'Negative dimensions should be handled via absolute values');
});

runTest('isThinRule identifies vertical thin rules within thickness and length thresholds', () => {
  // Standard vertical thin rules
  assert(isThinRule(1, 100), '1x100 vertical rule should be true');
  assert(isThinRule(0.75, 400), '0.75x400 vertical divider should be true');
  assert(isThinRule(MAX_RULE_THICKNESS, MIN_RULE_LENGTH), 'Exact boundary (4x8) should be true');
  assert(isThinRule(0, 30), 'Zero-thickness vertical line stroke (0x30) should be true');
});

runTest('isThinRule rejects shapes that are too thick, too short, or square blocks', () => {
  // Too thick
  assert(!isThinRule(100, 5), '100x5 is too thick (> 4pt)');
  assert(!isThinRule(5, 100), '5x100 is too thick (> 4pt)');

  // Too short
  assert(!isThinRule(7, 2), '7x2 is too short (< 8pt)');
  assert(!isThinRule(2, 7), '2x7 is too short (< 8pt)');

  // Boxes / blocks / points
  assert(!isThinRule(50, 50), '50x50 box should be false');
  assert(!isThinRule(4, 4), '4x4 square should be false');
  assert(!isThinRule(0, 0), '0x0 point should be false');
});

// ==========================================
// Suite 2: rulesFromVector Extraction
// ==========================================
runTest('rulesFromVector extracts single rule from already thin vector rectangle', () => {
  // Thin horizontal rectangle
  const horizVec = {
    bbox: [50, 120, 450, 121],
    flags: { isStroked: false, isRectangle: true }
  };
  const horizRules = rulesFromVector(horizVec);
  assert(horizRules.length === 1, `Expected 1 rule, got ${horizRules.length}`);
  assert(horizRules[0].left === 50 && horizRules[0].top === 120, 'Left and top match');
  assert(horizRules[0].right === 450 && horizRules[0].bottom === 121, 'Right and bottom match');

  // Thin vertical rectangle
  const vertVec = {
    bbox: [200, 50, 201, 350],
    flags: { isStroked: true, isRectangle: true }
  };
  const vertRules = rulesFromVector(vertVec);
  assert(vertRules.length === 1, `Expected 1 rule for thin vertical stroke, got ${vertRules.length}`);
  assert(vertRules[0].left === 200 && vertRules[0].right === 201, 'Vertical coordinates match');
});

runTest('rulesFromVector decomposes stroked rectangle box into 4 border rules', () => {
  const boxVec = {
    bbox: [50, 100, 450, 300],
    flags: { isStroked: true, isRectangle: true }
  };
  const rules = rulesFromVector(boxVec);
  assert(rules.length === 4, `Expected 4 border rules from stroked box, got ${rules.length}`);

  // Top edge
  const topEdge = rules.find(r => r.left === 50 && r.right === 450 && r.top === 100 && r.bottom === 100);
  assert(topEdge !== undefined, 'Top border rule found');

  // Bottom edge
  const bottomEdge = rules.find(r => r.left === 50 && r.right === 450 && r.top === 300 && r.bottom === 300);
  assert(bottomEdge !== undefined, 'Bottom border rule found');

  // Left edge
  const leftEdge = rules.find(r => r.left === 50 && r.right === 50 && r.top === 100 && r.bottom === 300);
  assert(leftEdge !== undefined, 'Left border rule found');

  // Right edge
  const rightEdge = rules.find(r => r.left === 450 && r.right === 450 && r.top === 100 && r.bottom === 300);
  assert(rightEdge !== undefined, 'Right border rule found');
});

runTest('rulesFromVector safely rejects non-rule vectors and handles inverted coords/invalid input', () => {
  // Filled background rectangle (not stroked, not thin)
  assert(rulesFromVector({ bbox: [50, 100, 450, 300], flags: { isStroked: false, isRectangle: true } }).length === 0, 'Filled box rejected');

  // Inverted bounding box coordinates normalization
  const inverted = rulesFromVector({ bbox: [450, 121, 50, 120], flags: {} });
  assert(inverted.length === 1, 'Inverted coords normalized');
  assert(inverted[0].left === 50 && inverted[0].right === 450, 'Normalized left < right');

  // Null and malformed vectors
  assert(rulesFromVector(null).length === 0, 'Null returns empty array');
  assert(rulesFromVector({}).length === 0, 'Empty object returns empty array');
  assert(rulesFromVector({ bbox: [0, 0] }).length === 0, 'Incomplete bbox returns empty array');
});

// ==========================================
// Suite 3: Margin Checking & Threshold Math
// ==========================================
runTest('runningPageThreshold matches min(8, max(3, ceil(pageCount * 0.5)))', () => {
  assert(runningPageThreshold(1) === 3, '1 page threshold is 3');
  assert(runningPageThreshold(2) === 3, '2 pages threshold is 3');
  assert(runningPageThreshold(3) === 3, '3 pages threshold is 3');
  assert(runningPageThreshold(4) === 3, '4 pages threshold is 3');
  assert(runningPageThreshold(5) === 3, '5 pages threshold is 3');
  assert(runningPageThreshold(6) === 3, '6 pages threshold is 3');
  assert(runningPageThreshold(7) === 4, '7 pages threshold is 4');
  assert(runningPageThreshold(8) === 4, '8 pages threshold is 4');
  assert(runningPageThreshold(10) === 5, '10 pages threshold is 5');
  assert(runningPageThreshold(16) === 8, '16 pages threshold is 8');
  assert(runningPageThreshold(25) === 8, '25 pages threshold clamped to 8');
  assert(runningPageThreshold(100) === 8, '100 pages threshold clamped to 8');
});

runTest('inMargin accurately classifies rules inside outer 12% margin band', () => {
  const bounds = [0, 0, 600, 800]; // 12% band: top/bottom <= 96 or >= 704; left/right <= 72 or >= 528

  // Top header margin (midY = 40 <= 96)
  assert(inMargin({ left: 50, top: 40, right: 550, bottom: 40 }, bounds), 'Header rule is in margin');

  // Bottom footer margin (midY = 750 >= 704)
  assert(inMargin({ left: 50, top: 750, right: 550, bottom: 750 }, bounds), 'Footer rule is in margin');

  // Left margin vertical rule (midX = 30 <= 72)
  assert(inMargin({ left: 30, top: 200, right: 30, bottom: 600 }, bounds), 'Left margin rule is in margin');

  // Right margin vertical rule (midX = 570 >= 528)
  assert(inMargin({ left: 570, top: 200, right: 570, bottom: 600 }, bounds), 'Right margin rule is in margin');

  // Content body rule (midX = 300, midY = 400)
  assert(!inMargin({ left: 100, top: 400, right: 500, bottom: 400 }, bounds), 'Body content rule is not in margin');

  // Defensive checks
  assert(!inMargin(null, bounds), 'Null rule returns false');
  assert(!inMargin({ left: 10, top: 10, right: 20, bottom: 20 }, null), 'Null bounds returns false');
});

// ==========================================
// Suite 4: Multi-Page Furniture Filtering
// ==========================================
runTest('filterContentRules suppresses recurring margin rules while preserving content lines and single-page margin lines', () => {
  const bounds = [0, 0, 612, 792]; // standard letter

  // Define test rules
  const recurringHeaderRule = { left: 54, top: 36, right: 558, bottom: 36.5 }; // midY = 36.25 <= 95 (margin)
  const recurringFooterRule = { left: 54, top: 756, right: 558, bottom: 756.5 }; // midY = 756.25 >= 696 (margin)
  const contentTableRule1 = { left: 54, top: 250, right: 558, bottom: 250.5 }; // midY = 250 (content)
  const contentTableRule2 = { left: 54, top: 320, right: 558, bottom: 320.5 }; // midY = 320 (content)
  const recurringContentDivider = { left: 54, top: 450, right: 558, bottom: 450.5 }; // midY = 450 (content, on all pages)
  const singlePageFootnoteRule = { left: 54, top: 720, right: 200, bottom: 720.5 }; // midY = 720 (in margin, but page 1 only)

  // Construct 5-page document mock
  const pagesData = [
    {
      index: 0,
      bounds,
      rules: [recurringHeaderRule, recurringFooterRule, contentTableRule1, contentTableRule2, recurringContentDivider]
    },
    {
      index: 1,
      bounds,
      rules: [recurringHeaderRule, recurringFooterRule, singlePageFootnoteRule, recurringContentDivider]
    },
    {
      index: 2,
      bounds,
      rules: [recurringHeaderRule, recurringFooterRule, recurringContentDivider]
    },
    {
      index: 3,
      bounds,
      rules: [recurringHeaderRule, recurringFooterRule, recurringContentDivider]
    },
    {
      index: 4,
      bounds,
      rules: [recurringHeaderRule, recurringFooterRule, recurringContentDivider]
    }
  ];

  const filteredRulesMap = filterContentRules(pagesData);

  assert(filteredRulesMap instanceof Map, 'Result is a Map');
  assert(filteredRulesMap.size === 5, 'Result contains 5 pages');

  // Page 0 checks
  const p0Rules = filteredRulesMap.get(0);
  assert(p0Rules.includes(contentTableRule1), 'Page 0 preserved content table rule 1');
  assert(p0Rules.includes(contentTableRule2), 'Page 0 preserved content table rule 2');
  assert(p0Rules.includes(recurringContentDivider), 'Page 0 preserved content divider despite repeating on all pages');
  assert(!p0Rules.includes(recurringHeaderRule), 'Page 0 dropped recurring header rule');
  assert(!p0Rules.includes(recurringFooterRule), 'Page 0 dropped recurring footer rule');

  // Page 1 checks
  const p1Rules = filteredRulesMap.get(1);
  assert(p1Rules.includes(singlePageFootnoteRule), 'Page 1 preserved footnote rule in margin because it is NOT recurring');
  assert(p1Rules.includes(recurringContentDivider), 'Page 1 preserved content divider');
  assert(!p1Rules.includes(recurringHeaderRule), 'Page 1 dropped recurring header rule');
  assert(!p1Rules.includes(recurringFooterRule), 'Page 1 dropped recurring footer rule');

  // Pages 2, 3, 4 checks
  for (let i = 2; i <= 4; i++) {
    const rules = filteredRulesMap.get(i);
    assert(rules.length === 1, `Page ${i} should only retain the content divider line`);
    assert(rules[0] === recurringContentDivider, `Page ${i} retained content divider`);
  }
});

runTest('filterContentRules suppresses decorative page frames repeating on all pages', () => {
  const bounds = [0, 0, 600, 800];
  // Page frame decomposed into 4 borders in margin
  const frameTop = { left: 10, top: 10, right: 590, bottom: 10 };
  const frameBottom = { left: 10, top: 790, right: 590, bottom: 790 };
  const frameLeft = { left: 10, top: 10, right: 10, bottom: 790 };
  const frameRight = { left: 590, top: 10, right: 590, bottom: 790 };

  const contentRule = { left: 100, top: 400, right: 500, bottom: 400 };

  const pagesData = [0, 1, 2, 3].map(index => ({
    index,
    bounds,
    rules: [frameTop, frameBottom, frameLeft, frameRight, ...(index === 0 ? [contentRule] : [])]
  }));

  const filtered = filterContentRules(pagesData);
  const p0 = filtered.get(0);
  assert(p0.length === 1 && p0[0] === contentRule, 'Page frame borders dropped across pages, body content rule kept');
  assert(filtered.get(1).length === 0, 'Page 1 frame borders dropped completely');
});

// ==========================================
// Suite 5: Vector Walker on Actual PDF Fixtures
// ==========================================
runTest('extractPageVectorsAndText extracts text lines, metrics, and vectors from sample.pdf', () => {
  const samplePdfPath = path.resolve(__dirname, 'fixtures/sample.pdf');
  assert(fs.existsSync(samplePdfPath), 'test/fixtures/sample.pdf exists');

  const data = fs.readFileSync(samplePdfPath);
  const doc = mupdf.Document.openDocument(data, 'application/pdf');
  const page = doc.loadPage(0);

  const { lines, vectors } = extractPageVectorsAndText(page);

  assert(Array.isArray(lines), 'lines is an array');
  assert(Array.isArray(vectors), 'vectors is an array');
  assert(lines.length > 0, `Expected lines > 0, got ${lines.length}`);

  // Validate line structure
  const firstLine = lines[0];
  assert(typeof firstLine.text === 'string' && firstLine.text.length > 0, 'Line has non-empty text');
  assert(firstLine.text.includes('paper-drift'), `Expected text to mention paper-drift, got "${firstLine.text}"`);
  assert(Array.isArray(firstLine.bbox) && firstLine.bbox.length === 4, 'Line has bbox array');
  assert(typeof firstLine.left === 'number', 'Line has numeric left');
  assert(typeof firstLine.top === 'number', 'Line has numeric top');
  assert(typeof firstLine.right === 'number', 'Line has numeric right');
  assert(typeof firstLine.bottom === 'number', 'Line has numeric bottom');
  assert(firstLine.width > 0 && firstLine.height > 0, 'Line width and height positive');

  // Validate font metrics
  assert(firstLine.font !== null, 'Line has font metrics');
  assert(typeof firstLine.font.name === 'string', 'Font has name');
  assert(typeof firstLine.font.size === 'number' && firstLine.font.size > 0, 'Font has positive size');
  assert(typeof firstLine.font.isBold === 'boolean', 'Font has isBold flag');
  assert(typeof firstLine.font.isItalic === 'boolean', 'Font has isItalic flag');
  assert(typeof firstLine.font.flags === 'object', 'Font has flags object');
  assert(typeof firstLine.font.flags.isBold === 'boolean', 'Font flags.isBold is boolean');
});

runTest('extractPageVectorsAndText extracts vectors from pos_full_grid.pdf fixture', () => {
  const gridPdfPath = path.resolve(__dirname, 'fixtures/eval/pos_full_grid.pdf');
  if (fs.existsSync(gridPdfPath)) {
    const data = fs.readFileSync(gridPdfPath);
    const doc = mupdf.Document.openDocument(data, 'application/pdf');
    const page = doc.loadPage(0);

    const { lines, vectors } = extractPageVectorsAndText(page);
    assert(vectors.length > 0, `Expected vectors > 0, got ${vectors.length}`);

    // Verify vector structure
    for (const v of vectors) {
      assert(Array.isArray(v.bbox) && v.bbox.length === 4, 'Vector has 4-element bbox');
      assert(typeof v.flags === 'object', 'Vector has flags');
    }

    // Convert vectors to rules
    const rules = vectors.flatMap(rulesFromVector);
    assert(rules.length >= 6, `Expected at least 6 rules from full grid, got ${rules.length}`);
  }
});

runTest('extractPageVectorsAndText fallback handles edge case gracefully', () => {
  // Edge case 1: null page
  const nullResult = extractPageVectorsAndText(null);
  assert(Array.isArray(nullResult.lines) && nullResult.lines.length === 0, 'Null page returns empty lines');
  assert(Array.isArray(nullResult.vectors) && nullResult.vectors.length === 0, 'Null page returns empty vectors');

  // Edge case 2: mock page where toStructuredText('vectors') throws, falling back to JSON
  const mockPage = {
    toStructuredText(mode) {
      if (mode === 'vectors') {
        throw new Error('Simulated WASM vector walk failure');
      }
      return {
        asJSON() {
          return JSON.stringify({
            blocks: [
              {
                lines: [
                  {
                    text: 'Fallback line text',
                    bbox: [50, 100, 200, 115],
                    font: { name: 'Fallback-Font', size: 12, isBold: false, isItalic: false }
                  }
                ]
              }
            ]
          });
        }
      };
    }
  };

  const fallbackResult = extractPageVectorsAndText(mockPage);
  assert(fallbackResult.lines.length === 1, 'Fallback successfully extracted 1 line');
  assert(fallbackResult.lines[0].text === 'Fallback line text', 'Fallback extracted line text');
  assert(fallbackResult.lines[0].font.name === 'Fallback-Font', 'Fallback extracted font info');
  assert(fallbackResult.vectors.length === 0, 'Fallback returned safe empty vectors');
});

console.log('\n\x1b[32m✔ All vector tests passed successfully!\x1b[0m\n');
