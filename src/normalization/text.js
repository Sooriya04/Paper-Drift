/**
 * @file src/normalization/text.js
 * @description Modular, zero-dependency text normalization pipeline for Paper-Drift.
 * Provides ligature cleanup, hyphenation repair, whitespace normalization,
 * running headers/footers filtering, and composite page text normalization.
 * Part of paper-drift - https://github.com/Sooriya04/Paper-Drift
 */

// Common compound prefix patterns where trailing hyphen split across lines is legitimate
const COMPOUND_PREFIXES = new Set([
  'well', 'self', 'state-of', 'cross', 'all', 'multi', 'non', 'pre', 'post',
  'sub', 're', 'co', 'semi', 'quasi', 'pseudo', 'inter', 'intra',
  'fine', 'low', 'high', 'out', 'end-to', 'few', 'zero', 'single', 'first',
  'wide', 'short', 'long', 'large', 'deep', 'real', 'open', 'full', 'free', 'scale'
]);

// Single words starting with compound-like prefixes that should be joined without hyphen
const JOINED_SINGLE_WORDS = new Set([
  'conditioning', 'interact', 'interaction', 'interactions', 'interest',
  'interesting', 'interestingly', 'intermediate', 'international', 'internet',
  'interpret', 'interpretable', 'interpretation', 'multiplicative', 'multiple',
  'multiplied', 'multiply', 'outperform', 'outperforms', 'output', 'outputs',
  'outside', 'predict', 'predictable', 'predicted', 'prediction', 'predictions',
  'predicts', 'preference', 'preferences', 'prevent', 'preventing', 'previous',
  'previously', 'produce', 'reconstruction', 'reconstructed', 'reconstruct',
  'recognition', 'recommendation', 'recommendations', 'recover', 'recoverable',
  'recovery', 'recurrence', 'recurrent', 'recurrents', 'reduce', 'reduced',
  'reference', 'referenced', 'references', 'refinement', 'reflection', 'reflections',
  'reformulation', 'regression', 'regularization', 'reinforce', 'reinforced',
  'reinforcement', 'reiterate', 'relate', 'related', 'relations', 'relationship',
  'relationships', 'relative', 'relatively', 'relaxation', 'relax', 'relevance',
  'relevant', 'reliability', 'reliable', 'relies', 'rely', 'remain', 'remainder',
  'remaining', 'remains', 'remarkable', 'remarkably', 'remember', 'remembered',
  'reminder', 'removal', 'removable', 'remove', 'removed', 'removes', 'render',
  'rendered', 'rendering', 'renders', 'repeat', 'repeated', 'repeating', 'repeats',
  'repetition', 'repetitions', 'repetitive', 'replace', 'replaced', 'replacement',
  'replacements', 'replacing', 'replicate', 'replicated', 'replication', 'replies',
  'reply', 'report', 'reported', 'reports', 'represent', 'representation',
  'representations', 'represents', 'reproduce', 'require', 'required', 'requirement',
  'requirements', 'research', 'resemble', 'resemblance', 'resembles', 'resembling',
  'residual', 'residuals', 'resolution', 'resolutions', 'resolve', 'resolved',
  'resolving', 'resource', 'resources', 'respect', 'respective', 'respectively',
  'response', 'responses', 'responsible', 'restore', 'restoration', 'restored',
  'restoring', 'restriction', 'restrictions', 'result', 'results', 'resume',
  'resumed', 'resuming', 'retain', 'retained', 'retaining', 'retention',
  'rethinking', 'retrieval', 'retrieve', 'retrieved', 'return', 'returned',
  'returning', 'returns', 'reveal', 'revealed', 'revealing', 'reveals',
  'review', 'reviews', 'revise', 'revised', 'revision', 'revisions', 'reward',
  'rewarding', 'rewards', 'rewired', 'rewrite', 'rewrites', 'rewriting',
  'shortcut', 'shortcuts', 'subsequently', 'substantially', 'understand', 'understanding'
]);

// Ligatures mapping table (PDF typographic ligatures & standard Latin ligatures)
const LIGATURE_MAP = {
  '\u0132': 'IJ',
  '\u0133': 'ij',
  '\uFB00': 'ff',
  '\uFB01': 'fi',
  '\uFB02': 'fl',
  '\uFB03': 'ffi',
  '\uFB04': 'ffl',
  '\uFB05': 'ft',
  '\uFB06': 'st',
  '\uFB07': 'ij'
};

const LIGATURE_REGEX = /[\u0132\u0133\uFB00-\uFB07]/g;

// Smart quote mappings: standard ASCII single and double quotes, including curly and guillemet variants
const SMART_QUOTES_REGEX = /[\u2018\u2019\u201A\u201B\u2039\u203A\u02BC\u02BD]|[\u201C\u201D\u201E\u201F\u00AB\u00BB]/g;

/**
 * Replaces typographic ligatures and normalizes smart quotes while preserving mathematical symbols.
 * ponytail: Fast regex lookups normalize typographic ligatures and smart/curly quotes without corrupting math/Greek.
 *
 * @param {string} text - Raw input text.
 * @returns {string} Text with normalized ligatures and quotes.
 */
export function cleanLigatures(text) {
  if (!text || typeof text !== 'string') return '';

  // Replace standard PDF and Latin typographic ligatures
  let cleaned = text.replace(LIGATURE_REGEX, match => LIGATURE_MAP[match] || match);

  // Normalize curly / smart quotes and apostrophes to standard ASCII
  cleaned = cleaned.replace(SMART_QUOTES_REGEX, match => {
    return (match === '"' || match === '\u201C' || match === '\u201D' || match === '\u201E' || match === '\u201F' || match === '\u00AB' || match === '\u00BB')
      ? '"'
      : "'";
  });

  return cleaned;
}

/**
 * Repairs words split across line breaks by hyphens while preserving legitimate compounds and markdown bullet items.
 * Handles ASCII hyphens, Unicode hyphens (U+2010, U+2011), and soft hyphens (U+00AD).
 * Preserves compound words (multi-column, state-of-the-art, high-level, fine-tuning) while rejoining split words
 * (trans-former -> transformer, re-sults -> results).
 *
 * @param {string} text - Input text with potential line-split words.
 * @returns {string} Text with healed hyphenated words.
 */
export function repairHyphenation(text) {
  if (!text || typeof text !== 'string') return '';

  // Remove soft hyphens within lines (discretionary hyphens that are not line breaks)
  let cleaned = text.replace(/\u00AD(?!\r?\n)/g, '');

  // Match: word-like token followed by hyphen/soft-hyphen + newline + subsequent word-like token
  return cleaned.replace(/([a-zA-Z0-9]+(?:-[a-zA-Z0-9]+)*)[-\u2010\u2011\u00AD]\r?\n[^\S\r\n]*([a-zA-Z0-9]+)/g, (match, prefix, suffix) => {
    const prefLower = prefix.toLowerCase();
    const suffLower = suffix.toLowerCase();
    const joinedLower = prefLower + suffLower;
    const lastWord = prefLower.includes('-') ? prefLower.split('-').pop() : prefLower;

    // 1. If prefix already contains an intentional hyphen (e.g. end-to, state-of, left-to), preserve
    if (prefix.includes('-')) {
      return `${prefix}-${suffix}`;
    }

    // 2. If it resolves to a known single-word (e.g. re-sults -> results, pre-vious -> previous, multi-plicative -> multiplicative)
    if (JOINED_SINGLE_WORDS.has(joinedLower)) {
      return `${prefix}${suffix}`;
    }

    // 3. Suffix starts with an uppercase letter indicating a compound proper noun (e.g. Berkeley-Parser, Cloud-TPU, DeepSeek-V3)
    // Avoid re-joining unless both prefix and suffix are ALL-CAPS acronym fragments (e.g. LAN-GUAGE -> LANGUAGE)
    if (/^[A-Z]/.test(suffix) && !(/^[A-Z]+$/.test(prefix) && /^[A-Z]+$/.test(suffix))) {
      return `${prefix}-${suffix}`;
    }

    // 4. Known compound prefixes (e.g. multi-column, state-of-the-art, fine-tuning, cross-attention, well-known)
    if (COMPOUND_PREFIXES.has(prefLower) || COMPOUND_PREFIXES.has(lastWord)) {
      return `${prefix}-${suffix}`;
    }

    // 5. Default: line-break hyphen is a typographic word-wrap split, join directly
    return `${prefix}${suffix}`;
  });
}

/**
 * Normalizes horizontal and vertical whitespace.
 * Replaces Unicode non-breaking & wide spaces, collapses horizontal whitespace, trims lines,
 * and collapses 3+ newlines down to 2.
 *
 * @param {string} text - Input text.
 * @returns {string} Cleaned text with normalized whitespace.
 */
export function normalizeWhitespace(text, options = {}) {
  if (!text || typeof text !== 'string') return '';

  const preserveIndent = options.preserveIndent === true;

  return text
    // Replace Unicode space variants, zero-width spaces/BOM, line separators (U+2028/U+2029)
    .replace(/[\u00A0\u1680\u2000-\u200A\u2028\u2029\u202F\u205F\u3000\uFEFF]/g, m => {
      return (m === '\u2028' || m === '\u2029') ? '\n' : (m === '\uFEFF' ? '' : ' ');
    })
    // Strip zero-width non-joiner / joiner if not needed or zero-width spaces
    .replace(/[\u200B-\u200D]/g, '')
    // Collapse 3 or more consecutive newlines down to 2
    .replace(/\n{3,}/g, '\n\n')
    .split('\n')
    .map(line => {
      if (preserveIndent) {
        const indentMatch = line.match(/^([^\S\r\n]*)(.*)$/);
        const indent = indentMatch ? indentMatch[1] : '';
        const rest = indentMatch ? indentMatch[2].replace(/[^\S\r\n]+/g, ' ').trim() : '';
        return rest ? indent + rest : '';
      }
      // Preserve list indentation (e.g. "  - Subitem")
      const listIndentMatch = line.match(/^([^\S\r\n]{2,})([-*•]|\d+\.)\s+(.*)$/);
      if (listIndentMatch) {
        const indent = listIndentMatch[1];
        const marker = listIndentMatch[2];
        const rest = listIndentMatch[3].replace(/[^\S\r\n]+/g, ' ').trim();
        return `${indent}${marker} ${rest}`;
      }
      return line.replace(/[^\S\r\n]+/g, ' ').trim();
    })
    .join('\n')
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
  text = normalizeWhitespace(text, options);

  return text;
}
