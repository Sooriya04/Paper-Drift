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
 * Differentiates fraction bars from table rules and full-width borders using geometry and nearby text bounds.
 * Eliminates false positives from headings, prose, and figure captions.
 *
 * @param {Array<Object>} lines - Text lines extracted from page
 * @param {Array<Object>} vectors - Vector paths/rules extracted from page
 * @param {number} pageWidth - Page width
 * @param {number} pageHeight - Page height
 * @returns {{ mathItems: Array<Object>, claimedLineIndices: Set<number> }} Reconstructed math blocks
 */
export function reconstructPageMath(lines, vectors, pageWidth, pageHeight) {
  const mathItems = [];
  const claimedLineIndices = new Set();

  if (!lines || lines.length === 0) {
    return { mathItems, claimedLineIndices };
  }

  // Helper to test if a vector is a valid fraction bar candidate
  function isFractionRule(v, candLines) {
    const w = v.bbox[2] - v.bbox[0];
    const h = v.bbox[3] - v.bbox[1];
    if (h > 2.5) return false;
    if (w < 4 || w > 120) return false; // Fraction bars are short
    if (w > pageWidth * 0.3) return false;

    const candMinX = Math.min(...candLines.map(c => c.line.left));
    const candMaxX = Math.max(...candLines.map(c => c.line.right));
    const candMinY = Math.min(...candLines.map(c => c.line.top));
    const candMaxY = Math.max(...candLines.map(c => c.line.bottom));
    const midY = (v.bbox[1] + v.bbox[3]) / 2;

    return v.bbox[0] >= candMinX - 10 && v.bbox[2] <= candMaxX + 10 &&
           midY >= candMinY - 5 && midY <= candMaxY + 5;
  }

  // 1. Detect numbered display equations e.g. Attention (1), FFN (2), etc.
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    const text = l.text.trim();
    const eqMatch = text.match(/^\(([1-9]\d*)\)$/);
    if (eqMatch && l.width < 50 && (l.right > 400 || l.right > pageWidth * 0.45)) {
      const eqNum = eqMatch[1];
      const eqMidY = (l.top + l.bottom) / 2;

      // Find candidate equation body lines near eqMidY to the left of the equation number
      const eqCandLines = [];
      for (let j = 0; j < lines.length; j++) {
        if (j === i) continue;
        const other = lines[j];
        const otherMidY = (other.top + other.bottom) / 2;
        if (Math.abs(otherMidY - eqMidY) < 18 && other.right <= l.left + 5) {
          if (other.width < 320) {
            eqCandLines.push({ idx: j, line: other });
          }
        }
      }

      if (eqCandLines.length > 0) {
        eqCandLines.sort((a, b) => a.line.left - b.line.left);
        const candMinX = Math.min(...eqCandLines.map(c => c.line.left));
        const candMaxX = Math.max(...eqCandLines.map(c => c.line.right));
        const candMinY = Math.min(...eqCandLines.map(c => c.line.top));
        const candMaxY = Math.max(...eqCandLines.map(c => c.line.bottom));

        const fracRule = (vectors || []).find(v => isFractionRule(v, eqCandLines));

        let eqLatex = '';
        if (fracRule) {
          const rx1 = fracRule.bbox[0];
          const rx2 = fracRule.bbox[2];
          const ry = (fracRule.bbox[1] + fracRule.bbox[3]) / 2;

          const allChars = eqCandLines.flatMap(c => c.line.chars || []);
          const leftChars = allChars.filter(c => c.x < rx1 - 2);
          const numChars = allChars.filter(c => c.x >= rx1 - 2 && c.x <= rx2 + 0.5 && c.y < ry);
          const denChars = allChars.filter(c => c.x >= rx1 - 2 && c.x <= rx2 + 0.5 && c.y >= ry);
          const rightChars = allChars.filter(c => c.x > rx2 + 0.5);

          leftChars.sort((a, b) => a.x - b.x);
          numChars.sort((a, b) => a.x - b.x);
          denChars.sort((a, b) => a.x - b.x);
          rightChars.sort((a, b) => a.x - b.x);

          let leftStr = leftChars.map(c => c.char).join('').trim();
          let numStr = numChars.map(c => c.char).join('').trim();
          let denStr = denChars.map(c => c.char).join('').trim();
          let rightStr = rightChars.map(c => c.char).join('').trim();

          numStr = numStr.replace(/([A-Z]{1,3})\s*([TH])\b/g, '$1^$2');
          denStr = denStr.replace(/√\s*([a-zA-Z])([a-zA-Z0-9])\b/g, '\\sqrt{$1_$2}').replace(/√\s*(\w+)/g, '\\sqrt{$1}');

          eqLatex = `${leftStr}\\frac{${numStr}}{${denStr}}${rightStr}`;
        } else {
          eqLatex = eqCandLines.map(c => c.line.text.trim()).join(' ');
        }

        eqLatex = eqLatex.replace(/·/g, '\\cdot ');

        claimedLineIndices.add(i);
        for (const c of eqCandLines) {
          claimedLineIndices.add(c.idx);
        }

        const bbox = [candMinX, candMinY, l.right, candMaxY];
        const node = createMathNode('equation', {
          body: createMathNode('raw', { value: eqLatex }),
          label: eqNum
        });

        mathItems.push({
          type: 'math',
          display: true,
          bbox,
          node,
          markdown: toMarkdown(node, true)
        });
      }
    }
  }

  // 2. Detect unnumbered fraction structures using short horizontal vector rules between text lines
  const horizontalRules = (vectors || []).filter(v => {
    const w = v.bbox[2] - v.bbox[0];
    const h = v.bbox[3] - v.bbox[1];
    return w >= 6 && w <= 120 && h <= 2.5; // Short fraction vinculum
  });

  for (const rule of horizontalRules) {
    const rx1 = rule.bbox[0];
    const rx2 = rule.bbox[2];
    const ry = (rule.bbox[1] + rule.bbox[3]) / 2;

    // Find numerator and denominator candidate lines
    let numLineIdx = -1;
    let minAboveDist = Infinity;
    for (let i = 0; i < lines.length; i++) {
      if (claimedLineIndices.has(i)) continue;
      const l = lines[i];
      if (l.width > 200) continue; // paragraph lines cannot be a standalone numerator
      const ly = l.bottom;
      if (ly <= ry && (ry - ly) < 25) {
        if (!(l.right < rx1 - 5 || l.left > rx2 + 5)) {
          const dist = ry - ly;
          if (dist < minAboveDist) {
            minAboveDist = dist;
            numLineIdx = i;
          }
        }
      }
    }

    let denLineIdx = -1;
    let minBelowDist = Infinity;
    for (let i = 0; i < lines.length; i++) {
      if (claimedLineIndices.has(i) || i === numLineIdx) continue;
      const l = lines[i];
      if (l.width > 200) continue; // paragraph lines cannot be a standalone denominator
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

  // 3. Scan remaining lines for standalone equations (requiring true math operators/symbols)
  for (let i = 0; i < lines.length; i++) {
    if (claimedLineIndices.has(i)) continue;
    const l = lines[i];
    const text = l.text.trim();

    // Exclude wide prose paragraphs, headings, captions, author/bib lines
    if (l.width >= 300) continue;
    if (/^(?:Figure|Fig\.|Table|Section|Sec\.)/i.test(text)) continue;
    if (/^\d+(?:\.\d+)*\s+[A-Z]/.test(text)) continue;
    if (text.endsWith(':') || text.endsWith('.')) continue;

    // Filter out ordinary sentences with many standard words
    const words = text.split(/\s+/);
    const englishWords = words.filter(w => /^[a-zA-Z]{3,}$/.test(w) && !/^(?:sin|cos|tan|log|ln|exp|max|min|det|softmax|Concat|head|where)$/i.test(w));
    if (englishWords.length >= 3) continue;

    const isDisplayMath = /^[A-Za-z]+(?:\([^\)]*\))?\s*=\s*/.test(text) ||
                          /^[a-zA-Z]\s*=\s*[0-9\.\-]/.test(text) ||
                          /[∫∑∏∂∇≤≥≠≈∈⊂∪]/.test(text);

    if (isDisplayMath) {
      claimedLineIndices.add(i);
      const mathIR = parseTextToMathIR(text);
      mathItems.push({
        type: 'math',
        display: true,
        bbox: [l.left, l.top, l.right, l.bottom],
        node: mathIR,
        markdown: toMarkdown(mathIR, true)
      });
    }
  }

  return { mathItems, claimedLineIndices };
}
