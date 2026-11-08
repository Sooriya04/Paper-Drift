/**
 * @file src/markdown/typography.js
 * @description Dynamic typography hierarchy and relative font size ratio classification.
 * Computes body font mode and identifies headings, captions, and footnotes mathematically.
 * Part of paper-drift - https://github.com/Sooriya04/Paper-Drift
 */

export const SECTION_NUMBER_REGEX = /^(?:\d+(?:\.\d+)*\.?|[A-Z](?:\.\d+)+\.?|[IVXLCDM]+\.?)\s+\p{Lu}/u;
export const SUBSECTION_REGEX = /^(?:\d+\.\d+\.?|[A-Z]\.\d+\.?)\s+\p{Lu}/u;
export const SUBSUBSECTION_REGEX = /^(?:\d+\.\d+\.\d+(?:\.\d+)*\.?)\s+\p{Lu}/u;
export const CAPTION_REGEX = /^(?:table|figure|fig\.|chart|exhibit|panel)\s+[A-Z]?\d+(?:[.-]\d+)*[a-z]?[:.]/i;
export const RUNIN_HEADING_REGEX = /^[A-Z0-9][A-Za-z0-9\s—–-]{0,35}:$/;

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
 * @param {number} [pageIndex=0] - 0-indexed page number
 * @returns {'title'|'h1'|'h2'|'h3'|'h4'|'caption'|'footnote'|'margin_artifact'|'body'}
 */
export function classifyTypography(line, bodyMode, pageHeight = 792, pageIndex = 0) {
  if (!line) return 'body';
  const size = (line.font && typeof line.font.size === 'number')
    ? line.font.size
    : (typeof line.fontSize === 'number' ? line.fontSize : (line.height || bodyMode));
  const ratio = size / bodyMode;
  const isBold = Boolean(line.font?.isBold);
  const text = (line.text || '').trim();
  if (!text) return 'body';
  const wordCount = text.split(/\s+/).filter(Boolean).length;

  // Margin running artifact check: vertical line or header/footer in outer margin
  if (line.left < 45 && line.height > line.width * 2) {
    return 'margin_artifact';
  }

  // Figure / Table Caption
  if (CAPTION_REGEX.test(text)) {
    return 'caption';
  }

  // Footnote: ratio <= 0.85x bodyMode and in bottom 45% of page
  if (ratio <= 0.85 && typeof line.top === 'number' && line.top >= pageHeight * 0.55) {
    return 'footnote';
  }

  // Major Title:
  // 1) Explicit large ratio >= 1.6 and <= 20 words
  // 2) On page 1 (pageIndex === 0) in top 35% of page with ratio >= 1.35 and wordCount <= 20
  const isTopRegion = typeof line.top === 'number' ? line.top <= pageHeight * 0.35 : true;
  if (pageIndex === 0 && isTopRegion && wordCount <= 20) {
    if (ratio >= 1.55) {
      return 'title';
    }
    if (isBold && ratio >= 1.35) {
      return 'title';
    }
  } else if (ratio >= 1.6 && wordCount <= 20) {
    return 'title';
  }

  // H3 (Sub-sub-section): e.g. 3.2.1 Scaled Dot-Product Attention
  if (SUBSUBSECTION_REGEX.test(text) && wordCount <= 16 && (ratio >= 0.95 || isBold)) {
    return 'h3';
  }

  // H2 (Sub-section): e.g. 3.1 Encoder and Decoder Stacks, 4.1 LOW-RANK-...
  if (SUBSECTION_REGEX.test(text) && wordCount <= 14 && (ratio >= 0.95 || isBold)) {
    return 'h2';
  }

  // H1 (Major Section): e.g. 1 Introduction, Abstract, References, Methods
  // Must be either:
  // - Clear section number (1 Introduction, IV. Methods) with ratio >= 1.08
  // - Bold with ratio >= 1.15 and wordCount <= 14
  // - Very large heading with ratio >= 1.25 and wordCount <= 14
  const isNumberedMajor = SECTION_NUMBER_REGEX.test(text) && ratio >= 1.08;
  const isBoldMajor = isBold && ratio >= 1.15;
  const isLargeMajor = ratio >= 1.25 && wordCount <= 14;
  if ((isNumberedMajor || isBoldMajor || isLargeMajor) && wordCount <= 16) {
    return 'h1';
  }

  // H4 / Run-in heading: short bold line ending in colon or short bold subhead
  if (isBold && RUNIN_HEADING_REGEX.test(text)) {
    return 'h4';
  }

  return 'body';
}
