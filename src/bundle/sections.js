/**
 * @file src/bundle/sections.js
 * @description Extracts flattened, RAG-optimized section chunks with content slices.
 * Part of paper-drift - https://github.com/Sooriya04/Paper-Drift
 */

import { calculateBodyFontSizeMode } from '../markdown/typography.js';
import {
  SECTION_REGEX,
  SUBSECTION_REGEX,
  SUBSUBSECTION_REGEX,
  SPECIAL_HEADINGS_SET
} from '../metadata/sections.js';

/**
 * Extracts flattened section objects containing title, level, page, and sliced content.
 *
 * @param {Array<Object>} rawPagesData - Extracted page objects with lines
 * @returns {Array<{ title: string, level: number, page: number, content: string }>}
 */
export function extractBundleSections(rawPagesData) {
  if (!Array.isArray(rawPagesData) || rawPagesData.length === 0) {
    return [];
  }

  const allLines = rawPagesData.flatMap(p => p.lines || []);
  const bodyMode = calculateBodyFontSizeMode(allLines);

  const sections = [];
  let currentSection = null;
  const contentBuffer = [];

  function flushCurrentSection() {
    if (currentSection) {
      currentSection.content = contentBuffer.join('\n').trim();
      sections.push(currentSection);
      contentBuffer.length = 0;
    }
  }

  for (const page of rawPagesData) {
    const pageNum = page.pageNumber;
    const lines = page.lines || [];

    for (const line of lines) {
      const text = (line.text || '').trim();
      if (!text || text.length < 2) continue;

      // Skip solitary running header / footer numbers
      if (/^\d+$/.test(text)) continue;
      if (line.top < 50 || line.top > page.height - 50) continue;

      const size = line.font?.size || line.fontSize || line.height || bodyMode;
      const ratio = size / bodyMode;
      const isBold = Boolean(line.font?.isBold);
      const words = text.split(/\s+/).filter(Boolean);

      let isHeading = false;
      let level = 1;
      let title = text;

      if (words.length <= 14 && !text.endsWith(':')) {
        const subsubMatch = SUBSUBSECTION_REGEX.exec(text);
        if (subsubMatch && (ratio >= 0.95 || isBold)) {
          isHeading = true;
          level = 3;
          title = subsubMatch[2].trim();
        } else {
          const subMatch = SUBSECTION_REGEX.exec(text);
          if (subMatch && (ratio >= 0.95 || isBold)) {
            isHeading = true;
            level = 2;
            title = subMatch[2].trim();
          } else {
            const secMatch = SECTION_REGEX.exec(text);
            if (secMatch && (ratio >= 1.05 || isBold || text.toLowerCase().startsWith('appendix'))) {
              isHeading = true;
              level = 1;
              title = (secMatch[2] || secMatch[4] || text).trim();
            } else {
              const lower = text.toLowerCase().replace(/[:.]/g, '').trim();
              if (SPECIAL_HEADINGS_SET.has(lower) && (isBold || ratio >= 1.05)) {
                isHeading = true;
                level = 1;
                title = text.replace(/[:.]/g, '').trim();
              }
            }
          }
        }
      }

      if (isHeading) {
        flushCurrentSection();
        currentSection = {
          title,
          level,
          page: pageNum,
          content: ''
        };
      } else {
        if (currentSection) {
          contentBuffer.push(text);
        }
      }
    }
  }

  flushCurrentSection();

  return sections;
}
