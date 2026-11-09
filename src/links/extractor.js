/**
 * @file src/links/extractor.js
 * @description PDF Hyperlink & Citation Reference Engine for paper-drift.
 * Extracts external web URLs, DOIs, emails, and internal named destinations (citations, figures, tables, sections),
 * resolves cross-reference destinations, and weaves Markdown hyperlinks into text lines with punctuation protection.
 * Part of paper-drift - https://github.com/Sooriya04/Paper-Drift
 */

/**
 * Normalizes an internal or external URI into a clean Markdown target.
 * Normalizes DOIs (doi:10.xxx -> https://doi.org/10.xxx) and http://arxiv.org to https://arxiv.org.
 * Internal named destinations (e.g. #nameddest=cite.bahdanau2014neural) are converted
 * to clean anchor slugs (e.g. #cite-bahdanau2014neural).
 *
 * @param {string} rawUri - Raw URI string from MuPDF Link
 * @returns {string} Clean Markdown link target
 */
export function formatDestinationSlug(rawUri) {
  if (!rawUri) return '';
  const trimmed = String(rawUri).trim();

  // DOI normalization
  const doiMatch = trimmed.match(/^(?:doi:\s*|(?:https?:\/\/)?(?:dx\.)?doi\.org\/)?(10\.\d{4,9}\/[-._;()/:A-Za-z0-9]+)$/i);
  if (doiMatch) {
    return `https://doi.org/${doiMatch[1]}`;
  }

  // Promote insecure academic repository URLs to https
  if (trimmed.startsWith('http://arxiv.org/')) {
    return trimmed.replace('http://arxiv.org/', 'https://arxiv.org/');
  }
  if (trimmed.startsWith('http://doi.org/')) {
    return trimmed.replace('http://doi.org/', 'https://doi.org/');
  }

  if (trimmed.startsWith('#nameddest=')) {
    const destName = trimmed.replace('#nameddest=', '');
    return '#' + destName.replace(/[\.:%]/g, '-').replace(/-+/g, '-').toLowerCase();
  }

  if (trimmed.startsWith('#')) {
    return '#' + trimmed.slice(1).replace(/[\.:%]/g, '-').replace(/-+/g, '-').toLowerCase();
  }

  return trimmed;
}

/**
 * Extracts links from a MuPDF page and normalizes their coordinates and URIs.
 *
 * @param {Object} page - MuPDF Page instance
 * @param {Object} [doc] - MuPDF Document instance (used to resolve internal destination coordinates)
 * @returns {Array<Object>} List of page links with bounding boxes and normalized targets
 */
export function extractPageLinks(page, doc = null) {
  if (!page || typeof page.getLinks !== 'function') {
    return [];
  }

  const links = page.getLinks();
  if (!Array.isArray(links) || links.length === 0) {
    return [];
  }

  const results = [];
  for (const link of links) {
    if (!link || typeof link.getURI !== 'function' || typeof link.getBounds !== 'function') {
      continue;
    }

    const rawUri = link.getURI();
    if (!rawUri) continue;

    const bounds = link.getBounds();
    if (!Array.isArray(bounds) || bounds.length < 4) continue;

    const left = Math.min(bounds[0], bounds[2]);
    const top = Math.min(bounds[1], bounds[3]);
    const right = Math.max(bounds[0], bounds[2]);
    const bottom = Math.max(bounds[1], bounds[3]);

    const isExternal = typeof link.isExternal === 'function'
      ? link.isExternal()
      : !rawUri.startsWith('#');

    const uri = formatDestinationSlug(rawUri);
    let targetPage = null;
    let targetY = null;

    if (!isExternal && doc && typeof doc.resolveLinkDestination === 'function') {
      try {
        const dest = doc.resolveLinkDestination(rawUri);
        if (dest && typeof dest.page === 'number') {
          targetPage = dest.page;
          targetY = dest.y;
        }
      } catch {
        // Fall back gracefully if destination resolution fails
      }
    }

    results.push({
      bbox: [left, top, right, bottom],
      midY: (top + bottom) / 2,
      uri,
      rawUri,
      isExternal,
      targetPage,
      targetY
    });
  }

  return results;
}

/**
 * Pre-scans a document across target pages to build a registry of internal destination anchors.
 * Maps destination page index to an array of anchors positioned on that page.
 * When native PDF link annotations are missing, scans for numbered bibliography entries ([1], [2], ...).
 *
 * @param {Object} doc - MuPDF Document instance
 * @param {number[]} pageIndices - List of 0-based page indices
 * @param {Map<number, Array<Object>>} [allPagesLines=null] - Pre-extracted text lines per page
 * @returns {Map<number, Array<{ id: string, name: string, y: number }>>}
 */
export function buildDocumentDestinations(doc, pageIndices, allPagesLines = null) {
  const destinationsByPage = new Map();
  if (!doc || !Array.isArray(pageIndices)) {
    return destinationsByPage;
  }

  const seenIds = new Set();

  for (const pageIndex of pageIndices) {
    let page;
    try {
      page = doc.loadPage(pageIndex);
    } catch {
      continue;
    }

    try {
      const links = page.getLinks();
      if (!Array.isArray(links)) continue;

      for (const link of links) {
        if (!link || typeof link.getURI !== 'function') continue;
        const rawUri = link.getURI();
        if (!rawUri || !rawUri.startsWith('#nameddest=')) continue;

        const slug = formatDestinationSlug(rawUri);
        const id = slug.startsWith('#') ? slug.slice(1) : slug;
        if (!id || seenIds.has(id)) continue;

        try {
          const dest = doc.resolveLinkDestination(rawUri);
          if (dest && typeof dest.page === 'number' && typeof dest.y === 'number' && !isNaN(dest.y)) {
            seenIds.add(id);
            const targetPage = dest.page;
            if (!destinationsByPage.has(targetPage)) {
              destinationsByPage.set(targetPage, []);
            }
            destinationsByPage.get(targetPage).push({
              id,
              name: rawUri.replace('#nameddest=', ''),
              y: dest.y
            });
          }
        } catch {
          // Ignore unresolved destinations
        }
      }
    } finally {
      if (page && typeof page.destroy === 'function') {
        try {
          page.destroy();
        } catch {}
      }
    }
  }

  // Bibliography fallback: If no PDF named destinations were indexed, or to augment references,
  // scan for numbered bibliography entries ([1], [2], ...) in the References section
  if (allPagesLines && typeof allPagesLines.get === 'function') {
    let inReferences = false;
    for (const pageIndex of pageIndices) {
      const lines = allPagesLines.get(pageIndex) || [];
      for (const line of lines) {
        const text = (line.text || '').trim();
        if (/^(?:references|bibliography)\s*$/i.test(text)) {
          inReferences = true;
          continue;
        }
        const numMatch = text.match(/^\[(\d+)\]\s+/);
        if (numMatch && (inReferences || Number(numMatch[1]) > 0)) {
          // If we see numbered bibliography patterns like [1], [2], activate references context
          inReferences = true;
          const id = `cite-${numMatch[1]}`;
          if (!seenIds.has(id)) {
            seenIds.add(id);
            if (!destinationsByPage.has(pageIndex)) {
              destinationsByPage.set(pageIndex, []);
            }
            destinationsByPage.get(pageIndex).push({
              id,
              name: numMatch[1],
              y: line.top !== undefined ? line.top : (line.bbox ? line.bbox[1] : 0)
            });
          }
        }
      }
    }
  }

  // Sort destinations on each page from top to bottom
  for (const list of destinationsByPage.values()) {
    list.sort((a, b) => a.y - b.y);
  }

  return destinationsByPage;
}

/**
 * Groups links across a page to their best-matching text line by typographic baseline.
 * Eliminates cross-line bounding box collision on tightly-spaced multi-line text.
 *
 * @param {Array<Object>} lines - Text lines on page
 * @param {Array<Object>} pageLinks - All links on page
 * @returns {Map<Object, Array<Object>>}
 */
export function groupLinksByLine(lines, pageLinks) {
  const linksByLine = new Map();
  if (!Array.isArray(lines) || !Array.isArray(pageLinks) || pageLinks.length === 0) {
    return linksByLine;
  }

  for (const link of pageLinks) {
    let bestLine = null;
    let minDistance = Infinity;

    for (const line of lines) {
      if (!line.bbox) continue;
      // Must have horizontal interval overlap or proximity with line bounding box
      if (link.bbox[2] < line.bbox[0] - 5 || link.bbox[0] > line.bbox[2] + 5) {
        continue;
      }

      const baselineY = line.chars?.[0]?.y ?? ((line.bbox[1] + line.bbox[3]) / 2);
      const distY = Math.abs(link.midY - baselineY);
      if (distY < minDistance && distY <= 12) {
        minDistance = distY;
        bestLine = line;
      }
    }

    if (bestLine) {
      if (!linksByLine.has(bestLine)) linksByLine.set(bestLine, []);
      linksByLine.get(bestLine).push(link);
    }
  }

  return linksByLine;
}

/**
 * Weaves Markdown hyperlinks into a text line based on character spatial coordinates and active links.
 * Preserves syntax punctuation and balances brackets so Markdown syntax remains pristine.
 *
 * @param {Object} line - Line object with `text`, `bbox`, and `chars`
 * @param {Array<Object>} pageLinks - List of links on the page (or pre-filtered for this line)
 * @param {Object} [options={}] - Optional settings
 * @param {Map<string, string>} [options.knownCitations] - Known citation key mapping (e.g. "19" -> "#cite-19")
 * @returns {string} Line text with Markdown links applied
 */
export function applyLinksToLine(line, pageLinks, options = {}) {
  if (!line || !line.text) return '';
  const text = line.text;

  // Filter links for this line
  let activeLinks = [];
  if (Array.isArray(pageLinks) && pageLinks.length > 0) {
    const lineTop = line.bbox?.[1] ?? line.top ?? 0;
    const lineBottom = line.bbox?.[3] ?? line.bottom ?? (lineTop + 10);
    const baselineY = line.chars?.[0]?.y ?? ((lineTop + lineBottom) / 2);

    // If pre-filtered array was passed in directly, use it; otherwise match with baseline proximity
    activeLinks = pageLinks.filter(l => {
      const distToBaseline = Math.abs(l.midY - baselineY);
      return distToBaseline <= 6 || (l.midY >= lineTop - 1.5 && l.midY <= lineBottom + 1.5);
    });
  }

  if (activeLinks.length === 0) {
    // If no interactive PDF links exist on this line, check for unlinked numbered citations if bibliography is indexed
    if (options.knownCitations && options.knownCitations.size > 0) {
      return text.replace(/\[(\d+(?:,\s*\d+)*)\]/g, (match, nums) => {
        // Do not match closed numerical intervals like [0, 1] or [0, 10]
        if (nums.startsWith('0,')) return match;
        const parts = nums.split(/,\s*/);
        const mapped = parts.map(n => {
          const target = options.knownCitations.get(n);
          return target ? `[${n}](${target})` : null;
        });
        // Only convert if at least one citation number matches the bibliography
        if (mapped.every(m => m === null)) return match;
        const formattedParts = parts.map((n, i) => mapped[i] || n);
        return `[${formattedParts.join(', ')}]`;
      });
    }
    return text;
  }

  if (!Array.isArray(line.chars) || line.chars.length === 0) {
    return text;
  }

  // Tag each character with its matching link URI using character midpoint and interval overlap
  const tagged = line.chars.map((c, idx) => {
    const isSpace = c.char === ' ';
    const nextC = line.chars[idx + 1];
    const charWidth = (nextC && nextC.x > c.x)
      ? (nextC.x - c.x)
      : ((c.size && c.size > 0) ? (c.size * 0.45) : 4);
    const charLeft = c.x;
    const charRight = c.x + charWidth;
    const charMidX = c.x + charWidth * 0.5;

    const matched = activeLinks.find(l => {
      if (isSpace) {
        // Space only matches if it is strictly interior to the link box
        return c.x >= l.bbox[0] && charRight <= l.bbox[2];
      }
      const overlap = Math.min(charRight, l.bbox[2]) - Math.max(charLeft, l.bbox[0]);
      return (overlap >= 1.0 && charMidX >= l.bbox[0] && charMidX <= l.bbox[2]) ||
             (charLeft >= l.bbox[0] && charRight <= l.bbox[2]);
    });
    return { char: c.char, link: matched ? matched.uri : null };
  });

  // Group contiguous characters sharing the same link target
  const spans = [];
  let currentSpan = { link: null, text: '' };
  for (const t of tagged) {
    if (t.link === currentSpan.link) {
      currentSpan.text += t.char;
    } else {
      if (currentSpan.text) spans.push(currentSpan);
      currentSpan = { link: t.link, text: t.char };
    }
  }
  if (currentSpan.text) spans.push(currentSpan);

  // Format linked spans as Markdown links [core](uri)
  return spans.map(s => {
    if (!s.link) return s.text;

    // Isolate leading and trailing whitespace
    const match = s.text.match(/^(\s*)([^\s]*.*[^\s])(\s*)$/) || s.text.match(/^(\s*)(.+)(\s*)$/);
    if (!match) return s.text;

    const [, lead, core, trail] = match;
    let cleanCore = core;
    let trailingPunct = '';
    let leadingPunct = '';

    // Strip trailing sentence punctuation outside the link
    while (/[,\.;:!?]$/.test(cleanCore)) {
      trailingPunct = cleanCore.slice(-1) + trailingPunct;
      cleanCore = cleanCore.slice(0, -1);
    }

    // Strip unbalanced closing bracket/parenthesis outside the link (e.g. "2019)" -> "[2019])")
    if (/[)\]]$/.test(cleanCore) && !/^[(\[]/.test(cleanCore)) {
      trailingPunct = cleanCore.slice(-1) + trailingPunct;
      cleanCore = cleanCore.slice(0, -1);
    }

    // Strip unbalanced opening bracket/parenthesis outside the link (e.g. "(Radford" -> "([Radford")
    if (/^[(\[]/.test(cleanCore) && !/[)\]]$/.test(cleanCore)) {
      leadingPunct = cleanCore.slice(0, 1) + leadingPunct;
      cleanCore = cleanCore.slice(1);
    }

    if (!cleanCore.trim()) return s.text;

    return `${lead}${leadingPunct}[${cleanCore}](${s.link})${trailingPunct}${trail}`;
  }).join('');
}

/**
 * Finds destination anchors situated on this page that correspond to the given line's coordinate.
 *
 * @param {Object} line - Line object with coordinate info
 * @param {Array<{ id: string, y: number }>} [pageDestinations=[]] - List of destinations on the page
 * @param {Set<string>} [claimedIds=new Set()] - Set of already claimed anchor IDs
 * @returns {string} HTML anchor tags to prepend (e.g. '<a id="cite-..."></a>')
 */
export function findDestinationAnchors(line, pageDestinations = [], claimedIds = new Set()) {
  if (!line || !Array.isArray(pageDestinations) || pageDestinations.length === 0) {
    return '';
  }

  const lineTop = line.top !== undefined ? line.top : (Array.isArray(line.bbox) ? line.bbox[1] : 0);
  const lineBottom = line.bottom !== undefined ? line.bottom : (Array.isArray(line.bbox) ? line.bbox[3] : lineTop + 10);
  const tags = [];

  for (const dest of pageDestinations) {
    if (claimedIds.has(dest.id)) continue;

    // Check if the destination coordinate falls near the top of this line (within 14pt) or inside its bounds
    if ((dest.y >= lineTop - 14 && dest.y <= lineBottom + 6) || Math.abs(dest.y - lineTop) <= 14) {
      claimedIds.add(dest.id);
      tags.push(`<a id="${dest.id}"></a>`);
    }
  }

  return tags.join('');
}
