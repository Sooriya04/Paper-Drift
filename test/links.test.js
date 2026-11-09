/**
 * @file test/links.test.js
 * @description Unit and integration test suite for Hyperlinks & Citation Anchors engine.
 * Tests URI slug formatting, page link extraction, document destination resolution,
 * spatial markdown weaving, de-hyphenation, and end-to-end markdown conversion.
 * Part of paper-drift - https://github.com/Sooriya04/Paper-Drift
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import assert from 'assert';
import mupdf from 'mupdf';

import {
  formatDestinationSlug,
  extractPageLinks,
  buildDocumentDestinations,
  applyLinksToLine,
  findDestinationAnchors,
  groupLinksByLine
} from '../src/links/extractor.js';

import { extractPageVectorsAndText } from '../src/vectors/walker.js';
import { convertPdfToMarkdown } from '../src/markdown/converter.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const attentionPdf = path.resolve(__dirname, 'fixtures/benchmarks/01-attention-is-all-you-need.pdf');
const resnetPdf = path.resolve(__dirname, 'fixtures/benchmarks/02-resnet-deep-residual-learning.pdf');
const loraPdf = path.resolve(__dirname, 'fixtures/benchmarks/03-lora-low-rank-adaptation.pdf');
const ganPdf = path.resolve(__dirname, 'fixtures/benchmarks/05-gan-generative-adversarial-nets.pdf');

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

console.log('\n\x1b[1m\x1b[36m=== Testing Hyperlinks & Citation Anchors Engine ===\x1b[0m\n');

// -------------------------------------------------------------
// 1. URI & Destination Slug Normalization
// -------------------------------------------------------------
console.log('\x1b[1m1. URI & Destination Slug Normalization\x1b[0m');

runTest('formatDestinationSlug normalizes internal named destinations to clean anchor slugs', () => {
  assert.strictEqual(
    formatDestinationSlug('#nameddest=cite.bahdanau2014neural'),
    '#cite-bahdanau2014neural'
  );
  assert.strictEqual(
    formatDestinationSlug('#nameddest=figure.1'),
    '#figure-1'
  );
  assert.strictEqual(
    formatDestinationSlug('#nameddest=subsection.3.2'),
    '#subsection-3-2'
  );
  assert.strictEqual(
    formatDestinationSlug('#nameddest=Hfootnote.1'),
    '#hfootnote-1'
  );
  assert.strictEqual(
    formatDestinationSlug('#nameddest=appendix.A'),
    '#appendix-a'
  );
});

runTest('formatDestinationSlug preserves external web URLs and emails and normalizes DOIs', () => {
  assert.strictEqual(
    formatDestinationSlug('https://github.com/microsoft/LoRA'),
    'https://github.com/microsoft/LoRA'
  );
  assert.strictEqual(
    formatDestinationSlug('mailto:author@example.org'),
    'mailto:author@example.org'
  );
  assert.strictEqual(
    formatDestinationSlug('http://arxiv.org/abs/1706.03762'),
    'https://arxiv.org/abs/1706.03762'
  );
  assert.strictEqual(
    formatDestinationSlug('doi:10.1145/1234567.89'),
    'https://doi.org/10.1145/1234567.89'
  );
  assert.strictEqual(
    formatDestinationSlug('10.1145/1234567.89'),
    'https://doi.org/10.1145/1234567.89'
  );
});

// -------------------------------------------------------------
// 2. Link Extraction & Destination Resolution
// -------------------------------------------------------------
console.log('\n\x1b[1m2. Page Link Extraction & Destination Resolution\x1b[0m');

runTest('extractPageLinks extracts external and internal links with bounding boxes', () => {
  const doc = mupdf.Document.openDocument(fs.readFileSync(loraPdf), 'application/pdf');
  const page0 = doc.loadPage(0);
  const links = extractPageLinks(page0, doc);

  assert.ok(Array.isArray(links));
  assert.ok(links.length >= 5, `Expected >= 5 links on LoRA page 1, got ${links.length}`);

  const externalLink = links.find(l => l.isExternal);
  assert.ok(externalLink, 'Should find external link');
  assert.strictEqual(externalLink.uri, 'https://github.com/microsoft/LoRA');
  assert.ok(externalLink.bbox[0] > 0);

  const citeLink = links.find(l => l.uri.startsWith('#cite-'));
  assert.ok(citeLink, 'Should find citation link');
  assert.strictEqual(citeLink.isExternal, false);
  assert.strictEqual(typeof citeLink.targetPage, 'number');
  assert.ok(citeLink.targetPage >= 10, 'Citation target page should point to references section');
});

runTest('buildDocumentDestinations indexes all unique internal destinations across document', () => {
  const doc = mupdf.Document.openDocument(fs.readFileSync(attentionPdf), 'application/pdf');
  const allIndices = Array.from({ length: doc.countPages() }, (_, i) => i);
  const destinations = buildDocumentDestinations(doc, allIndices);

  assert.ok(destinations.size > 0, 'Should index destination pages');

  // Verify destinations on Page 10 (References section)
  const p9Dests = destinations.get(9) || [];
  assert.ok(p9Dests.length >= 3, 'Page 10 should contain multiple reference destinations');
  assert.ok(p9Dests.some(d => d.id.includes('bahdanau')));
  assert.ok(p9Dests.every(d => typeof d.y === 'number' && !isNaN(d.y)));
});

// -------------------------------------------------------------
// 3. Spatial Line Weaving & Punctuation Protection
// -------------------------------------------------------------
console.log('\n\x1b[1m3. Spatial Line Weaving & Markdown Link Formatting\x1b[0m');

runTest('applyLinksToLine cleanly weaves URLs and protects trailing punctuation', () => {
  const line = {
    bbox: [50, 100, 450, 112],
    chars: [
      { char: 'C', x: 50 }, { char: 'o', x: 58 }, { char: 'd', x: 66 }, { char: 'e', x: 74 },
      { char: ':', x: 82 }, { char: ' ', x: 86 },
      { char: 'h', x: 90 }, { char: 't', x: 96 }, { char: 't', x: 102 }, { char: 'p', x: 108 },
      { char: 's', x: 114 }, { char: ':', x: 120 }, { char: '/', x: 124 }, { char: '/', x: 128 },
      { char: 'g', x: 132 }, { char: 'i', x: 138 }, { char: 't', x: 142 }, { char: '.', x: 146 },
      { char: 'i', x: 150 }, { char: 'o', x: 156 },
      { char: '.', x: 162 } // sentence-ending period
    ],
    text: 'Code: https://git.io.'
  };

  const links = [
    {
      bbox: [90, 99, 160, 113],
      midY: 106,
      uri: 'https://git.io'
    }
  ];

  const result = applyLinksToLine(line, links);
  assert.strictEqual(result, 'Code: [https://git.io](https://git.io).');
});

runTest('applyLinksToLine handles citation brackets and balances parentheses', () => {
  const line = {
    bbox: [50, 200, 450, 212],
    chars: [
      { char: '(', x: 50 },
      { char: 'V', x: 55 }, { char: 'a', x: 61 }, { char: 's', x: 67 },
      { char: 'w', x: 73 }, { char: 'a', x: 79 }, { char: 'n', x: 85 },
      { char: 'i', x: 91 }, { char: ',', x: 95 }, { char: ' ', x: 98 },
      { char: '2', x: 102 }, { char: '0', x: 108 }, { char: '1', x: 114 },
      { char: '7', x: 120 }, { char: ')', x: 126 }
    ],
    text: '(Vaswani, 2017)'
  };

  const links = [
    {
      bbox: [55, 199, 128, 213],
      midY: 206,
      uri: '#cite-vaswani2017'
    }
  ];

  const result = applyLinksToLine(line, links);
  assert.strictEqual(result, '([Vaswani, 2017](#cite-vaswani2017))');
});

runTest('findDestinationAnchors prepends HTML anchor tag matching line coordinates', () => {
  const line = {
    top: 300,
    bottom: 312,
    bbox: [50, 300, 400, 312],
    text: '[1] Author Name et al.'
  };

  const pageDestinations = [
    { id: 'cite-author2020', y: 302 },
    { id: 'cite-other', y: 500 }
  ];

  const claimed = new Set();
  const anchors = findDestinationAnchors(line, pageDestinations, claimed);

  assert.strictEqual(anchors, '<a id="cite-author2020"></a>');
  assert.ok(claimed.has('cite-author2020'));

  // Subsequent call for the same claimed ID returns empty
  const secondCall = findDestinationAnchors(line, pageDestinations, claimed);
  assert.strictEqual(secondCall, '');
});

runTest('groupLinksByLine maps link to unique best-matching line without vertical bleeding', () => {
  const line1 = {
    bbox: [50, 200, 300, 212],
    chars: [{ char: 'a', x: 50, y: 210, size: 10 }]
  };
  const line2 = {
    bbox: [50, 210, 300, 222], // Note overlapping vertical bbox with line1
    chars: [{ char: 'b', x: 50, y: 220, size: 10 }]
  };

  const link = {
    bbox: [100, 215, 120, 225],
    midY: 220,
    uri: '#cite-test'
  };

  const grouped = groupLinksByLine([line1, line2], [link]);
  assert.strictEqual(grouped.has(line1), false);
  assert.strictEqual(grouped.has(line2), true);
  assert.strictEqual(grouped.get(line2)[0], link);
});

runTest('applyLinksToLine unlinked citation fallback weaves citations without matching math intervals', () => {
  const knownCitations = new Map([
    ['1', '#cite-1'],
    ['19', '#cite-19']
  ]);

  const mathLine = { text: 'achieves its maximum in [0, 1] at conclusion' };
  assert.strictEqual(applyLinksToLine(mathLine, [], { knownCitations }), 'achieves its maximum in [0, 1] at conclusion');

  const citeLine = { text: 'introduced by earlier models [19, 1] successfully' };
  assert.strictEqual(
    applyLinksToLine(citeLine, [], { knownCitations }),
    'introduced by earlier models [[19](#cite-19), [1](#cite-1)] successfully'
  );
});

// -------------------------------------------------------------
// 4. End-to-End Markdown Integration
// -------------------------------------------------------------
console.log('\n\x1b[1m4. End-to-End Markdown Integration\x1b[0m');

await runAsyncTest('convertPdfToMarkdown outputs interactive hyperlinks and citations for LoRA', async () => {
  const result = await convertPdfToMarkdown(loraPdf, {
    pages: '1-2'
  });

  assert.ok(result.markdown.length > 500);

  // Check for external GitHub link
  assert.ok(
    result.markdown.includes('[https://github.com/microsoft/LoRA](https://github.com/microsoft/LoRA)'),
    'Markdown should contain clickable GitHub repository link'
  );

  // Check for internal citations
  assert.ok(
    result.markdown.includes('](#cite-') || result.markdown.includes('](#appendix-'),
    'Markdown should contain internal citation/reference links'
  );
});

await runAsyncTest('convertPdfToMarkdown outputs interactive citations for Attention paper', async () => {
  const result = await convertPdfToMarkdown(attentionPdf, {
    pages: '1-3'
  });

  assert.ok(result.markdown.length > 500);

  // Check for internal numbered citations and figure references
  assert.ok(
    result.markdown.includes('](#cite-') || result.markdown.includes('](#figure-'),
    'Markdown should contain internal citations or figure links'
  );
});

await runAsyncTest('convertPdfToMarkdown generates hyphenated section and subsection anchor IDs', async () => {
  const result = await convertPdfToMarkdown(resnetPdf, {
    pages: '1-3'
  });

  // Section 3.1 should produce #subsection-3-1 anchor, not subsection-31
  assert.ok(
    result.markdown.includes('<a id="subsection-3-1"></a>'),
    'Markdown should contain hyphenated anchor ID <a id="subsection-3-1"></a>'
  );
  assert.ok(
    result.markdown.includes('<a id="subsection-3-2"></a>'),
    'Markdown should contain hyphenated anchor ID <a id="subsection-3-2"></a>'
  );
});

await runAsyncTest('convertPdfToMarkdown generates table anchors on table captions', async () => {
  const result = await convertPdfToMarkdown(loraPdf, {
    pages: '1-6'
  });

  assert.ok(
    result.markdown.includes('<a id="table-1"></a>') || result.markdown.includes('<a id="table-2"></a>'),
    'Markdown should generate table anchor matching caption (e.g. <a id="table-1"></a>)'
  );
});

await runAsyncTest('convertPdfToMarkdown generates figure anchors and wraps image links with spaces', async () => {
  const assetsWithSpacesDir = path.join(path.dirname(__filename), 'results/links-test/assets with spaces');
  const result = await convertPdfToMarkdown(attentionPdf, {
    pages: '1-4',
    extractImages: true,
    imagesDir: assetsWithSpacesDir
  });

  // Verify figure anchor generation
  assert.ok(
    result.markdown.includes('<a id="figure-1"></a>') || result.markdown.includes('<a id="figure-2"></a>'),
    'Markdown should contain figure anchor <a id="figure-..."></a>'
  );

  // If image link was generated with space-bearing path, verify angle-bracket wrapping
  if (result.markdown.includes('assets with spaces')) {
    assert.ok(
      result.markdown.includes('](<') && result.markdown.includes('>)'),
      'Image links containing spaces should be enclosed in angle brackets'
    );
  }
});

await runAsyncTest('convertPdfToMarkdown weaves unlinked citations on PDFs without native PDF links (GAN)', async () => {
  const result = await convertPdfToMarkdown(ganPdf, {
    pages: '1,8'
  });

  assert.ok(result.markdown.length > 500);

  // Check for synthesized citation anchors and interactive in-text citations
  assert.ok(
    result.markdown.includes('<a id="cite-1"></a>') || result.markdown.includes('<a id="cite-2"></a>'),
    'Markdown should contain generated citation anchor <a id="cite-N"></a>'
  );
  assert.ok(
    result.markdown.includes('](#cite-'),
    'Markdown should contain woven in-text citations linking to #cite-N'
  );
});

console.log('\n\x1b[32mAll Hyperlink & Citation Anchor tests passed successfully!\x1b[0m\n');
