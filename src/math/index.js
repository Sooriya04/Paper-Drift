/**
@file src/math/index.js
@description Public API for Mathematical Equation Reconstruction subsystem in Paper-Drift.
Exports Math IR schema creation, validation, parsers, and LaTeX/MathML/Markdown converters.
Part of paper-drift - https://github.com/Sooriya04/Paper-Drift
*/

import { createMathNode, validateMathIR, toLaTeX, toMathML, toMarkdown } from './schema.js';
import { parseTextToMathIR, reconstructPageMath } from './detector.js';

export {
  createMathNode,
  validateMathIR,
  toLaTeX,
  toMathML,
  toMarkdown,
  parseTextToMathIR,
  reconstructPageMath
};
