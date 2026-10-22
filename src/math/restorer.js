/**
 * @file src/math/restorer.js
 * @description Advanced LaTeX math heuristic restoration engine for academic and scientific PDFs.
 * Reconstructs sub/superscripts, fractions, square roots, Greek/symbol glyphs,
 * and frames expressions into inline ($...$) or display ($$...$$) LaTeX equations.
 * Part of paper-drift - https://github.com/Sooriya04/Paper-Drift
 */

import { ALL_MATH_SYMBOLS, mapUnicodeToLatex } from './symbols.js';

const MATH_FONT_PATTERNS = [
  /cmr/i,
  /cmsy/i,
  /cmmi/i,
  /math/i,
  /symbol/i,
  /stix/i,
  /euler/i,
  /msam/i,
  /msbm/i
];

/**
 * Checks if a font name indicates a LaTeX or mathematical typography font.
 * @param {string} fontName
 * @returns {boolean}
 */
export function isMathFont(fontName) {
  if (!fontName) return false;
  return MATH_FONT_PATTERNS.some(p => p.test(fontName));
}

/**
 * Checks if a string contains mathematical or Greek symbols.
 * @param {string} str
 * @returns {boolean}
 */
export function containsMathSymbols(str) {
  if (!str) return false;
  for (const sym of Object.keys(ALL_MATH_SYMBOLS)) {
    if (str.includes(sym)) return true;
  }
  return false;
}

/**
 * Normalizes math variable indices (e.g. dk -> d_k, dmodel -> d_{model}, headi -> head_i).
 * @param {string} str
 * @returns {string}
 */
export function normalizeMathIndices(str) {
  if (!str) return '';

  // Common academic math variable patterns
  return str
    .replace(/\b([dD])([kqv])\b/g, '$1_{$2}')
    .replace(/\b(d)(model)\b/g, '$1_{\\text{$2}}')
    .replace(/\b(head)([i-k])\b/g, '\\text{$1}_{$2}')
    .replace(/\b([Ww])([0-9a-zA-Z])\b/g, '$1_{$2}')
    .replace(/\b([XxYyZz])([i-k0-9])\b/g, '$1_{$2}');
}

/**
 * Restores sub/superscripts, symbols, and operators in a horizontal line of text tokens.
 *
 * @param {Array<{ str: string, x: number, y: number, fontSize: number, fontName?: string, w?: number, h?: number }>} tokens
 * @param {Object} [options={}]
 * @param {boolean} [options.bottomUp=false] - True if coordinates are bottom-up (PDF standard) vs top-down (DOM)
 * @returns {string} Reconstructed LaTeX expression
 */
export function restoreLineMath(tokens, options = {}) {
  const { bottomUp = false } = options;
  if (!tokens || tokens.length === 0) return '';

  // Sort primarily by X coordinate
  const sorted = [...tokens]
    .filter(t => t.str && t.str.trim() !== '')
    .sort((a, b) => a.x - b.x);

  if (sorted.length === 0) return '';

  let out = '';
  let prevToken = null;

  for (let i = 0; i < sorted.length; i++) {
    const curr = sorted[i];
    let tokenText = mapUnicodeToLatex(curr.str);

    // Apply index normalization for math variables
    if (isMathFont(curr.fontName) || curr.fontSize <= 9) {
      tokenText = normalizeMathIndices(tokenText);
    }

    if (prevToken) {
      const isSmaller = curr.fontSize < prevToken.fontSize * 0.85;
      const yDiff = bottomUp ? (curr.y - prevToken.y) : (prevToken.y - curr.y);

      // Superscript check: smaller font and elevated baseline
      if (isSmaller && yDiff > 1.0) {
        out = out.trimEnd() + `^{${tokenText}}`;
        prevToken = curr;
        continue;
      }

      // Subscript check: smaller font and lowered baseline
      if (isSmaller && yDiff < -1.0) {
        out = out.trimEnd() + `_{${tokenText}}`;
        prevToken = curr;
        continue;
      }

      // Spacing between distinct mathematical terms
      const xGap = curr.x - (prevToken.x + (prevToken.w || prevToken.fontSize * 0.45));
      if (xGap > 2.0 && !out.endsWith(' ') && !out.endsWith('{') && !out.endsWith('_') && !out.endsWith('^') && !out.endsWith('\\')) {
        out += ' ';
      }
    }

    // Format square roots: √x -> \sqrt{x}
    if (tokenText.startsWith('\\sqrt')) {
      const remainder = tokenText.slice(5).trim();
      tokenText = remainder.length > 0 ? `\\sqrt{${remainder}}` : '\\sqrt';
    }

    out += tokenText;
    prevToken = curr;
  }

  return out.replace(/\s+/g, ' ').trim();
}

/**
 * Reconstructs a full mathematical block, framing as display ($$...$$) or inline ($...$).
 *
 * @param {Object} block - Text block with lines of tokens
 * @param {Object} [options={}]
 * @returns {{ isMath: boolean, latex: string }}
 */
export function restoreBlockMath(block, options = {}) {
  if (!block || !block.lines || block.lines.length === 0) {
    return { isMath: false, latex: '' };
  }

  // Extract all tokens across lines
  const allTokens = [];
  let mathTokensCount = 0;

  for (const line of block.lines) {
    const tokens = line.tokens || [{
      str: line.text,
      x: line.bbox?.x ?? line.x ?? 0,
      y: line.bbox?.y ?? line.y ?? 0,
      w: line.bbox?.w,
      h: line.bbox?.h,
      fontSize: line.font?.size || line.bbox?.h || 10,
      fontName: line.font?.name || ''
    }];

    for (const t of tokens) {
      allTokens.push(t);
      if (isMathFont(t.fontName) || containsMathSymbols(t.str)) {
        mathTokensCount++;
      }
    }
  }

  const rawText = block.lines.map(l => l.text).join(' ').trim();
  const mathDensity = allTokens.length > 0 ? (mathTokensCount / allTokens.length) : 0;

  // Check for equation tag pattern at the end: (1), (2.4), (12)
  const equationLabelMatch = rawText.match(/\((\d+(\.\d+)?)\)\s*$/);
  const hasEquationLabel = Boolean(equationLabelMatch);

  // High math likelihood triggers
  const isEquation = mathDensity >= 0.25 ||
                     hasEquationLabel ||
                     (containsMathSymbols(rawText) && (rawText.includes('=') || rawText.includes('+')));

  if (!isEquation) {
    return { isMath: false, latex: rawText };
  }

  // Reconstruct math expression
  let restored = restoreLineMath(allTokens, options);

  // If there's an equation tag at the end, convert to \tag{N}
  if (equationLabelMatch) {
    const label = equationLabelMatch[1];
    restored = restored.replace(/\(\d+(\.\d+)?\)\s*$/, '').trim();
    return {
      isMath: true,
      latex: `$$\n${restored} \\tag{${label}}\n$$`
    };
  }

  return {
    isMath: true,
    latex: `$$\n${restored}\n$$`
  };
}

/**
 * Scans regular text paragraphs and converts inline math expressions (e.g. d_k, x^2, \alpha)
 * into standard inline LaTeX ($...$).
 *
 * @param {string} text
 * @returns {string} Text with inline math wrapped in $...$
 */
export function formatInlineMath(text) {
  if (!text) return '';

  let result = mapUnicodeToLatex(text);
  result = normalizeMathIndices(result);

  // Wrap isolated sub/superscript tokens or Greek symbols in $...$
  result = result.replace(/(^|\s)([a-zA-Z0-9\\]+[\^_]\{[^{}]+\})($|\s|[.,;:])/g, (match, prefix, math, suffix) => {
    return `${prefix}$${math}$${suffix}`;
  });

  return result;
}
