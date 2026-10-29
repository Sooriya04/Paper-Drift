/**
 * @file src/markdown/normalizer.js
 * @description Markdown AST validation and GFM normalization pipeline using unified and remark.
 * Normalizes pipe tables, headings, code fences, and asserts syntactically valid GFM markdown.
 * Part of paper-drift - https://github.com/Sooriya04/Paper-Drift
 */

import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import remarkStringify from 'remark-stringify';
import { cleanText } from './cleaner.js';

const processor = unified()
  .use(remarkParse)
  .use(remarkGfm)
  .use(remarkStringify, {
    bullet: '-',
    emphasis: '_',
    fences: true,
    listItemIndent: 'one',
    resourceLink: true,
    rule: '-',
    strong: '*',
    tableCellPadding: true,
    tablePipeAlign: false
  });

/**
 * Normalizes and formats a markdown string through the Unified / Remark AST processor.
 *
 * @param {string} markdown - Raw input markdown
 * @param {Object} [options={}]
 * @param {boolean} [options.transliterate=true]
 * @returns {Promise<string>} Standardized GFM Markdown
 */
export async function normalizeMarkdown(markdown, options = {}) {
  if (!markdown || typeof markdown !== 'string') return '';

  const cleanedInput = cleanText(markdown, options);
  if (!cleanedInput.trim()) return '';

  try {
    const vfile = await processor.process(cleanedInput);
    return String(vfile).trim();
  } catch (err) {
    // If AST parsing fails, fallback to cleaned text to prevent throwing
    return cleanedInput.trim();
  }
}
