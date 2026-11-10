/**
 * @file src/metadata/references.js
 * @description Extracts and parses bibliography entries into structured records:
 * authors, title, venue, year, DOI, URL, while preserving the raw text and provenance.
 * Part of paper-drift - https://github.com/Sooriya04/Paper-Drift
 */

const DOI_REGEX = /\b(10\.\d{4,9}\/[-._;()/:A-Za-z0-9]+)\b/;
const URL_REGEX = /(https?:\/\/[^\s"'<>]+)/;
const YEAR_REGEX = /\b(19\d{2}|20\d{2})\b/;
const BRACKET_NUM_REGEX = /^\[([0-9]+|[a-zA-Z0-9+]+)\]\s*/;

/**
 * Extracts and parses structured references from raw pages data.
 *
 * @param {Array<Object>} rawPagesData - Page data with text lines
 * @returns {Array<Object>} List of structured reference objects
 */
export function extractStructuredReferences(rawPagesData) {
  // 1. Locate the Reference section start
  let refPageIdx = -1;
  let refLineIdx = -1;

  for (let p = 0; p < rawPagesData.length; p++) {
    const lines = rawPagesData[p].lines || [];
    for (let l = 0; l < lines.length; l++) {
      const text = lines[l].text.trim().toLowerCase();
      if (/^(?:\d+\.?\s+)?(?:references|bibliography)\b/.test(text)) {
        refPageIdx = p;
        refLineIdx = l;
        break;
      }
    }
    if (refPageIdx !== -1) break;
  }

  if (refPageIdx === -1) {
    return [];
  }

  // 2. Collect lines following reference start until appendix or end of document
  const collectedItems = [];
  let currentRaw = '';
  let currentBboxes = [];
  let currentPage = rawPagesData[refPageIdx].pageNumber;

  for (let p = refPageIdx; p < rawPagesData.length; p++) {
    const page = rawPagesData[p];
    const lines = page.lines || [];
    const startL = (p === refPageIdx) ? refLineIdx + 1 : 0;

    for (let l = startL; l < lines.length; l++) {
      const line = lines[l];
      const text = line.text.trim();
      if (!text) continue;

      // Check if appendix started
      if (/^(?:\d+\.?\s+)?appendix\b/i.test(text) && currentRaw.length > 0) {
        break;
      }

      // Check if new numbered reference starts: [1] or [Vas17] or "1."
      const isNewRef = BRACKET_NUM_REGEX.test(text) || /^\d+\.\s+[A-Z]/.test(text);

      if (isNewRef) {
        if (currentRaw) {
          collectedItems.push({
            raw: currentRaw.trim(),
            page: currentPage,
            bboxes: currentBboxes
          });
        }
        currentRaw = text;
        currentBboxes = [line.bbox || [line.left, line.top, line.left + line.width, line.top + line.height]];
        currentPage = page.pageNumber;
      } else {
        if (currentRaw) {
          currentRaw += ' ' + text;
          currentBboxes.push(line.bbox || [line.left, line.top, line.left + line.width, line.top + line.height]);
        } else {
          // If first item doesn't have [1], start it
          currentRaw = text;
          currentBboxes = [line.bbox || [line.left, line.top, line.left + line.width, line.top + line.height]];
          currentPage = page.pageNumber;
        }
      }
    }
  }

  if (currentRaw) {
    collectedItems.push({
      raw: currentRaw.trim(),
      page: currentPage,
      bboxes: currentBboxes
    });
  }

  // 3. Decompose each reference into structured fields
  const structuredRefs = [];
  let index = 1;

  for (const item of collectedItems) {
    const parsed = parseSingleReference(item.raw, index++);
    parsed.page = item.page;
    structuredRefs.push(parsed);
  }

  return structuredRefs;
}

/**
 * Parses a single reference raw text string into structured fields.
 *
 * @param {string} raw - Raw reference text
 * @param {number} index - Index order
 * @returns {Object} Structured reference
 */
export function parseSingleReference(raw, index) {
  let cleaned = raw.replace(BRACKET_NUM_REGEX, '').trim();

  // DOI extraction
  let doi = null;
  const doiMatch = DOI_REGEX.exec(cleaned);
  if (doiMatch) {
    doi = doiMatch[1];
  }

  // URL extraction
  let url = null;
  const urlMatch = URL_REGEX.exec(cleaned);
  if (urlMatch) {
    url = urlMatch[1];
  }

  // Year extraction
  let year = null;
  const yearMatch = YEAR_REGEX.exec(cleaned);
  if (yearMatch) {
    year = parseInt(yearMatch[1], 10);
  }

  // Author & Title extraction
  // Standard format: Authors. Title. Venue, Year.
  let authors = [];
  let title = null;
  let venue = null;

  const dotParts = cleaned.split(/\.\s+/);
  if (dotParts.length >= 2) {
    // First part is usually authors
    const rawAuthors = dotParts[0];
    authors = rawAuthors
      .replace(/\band\b/gi, ',')
      .split(',')
      .map(a => a.trim())
      .filter(a => a.length > 1 && !/^\d+$/.test(a));

    title = dotParts[1].trim();

    if (dotParts.length >= 3) {
      venue = dotParts.slice(2).join('. ').trim();
      // Remove trailing period or year
      venue = venue.replace(/\.\s*$/, '').trim();
    }
  } else {
    title = cleaned;
  }

  return {
    index,
    raw,
    authors: authors.length > 0 ? authors : ['Unknown'],
    title: title || cleaned,
    venue: venue || null,
    year: year || null,
    doi: doi || null,
    url: url || null
  };
}
