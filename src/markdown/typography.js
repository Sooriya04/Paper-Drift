/**
 * @file src/markdown/typography.js
 * @description Dynamic typography hierarchy and relative font size ratio classification.
 * Computes body font mode and identifies headings, captions, and footnotes mathematically.
 * Part of paper-drift - https://github.com/Sooriya04/Paper-Drift
 */

export const SECTION_NUMBER_REGEX = /^(?:\d+(?:\.\d+)*\.?|[A-Z](?:\.\d+)+\.?|[IVXLCDM]+\.?)\s+\p{Lu}/u;
export const CAPTION_REGEX = /^(?:table|figure|fig\.|chart|exhibit|panel)\s+[A-Z]?\d+(?:[.-]\d+)*[a-z]?[:.]/i;

/**
 * Calculates the statistical mode (most frequent size weighted by character length) of body text.
 *
 * @param {Array<Object>} lines - Text lines with font metrics
 * @returns {number} Body font size mode in points (e.g. 10.0)
 */
export function calculateBodyFontSizeMode(lines) {
  if (!lines || lines.length === 0) return 10.0;

  const counts = new Map();
  for (const line of lines) {
    const rawSize = (line.font && typeof line.font.size === 'number')
      ? line.font.size
      : (typeof line.fontSize === 'number' ? line.fontSize : (line.height || 10));
    const size = Math.round(rawSize * 10) / 10;
    if (size > 0) {
      const weight = (line.text && line.text.length) ? line.text.length : 1;
      counts.set(size, (counts.get(size) || 0) + weight);
    }
  }

  let modeSize = 10.0;
  let maxWeight = 0;
  for (const [size, weight] of counts.entries()) {
    if (weight > maxWeight) {
      maxWeight = weight;
      modeSize = size;
    }
  }

  return modeSize;
}

/**
 * Classifies a line of text into a semantic typographical category.
 *
 * @param {Object} line - Text line object
 * @param {number} bodyMode - Body font size mode
 * @param {number} [pageHeight=792] - Page height in points
 * @returns {'title'|'h1'|'h2'|'caption'|'footnote'|'body'}
 */
export function classifyTypography(line, bodyMode, pageHeight = 792) {
  if (!line) return 'body';
  const size = (line.font && typeof line.font.size === 'number')
    ? line.font.size
    : (typeof line.fontSize === 'number' ? line.fontSize : (line.height || bodyMode));
  const ratio = size / bodyMode;
  const text = (line.text || '').trim();
  if (!text) return 'body';
  const wordCount = text.split(/\s+/).filter(Boolean).length;

  // Major Title: ratio >= 1.6x bodyMode and short (<= 20 words)
  if (ratio >= 1.6 && wordCount <= 20) {
    return 'title';
  }

  // Major Section: ratio >= 1.25x bodyMode and <= 16 words
  if (ratio >= 1.25 && wordCount <= 16) {
    return 'h1';
  }

  // Numbered Sub-section: ratio >= 1.05x bodyMode with section numbering and <= 14 words
  if (ratio >= 1.05 && SECTION_NUMBER_REGEX.test(text) && wordCount <= 14) {
    return 'h2';
  }

  // Figure / Table Caption
  if (CAPTION_REGEX.test(text)) {
    return 'caption';
  }

  // Footnote: ratio <= 0.85x bodyMode and in bottom 45% of page
  if (ratio <= 0.85 && typeof line.top === 'number' && line.top >= pageHeight * 0.55) {
    return 'footnote';
  }

  return 'body';
}
