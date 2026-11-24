/**
 * @file src/bundle/sections.js
 * @description Extracts flattened, RAG-optimized section chunks with content slices,
 * preserving vector tables and LaTeX math formulas.
 * Part of paper-drift - https://github.com/Sooriya04/Paper-Drift
 */

import { extractPageAtomicBlocks } from '../rag/blocks.js';
import { reconstructTables } from '../tables/grid.js';

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

  const sections = [];
  let currentSection = null;
  const contentBuffer = [];

  function flushCurrentSection() {
    if (currentSection) {
      currentSection.content = contentBuffer.join('\n\n').trim();
      sections.push(currentSection);
      contentBuffer.length = 0;
    }
  }

  for (const page of rawPagesData) {
    const tables = page.tables || reconstructTables(page.rules || [], page.lines || [], page.width, page.height);
    const blocks = extractPageAtomicBlocks({
      pageNumber: page.pageNumber,
      width: page.width,
      height: page.height,
      lines: page.lines,
      tables,
      mathItems: page.mathItems,
      claimedLineIndices: page.claimedLineIndices
    });

    for (const b of blocks) {
      if (b.type === 'heading') {
        flushCurrentSection();
        currentSection = {
          title: b.content,
          level: b.level || 1,
          page: b.page,
          content: ''
        };
      } else if (currentSection && b.content) {
        contentBuffer.push(b.content);
      }
    }
  }

  flushCurrentSection();
  return sections;
}
