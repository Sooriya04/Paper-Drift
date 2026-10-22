/**
 * @file src/math/index.js
 * @description Main export for the paper-drift LaTeX math restoration engine.
 * Provides symbol mapping, sub/superscript resolution, equation tagging, and math block formatting.
 * Part of paper-drift - https://github.com/Sooriya04/Paper-Drift
 */

export {
  restoreLineMath,
  restoreBlockMath,
  formatInlineMath,
  normalizeMathIndices,
  isMathFont,
  containsMathSymbols
} from './restorer.js';

export {
  ALL_MATH_SYMBOLS,
  mapUnicodeToLatex,
  GREEK_LOWERCASE,
  GREEK_UPPERCASE,
  MATH_OPERATORS,
  MATH_RELATIONS,
  ARROWS_AND_LOGIC,
  BLACKBOARD_SETS
} from './symbols.js';
