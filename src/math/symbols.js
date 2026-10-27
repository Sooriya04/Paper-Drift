/**
 * @file src/math/symbols.js
 * @description Comprehensive Unicode-to-LaTeX mathematical symbol and Greek alphabet mapping dictionary.
 * Translates raw glyphs from academic PDF fonts (CMR, CMSY, CMMI, Symbol) into clean LaTeX expressions.
 * Part of paper-drift - https://github.com/Sooriya04/Paper-Drift
 */

export const GREEK_LOWERCASE = {
  'α': '\\alpha',
  'β': '\\beta',
  'γ': '\\gamma',
  'δ': '\\delta',
  'ε': '\\epsilon',
  'ϵ': '\\varepsilon',
  'ζ': '\\zeta',
  'η': '\\eta',
  'θ': '\\theta',
  'ϑ': '\\vartheta',
  'ι': '\\iota',
  'κ': '\\kappa',
  'λ': '\\lambda',
  'μ': '\\mu',
  'ν': '\\nu',
  'ξ': '\\xi',
  'π': '\\pi',
  'ϖ': '\\varpi',
  'ρ': '\\rho',
  'ϱ': '\\varrho',
  'σ': '\\sigma',
  'ς': '\\varsigma',
  'τ': '\\tau',
  'υ': '\\upsilon',
  'φ': '\\phi',
  'ϕ': '\\varphi',
  'χ': '\\chi',
  'ψ': '\\psi',
  'ω': '\\omega'
};

export const GREEK_UPPERCASE = {
  'Γ': '\\Gamma',
  'Δ': '\\Delta',
  'Θ': '\\Theta',
  'Λ': '\\Lambda',
  'Ξ': '\\Xi',
  'Π': '\\Pi',
  'Σ': '\\Sigma',
  'Υ': '\\Upsilon',
  'Φ': '\\Phi',
  'Ψ': '\\Psi',
  'Ω': '\\Omega'
};

export const MATH_OPERATORS = {
  '∑': '\\sum',
  '∏': '\\prod',
  '∐': '\\coprod',
  '∫': '\\int',
  '∬': '\\iint',
  '∭': '\\iiint',
  '∮': '\\oint',
  '√': '\\sqrt',
  '±': '\\pm',
  '∓': '\\mp',
  '×': '\\times',
  '÷': '\\div',
  '·': '\\cdot',
  '∘': '\\circ',
  '∙': '\\bullet',
  '⊗': '\\otimes',
  '⊕': '\\oplus',
  '⊙': '\\odot',
  '∗': '*',
  '⋆': '\\star'
};

export const MATH_RELATIONS = {
  '≤': '\\le',
  '≥': '\\ge',
  '≠': '\\neq',
  '≈': '\\approx',
  '≡': '\\equiv',
  '∼': '\\sim',
  '≃': '\\simeq',
  '∝': '\\propto',
  '≪': '\\ll',
  '≫': '\\gg',
  '∈': '\\in',
  '∉': '\\notin',
  '∋': '\\owns',
  '⊂': '\\subset',
  '⊃': '\\supset',
  '⊆': '\\subseteq',
  '⊇': '\\supseteq',
  '∩': '\\cap',
  '∪': '\\cup'
};

export const ARROWS_AND_LOGIC = {
  '=⇒': '\\implies',
  '=→': '\\to',
  '⇒': '\\implies',
  '⇐': '\\impliedby',
  '⇔': '\\iff',
  '→': '\\to',
  '←': '\\leftarrow',
  '↔': '\\leftrightarrow',
  '↑': '\\uparrow',
  '↓': '\\downarrow',
  '∀': '\\forall',
  '∃': '\\exists',
  '∄': '\\nexists',
  '∇': '\\nabla',
  '∂': '\\partial',
  '∞': '\\infty',
  '∠': '\\angle',
  '⊥': '\\perp'
};

export const BLACKBOARD_SETS = {
  'ℝ': '\\mathbb{R}',
  'ℂ': '\\mathbb{C}',
  'ℕ': '\\mathbb{N}',
  'ℤ': '\\mathbb{Z}',
  'ℚ': '\\mathbb{Q}',
  '𝔼': '\\mathbb{E}',
  'ℙ': '\\mathbb{P}',
  '𝟙': '\\mathbb{1}'
};

// Unified lookup map
export const ALL_MATH_SYMBOLS = {
  ...GREEK_LOWERCASE,
  ...GREEK_UPPERCASE,
  ...MATH_OPERATORS,
  ...MATH_RELATIONS,
  ...ARROWS_AND_LOGIC,
  ...BLACKBOARD_SETS
};

/**
 * Replaces unicode math symbols with their LaTeX equivalent.
 * @param {string} text
 * @returns {string}
 */
export function mapUnicodeToLatex(text) {
  if (!text) return '';
  let out = String(text);

  // Normalize combining slashes and negations (e.g. s̸= -> \neq)
  out = out.replace(/(\u0338=|=\u0338)/g, ' \\neq ');
  out = out.replace(/\u0338/g, '');

  // Normalize Unicode minuses, hyphens, and primes
  out = out.replace(/[−–]/g, '-');
  out = out.replace(/′/g, "'");

  for (const [sym, latex] of Object.entries(ALL_MATH_SYMBOLS)) {
    if (out.includes(sym)) {
      out = out.split(sym).join(` ${latex} `);
    }
  }
  return out.replace(/\s+/g, ' ').trim();
}
