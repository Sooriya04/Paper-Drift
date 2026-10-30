/**
 * @file src/links/extractor.js
 * @description PDF Hyperlink & Citation Reference Engine for paper-drift.
 * Extracts external web URLs, DOIs, emails, and internal named destinations (citations, figures, tables, sections),
 * resolves cross-reference destinations, and weaves Markdown hyperlinks into text lines with punctuation protection.
 * Part of paper-drift - https://github.com/Sooriya04/Paper-Drift
 */

/**
 * Normalizes an internal or external URI into a clean Markdown target.
 * Internal named destinations (e.g. #nameddest=cite.bahdanau2014neural) are converted
 * to clean anchor slugs (e.g. #cite-bahdanau2014neural).
 *
 * @param {string} rawUri - Raw URI string from MuPDF Link
 * @returns {string} Clean Markdown link target
 */
export function formatDestinationSlug(rawUri) {
  if (!rawUri) return '';
  const trimmed = String(rawUri).trim();

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
 *
 * @param {Object} doc - MuPDF Document instance
 * @param {number[]} pageIndices - List of 0-based page indices
 * @returns {Map<number, Array<{ id: string, name: string, y: number }>>}
 */
export function buildDocumentDestinations(doc, pageIndices) {
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
  }

  // Sort destinations on each page from top to bottom
  for (const list of destinationsByPage.values()) {
    list.sort((a, b) => a.y - b.y);
  }

  return destinationsByPage;
}

/**
 * Weaves Markdown hyperlinks into a text line based on character spatial coordinates and active links.
 * Preserves syntax punctuation and balances brackets so Markdown syntax remains pristine.
 *
 * @param {Object} line - Line object with `text`, `bbox`, and `chars`
 * @param {Array<Object>} pageLinks - List of links on the page
 * @returns {string} Line text with Markdown links applied
 */
export function applyLinksToLine(line, pageLinks) {
  if (!line || !line.text) return '';
  if (!Array.isArray(pageLinks) || pageLinks.length === 0 || !Array.isArray(line.chars) || line.chars.length === 0) {
    return line.text;
  }

  const lineTop = line.bbox[1];
  const lineBottom = line.bbox[3];

  // A link belongs to this line if its vertical center is inside the line's bounds
  const activeLinks = pageLinks.filter(l => l.midY >= lineTop - 1.5 && l.midY <= lineBottom + 1.5);
  if (activeLinks.length === 0) {
    return line.text;
  }

  // Tag each character with its matching link URI
  const tagged = line.chars.map(c => {
    const matched = activeLinks.find(l => c.x >= l.bbox[0] - 2.5 && c.x <= l.bbox[2] + 2.5);
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

    // Check if the destination coordinate falls near the top of this line (within 8pt) or inside its bounds
    if (Math.abs(dest.y - lineTop) <= 8 || (dest.y >= lineTop && dest.y <= lineBottom)) {
      claimedIds.add(dest.id);
      tags.push(`<a id="${dest.id}"></a>`);
    }
  }

  return tags.join('');
}
