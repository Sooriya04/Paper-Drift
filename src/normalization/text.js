/**
 * @file src/normalization/text.js
 * @description Modular, zero-dependency text normalization pipeline for Paper-Drift.
 * Provides ligature cleanup, hyphenation repair, whitespace normalization,
 * running headers/footers filtering, and composite page text normalization.
 * Part of paper-drift - https://github.com/Sooriya04/Paper-Drift
 */

// Common compound prefix patterns where trailing hyphen split across lines is legitimate
const COMPOUND_PREFIX_REGEX = /^(?:well|self|state-of|cross|all|multi|non|pre|post|sub|re|co|semi|quasi|pseudo|inter|intra)$/i;

/**
 * Replaces typographic ligatures and normalizes smart quotes while preserving mathematical symbols.
 * ponytail: NFKC handles general unicode canonical decomposition; manual mappings protect domain ligatures & quotes.
 *
 * @param {string} text - Raw input text.
 * @returns {string} Text with normalized ligatures and quotes.
 */
export function cleanLigatures(text) {
  if (!text || typeof text !== 'string') return '';

  const ligatures = {
    '\uFB00': 'ff',
    '\uFB01': 'fi',
    '\uFB02': 'fl',
    '\uFB03': 'ffi',
    '\uFB04': 'ffl',
    '\uFB05': 'ft',
    '\uFB06': 'st'
  };

  // Replace standard PDF typographic ligatures
  let cleaned = text.replace(/[\uFB00-\uFB06]/g, match => ligatures[match] || match);

  // Normalize curly / smart quotes and apostrophes to standard ASCII
  cleaned = cleaned
    .replace(/[\u2018\u2019\u201A\u201B]/g, "'")
    .replace(/[\u201C\u201D\u201E\u201F]/g, '"');

  return cleaned;
}

/**
 * Repairs words split across line breaks by hyphens while preserving legitimate compounds and markdown bullet items.
 * ponytail: Regex matches word-like prefix followed by hyphen and newline. Checks compound prefixes to preserve hyphens.
 *
 * @param {string} text - Input text with potential line-split words.
 * @returns {string} Text with healed hyphenated words.
 */
export function repairHyphenation(text) {
  if (!text || typeof text !== 'string') return '';

  // Match: word characters immediately before hyphen + newline + following word characters
  // Avoid matching markdown bullets (e.g., newline followed by - or * or whitespace before -)
  return text.replace(/([a-zA-Z0-9]+(?:-[a-zA-Z0-9]+)*)-\n\s*([a-zA-Z0-9]+)/g, (match, prefix, suffix) => {
    // If the prefix ends with or matches a known compound pattern, preserve the hyphen
    const lastWord = prefix.includes('-') ? prefix.split('-').pop() : prefix;
    if (COMPOUND_PREFIX_REGEX.test(prefix) || COMPOUND_PREFIX_REGEX.test(lastWord)) {
      return `${prefix}-${suffix}`;
    }
    // Otherwise join directly (e.g. trans- \n former -> transformer)
    return `${prefix}${suffix}`;
  });
}

/**
 * Normalizes horizontal and vertical whitespace.
 * Collapses multiple horizontal spaces/tabs, trims each line, and collapses 3+ newlines to 2.
 * ponytail: Fast regex passes over string rather than line-by-line arrays.
 *
 * @param {string} text - Input text.
 * @returns {string} Cleaned text with normalized whitespace.
 */
export function normalizeWhitespace(text) {
  if (!text || typeof text !== 'string') return '';

  return text
    // Replace non-breaking spaces with standard space
    .replace(/[\u00A0\u2000-\u200A\u202F\u205F]/g, ' ')
    // Collapse horizontal whitespace (spaces/tabs) to a single space per line
    .replace(/[^\S\r\n]+/g, ' ')
    // Trim spaces at the start and end of each line
    .split('\n')
    .map(line => line.trim())
    .join('\n')
    // Collapse 3 or more consecutive newlines down to 2
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Detects and filters recurring running headers and footers across pages.
 * Detects identical top/bottom lines appearing on 2+ pages or standalone page number patterns.
 * ponytail: Frequency map over first/last non-empty line of each page.
 *
 * @param {Array<{page: number, content: string}>} pages - Array of page objects.
 * @param {Object} [options={}] - Filter options.
 * @param {boolean} [options.strip=true] - Whether to remove detected running headers/footers.
 * @returns {Array<{page: number, content: string}>} Filtered pages.
 */
export function filterRunningHeadersFooters(pages, options = {}) {
  if (!Array.isArray(pages) || pages.length === 0) return [];
  const strip = options.strip !== false;
  if (!strip) return pages;

  // Track occurrences of candidate header (first line) and footer (last line)
  const headerCounts = new Map();
  const footerCounts = new Map();

  const parsedPages = pages.map(p => {
    const lines = (p.content || '').split('\n').map(l => l.trim()).filter(Boolean);
    return {
      ...p,
      firstLine: lines[0] || null,
      lastLine: lines.length > 1 ? lines[lines.length - 1] : null
    };
  });

  for (const p of parsedPages) {
    if (p.firstLine) {
      headerCounts.set(p.firstLine, (headerCounts.get(p.firstLine) || 0) + 1);
    }
    if (p.lastLine) {
      footerCounts.set(p.lastLine, (footerCounts.get(p.lastLine) || 0) + 1);
    }
  }

  // Regex to detect standalone page numbers like "1", "Page 1", "Page 1 of 10", "1 / 10", "- 1 -"
  const PAGE_NUMBER_REGEX = /^(?:page\s+)?\d+(?:\s*(?:of|\/)\s*\d+)?$|^-\s*\d+\s*-$/i;

  return pages.map((p, idx) => {
    const lines = (p.content || '').split('\n').map(l => l.trim());
    if (lines.length === 0) return p;

    let startIndex = 0;
    let endIndex = lines.length;

    // Check header (first line)
    if (lines[startIndex] !== undefined) {
      const top = lines[startIndex];
      const isRepeatedHeader = (headerCounts.get(top) || 0) >= 2;
      const isPageNum = PAGE_NUMBER_REGEX.test(top);
      if (isRepeatedHeader || isPageNum) {
        startIndex++;
      }
    }

    // Check footer (last line)
    if (endIndex > startIndex) {
      const bottom = lines[endIndex - 1];
      const isRepeatedFooter = (footerCounts.get(bottom) || 0) >= 2;
      const isPageNum = PAGE_NUMBER_REGEX.test(bottom);
      if (isRepeatedFooter || isPageNum) {
        endIndex--;
      }
    }

    const filteredLines = lines.slice(startIndex, endIndex);
    return {
      ...p,
      content: filteredLines.join('\n').trim()
    };
  });
}

/**
 * Top-level normalizer composing cleanLigatures, repairHyphenation, and normalizeWhitespace.
 * ponytail: Pipeline composition: ligatures -> hyphenation -> whitespace.
 *
 * @param {string} rawText - Raw input text from PDF extractor.
 * @param {Object} [options={}] - Normalization options.
 * @returns {string} Fully normalized clean text.
 */
export function normalizePageText(rawText, options = {}) {
  if (!rawText || typeof rawText !== 'string') return '';

  let text = cleanLigatures(rawText);
  text = repairHyphenation(text);
  text = normalizeWhitespace(text);

  return text;
}
