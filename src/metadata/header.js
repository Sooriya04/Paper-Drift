/**
 * @file src/metadata/header.js
 * @description Extracts scientific frontmatter: Title, Subtitle, Authors, Affiliations,
 * Emails, Abstract, Keywords, DOI, Year, Venue, Publisher, Document Type.
 * Part of paper-drift - https://github.com/Sooriya04/Paper-Drift
 */

import { createProvenanceField, mergeBboxes } from './provenance.js';

const DOI_REGEX = /\b(10\.\d{4,9}\/[-._;()/:A-Za-z0-9]+)\b/;
const ARXIV_REGEX = /\barXiv:\s*(\d{4}\.\d{4,5}(?:v\d+)?)\b/i;
const YEAR_REGEX = /\b(19\d{2}|20\d{2})\b/;
const EMAIL_REGEX = /([a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+)/g;
const BRACKET_EMAIL_REGEX = /\{([^}]+)\}@([a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+)/g;

/**
 * Normalizes string whitespace and ligatures.
 */
function clean(str) {
  if (!str) return '';
  return str.replace(/\s+/g, ' ').trim();
}

/**
 * Extracts frontmatter scientific metadata from the first page(s) lines and text.
 *
 * @param {Array<Object>} rawPagesData - Raw page data with lines, links, bounds
 * @param {Map<string, any>} typographyMap - Typography classification from typography.js
 * @returns {Object} Extracted header metadata
 */
export function extractScientificHeader(rawPagesData, typographyMap) {
  if (!rawPagesData || rawPagesData.length === 0) {
    return createEmptyHeader();
  }

  const firstPage = rawPagesData[0];
  const lines = firstPage.lines || [];

  // 1. Identify Abstract Anchor & Boundaries
  let abstractStartIndex = -1;
  let abstractEndIndex = -1;
  let abstractBboxes = [];
  let abstractLines = [];

  for (let i = 0; i < lines.length; i++) {
    const text = lines[i].text.trim();
    if (/^(?:abstract|a\s*b\s*s\s*t\s*r\s*a\s*c\s*t)\b/i.test(text)) {
      abstractStartIndex = i;
      break;
    }
  }

  // Find end of abstract (Introduction, Index Terms, Keywords, or major heading)
  if (abstractStartIndex !== -1) {
    for (let i = abstractStartIndex + 1; i < lines.length; i++) {
      const text = lines[i].text.trim();
      if (/^(?:\d+\.?\s+)?introduction\b/i.test(text) ||
          /^(?:index\s+terms|keywords)\b/i.test(text) ||
          /^(?:i\.\s+introduction)\b/i.test(text)) {
        abstractEndIndex = i;
        break;
      }
    }
    if (abstractEndIndex === -1) {
      // Default to 15 lines max after abstract start or until end of page
      abstractEndIndex = Math.min(lines.length, abstractStartIndex + 20);
    }

    for (let i = abstractStartIndex; i < abstractEndIndex; i++) {
      const l = lines[i];
      abstractLines.push(l.text);
      if (l.bbox) abstractBboxes.push(l.bbox);
      else if (l.left !== undefined) abstractBboxes.push([l.left, l.top, l.left + l.width, l.top + l.height]);
    }
  }

  // Clean Abstract Text
  let rawAbstract = abstractLines.join(' ');
  rawAbstract = rawAbstract.replace(/^(?:abstract|a\s*b\s*s\s*t\s*r\s*a\s*c\s*t)[:.—\s]*/i, '');
  rawAbstract = clean(rawAbstract);

  const abstractField = rawAbstract
    ? createProvenanceField(rawAbstract, 'extracted', 1, mergeBboxes(abstractBboxes), 0.95)
    : createProvenanceField(null, 'unavailable');

  // 2. Title & Subtitle Extraction
  // Candidates: lines before abstractStartIndex with large font size or top position
  const preAbstractLimit = abstractStartIndex !== -1 ? abstractStartIndex : Math.min(lines.length, 12);
  const candidateTitleLines = [];

  let maxFontSize = 0;
  for (let i = 0; i < preAbstractLimit; i++) {
    const l = lines[i];
    const text = l.text.trim();
    if (!text) continue;
    // Skip typical header notices, arXiv stamps, or email lines at top
    if ((/arXiv:\d+\.\d+|preprint|under review|published in|conference/i.test(text) && l.top < 80) || (/@/.test(text) && /\.[a-z]{2,}/i.test(text))) {
      continue;
    }
    const size = l.font?.size || l.fontSize || l.height || 10;
    if (size > maxFontSize) {
      maxFontSize = size;
    }
  }

  // Collect lines matching near maxFontSize
  const titleBboxes = [];
  let foundTitle = false;
  let titleEndIndex = -1;

  for (let i = 0; i < preAbstractLimit; i++) {
    const l = lines[i];
    const text = l.text.trim();
    if (!text) continue;
    if ((/arXiv:\d+\.\d+|preprint|under review|published in|conference/i.test(text) && l.top < 80) || (/@/.test(text) && /\.[a-z]{2,}/i.test(text))) {
      continue;
    }
    const size = l.font?.size || l.fontSize || l.height || 10;
    if (size >= maxFontSize * 0.85) {
      candidateTitleLines.push(text);
      if (l.bbox) titleBboxes.push(l.bbox);
      else if (l.left !== undefined) titleBboxes.push([l.left, l.top, l.left + l.width, l.top + l.height]);
      foundTitle = true;
      titleEndIndex = i;
    } else if (foundTitle) {
      // Stopped seeing title-sized font
      break;
    }
  }

  let fullTitle = clean(candidateTitleLines.join(' '));
  let titleStr = fullTitle;
  let subtitleStr = null;

  if (fullTitle.includes(': ')) {
    const parts = fullTitle.split(': ');
    titleStr = parts[0].trim();
    subtitleStr = parts.slice(1).join(': ').trim();
  } else if (fullTitle.includes(' - ')) {
    const parts = fullTitle.split(' - ');
    titleStr = parts[0].trim();
    subtitleStr = parts.slice(1).join(' - ').trim();
  }

  const titleField = titleStr
    ? createProvenanceField(titleStr, 'extracted', 1, mergeBboxes(titleBboxes), 0.95)
    : createProvenanceField(null, 'unavailable');

  const subtitleField = subtitleStr
    ? createProvenanceField(subtitleStr, 'extracted', 1, mergeBboxes(titleBboxes), 0.90)
    : createProvenanceField(null, 'unavailable');

  // 3. Authors, Affiliations, Emails Extraction
  // Region: between titleEndIndex and abstractStartIndex
  const authorRegionLines = [];
  const authorBboxes = [];
  const authorStart = titleEndIndex !== -1 ? titleEndIndex + 1 : 1;
  const authorEnd = abstractStartIndex !== -1 ? abstractStartIndex : Math.min(lines.length, 18);

  for (let i = authorStart; i < authorEnd; i++) {
    const l = lines[i];
    const text = l.text.trim();
    if (!text) continue;
    authorRegionLines.push(text);
    if (l.bbox) authorBboxes.push(l.bbox);
    else if (l.left !== undefined) authorBboxes.push([l.left, l.top, l.left + l.width, l.top + l.height]);
  }

  const { authors, affiliations, emails } = parseAuthorBlock(authorRegionLines, authorBboxes);

  // 4. Keywords Extraction
  const keywords = extractKeywords(lines, firstPage);

  // 5. DOI, Publication Year, Venue, Publisher, Document Type
  const pubMeta = extractPublicationDetails(rawPagesData);

  return {
    version: '2.0.0',
    title: titleField,
    subtitle: subtitleField,
    authors,
    affiliations,
    emails,
    abstract: abstractField,
    keywords,
    doi: pubMeta.doi,
    year: pubMeta.year,
    venue: pubMeta.venue,
    publisher: pubMeta.publisher,
    documentType: pubMeta.documentType
  };
}

/**
 * Parses author lines into structured authors, affiliations, and emails.
 */
function parseAuthorBlock(lines, bboxes) {
  const emails = [];
  const affiliations = [];
  const rawAuthors = [];

  const affilKeywords = /\b(university|institute|college|department|laboratory|lab|technologies|inc\.|ltd\.|corp\.|google|microsoft|meta|openai|deepmind|amazon|research|center|centre|faculty)\b/i;

  for (const line of lines) {
    // Check bracket emails: {a, b}@c.com
    let match;
    while ((match = BRACKET_EMAIL_REGEX.exec(line)) !== null) {
      const names = match[1].split(',').map(n => n.trim());
      const domain = match[2].trim();
      names.forEach(n => emails.push(`${n}@${domain}`));
    }

    // Check normal emails
    while ((match = EMAIL_REGEX.exec(line)) !== null) {
      if (!emails.includes(match[1])) {
        emails.push(match[1]);
      }
    }

    // Check affiliation
    if (affilKeywords.test(line)) {
      // Strip superscript markers (*, numbers)
      const cleanedAffil = clean(line.replace(/^[\d*†‡§\s,]+/, ''));
      if (cleanedAffil.length > 3 && !affiliations.includes(cleanedAffil)) {
        affiliations.push(cleanedAffil);
      }
    } else if (!/@/.test(line)) {
      // Possible author line
      rawAuthors.push(line);
    }
  }

  // Parse structured author names
  const authorList = [];
  let order = 1;

  for (const authorLine of rawAuthors) {
    // Split by comma or 'and'
    const parts = authorLine
      .replace(/\band\b/gi, ',')
      .split(',')
      .map(p => p.trim())
      .filter(Boolean);

    for (const p of parts) {
      // Remove footnote marks like 1, 2, *, †, ‡
      const name = clean(p.replace(/[\d*†‡§^]/g, ''));
      if (name.length > 2 && !affilKeywords.test(name) && !/abstract/i.test(name)) {
        // Link any matching email or affiliation if possible
        const authorEmails = emails.filter(e => {
          const prefix = e.split('@')[0].toLowerCase();
          const nameParts = name.toLowerCase().split(' ');
          return nameParts.some(part => part.length > 2 && prefix.includes(part));
        });

        authorList.push({
          name,
          order: order++,
          affiliations: affiliations.length > 0 ? [affiliations[0]] : [],
          email: authorEmails[0] || null
        });
      }
    }
  }

  return {
    authors: authorList,
    affiliations,
    emails
  };
}

/**
 * Extracts keywords from page text or lines.
 */
function extractKeywords(lines, page) {
  const kwList = [];
  for (const l of lines) {
    const text = l.text.trim();
    const match = /^(?:keywords|index\s+terms)[:.—\s]+(.*)/i.exec(text);
    if (match && match[1]) {
      const tokens = match[1].split(/[;,•]/).map(t => clean(t)).filter(Boolean);
      kwList.push(...tokens);
    }
  }
  return kwList;
}

/**
 * Extracts DOI, Year, Venue, Publisher, Document Type from all pages data.
 */
function extractPublicationDetails(rawPagesData) {
  let doi = null;
  let doiPage = null;
  let doiBbox = null;

  let year = null;
  let yearPage = null;

  let venue = null;
  let publisher = null;
  let docType = 'preprint';

  // Check links first for DOI
  for (const p of rawPagesData) {
    if (p.links) {
      for (const l of p.links) {
        if (l.uri && DOI_REGEX.test(l.uri)) {
          const match = DOI_REGEX.exec(l.uri);
          doi = match[1];
          doiPage = p.pageNumber;
          doiBbox = l.bbox;
          break;
        }
      }
    }
    if (doi) break;
  }

  // Scan text lines for DOI, arXiv, Conference, Publisher
  for (const p of rawPagesData) {
    for (const l of p.lines) {
      const text = l.text;

      // DOI text check
      if (!doi && DOI_REGEX.test(text)) {
        const match = DOI_REGEX.exec(text);
        doi = match[1];
        doiPage = p.pageNumber;
        doiBbox = l.bbox;
      }

      // ArXiv check
      if (ARXIV_REGEX.test(text)) {
        docType = 'preprint';
        if (!publisher) publisher = 'arXiv';
      }

      // Venue / Conference / Publisher check
      if (/NeurIPS|Neural Information Processing Systems/i.test(text)) {
        venue = 'NeurIPS';
        publisher = 'Curran Associates, Inc.';
        docType = 'conference_paper';
      } else if (/ICLR|International Conference on Learning Representations/i.test(text)) {
        venue = 'ICLR';
        docType = 'conference_paper';
      } else if (/ICML|International Conference on Machine Learning/i.test(text)) {
        venue = 'ICML';
        docType = 'conference_paper';
      } else if (/CVPR|Computer Vision and Pattern Recognition/i.test(text)) {
        venue = 'CVPR';
        publisher = 'IEEE';
        docType = 'conference_paper';
      } else if (/IEEE/i.test(text) && !publisher) {
        publisher = 'IEEE';
        docType = 'journal_article';
      } else if (/ACM/i.test(text) && !publisher) {
        publisher = 'ACM';
      }

      // Year extraction from publication headers
      if (!year && (l.top < 80 || l.top > p.height - 80)) {
        const yMatch = YEAR_REGEX.exec(text);
        if (yMatch) {
          const yVal = parseInt(yMatch[1], 10);
          if (yVal >= 1970 && yVal <= 2030) {
            year = yVal;
            yearPage = p.pageNumber;
          }
        }
      }
    }
  }

  return {
    doi: doi ? createProvenanceField(doi, 'extracted', doiPage, doiBbox, 0.98) : createProvenanceField(null, 'unavailable'),
    year: year ? createProvenanceField(year, 'inferred', yearPage, null, 0.85) : createProvenanceField(null, 'unavailable'),
    venue: venue ? createProvenanceField(venue, 'inferred', 1, null, 0.85) : createProvenanceField(null, 'unavailable'),
    publisher: publisher ? createProvenanceField(publisher, 'inferred', 1, null, 0.80) : createProvenanceField(null, 'unavailable'),
    documentType: createProvenanceField(docType, 'inferred', 1, null, 0.75)
  };
}

function createEmptyHeader() {
  return {
    version: '2.0.0',
    title: createProvenanceField(null, 'unavailable'),
    subtitle: createProvenanceField(null, 'unavailable'),
    authors: [],
    affiliations: [],
    emails: [],
    abstract: createProvenanceField(null, 'unavailable'),
    keywords: [],
    doi: createProvenanceField(null, 'unavailable'),
    year: createProvenanceField(null, 'unavailable'),
    venue: createProvenanceField(null, 'unavailable'),
    publisher: createProvenanceField(null, 'unavailable'),
    documentType: createProvenanceField('unknown', 'inferred')
  };
}
