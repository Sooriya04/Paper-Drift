/**
 * @file src/metadata/sections.js
 * @description Reconstructs section hierarchy from typography and heading rules.
 * Supports numbered and unnumbered headings, subsections, subsubsections,
 * appendices, and acknowledgements with hierarchical nesting.
 * Part of paper-drift - https://github.com/Sooriya04/Paper-Drift
 */

import { mergeBboxes } from './provenance.js';
import { calculateBodyFontSizeMode } from '../markdown/typography.js';

// Matches "1", "1.1", "1.1.1", "I", "II.A", "Appendix A", "Appendices"
const SECTION_REGEX = /^(?:([1-9]\d*|[IVXLCDM]+)\.?\s+(\p{Lu}.*)|appendix(?:\s+([a-z0-9]+))?[:.\s]+(.*))$/iu;
const SUBSECTION_REGEX = /^([0-9]+\.[0-9]+)\.?\s+(\p{Lu}.*)$/u;
const SUBSUBSECTION_REGEX = /^([0-9]+\.[0-9]+\.[0-9]+)\.?\s+(\p{Lu}.*)$/u;

const SPECIAL_HEADINGS = [
  'abstract',
  'introduction',
  'background',
  'related work',
  'method',
  'methods',
  'methodology',
  'experiments',
  'experimental setup',
  'results',
  'discussion',
  'conclusion',
  'conclusions',
  'acknowledgements',
  'acknowledgments',
  'references',
  'bibliography',
  'appendix',
  'appendices'
];

/**
 * Reconstructs section hierarchy tree from pages and typography classification.
 *
 * @param {Array<Object>} rawPagesData - Page data containing text lines
 * @param {Map<string, any>} [typographyMap] - Typography classifications
 * @returns {Array<Object>} Nested hierarchy of section nodes
 */
export function reconstructSectionHierarchy(rawPagesData, typographyMap) {
  const flatHeadings = [];
  const allLines = rawPagesData ? rawPagesData.flatMap(p => p.lines || []) : [];
  const bodyMode = calculateBodyFontSizeMode(allLines);

  for (const page of rawPagesData) {
    const pageNum = page.pageNumber;
    const lines = page.lines || [];

    for (const line of lines) {
      const text = (line.text || '').trim();
      if (!text || text.length < 2) continue;

      // Skip running headers / footers or single page numbers
      if (/^\d+$/.test(text)) continue;
      if (line.top < 50 || line.top > page.height - 50) continue;

      const size = line.font?.size || line.fontSize || line.height || bodyMode;
      const ratio = size / bodyMode;
      const isBold = Boolean(line.font?.isBold);
      const words = text.split(/\s+/).filter(Boolean);

      // Headings must be concise (<= 14 words) and not end with a colon
      if (words.length > 14 || text.endsWith(':')) continue;

      // Evaluate typography heading or pattern
      let level = null;
      let number = null;
      let title = text;

      // Check subsubsection: 1.1.1
      const subsubMatch = SUBSUBSECTION_REGEX.exec(text);
      if (subsubMatch && (ratio >= 0.95 || isBold)) {
        level = 3;
        number = subsubMatch[1];
        title = subsubMatch[2].trim();
      } else {
        // Check subsection: 1.1
        const subMatch = SUBSECTION_REGEX.exec(text);
        if (subMatch && (ratio >= 0.95 || isBold)) {
          level = 2;
          number = subMatch[1];
          title = subMatch[2].trim();
        } else {
          // Check top-level section: 1. or I. or Appendix
          const secMatch = SECTION_REGEX.exec(text);
          if (secMatch && (ratio >= 1.05 || isBold || text.toLowerCase().startsWith('appendix'))) {
            level = 1;
            number = secMatch[1] || secMatch[3] || 'Appendix';
            title = (secMatch[2] || secMatch[4] || '').trim();
          } else {
            // Unnumbered special sections (e.g. "References", "Acknowledgements", "Abstract")
            const lower = text.toLowerCase().replace(/[:.]/g, '').trim();
            if (SPECIAL_HEADINGS.includes(lower) && (isBold || ratio >= 1.05)) {
              level = 1;
              number = null;
              title = text.replace(/[:.]/g, '').trim();
            }
          }
        }
      }

      // If typography indicates heading mode or bold font
      if (level !== null && title.length > 0) {
        const bbox = line.bbox || (line.left !== undefined ? [line.left, line.top, line.left + line.width, line.top + line.height] : null);
        flatHeadings.push({
          title,
          number,
          level,
          page: pageNum,
          bbox,
          children: []
        });
      }
    }
  }

  return nestSectionHierarchy(flatHeadings);
}

/**
 * Nests flat list of headings into a hierarchy tree based on `level`.
 *
 * @param {Array<Object>} headings
 * @returns {Array<Object>}
 */
export function nestSectionHierarchy(headings) {
  const root = [];
  const stack = [];

  for (const h of headings) {
    const node = {
      title: h.title,
      number: h.number,
      level: h.level,
      page: h.page,
      bbox: h.bbox,
      children: []
    };

    while (stack.length > 0 && stack[stack.length - 1].level >= node.level) {
      stack.pop();
    }

    if (stack.length === 0) {
      root.push(node);
    } else {
      stack[stack.length - 1].children.push(node);
    }

    stack.push(node);
  }

  return root;
}
