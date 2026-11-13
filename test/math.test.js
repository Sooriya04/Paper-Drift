/**
@file test/math.test.js
@description Unit tests for Mathematical Equation Reconstruction subsystem in Paper-Drift.
Tests Math IR creation, validation, LaTeX/MathML/Markdown export, text parsing (Greek, superscripts,
subscripts, fractions, square roots, integrals, equations), and spatial math reconstruction.
Part of paper-drift - https://github.com/Sooriya04/Paper-Drift
*/

import assert from 'assert';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  createMathNode,
  validateMathIR,
  toLaTeX,
  toMathML,
  toMarkdown,
  parseTextToMathIR,
  reconstructPageMath
} from '../src/math/index.js';
import { convertPdfToMarkdown } from '../src/markdown/converter.js';
import { convertPdfToDocumentIR } from '../src/ir/schema.js';
import { extractPageVectorsAndText } from '../src/vectors/walker.js';
import mupdf from 'mupdf';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const attentionPdf = path.resolve(__dirname, 'fixtures/benchmarks/01-attention-is-all-you-need.pdf');

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

console.log('\n\x1b[1m\x1b[36mRunning Mathematical Equation Reconstruction Test Suite\x1b[0m');

// 1. Math IR Schema & Exporters
runTest('createMathNode and validateMathIR validate correctly', () => {
  const node = createMathNode('fraction', {
    numerator: createMathNode('identifier', { value: 'a' }),
    denominator: createMathNode('identifier', { value: 'b' })
  });
  assert.strictEqual(validateMathIR(node), true);
  assert.strictEqual(validateMathIR(null), false);
});

runTest('toLaTeX exports correct LaTeX representation for various math nodes', () => {
  const frac = createMathNode('fraction', {
    numerator: createMathNode('greek', { name: 'alpha', value: 'α' }),
    denominator: createMathNode('identifier', { value: 'beta' })
  });
  assert.strictEqual(toLaTeX(frac), '\\frac{\\alpha}{beta}');

  const sup = createMathNode('superscript', {
    base: createMathNode('identifier', { value: 'x' }),
    sup: createMathNode('number', { value: '2' })
  });
  assert.strictEqual(toLaTeX(sup), 'x^{2}');
});

runTest('toMathML exports valid MathML XML string', () => {
  const node = createMathNode('number', { value: '42' });
  const mathml = toMathML(node);
  assert.strictEqual(mathml.includes('<math'), true);
  assert.strictEqual(mathml.includes('<mn>42</mn>'), true);

  const greekNode = createMathNode('greek', { name: 'alpha', value: 'α' });
  const greekMathml = toMathML(greekNode);
  assert.strictEqual(greekMathml.includes('<mi>α</mi>'), true);
  assert.strictEqual(greekMathml.includes('&alpha;'), false);
});

runTest('toMarkdown exports inline and display math properly', () => {
  const node = createMathNode('identifier', { value: 'E=mc^2' });
  assert.strictEqual(toMarkdown(node, false), '$E=mc^2$');
  assert.strictEqual(toMarkdown(node, true), '$$\nE=mc^2\n$$');
});

// 2. Text Parsing & Symbol Recognition
runTest('parseTextToMathIR parses Greek symbols and operators correctly', () => {
  const ir = parseTextToMathIR('α + β ≤ γ');
  const latex = toLaTeX(ir);
  assert.strictEqual(latex.includes('\\alpha'), true);
  assert.strictEqual(latex.includes('\\leq'), true);
  assert.strictEqual(latex.includes('\\gamma'), true);
});

runTest('parseTextToMathIR parses superscripts and subscripts', () => {
  const ir = parseTextToMathIR('x^2 + y_1');
  const latex = toLaTeX(ir);
  assert.strictEqual(latex.includes('x^{2}'), true);
  assert.strictEqual(latex.includes('y_{1}'), true);
});

runTest('parseTextToMathIR parses simple fractions and square roots', () => {
  const fracIr = parseTextToMathIR('a / b');
  assert.strictEqual(toLaTeX(fracIr), '\\frac{a}{b}');

  const sqrtIr = parseTextToMathIR('sqrt{x}');
  assert.strictEqual(toLaTeX(sqrtIr), '\\sqrt{x}');
});

runTest('parseTextToMathIR preserves equation numbers and label references', () => {
  const eqIr = parseTextToMathIR('E = mc^2 (1)');
  const latex = toLaTeX(eqIr);
  assert.strictEqual(latex.includes('\\tag{1}'), true);
});

// 3. Spatial Math Reconstruction
runTest('reconstructPageMath reconstructs fractions from vector rules and text lines', () => {
  const lines = [
    { text: 'a + b', left: 100, top: 100, right: 150, bottom: 112 },
    { text: 'c + d', left: 100, top: 130, right: 150, bottom: 142 }
  ];
  const vectors = [
    { bbox: [95, 118, 155, 120] } // fraction bar rule
  ];
  const { mathItems, claimedLineIndices } = reconstructPageMath(lines, vectors, 600, 800);
  assert.strictEqual(mathItems.length > 0, true);
  assert.strictEqual(claimedLineIndices.has(0), true);
  assert.strictEqual(claimedLineIndices.has(1), true);
  assert.strictEqual(mathItems[0].markdown.includes('\\frac'), true);
});

// 4. Real Academic PDF Equation Reconstruction (Attention Is All You Need)
runTest('reconstructPageMath reconstructs Equation 1 from Attention paper page 4', () => {
  const buf = fs.readFileSync(attentionPdf);
  const doc = mupdf.PDFDocument.openDocument(buf, 'application/pdf');
  const page = doc.loadPage(3); // 0-based page 4
  const res = extractPageVectorsAndText(page);

  const { mathItems, claimedLineIndices } = reconstructPageMath(res.lines, res.vectors, 612, 792);
  assert.strictEqual(mathItems.length >= 1, true);

  const eq1 = mathItems.find(m => m.node && m.node.label === '1');
  assert.ok(eq1, 'Equation 1 should be detected and labelled');
  assert.ok(eq1.markdown.includes('Attention(Q, K, V ) = softmax'), 'Equation 1 should reconstruct Attention formula');
  assert.ok(eq1.markdown.includes('\\frac{QK^T}{\\sqrt{d_k}}'), 'Equation 1 should reconstruct QK^T / sqrt(d_k) fraction');
  assert.ok(eq1.markdown.includes('\\tag{1}'), 'Equation 1 should contain \\tag{1}');
});

runTest('reconstructPageMath rejects headings, captions, and prose false positives', () => {
  const buf = fs.readFileSync(attentionPdf);
  const doc = mupdf.PDFDocument.openDocument(buf, 'application/pdf');

  for (let p = 0; p < doc.countPages(); p++) {
    const page = doc.loadPage(p);
    const res = extractPageVectorsAndText(page);
    const { mathItems } = reconstructPageMath(res.lines, res.vectors, 612, 792);

    for (const m of mathItems) {
      const text = m.markdown;
      assert.strictEqual(/^(?:Figure|Fig\.|Table|Section|Sec\.)/i.test(text), false, 'Captions should never be math');
      assert.strictEqual(/\b(?:Google|University|Research|Brain|Publishers)\b/.test(text), false, 'Affiliations should not be math');
      assert.strictEqual(/^#+\s/.test(text), false, 'Headings should not be classified as math');
    }
  }
});

// 5. End-to-End Markdown and Document IR Integration
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

await runAsyncTest('convertPdfToMarkdown outputs Equation 1 as display math block in reading order', async () => {
  const res = await convertPdfToMarkdown(attentionPdf, { pages: '4' });
  assert.ok(res.markdown.includes('$$\nAttention(Q, K, V ) = softmax(\\frac{QK^T}{\\sqrt{d_k}})V \\tag{1}\n$$'));
  assert.ok(!res.markdown.includes('$$\nScaled Dot-Product Attention\n$$'), 'Titles should not be turned into math');
});

await runAsyncTest('convertPdfToDocumentIR stores structured math with structuredMath option', async () => {
  const ir = await convertPdfToDocumentIR(attentionPdf, { pages: '4', structuredMath: true });
  assert.ok(Array.isArray(ir.pages[0].math), 'Page 4 should contain structured math array');
  const eq1 = ir.pages[0].math.find(m => m.equationNumber === '1');
  assert.ok(eq1, 'Structured math should contain equation 1');
  assert.strictEqual(eq1.type, 'math');
  assert.ok(eq1.latex.includes('Attention(Q, K, V ) = softmax(\\frac{QK^T}{\\sqrt{d_k}})V'));
  assert.ok(eq1.mathml.includes('<math'));
  assert.ok(Array.isArray(eq1.bbox) && eq1.bbox.length === 4);
});

console.log('\n\x1b[32m✔ All Mathematical Equation Reconstruction tests passed successfully!\x1b[0m\n');
