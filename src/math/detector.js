/**
@file src/math/detector.js
@description Spatial Math Reconstruction engine for Paper-Drift.
Detects and reconstructs mathematical equations, fractions, square roots, integrals,
summations, limits, matrices, superscripts, subscripts, and Greek symbols using PDF glyphs,
font metrics, text positions, and vector rules.
Part of paper-drift - https://github.com/Sooriya04/Paper-Drift
*/

import { createMathNode, toLaTeX, toMathML, toMarkdown } from './schema.js';

/**
 * Common Greek letter unicode mappings to LaTeX names.
 */
const GREEK_MAP = {
  'α': 'alpha', 'β': 'beta', 'γ': 'gamma', 'δ': 'delta', 'ε': 'varepsilon',
  'ζ': 'zeta', 'η': 'eta', 'θ': 'theta', 'ι': 'iota', 'κ': 'kappa',
  'λ': 'lambda', 'μ': 'mu', 'nu': 'nu', 'ξ': 'xi', 'π': 'pi',
  'ρ': 'rho', 'σ': 'sigma', 'τ': 'tau', 'υ': 'upsilon', 'φ': 'varphi',
  'χ': 'chi', 'ψ': 'psi', 'ω': 'omega',
  'Α': 'Alpha', 'Β': 'Beta', 'Γ': 'Gamma', 'Δ': 'Delta', 'Θ': 'Theta',
  'Λ': 'Lambda', 'Ξ': 'Xi', 'Π': 'Pi', 'Σ': 'Sigma', 'Υ': 'Upsilon',
  'Φ': 'Phi', 'Ψ': 'Psi', 'Ω': 'Omega'
};

/**
 * Math operator unicode mappings.
 */
const OPERATOR_MAP = {
  '∫': '\\int',
  '∑': '\\sum',
  '∏': '\\prod',
  '±': '\\pm',
  '×': '\\times',
  '÷': '\\div',
  '≤': '\\leq',
  '≥': '\\geq',
  '≠': '\\neq',
  '≈': '\\approx',
  '∞': '\\infty',
  '∂': '\\partial',
  '∇': '\\nabla',
  '∈': '\\in',
  '∉': '\\notin',
  '⊂': '\\subset',
  '⊃': '\\supset',
  '∪': '\\cup',
  '∩': '\\cap',
  '∀': '\\forall',
  '∃': '\\exists',
  '→': '\\rightarrow',
  '←': '\\leftarrow',
  '↔': '\\leftrightarrow',
  '⇒': '\\Rightarrow',
  '⇐': '\\Leftarrow',
  '⇔': '\\Leftrightarrow'
};

/**
 * Parses raw text or characters into Math IR expression nodes.
 * @param {string} text - Text string
 * @returns {Object} Math IR node
 */
export function parseTextToMathIR(text) {
  if (!text || typeof text !== 'string') {
    return createMathNode('text', { value: '' });
  }

  const trimmed = text.trim();

  // Check if equation ends with equation number like (1) or (2.1)
  let label = null;
  let cleanText = trimmed;
  const labelMatch = trimmed.match(/\(([A-Z]?\d+(?:\.\d+)*[a-z]?)\)\s*$/);
  if (labelMatch) {
    label = labelMatch[1];
    cleanText = trimmed.replace(/\s*\([A-Z]?\d+(?:\.\d+)*[a-z]?\)\s*$/, '').trim();
  }

  // Check for simple fraction patterns like a / b or (a)/(b)
  const fracMatch = cleanText.match(/^\((.*?)\)\s*\/\s*\((.*?)\)$/) || cleanText.match(/^([a-zA-Z0-9]+)\s*\/\s*([a-zA-Z0-9]+)$/);
  if (fracMatch) {
    const num = parseTextToMathIR(fracMatch[1]);
    const den = parseTextToMathIR(fracMatch[2]);
    const fracNode = createMathNode('fraction', { numerator: num, denominator: den });
    if (label) {
      return createMathNode('equation', { body: fracNode, label });
    }
    return fracNode;
  }

  // Check for square root pattern sqrt{...} or √(...)
  const sqrtMatch = cleanText.match(/^(?:sqrt|√)\s*[\(\{](.*?)[,\)\}]$/i);
  if (sqrtMatch) {
    const expr = parseTextToMathIR(sqrtMatch[1]);
    const sqrtNode = createMathNode('sqrt', { expr });
    if (label) {
      return createMathNode('equation', { body: sqrtNode, label });
    }
    return sqrtNode;
  }

  // Tokenize and parse symbols, operators, Greek letters, superscripts, subscripts
  const elements = [];
  let i = 0;
  while (i < cleanText.length) {
    const char = cleanText[i];

    // Whitespace
    if (/\s/.test(char)) {
      i++;
      continue;
    }

    // Greek letters
    if (GREEK_MAP[char]) {
      elements.push(createMathNode('greek', { name: GREEK_MAP[char], value: char }));
      i++;
      continue;
    }

    // Operators
    if (OPERATOR_MAP[char]) {
      elements.push(createMathNode('operator', { value: OPERATOR_MAP[char] }));
      i++;
      continue;
    }

    // Numbers
    if (/[0-9]/.test(char)) {
      let numStr = '';
      while (i < cleanText.length && /[0-9\.]/.test(cleanText[i])) {
        numStr += cleanText[i];
        i++;
      }
      elements.push(createMathNode('number', { value: numStr }));
      continue;
    }

    // Identifiers / variables / functions
    if (/[a-zA-Z]/.test(char)) {
      let idStr = '';
      while (i < cleanText.length && /[a-zA-Z0-9]/.test(cleanText[i])) {
        idStr += cleanText[i];
        i++;
      }
      // Check for superscript or subscript following
      if (i < cleanText.length && cleanText[i] === '^') {
        i++; // skip ^
        let supStr = '';
        if (i < cleanText.length && cleanText[i] === '{') {
          i++; // skip {
          let depth = 1;
          while (i < cleanText.length && depth > 0) {
            if (cleanText[i] === '{') depth++;
            if (cleanText[i] === '}') depth--;
            if (depth > 0) supStr += cleanText[i];
            i++;
          }
        } else if (i < cleanText.length) {
          supStr = cleanText[i];
          i++;
        }
        const baseNode = createMathNode('identifier', { value: idStr });
        const supNode = parseTextToMathIR(supStr);
        elements.push(createMathNode('superscript', { base: baseNode, sup: supNode }));
        continue;
      }

      if (i < cleanText.length && cleanText[i] === '_') {
        i++; // skip _
        let subStr = '';
        if (i < cleanText.length && cleanText[i] === '{') {
          i++; // skip {
          let depth = 1;
          while (i < cleanText.length && depth > 0) {
            if (cleanText[i] === '{') depth++;
            if (cleanText[i] === '}') depth--;
            if (depth > 0) subStr += cleanText[i];
            i++;
          }
        } else if (i < cleanText.length) {
          subStr = cleanText[i];
          i++;
        }
        const baseNode = createMathNode('identifier', { value: idStr });
        const subNode = parseTextToMathIR(subStr);
        elements.push(createMathNode('subscript', { base: baseNode, sub: subNode }));
        continue;
      }

      elements.push(createMathNode('identifier', { value: idStr }));
      continue;
    }

    // Standard operator or punctuation
    elements.push(createMathNode('operator', { value: char }));
    i++;
  }

  let bodyNode = elements.length === 1 ? elements[0] : createMathNode('row', { children: elements });

  if (label) {
    return createMathNode('equation', { body: bodyNode, label });
  }

  return bodyNode;
}

/**
 * Reconstructs mathematical expressions from page text lines and vector rules.
 * @param {Array<Object>} lines - Text lines extracted from page
 * @param {Array<Object>} vectors - Vector paths/rules extracted from page
 * @param {number} pageWidth - Page width
 * @param {number} pageHeight - Page height
 * @returns {Array<Object>} Reconstructed math blocks / items
 */
export function reconstructPageMath(lines, vectors, pageWidth, pageHeight) {
  const mathItems = [];

  if (!lines || lines.length === 0) return mathItems;

  // Identify vector horizontal lines (potential fraction bars or radical bars)
  const horizontalRules = (vectors || []).filter(v => {
    const w = v.bbox[2] - v.bbox[0];
    const h = v.bbox[3] - v.bbox[1];
    return w > 10 && h <= 3; // thin horizontal rule
  });

  // Track lines that are part of reconstructed math
  const claimedLineIndices = new Set();

  // 1. Detect fraction structures using horizontal vector rules positioned between two text lines
  for (const rule of horizontalRules) {
    const rx1 = rule.bbox[0];
    const rx2 = rule.bbox[2];
    const ry = (rule.bbox[1] + rule.bbox[3]) / 2;

    // Find line immediately above rule (numerator)
    let numLineIdx = -1;
    let minAboveDist = Infinity;
    for (let i = 0; i < lines.length; i++) {
      if (claimedLineIndices.has(i)) continue;
      const l = lines[i];
      const ly = l.bottom;
      if (ly <= ry && (ry - ly) < 25) {
        // check horizontal overlap
        if (!(l.right < rx1 - 5 || l.left > rx2 + 5)) {
          const dist = ry - ly;
          if (dist < minAboveDist) {
            minAboveDist = dist;
            numLineIdx = i;
          }
        }
      }
    }

    // Find line immediately below rule (denominator)
    let denLineIdx = -1;
    let minBelowDist = Infinity;
    for (let i = 0; i < lines.length; i++) {
      if (claimedLineIndices.has(i) || i === numLineIdx) continue;
      const l = lines[i];
      const ly = l.top;
      if (ly >= ry && (ly - ry) < 25) {
        if (!(l.right < rx1 - 5 || l.left > rx2 + 5)) {
          const dist = ly - ry;
          if (dist < minBelowDist) {
            minBelowDist = dist;
            denLineIdx = i;
          }
        }
      }
    }

    if (numLineIdx !== -1 && denLineIdx !== -1) {
      claimedLineIndices.add(numLineIdx);
      claimedLineIndices.add(denLineIdx);

      const numText = lines[numLineIdx].text;
      const denText = lines[denLineIdx].text;
      const numIR = parseTextToMathIR(numText);
      const denIR = parseTextToMathIR(denText);
      const fracNode = createMathNode('fraction', { numerator: numIR, denominator: denIR });

      const topY = Math.min(lines[numLineIdx].top, rule.bbox[1]);
      const botY = Math.max(lines[denLineIdx].bottom, rule.bbox[3]);
      const leftX = Math.min(lines[numLineIdx].left, lines[denLineIdx].left, rx1);
      const rightX = Math.max(lines[numLineIdx].right, lines[denLineIdx].right, rx2);

      mathItems.push({
        type: 'math',
        display: true,
        bbox: [leftX, topY, rightX, botY],
        node: fracNode,
        markdown: toMarkdown(fracNode, true)
      });
    }
  }

  // 2. Scan remaining lines for standalone equations, integrals, matrices, or display math
  for (let i = 0; i < lines.length; i++) {
    if (claimedLineIndices.has(i)) continue;
    const l = lines[i];
    const text = l.text.trim();

    // Check if line contains math indicators (Greek letters, math operators, equation numbers, or explicit math syntax)
    const hasMathSymbols = /[∫∑∏±×÷≤≥≠≈∞∂∇∈∉⊂⊃∪∩∀∃→←↔⇒⇐⇔α-ωΑ-Ω]/.test(text);
    const hasEquationNumber = /\([A-Z]?\d+(?:\.\d+)*[a-z]?\)\s*$/.test(text);
    const isCentered = Math.abs((l.left + l.right) / 2 - pageWidth / 2) < pageWidth * 0.25 && l.width < pageWidth * 0.8;

    if (hasMathSymbols || hasEquationNumber || (isCentered && text.length < 80)) {
      claimedLineIndices.add(i);
      const mathIR = parseTextToMathIR(text);
      const display = hasEquationNumber || isCentered || text.length > 30;

      mathItems.push({
        type: 'math',
        display,
        bbox: [l.left, l.top, l.right, l.bottom],
        node: mathIR,
        markdown: toMarkdown(mathIR, display)
      });
    }
  }

  return { mathItems, claimedLineIndices };
}
