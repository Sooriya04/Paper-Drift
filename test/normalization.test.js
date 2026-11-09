/**
 * @file test/normalization.test.js
 * @description Unit tests for text normalization pipeline.
 * Tests ligature cleanup, math preservation, hyphenation repair, whitespace normalization,
 * running headers/footers filtering, and top-level normalizer composition.
 * Part of paper-drift - https://github.com/Sooriya04/Paper-Drift
 */

import assert from 'assert';
import {
  cleanLigatures,
  repairHyphenation,
  normalizeWhitespace,
  filterRunningHeadersFooters,
  normalizePageText
} from '../src/normalization/text.js';

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

console.log('\n\x1b[1m\x1b[36mRunning Text Normalization Pipeline Test Suite\x1b[0m');

// 1. Ligatures & Unicode Cleanup
runTest('cleanLigatures replaces standard PDF typographic ligatures', () => {
  const input = 'ﬁle ﬂow eﬀect oﬃce aﬄict aﬅer ﬁrﬆ';
  const expected = 'file flow effect office afflict after first';
  assert.strictEqual(cleanLigatures(input), expected);
});

runTest('cleanLigatures replaces Dutch and Latin ligatures IJ and ij', () => {
  const input = 'Ĳsselmeer and ĳs or ﬇';
  const expected = 'IJsselmeer and ijs or ij';
  assert.strictEqual(cleanLigatures(input), expected);
});

runTest('cleanLigatures normalizes smart quotes and apostrophes to standard ASCII', () => {
  const input = '‘single’ ‚low‛ and “double” „low‟ «guillemets» ‹single›';
  const expected = '\'single\' \'low\' and "double" "low" "guillemets" \'single\'';
  assert.strictEqual(cleanLigatures(input), expected);
});

runTest('cleanLigatures normalizes modifier apostrophes without corrupting letters', () => {
  const input = 'OʼConnor and dʼAlembert';
  const expected = "O'Connor and d'Alembert";
  assert.strictEqual(cleanLigatures(input), expected);
});

runTest('cleanLigatures preserves mathematical notations, Greek symbols, and operators', () => {
  const mathInput = 'f(x) = ∫_0^∞ e^{-x} dx ≤ ∑_{i=1}^n x_i ∏ y_i ≠ α + β + γ ≥ 0';
  assert.strictEqual(cleanLigatures(mathInput), mathInput);
});

// 2. Hyphenation Repair
runTest('repairHyphenation joins words split across line breaks by hyphens', () => {
  const input = 'trans-\nformer architec-\nture and imple-\nmentation';
  const expected = 'transformer architecture and implementation';
  assert.strictEqual(repairHyphenation(input), expected);
});

runTest('repairHyphenation rejoins words split with compound prefixes where the joined word is a single word', () => {
  // re-sults -> results, pre-vious -> previous, multi-plicative -> multiplicative
  const input = 're-\nsults and pre-\nvious and multi-\nplicative';
  const expected = 'results and previous and multiplicative';
  assert.strictEqual(repairHyphenation(input), expected);
});

runTest('repairHyphenation preserves legitimate compound words across line breaks', () => {
  const input = 'state-of-\nthe-art well-\nknown cross-\nattention multi-\ncolumn fine-\ntuning high-\nlevel';
  const expected = 'state-of-the-art well-known cross-attention multi-column fine-tuning high-level';
  assert.strictEqual(repairHyphenation(input), expected);
});

runTest('repairHyphenation preserves hyphenated compound proper nouns with capital suffix', () => {
  const input = 'Berkeley-\nParser and DeepSeek-\nV3 and Cloud-\nTPU';
  const expected = 'Berkeley-Parser and DeepSeek-V3 and Cloud-TPU';
  assert.strictEqual(repairHyphenation(input), expected);
});

runTest('repairHyphenation rejoins all-caps words split across lines', () => {
  const input = 'LAN-\nGUAGE and TRANS-\nFORMER';
  const expected = 'LANGUAGE and TRANSFORMER';
  assert.strictEqual(repairHyphenation(input), expected);
});

runTest('repairHyphenation handles Unicode hyphens, soft hyphens, and Windows CRLF line endings', () => {
  // U+2010 hyphen, U+2011 non-breaking hyphen, U+00AD soft hyphen
  const input = 'trans\u2010\r\nformer and architec\u2011\n\nture and imple\u00AD\r\nmentation and in\u00ADline soft hyphen';
  const expected = 'transformer and architec\u2011\n\nture and implementation and inline soft hyphen';
  assert.strictEqual(repairHyphenation(input), expected);
});

runTest('repairHyphenation preserves markdown bullet points and hyphens', () => {
  const input = '- Item 1\n- Item 2\n  - Subitem';
  assert.strictEqual(repairHyphenation(input), input);
});

// 3. Whitespace Normalization
runTest('normalizeWhitespace collapses excessive horizontal whitespace while preserving line breaks', () => {
  const input = 'Word1    Word2\t\tWord3  \nLine2   continuation';
  const expected = 'Word1 Word2 Word3\nLine2 continuation';
  assert.strictEqual(normalizeWhitespace(input), expected);
});

runTest('normalizeWhitespace normalizes Unicode spaces, BOM, and line separator characters', () => {
  // U+FEFF (BOM), U+00A0 (NBSP), U+2003 (EM space), U+2028 (Line Separator), U+3000 (Ideographic space)
  const input = '\uFEFFSection 1\u00A0\u2003Details\u2028Next Line\u3000End';
  const expected = 'Section 1 Details\nNext Line End';
  assert.strictEqual(normalizeWhitespace(input), expected);
});

runTest('normalizeWhitespace collapses 3+ consecutive newlines down to 2 and trims lines', () => {
  const input = 'Paragraph 1   \n\n\n\n   Paragraph 2\n\n\nParagraph 3';
  const expected = 'Paragraph 1\n\nParagraph 2\n\nParagraph 3';
  assert.strictEqual(normalizeWhitespace(input), expected);
});

// 4. Header & Footer Detection and Filtering
runTest('filterRunningHeadersFooters detects and strips repeating headers and footers across pages', () => {
  const pages = [
    { page: 1, content: 'PREPRINT - DRAFT\nFirst page body content here.\n1' },
    { page: 2, content: 'PREPRINT - DRAFT\nSecond page body content here.\n2' },
    { page: 3, content: 'PREPRINT - DRAFT\nThird page body content here.\n3' }
  ];
  const cleaned = filterRunningHeadersFooters(pages);
  assert.strictEqual(cleaned[0].content, 'First page body content here.');
  assert.strictEqual(cleaned[1].content, 'Second page body content here.');
  assert.strictEqual(cleaned[2].content, 'Third page body content here.');
});

// 5. Top-Level Normalizer
runTest('normalizePageText composes ligature, hyphenation, and whitespace normalization cleanly', () => {
  const raw = '  The ﬁrst trans-\nformer  achieved  “state-of-\nthe-art”   results.\n\n\n\nEquation: α + β ≤ γ  ';
  const normalized = normalizePageText(raw);
  const expected = 'The first transformer achieved "state-of-the-art" results.\n\nEquation: α + β ≤ γ';
  assert.strictEqual(normalized, expected);
});

console.log('\n\x1b[32m✔ All Text Normalization tests passed successfully!\x1b[0m\n');
