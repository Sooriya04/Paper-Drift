/**
 * @file test/math.test.js
 * @description Automated test suite for Phase 3: LaTeX Math Restoration.
 * Validates sub/superscripts, math font triggers, equation tags, Greek glyphs, and operators.
 * Part of paper-drift - https://github.com/Sooriya04/Paper-Drift
 */

import {
  restoreLineMath,
  restoreBlockMath,
  formatInlineMath,
  normalizeMathIndices,
  mapUnicodeToLatex,
  isMathFont
} from '../src/math/index.js';

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

console.log('\n\x1b[1m\x1b[36mRunning LaTeX Math Restoration Test Suite\x1b[0m');

// 1. Greek & Unicode Math Symbol Mapping
runTest('mapUnicodeToLatex maps Greek letters and math operators correctly', () => {
  const input = 'α + β ≤ γ × ∑_{i=1}';
  const out = mapUnicodeToLatex(input);

  assert(out.includes('\\alpha'), 'Must map alpha');
  assert(out.includes('\\beta'), 'Must map beta');
  assert(out.includes('\\le'), 'Must map <=');
  assert(out.includes('\\times'), 'Must map *');
  assert(out.includes('\\sum'), 'Must map sum');
});

// 2. Math Font Detection
runTest('isMathFont recognizes Computer Modern, CMSY, STIX and Symbol fonts', () => {
  assert(isMathFont('FUIULY+CMR10'), 'CMR10 must be recognized as math font');
  assert(isMathFont('NSOWGJ+CMSY10'), 'CMSY10 must be recognized as math font');
  assert(isMathFont('STIXMath-Regular'), 'STIX must be recognized as math font');
  assert(!isMathFont('Helvetica-Bold'), 'Helvetica must NOT be recognized as math font');
});

// 3. Superscripts and Subscripts
runTest('restoreLineMath detects superscripts and subscripts by font size and baseline shift', () => {
  const tokens = [
    { str: 'x', x: 10, y: 100, fontSize: 10 },
    { str: '2', x: 16, y: 103, fontSize: 6 }, // raised by 3pt, 6pt font -> ^2
    { str: '+', x: 25, y: 100, fontSize: 10 },
    { str: 'W', x: 35, y: 100, fontSize: 10 },
    { str: 'q', x: 45, y: 97, fontSize: 6 },  // lowered by 3pt, 6pt font -> _q
    { str: '=', x: 55, y: 100, fontSize: 10 },
    { str: '0', x: 65, y: 100, fontSize: 10 }
  ];

  // Test bottom-up coordinates (PDF standard)
  const result = restoreLineMath(tokens, { bottomUp: true });
  assert(result.includes('x^{2}'), `Expected x^{2}, got: ${result}`);
  assert(result.includes('W_{q}'), `Expected W_{q}, got: ${result}`);
  assert(result.includes('='), `Expected =, got: ${result}`);
});

// 4. Square root formatting
runTest('restoreLineMath formats square root glyph into \\sqrt{...}', () => {
  const tokens = [
    { str: '√', x: 10, y: 100, fontSize: 10 },
    { str: 'dk', x: 20, y: 100, fontSize: 10, fontName: 'CMR10' }
  ];

  const result = restoreLineMath(tokens);
  assert(result.includes('\\sqrt') && result.includes('d_{k}'), `Expected \\sqrt with d_k, got: ${result}`);
});

// 5. Display equation framing with equation numbers (\tag{1})
runTest('restoreBlockMath frames display equation and wraps equation number into \\tag{...}', () => {
  const block = {
    lines: [
      {
        text: 'Attention(Q, K, V) = softmax(QK^T) (1)',
        tokens: [
          { str: 'Attention(Q, K, V)', x: 100, y: 200, fontSize: 10, fontName: 'CMR10' },
          { str: '=', x: 180, y: 200, fontSize: 10, fontName: 'CMR10' },
          { str: 'softmax(QK', x: 195, y: 200, fontSize: 10, fontName: 'CMR10' },
          { str: 'T', x: 255, y: 203, fontSize: 6, fontName: 'CMR10' },
          { str: ')', x: 265, y: 200, fontSize: 10, fontName: 'CMR10' },
          { str: '(1)', x: 450, y: 200, fontSize: 10, fontName: 'Nimbus' }
        ]
      }
    ]
  };

  const result = restoreBlockMath(block, { bottomUp: true });
  assert(result.isMath === true, 'Must identify as math block');
  assert(result.latex.startsWith('$$'), 'Must frame with $$');
  assert(result.latex.endsWith('$$'), 'Must end with $$');
  assert(result.latex.includes('\\tag{1}'), `Must convert (1) to \\tag{1}, got: ${result.latex}`);
  assert(result.latex.includes('^{T}'), `Must restore T to ^{T}, got: ${result.latex}`);
});

// 6. Math variable index normalization
runTest('normalizeMathIndices automatically formats common math variable subscripts', () => {
  assert(normalizeMathIndices('dk') === 'd_{k}', 'dk -> d_{k}');
  assert(normalizeMathIndices('W0') === 'W_{0}', 'W0 -> W_{0}');
  assert(normalizeMathIndices('headi') === '\\text{head}_{i}', 'headi -> \\text{head}_{i}');
});

// 7. Inline math paragraph formatting
runTest('formatInlineMath wraps variables with scripts in $...$', () => {
  const paragraph = 'The output of the projection is W_{q} and the key dimension is d_{k}. We also use dmodel-dimensional vectors and headi.';
  const out = formatInlineMath(paragraph);

  assert(out.includes('$W_{q}$'), 'Must wrap W_{q} in $');
  assert(out.includes('$d_{k}$'), 'Must wrap d_{k} in $');
  assert(out.includes('$d_{\\text{model}}$'), 'Must wrap dmodel as $d_{\\text{model}}$ in $');
  assert(out.includes('$\\text{head}_{i}$'), 'Must wrap headi as $\\text{head}_{i}$ in $');
});

// 8. Author metadata and non-equations rejection
runTest('restoreBlockMath rejects author names with asterisks or email addresses', () => {
  const authorBlock = {
    lines: [
      {
        text: 'Ashish Vaswani *',
        tokens: [
          { str: 'Ashish', x: 10, y: 100, fontSize: 10 },
          { str: 'Vaswani', x: 50, y: 100, fontSize: 10 },
          { str: '∗', x: 100, y: 100, fontSize: 10, fontName: 'CMSY10' }
        ]
      }
    ]
  };

  const emailBlock = {
    lines: [
      {
        text: 'Llion Jones * Google Research llion@google.com',
        tokens: [
          { str: 'Llion Jones * Google Research llion@google.com', x: 10, y: 100, fontSize: 10 }
        ]
      }
    ]
  };

  assert(restoreBlockMath(authorBlock).isMath === false, 'Author names with asterisks must NOT be flagged as math');
  assert(restoreBlockMath(emailBlock).isMath === false, 'Author lines with emails must NOT be flagged as math');
});

console.log('\n\x1b[32m✔ All LaTeX math restoration tests passed successfully!\x1b[0m\n');
