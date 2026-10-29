/**
 * @file test/markdown.test.js
 * @description Unit and integration test suite for Markdown conversion pipeline.
 * Tests text cleaning/sanitization, typography classification, AST normalization, and CLI Markdown export.
 * Part of paper-drift - https://github.com/Sooriya04/Paper-Drift
 */

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import assert from 'assert';

import {
  transliterateHomoglyphs,
  normalizeSmartPunctuation,
  decodeHtmlEntities,
  cleanText
} from '../src/markdown/cleaner.js';

import {
  calculateBodyFontSizeMode,
  classifyTypography,
  SECTION_NUMBER_REGEX,
  CAPTION_REGEX
} from '../src/markdown/typography.js';

import { normalizeMarkdown } from '../src/markdown/normalizer.js';
import { convertPdfToMarkdown } from '../src/markdown/converter.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const samplePdfPath = path.resolve(__dirname, 'fixtures/sample.pdf');
const resultsOutputDir = path.resolve(__dirname, 'results/cli-test');

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

console.log('\n\x1b[1m\x1b[36mRunning Markdown & Typography Test Suite\x1b[0m');

// Ensure fixture exists
if (!fs.existsSync(samplePdfPath)) {
  execSync(`node "${path.resolve(__dirname, 'scripts/generate-sample.js')}"`, { stdio: 'inherit' });
}

if (!fs.existsSync(resultsOutputDir)) {
  fs.mkdirSync(resultsOutputDir, { recursive: true });
}

// -------------------------------------------------------------
// 1. Text Cleaner & Sanitizer Tests
// -------------------------------------------------------------
runTest('transliterateHomoglyphs maps Cyrillic and Greek lookalikes to Latin ASCII', () => {
  // Cyrillic uppercase: А, В, С, Е, Н, О, Р, Т, Х
  const cyrillicUpper = '\u0410\u0412\u0421\u0415\u041D\u041E\u0420\u0422\u0425';
  assert.strictEqual(transliterateHomoglyphs(cyrillicUpper), 'ABCEHOPTX');

  // Cyrillic lowercase: а, с, е, о, р, х, у
  // Note: Cyrillic р is 'er' which looks like Latin 'p'
  const cyrillicLower = '\u0430\u0441\u0435\u043E\u0440\u0445\u0443';
  assert.strictEqual(transliterateHomoglyphs(cyrillicLower), 'aceopxy');

  // Mixed word with Cyrillic lookalikes
  const mixedWord = '\u0410l\u0440h\u0430'; // А (Cyrillic A), l, р (Cyrillic p), h, а (Cyrillic a)
  assert.strictEqual(transliterateHomoglyphs(mixedWord), 'Alpha');

  // Handles empty or falsy text
  assert.strictEqual(transliterateHomoglyphs(''), '');
  assert.strictEqual(transliterateHomoglyphs(null), '');
});

runTest('normalizeSmartPunctuation converts curly quotes, dashes, and ellipses', () => {
  const smartQuotes = '\u201CUniversal\u201D and \u2018Specific\u2019';
  assert.strictEqual(normalizeSmartPunctuation(smartQuotes), '"Universal" and \'Specific\'');

  const dashesAndEllipsis = 'Item 1\u2013Item 2\u2014Item 3\u2026';
  assert.strictEqual(normalizeSmartPunctuation(dashesAndEllipsis), 'Item 1--Item 2--Item 3...');

  assert.strictEqual(normalizeSmartPunctuation(''), '');
  assert.strictEqual(normalizeSmartPunctuation(null), '');
});

runTest('decodeHtmlEntities decodes common HTML entities', () => {
  const encoded = '&lt;div&gt;Tom &amp; &quot;Jerry&quot; &#39;test&#39;&nbsp;160&lt;/div&gt;';
  const decoded = decodeHtmlEntities(encoded);
  assert.strictEqual(decoded, '<div>Tom & "Jerry" \'test\' 160</div>');

  assert.strictEqual(decodeHtmlEntities(''), '');
  assert.strictEqual(decodeHtmlEntities(null), '');
});

runTest('cleanText strips invisible zero-width chars and bidi overrides while transliterating', () => {
  // \u200B = zero-width space, \u202E = right-to-left override, \uFEFF = BOM, \u00A0 = non-breaking space
  const dirty = '\uFEFF\u202EHello\u200B \u0421World\u00A0!\u202C';
  const cleaned = cleanText(dirty);
  assert.strictEqual(cleaned, 'Hello CWorld !');

  // Test options.transliterate = false preserves Cyrillic
  const preserved = cleanText('\u0421', { transliterate: false });
  assert.strictEqual(preserved, '\u0421');

  assert.strictEqual(cleanText(''), '');
  assert.strictEqual(cleanText(null), '');
});

// -------------------------------------------------------------
// 2. Dynamic Typography Hierarchy Tests
// -------------------------------------------------------------
runTest('calculateBodyFontSizeMode returns the length-weighted mode of font sizes', () => {
  const sampleLines = [
    { text: 'A short heading', font: { size: 18 } },
    { text: 'This is a substantially longer paragraph line with standard body text size.', font: { size: 10 } },
    { text: 'Another long sentence in body text describing various experimental methodologies.', font: { size: 10 } },
    { text: 'Small footnote here', font: { size: 8 } }
  ];

  const mode = calculateBodyFontSizeMode(sampleLines);
  assert.strictEqual(mode, 10.0);

  // Defaults gracefully for empty list
  assert.strictEqual(calculateBodyFontSizeMode([]), 10.0);
  assert.strictEqual(calculateBodyFontSizeMode(null), 10.0);
});

runTest('classifyTypography categorizes headings, captions, footnotes, and body lines accurately', () => {
  const bodyMode = 10.0;
  const pageHeight = 792;

  // Title: ratio >= 1.6 && wordCount <= 20
  const titleLine = { text: 'Deep Residual Learning for Image Recognition', font: { size: 18 } };
  assert.strictEqual(classifyTypography(titleLine, bodyMode, pageHeight), 'title');

  // Title with too many words (> 20) falls back
  const longTitleLine = {
    text: 'One Two Three Four Five Six Seven Eight Nine Ten Eleven Twelve Thirteen Fourteen Fifteen Sixteen Seventeen Eighteen Nineteen Twenty Twenty-One',
    font: { size: 18 }
  };
  assert.notStrictEqual(classifyTypography(longTitleLine, bodyMode, pageHeight), 'title');

  // H1: ratio >= 1.25 && wordCount <= 16
  const h1Line = { text: '1. Introduction and Prior Works', font: { size: 13 } };
  assert.strictEqual(classifyTypography(h1Line, bodyMode, pageHeight), 'h1');

  // H2: ratio >= 1.05 && matches SECTION_NUMBER_REGEX && wordCount <= 14
  const h2Line = { text: '1.1 System Architecture Overview', font: { size: 11 } };
  assert.strictEqual(classifyTypography(h2Line, bodyMode, pageHeight), 'h2');

  const romanH2Line = { text: 'IV. Experimental Setup', font: { size: 11 } };
  assert.strictEqual(classifyTypography(romanH2Line, bodyMode, pageHeight), 'h2');

  // Caption: matches CAPTION_REGEX
  const figureCaption = { text: 'Figure 1: High-level system architecture and data pipeline.', font: { size: 9 }, top: 300 };
  assert.strictEqual(classifyTypography(figureCaption, bodyMode, pageHeight), 'caption');

  const tableCaption = { text: 'Table 2. Quantitative evaluation on standard benchmarks.', font: { size: 10 }, top: 250 };
  assert.strictEqual(classifyTypography(tableCaption, bodyMode, pageHeight), 'caption');

  // Footnote: ratio <= 0.85 && top >= pageHeight * 0.55
  const footnoteBottom = { text: '* Corresponding author: researcher@lab.ai', font: { size: 8 }, top: 720 };
  assert.strictEqual(classifyTypography(footnoteBottom, bodyMode, pageHeight), 'footnote');

  // Small text in upper half of page (top < 0.55 * pageHeight) is NOT a footnote
  const smallTextTop = { text: 'Subscript or margin note', font: { size: 8 }, top: 200 };
  assert.notStrictEqual(classifyTypography(smallTextTop, bodyMode, pageHeight), 'footnote');

  // Standard prose line
  const bodyLine = { text: 'We evaluate the performance of the proposed architecture across multiple datasets.', font: { size: 10 }, top: 350 };
  assert.strictEqual(classifyTypography(bodyLine, bodyMode, pageHeight), 'body');
});

// -------------------------------------------------------------
// 3. Remark AST Normalization Tests
// -------------------------------------------------------------
await runAsyncTest('normalizeMarkdown parses, cleans, and outputs standardized GFM markdown', async () => {
  const rawMarkdown = `
# Title

Some text with &amp; entity and \u201Cquotes\u201D.

| Column A | Column B |
| --- | --- |
| Val 1 | Val 2 |
`;

  const normalized = await normalizeMarkdown(rawMarkdown);
  assert.ok(normalized.includes('# Title'), 'Heading normalized');
  assert.ok(normalized.includes('Some text with & entity and "quotes".'), 'Entities and quotes cleaned');
  assert.ok(normalized.includes('| Column A | Column B |'), 'Table preserved');
  assert.ok(normalized.includes('| Val 1    | Val 2    |') || normalized.includes('| Val 1 | Val 2 |'), 'Table cells formatted');

  // Handles empty inputs gracefully
  assert.strictEqual(await normalizeMarkdown(''), '');
  assert.strictEqual(await normalizeMarkdown(null), '');
});

// -------------------------------------------------------------
// 4. Programmatic convertPdfToMarkdown Tests
// -------------------------------------------------------------
await runAsyncTest('convertPdfToMarkdown successfully converts sample.pdf into clean GFM Markdown', async () => {
  const result = await convertPdfToMarkdown(samplePdfPath);

  assert.strictEqual(typeof result.markdown, 'string');
  assert.ok(result.markdown.length > 50, 'Markdown should be non-empty');
  assert.strictEqual(result.totalPages, 1);
  assert.strictEqual(result.pagesProcessed, 1);
  assert.strictEqual(typeof result.tablesCount, 'number');
  assert.ok(result.durationMs >= 0);

  // Validate structural Markdown elements generated from sample.pdf
  assert.ok(result.markdown.includes('# paper-drift Document Parser'), 'Expected main title');
  assert.ok(result.markdown.includes('High-Fidelity PDF Conversion via WebAssembly'), 'Expected subtitle');
  assert.ok(result.markdown.includes('Key Capabilities:'), 'Expected lead-in section');
  assert.ok(result.markdown.includes('- Zero-Chromium and zero-Python architecture'), 'Expected list item 1');
  assert.ok(result.markdown.includes('- Fully selectable and searchable HTML text overlay'), 'Expected list item 2');
  assert.ok(result.markdown.includes('- High-DPI WebAssembly rendering engine with 100% privacy'), 'Expected list item 3');
});

await runAsyncTest('convertPdfToMarkdown accepts Buffer input and options', async () => {
  const buffer = fs.readFileSync(samplePdfPath);
  let progressCalled = false;

  const result = await convertPdfToMarkdown(buffer, {
    pages: '1',
    onProgress: (p) => {
      if (p.current === 1) progressCalled = true;
    }
  });

  assert.strictEqual(result.pagesProcessed, 1);
  assert.ok(progressCalled, 'Progress callback should be triggered');
  assert.ok(result.markdown.includes('# paper-drift Document Parser'));
});

// -------------------------------------------------------------
// 5. CLI Execution Tests
// -------------------------------------------------------------
runTest('CLI converts PDF to Markdown via --format markdown', () => {
  const mdOutputFile = path.join(resultsOutputDir, 'sample.md');
  if (fs.existsSync(mdOutputFile)) {
    fs.unlinkSync(mdOutputFile);
  }

  const stdout = execSync(
    `node bin/cli.js "${samplePdfPath}" "${mdOutputFile}" --format markdown`,
    { encoding: 'utf-8' }
  );

  assert.ok(stdout.includes('Converted 1 of 1 pages'), 'CLI should report successful page conversion');
  assert.ok(stdout.includes('FORMAT:  MARKDOWN') || stdout.includes('Format:  MARKDOWN'));
  assert.ok(fs.existsSync(mdOutputFile), 'Target markdown file should exist on disk');

  const content = fs.readFileSync(mdOutputFile, 'utf-8');
  assert.ok(content.includes('# paper-drift Document Parser'), 'Exported file must contain the title');
  assert.ok(content.includes('- Zero-Chromium and zero-Python architecture'), 'Exported file must contain list items');
});

runTest('CLI converts PDF to Markdown via --format md', () => {
  const mdOutputFile = path.join(resultsOutputDir, 'sample-cli-md.md');
  if (fs.existsSync(mdOutputFile)) {
    fs.unlinkSync(mdOutputFile);
  }

  execSync(
    `node bin/cli.js "${samplePdfPath}" "${mdOutputFile}" --format md`,
    { encoding: 'utf-8' }
  );

  assert.ok(fs.existsSync(mdOutputFile), 'Target markdown file should exist on disk');
  const content = fs.readFileSync(mdOutputFile, 'utf-8');
  assert.ok(content.includes('# paper-drift Document Parser'));
});

runTest('CLI infers markdown format automatically from .md extension', () => {
  const inferredOutputFile = path.join(resultsOutputDir, 'sample-inferred.md');
  if (fs.existsSync(inferredOutputFile)) {
    fs.unlinkSync(inferredOutputFile);
  }

  execSync(
    `node bin/cli.js "${samplePdfPath}" "${inferredOutputFile}"`,
    { encoding: 'utf-8' }
  );

  assert.ok(fs.existsSync(inferredOutputFile), 'Inferred output file should exist');
  const content = fs.readFileSync(inferredOutputFile, 'utf-8');
  assert.ok(content.includes('# paper-drift Document Parser'));
});

console.log('\n\x1b[32m✔ All Markdown, Typography & CLI tests passed successfully!\x1b[0m\n');
