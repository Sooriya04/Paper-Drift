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
    // Skip typical header notices or arXiv stamps at top
    if (/arXiv:\d+\.\d+|preprint|under review|published in|conference|permission to|proceedings/i.test(text) && l.top < 110) {
      continue;
    }
    // Filter out email addresses and tall bracketed blocks from title candidates
    if (/@/.test(text) || /\{[^}]+\}/.test(text) || /\{[^}]*$/.test(text)) {
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
    if (/arXiv:\d+\.\d+|preprint|under review|published in|conference|permission to|proceedings/i.test(text) && l.top < 110) {
      continue;
    }
    // Filter out email addresses and tall bracketed blocks from title candidates
    if (/@/.test(text) || /\{[^}]+\}/.test(text) || /\{[^}]*$/.test(text)) {
      continue;
    }
    const size = l.font?.size || l.fontSize || l.height || 10;
    // Check if line continues a hyphenated title or is within 85% of max font size
    const prevText = candidateTitleLines.length > 0 ? candidateTitleLines[candidateTitleLines.length - 1] : '';
    const isHyphenContinuation = prevText.endsWith('-') && size >= maxFontSize * 0.75;

    if (size >= maxFontSize * 0.85 || isHyphenContinuation) {
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
  const authorEnd = abstractStartIndex !== -1 ? abstractStartIndex : Math.min(lines.length, authorStart + 5);

  const hasAuthorClues = abstractStartIndex !== -1 || lines.slice(authorStart, authorEnd).some(l =>
    /@|\b(university|institute|lab|laboratory|google|microsoft|research|meta|apple|amazon|deepmind|corp|inc)\b/i.test(l.text || '')
  );

  if (hasAuthorClues) {
    for (let i = authorStart; i < authorEnd; i++) {
      const l = lines[i];
      const text = l.text.trim();
      if (!text) continue;
      // Skip prose sentences, bullet points, or list items
      if (/^[-*•]/.test(text) || text.endsWith('.') || text.endsWith('!') || text.endsWith(':')) continue;
      authorRegionLines.push(l);
      if (l.bbox) authorBboxes.push(l.bbox);
      else if (l.left !== undefined) authorBboxes.push([l.left, l.top, l.left + l.width, l.top + l.height]);
    }
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
 * Matches an author name to their email candidate.
 */
function matchAuthorEmail(name, emails) {
  const normalized = name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z\s]/g, '').split(/\s+/).filter(Boolean);
  if (normalized.length === 0) return null;
  const firstInitial = normalized[0][0];
  const firstName = normalized[0];
  const lastName = normalized[normalized.length - 1];
  const lastInitial = lastName[0];

  // 1. Exact matches: full name or initial + lastname
  const fullConcat = firstName + lastName;
  let match = emails.find(e => {
    const prefix = e.split('@')[0].toLowerCase().replace(/^v-/, '');
    return prefix === fullConcat || prefix === (firstInitial + lastName);
  });
  if (match) return match;

  // 2. Syllable / prefix combo: e.g. 'yeshe' for 'yelong shen', 'kristout' for 'kristina toutanova'
  match = emails.find(e => {
    const prefix = e.split('@')[0].toLowerCase().replace(/^v-/, '');
    for (let len = 2; len <= Math.min(firstName.length, prefix.length - 2); len++) {
      if (prefix.startsWith(firstName.slice(0, len)) && lastName.startsWith(prefix.slice(len))) {
        return true;
      }
    }
    return false;
  });
  if (match) return match;

  // 3. First name + last initial (e.g. zeyuana, yuanzhil) OR prefix of first + last initial (e.g. xiangz)
  match = emails.find(e => {
    const prefix = e.split('@')[0].toLowerCase().replace(/^v-/, '');
    return (prefix.endsWith(lastInitial) && (firstName.startsWith(prefix.slice(0, -1)) || prefix.slice(0, -1).startsWith(firstName)));
  });
  if (match) return match;

  // 4. Standard abbreviations / initials
  match = emails.find(e => {
    const prefix = e.split('@')[0].toLowerCase().replace(/^v-/, '');
    return (prefix.startsWith(firstInitial) && prefix.endsWith(lastInitial) && lastName.startsWith(prefix.slice(1, -1))) ||
           (prefix.startsWith(firstInitial) && lastName.startsWith(prefix.slice(1))) ||
           prefix === (firstInitial + lastInitial);
  });
  if (match) return match;

  // 5. General substring match
  match = emails.find(e => {
    const prefix = e.split('@')[0].toLowerCase().replace(/^v-/, '');
    return prefix.includes(lastName) || lastName.includes(prefix) || prefix.includes(firstName);
  });
  return match || null;
}

/**
 * Splits a single text line into multiple author names if separated by large horizontal gaps.
 */
function splitLineByGaps(lineObj) {
  if (typeof lineObj === 'string') return [lineObj];
  if (!lineObj.chars || lineObj.chars.length === 0) return [lineObj.text.trim()];
  const fontSize = lineObj.font?.size || 10;
  const segments = [];
  let cur = '';
  for (let i = 0; i < lineObj.chars.length; i++) {
    cur += lineObj.chars[i].char;
    if (i < lineObj.chars.length - 1) {
      const dx = lineObj.chars[i + 1].x - lineObj.chars[i].x;
      if (dx > fontSize * 1.3) {
        segments.push(cur.trim());
        cur = '';
      }
    }
  }
  if (cur.trim()) segments.push(cur.trim());
  return segments;
}

/**
 * Parses author lines into structured authors, affiliations, and emails.
 */
function parseAuthorBlock(lines, bboxes) {
  const emails = [];
  const affiliations = [];
  const rawAuthorEntries = [];

  const affilKeywords = /\b(university|universite|institute|institut|college|department|departement|laboratory|laboratoire|lab|technologies|inc\.|ltd\.|corp\.|google|microsoft|meta|openai|deepmind|amazon|research|recherche|center|centre|faculty|faculte)\b/i;

  function isAffiliationLine(str) {
    const norm = str.normalize('NFD').replace(/[\u0300-\u036f´`]/g, '');
    return affilKeywords.test(norm) || /\b(?:montr[eé]al|quebec|toronto|california|stanford|cambridge|oxford|beijing|zurich|london|boston)\b/i.test(norm) || /^[A-Z]{2}\s+[A-Z0-9]{3}\s+[A-Z0-9]{3}$/i.test(norm.trim());
  }

  // 1. Pre-process and combine multi-line bracket emails
  const processedLines = [];
  for (let i = 0; i < lines.length; i++) {
    const item = lines[i];
    const text = typeof item === 'string' ? item : (item.text || '').trim();
    if (/\{[^}]*$/.test(text) && i + 1 < lines.length) {
      let mergedText = text;
      let j = i + 1;
      while (j < lines.length && !/\}/.test(mergedText)) {
        const nextText = typeof lines[j] === 'string' ? lines[j] : (lines[j].text || '').trim();
        mergedText += ' ' + nextText;
        j++;
      }
      processedLines.push({
        text: mergedText,
        left: typeof item === 'object' ? item.left : undefined,
        top: typeof item === 'object' ? item.top : undefined,
        chars: item.chars,
        font: item.font
      });
      i = j - 1;
    } else {
      processedLines.push(item);
    }
  }

  // 2. Classify lines into emails, affiliations, or raw author candidates
  const affilLineObjects = [];
  const emailLineObjects = [];

  for (const lineObj of processedLines) {
    const line = typeof lineObj === 'string' ? lineObj : (lineObj.text || '').trim();
    if (!line) continue;

    // Check bracket emails: {a, b}@c.com
    let match;
    let hasBracketEmail = false;
    while ((match = BRACKET_EMAIL_REGEX.exec(line)) !== null) {
      hasBracketEmail = true;
      const names = match[1].split(',').map(n => n.trim());
      const domain = match[2].trim();
      names.forEach(n => {
        const fullEmail = `${n}@${domain}`;
        if (!emails.includes(fullEmail)) emails.push(fullEmail);
      });
    }

    // Check normal emails
    let hasNormalEmail = false;
    while ((match = EMAIL_REGEX.exec(line)) !== null) {
      hasNormalEmail = true;
      if (!emails.includes(match[1])) {
        emails.push(match[1]);
      }
    }

    if (hasBracketEmail || hasNormalEmail) {
      emailLineObjects.push(lineObj);
      continue;
    }

    // Skip version stamps or stray bracket lines
    if (/^\(version|\{/i.test(line)) {
      continue;
    }

    // Check affiliation
    if (isAffiliationLine(line)) {
      const cleanedAffil = clean(line.replace(/^[\d*†‡§\s,]+/, ''));
      if (cleanedAffil.length > 3 && !affiliations.includes(cleanedAffil)) {
        affiliations.push(cleanedAffil);
      }
      affilLineObjects.push(lineObj);
    } else {
      rawAuthorEntries.push(lineObj);
    }
  }

  // 3. Parse structured author names & associate with spatially nearest affiliations / emails
  const authorList = [];
  let order = 1;

  for (const authorEntry of rawAuthorEntries) {
    const rawLine = typeof authorEntry === 'string' ? authorEntry : (authorEntry.text || '').trim();
    if (!rawLine || /abstract/i.test(rawLine)) continue;

    // Split line by large gaps if available (e.g. BERT, LoRA multi-column author lines)
    const gapSegments = splitLineByGaps(authorEntry);

    for (const segment of gapSegments) {
      const parts = segment
        .replace(/\band\b/gi, ',')
        .split(',')
        .map(p => p.trim())
        .filter(Boolean);

      for (const p of parts) {
        // Remove footnote marks like 1, 2, *, †, ‡
        const name = clean(p.replace(/[\d*†‡§^]/g, ''));
        const nameWords = name.split(/\s+/).filter(Boolean);
        const hasProseWords = /\b(the|and|or|was|were|is|are|via|with|for|from|notice|this|document|rendered|parsed|intact)\b/i.test(name);
        const isNameLike = name.length > 2 && nameWords.length <= 5 && !hasProseWords;

        if (isNameLike && !isAffiliationLine(name) && !/abstract/i.test(name) && !/^\(version/i.test(name)) {
          // Spatial proximity lookup if coordinates are present
          let matchedAffil = null;
          let matchedEmail = null;

          if (typeof authorEntry === 'object' && authorEntry.left !== undefined && authorEntry.top !== undefined) {
            const aLeft = authorEntry.left;
            const aTop = authorEntry.top;

            const nearbyAffil = affilLineObjects.find(aff =>
              aff.top >= aTop && aff.top <= aTop + 40 && Math.abs((aff.left || 0) - aLeft) < 80
            );
            if (nearbyAffil) {
              matchedAffil = clean(nearbyAffil.text.replace(/^[\d*†‡§\s,]+/, ''));
            }

            const nearbyEmail = emailLineObjects.find(em =>
              em.top >= aTop && em.top <= aTop + 50 && Math.abs((em.left || 0) - aLeft) < 80
            );
            if (nearbyEmail) {
              const emailText = nearbyEmail.text;
              const found = emails.find(e => emailText.includes(e));
              if (found) matchedEmail = found;
            }
          }

          // Fallback to name heuristic matching if spatial match not found
          if (!matchedEmail) {
            matchedEmail = matchAuthorEmail(name, emails);
          }

          const authorAffiliations = matchedAffil
            ? [matchedAffil]
            : (affiliations.length > 0 ? [affiliations[0]] : []);

          authorList.push({
            name,
            order: order++,
            affiliations: authorAffiliations,
            email: matchedEmail || null
          });
        }
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

      // Venue / Conference / Publisher check (scoped strictly to Page 1)
      if (p.pageNumber === 1) {
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
