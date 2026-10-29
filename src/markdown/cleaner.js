/**
 * @file src/markdown/cleaner.js
 * @description Unicode sanitizer, homoglyph transliteration, and invisible character stripping.
 * Cleans extracted PDF text to avoid token corruption, zero-width attacks, and broken markup.
 * Part of paper-drift - https://github.com/Sooriya04/Paper-Drift
 */

// Common Cyrillic and Greek homoglyphs mapped to ASCII equivalents
const HOMOGLYPH_MAP = {
  // Cyrillic uppercase
  '\u0410': 'A',
  '\u0412': 'B',
  '\u0421': 'C',
  '\u0415': 'E',
  '\u041D': 'H',
  '\u0406': 'I',
  '\u0408': 'J',
  '\u041A': 'K',
  '\u041C': 'M',
  '\u041E': 'O',
  '\u0420': 'P',
  '\u0405': 'S',
  '\u0422': 'T',
  '\u0425': 'X',
  '\u0423': 'Y',
  '\u04AE': 'Y',

  // Cyrillic lowercase
  '\u0430': 'a',
  '\u0441': 'c',
  '\u0435': 'e',
  '\u0456': 'i',
  '\u0458': 'j',
  '\u043A': 'k',
  '\u043E': 'o',
  '\u0440': 'p',
  '\u0455': 's',
  '\u0445': 'x',
  '\u0443': 'y',
  '\u04AF': 'y',

  // Greek uppercase
  '\u0391': 'A',
  '\u0392': 'B',
  '\u0395': 'E',
  '\u0396': 'Z',
  '\u0397': 'H',
  '\u0399': 'I',
  '\u039A': 'K',
  '\u039C': 'M',
  '\u039D': 'N',
  '\u039F': 'O',
  '\u03A1': 'P',
  '\u03A4': 'T',
  '\u03A5': 'Y',
  '\u03A7': 'X',

  // Greek lowercase
  '\u03BF': 'o'
};

const HOMOGLYPH_REGEX = /[\u0410\u0412\u0421\u0415\u041D\u0406\u0408\u041A\u041C\u041E\u0420\u0405\u0422\u0425\u0423\u04AE\u0430\u0441\u0435\u0456\u0458\u043A\u043E\u0440\u0455\u0445\u0443\u04AF\u0391\u0392\u0395\u0396\u0397\u0399\u039A\u039C\u039D\u039F\u03A1\u03A4\u03A5\u03A7\u03BF]/g;

// Dangerous invisible zero-width chars, soft hyphens, and bidi overrides
const DANGEROUS_INVISIBLE_REGEX = /[\u200B-\u200F\uFEFF\u00AD\u202A-\u202E\u2066-\u2069]/g;

// Space-like characters (non-breaking spaces, em/en spaces)
const SPACE_LIKE_REGEX = /[\u00A0\u1680\u2000-\u200A\u202F\u205F\u3000]/g;

/**
 * Transliterates common homoglyphs into Latin ASCII counterparts.
 * @param {string} text
 * @returns {string}
 */
export function transliterateHomoglyphs(text) {
  if (!text) return '';
  return text.replace(HOMOGLYPH_REGEX, match => HOMOGLYPH_MAP[match] || match);
}

/**
 * Normalizes smart quotes, apostrophes, and dashes into plain ASCII / Markdown equivalents.
 * @param {string} text
 * @returns {string}
 */
export function normalizeSmartPunctuation(text) {
  if (!text) return '';
  return text
    .replace(/[\u2018\u2019\u201A\u201B]/g, "'")
    .replace(/[\u201C\u201D\u201E\u201F\u00AB\u00BB]/g, '"')
    .replace(/[\u2013\u2014\u2015]/g, '--')
    .replace(/\u2026/g, '...');
}

/**
 * Decodes standard HTML entities into plain characters.
 * @param {string} text
 * @returns {string}
 */
export function decodeHtmlEntities(text) {
  if (!text) return '';
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;|&#x27;/g, "'")
    .replace(/&nbsp;|&#160;/g, ' ');
}

/**
 * Cleans extracted text by stripping invisible artifacts and normalizing characters.
 *
 * @param {string} text
 * @param {Object} [options={}]
 * @param {boolean} [options.transliterate=true]
 * @returns {string}
 */
export function cleanText(text, options = {}) {
  if (!text) return '';
  let out = decodeHtmlEntities(String(text));

  if (options.transliterate !== false) {
    out = transliterateHomoglyphs(out);
  }

  out = normalizeSmartPunctuation(out)
    .replace(DANGEROUS_INVISIBLE_REGEX, '')
    .replace(SPACE_LIKE_REGEX, ' ')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n');

  return out;
}
