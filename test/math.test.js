/**
@file test/math.test.js
@description Unit tests for Mathematical Equation Reconstruction subsystem in Paper-Drift.
Tests Math IR creation, validation, LaTeX/MathML/Markdown export, text parsing (Greek, superscripts,
subscripts, fractions, square roots, integrals, equations), and spatial math reconstruction.
Part of paper-drift - https://github.com/Sooriya04/Paper-Drift
*/

import assert from 'assert';
import {
  createMathNode,
  validateMathIR,
  toLaTeX,
  toMathML,
  toMarkdown,
  parseTextToMathIR,
  reconstructPageMath
} from '../src/math/index.js';

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

console.log('\n\x1b[32m✔ All Mathematical Equation Reconstruction tests passed successfully!\x1b[0m\n');
