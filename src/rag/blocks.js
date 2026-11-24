/**
 * @file src/rag/blocks.js
 * @description Extracts and classifies atomic layout blocks (headings, paragraphs,
 * tables, math formulas) from raw page structures in natural spatial reading order.
 * Part of paper-drift - https://github.com/Sooriya04/Paper-Drift
 */

import { BLOCK_TYPES } from './constants.js';
import { calculateBodyFontSizeMode } from '../markdown/typography.js';
import { recursiveXyCut } from '../spatial/reading-order.js';
import { repairHyphenation } from '../normalization/text.js';
import {
  SECTION_REGEX,
  SUBSECTION_REGEX,
  SUBSUBSECTION_REGEX,
  SPECIAL_HEADINGS_SET as SPECIAL_HEADINGS
} from '../metadata/sections.js';

/**
 * Classifies if a line qualifies as a section heading.
 */
function detectHeading(line, text, bodyMode) {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length > 14 || text.endsWith(':')) return null;

  const size = line.font?.size || line.fontSize || line.height || bodyMode;
  const ratio = size / bodyMode;
  const isBold = Boolean(line.font?.isBold);

  const subsub = SUBSUBSECTION_REGEX.exec(text);
  if (subsub && (ratio >= 0.95 || isBold)) return { level: 3, title: text.trim() };

  const sub = SUBSECTION_REGEX.exec(text);
  if (sub && (ratio >= 0.95 || isBold)) return { level: 2, title: text.trim() };

  const sec = SECTION_REGEX.exec(text);
  if (sec && (ratio >= 1.05 || isBold || text.toLowerCase().startsWith('appendix'))) {
    return { level: 1, title: text.trim() };
  }

  const lower = text.toLowerCase().replace(/[:.]/g, '').trim();
  if (SPECIAL_HEADINGS.has(lower) && (isBold || ratio >= 1.05)) {
    return { level: 1, title: text.replace(/[:.]/g, '').trim() };
  }

  return null;
}

/**
 * Extracts atomic semantic blocks from a single page's extraction data.
 *
 * @param {Object} pageData - Raw page data with lines, tables, and math
 * @returns {Array<Object>} Spatially ordered atomic blocks
 */
export function extractPageAtomicBlocks(pageData) {
  const { pageNumber, width = 612, height = 792 } = pageData;
  const lines = pageData.lines || [];
  const tables = pageData.tables || [];
  const mathItems = pageData.mathItems || [];
  const claimedLineIndices = pageData.claimedLineIndices || new Set();

  const claimedLines = new Set([
    ...tables.flatMap(t => t.linesInside || []),
    ...Array.from(claimedLineIndices).map(idx => lines[idx]).filter(Boolean)
  ]);

  const bodyMode = calculateBodyFontSizeMode(lines);

  // Filter margin artifacts (solitary page numbers, running headers/footers)
  const validLines = lines.filter(l => {
    if (claimedLines.has(l)) return false;
    const t = (l.text || '').trim();
    if (!t || /^\d+$/.test(t)) return false;
    if (l.top < 40 || l.top > height - 40) return false;
    return true;
  });

  const rawBlocks = [
    ...validLines.map(l => ({
      bbox: { x: l.left, y: l.top, w: l.width, h: l.height },
      type: 'line',
      data: l
    })),
    ...tables.map(t => ({
      bbox: { x: t.bbox[0], y: t.bbox[1], w: t.bbox[2] - t.bbox[0], h: t.bbox[3] - t.bbox[1] },
      type: 'table',
      data: t
    })),
    ...mathItems.map(m => ({
      bbox: { x: m.bbox[0], y: m.bbox[1], w: m.bbox[2] - m.bbox[0], h: m.bbox[3] - m.bbox[1] },
      type: 'math',
      data: m
    }))
  ];

  const orderedItems = recursiveXyCut(rawBlocks, 0, 0, width, height);
  const blocks = [];
  const paragraphLines = [];

  function flushParagraph() {
    if (paragraphLines.length === 0) return;
    const joined = repairHyphenation(paragraphLines.join('\n')).split('\n').join(' ').trim();
    if (joined.length > 0) {
      blocks.push({
        type: BLOCK_TYPES.PARAGRAPH,
        page: pageNumber,
        content: joined,
        isAtomic: false,
        has_math: false,
        has_table: false
      });
    }
    paragraphLines.length = 0;
  }

  for (const item of orderedItems) {
    if (item.type === 'table') {
      flushParagraph();
      blocks.push({
        type: BLOCK_TYPES.TABLE,
        page: pageNumber,
        content: item.data.markdown.trim(),
        isAtomic: true,
        has_math: false,
        has_table: true
      });
    } else if (item.type === 'math') {
      flushParagraph();
      blocks.push({
        type: BLOCK_TYPES.MATH,
        page: pageNumber,
        content: item.data.markdown.trim(),
        isAtomic: true,
        has_math: true,
        has_table: false
      });
    } else {
      const line = item.data;
      const text = (line.text || '').trim();
      const heading = detectHeading(line, text, bodyMode);
      if (heading) {
        flushParagraph();
        blocks.push({
          type: BLOCK_TYPES.HEADING,
          section: heading.title,
          level: heading.level,
          page: pageNumber,
          content: heading.title,
          isAtomic: true,
          has_math: false,
          has_table: false
        });
      } else {
        paragraphLines.push(text);
      }
    }
  }

  flushParagraph();
  return blocks;
}
