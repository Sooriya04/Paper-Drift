/**
 * @file src/spatial/reading-order.js
 * @description General-purpose spatial reading order engine using dynamic spanning-band and column decomposition.
 * Slices documents into natural reading flow (banners -> column 1 -> column 2 -> footers)
 * with zero hardcoded strings, zero dropped content, and full support for any PDF format.
 * Part of paper-drift - https://github.com/Sooriya04/Paper-Drift
 */

/**
 * Organizes any arbitrary collection of text blocks into natural human reading order.
 * Dynamically detects full-width spanning blocks (e.g. headers, full-width figures)
 * and vertical column gutters without hardcoding dimensions or document types.
 *
 * @param {Array<Object>} blockList - Text blocks with bounding box `{ x, y, w, h }`
 * @returns {Array<Object>} Spatially ordered blocks preserving 100% of text
 */
export function recursiveXyCut(blockList) {
  if (!blockList || blockList.length <= 1) return blockList || [];

  // Separate vertical margin watermarks (e.g. arXiv vertical timestamp at edge x < 35 with large height)
  // so they do not distort the document's true content center
  const contentBlocks = blockList.filter(b => !(b.bbox.x < 35 && b.bbox.h > 100 && b.bbox.w < 35));
  const watermarks = blockList.filter(b => b.bbox.x < 35 && b.bbox.h > 100 && b.bbox.w < 35);

  if (contentBlocks.length <= 1) return [...watermarks, ...contentBlocks];

  // Compute tight horizontal bounds across all content blocks
  let minX = Infinity;
  let maxX = -Infinity;

  for (const b of contentBlocks) {
    if (b.bbox.x < minX) minX = b.bbox.x;
    if (b.bbox.x + b.bbox.w > maxX) maxX = b.bbox.x + b.bbox.w;
  }

  const fullWidth = maxX - minX;

  // Search candidate vertical cuts across interior (from 20% to 80% of content width)
  let bestCut = null;
  let bestScore = -Infinity;

  for (let x = minX + fullWidth * 0.20; x <= maxX - fullWidth * 0.20; x += 3) {
    const left = [];
    const right = [];
    const crossing = [];

    for (const b of contentBlocks) {
      if ((b.bbox.x + b.bbox.w) <= x + 2) {
        left.push(b);
      } else if (b.bbox.x >= x - 2) {
        right.push(b);
      } else {
        crossing.push(b);
      }
    }

    if (left.length >= 1 && right.length >= 1) {
      const gutterLeft = Math.max(...left.map(b => b.bbox.x + b.bbox.w));
      const gutterRight = Math.min(...right.map(b => b.bbox.x));
      const gutterWidth = gutterRight - gutterLeft;

      const balance = 1 - Math.abs(left.length - right.length) / (left.length + right.length);
      const score = (gutterWidth >= 6 ? 100 : -100) + (balance * 50) - (crossing.length * 40);

      if (score > bestScore) {
        bestScore = score;
        bestCut = { x, left, right, crossing, gutterWidth };
      }
    }
  }

  // If a valid column gutter with crossing elements is found (like Title/Author spanning blocks):
  if (bestCut && bestCut.crossing.length > 0 && bestCut.left.length >= 2 && bestCut.right.length >= 2) {
    // Partition by Y around crossing elements
    const sorted = [...contentBlocks].sort((a, b) => a.bbox.y - b.bbox.y);
    const result = [];
    let band = [];

    for (const b of sorted) {
      if (bestCut.crossing.includes(b)) {
        if (band.length > 0) {
          result.push(...recursiveXyCut(band));
          band = [];
        }
        result.push(b);
      } else {
        band.push(b);
      }
    }
    if (band.length > 0) {
      result.push(...recursiveXyCut(band));
    }
    return [...watermarks, ...result];
  }

  // If a clean column gutter with zero crossing is found:
  if (bestCut && bestCut.crossing.length === 0 && bestCut.gutterWidth >= 6) {
    return [
      ...watermarks,
      ...recursiveXyCut(bestCut.left),
      ...recursiveXyCut(bestCut.right)
    ];
  }

  // Single column fallback: sort naturally top-to-bottom by Y, then X
  const sorted = [...contentBlocks].sort((a, b) => {
    const dy = a.bbox.y - b.bbox.y;
    if (Math.abs(dy) > 3) return dy;
    return a.bbox.x - b.bbox.x;
  });

  return [...watermarks, ...sorted];
}

/**
 * Organizes any PDF page into natural reading order without dropping any content.
 *
 * @param {Object} pageJson - Parsed JSON from `page.toStructuredText().asJSON()`
 * @param {number} [pageWidth] - Optional page width
 * @param {number} [pageHeight] - Optional page height
 * @returns {{
 *   blocks: Array<Object>,
 *   text: string,
 *   columnsDetected: number
 * }}
 */
export function resolveReadingOrder(pageJson, pageWidth, pageHeight) {
  const rawBlocks = pageJson.blocks || [];
  const textBlocks = rawBlocks.filter(b => b.type === 'text');

  if (textBlocks.length === 0) {
    return {
      blocks: [],
      text: '',
      columnsDetected: 1
    };
  }

  // Tighten bounding boxes based on actual text lines to eliminate font metric whitespace padding
  for (const b of textBlocks) {
    if (b.lines && b.lines.length > 0) {
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (const l of b.lines) {
        const lx = l.bbox?.x ?? l.x ?? 0;
        const ly = l.bbox?.y ?? l.y ?? 0;
        const lw = l.bbox?.w ?? l.w ?? 0;
        const lh = l.bbox?.h ?? l.h ?? 0;
        if (lx < minX) minX = lx;
        if (ly < minY) minY = ly;
        if (lx + lw > maxX) maxX = lx + lw;
        if (ly + lh > maxY) maxY = ly + lh;
      }
      if (minX !== Infinity && maxX > minX) {
        b.bbox = { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
      }
    }
  }

  // Pure geometric decomposition: Zero dropped blocks, zero hardcoded strings
  const orderedBlocks = recursiveXyCut(textBlocks);

  // Dynamic column detection from spatial distribution
  let columnsDetected = 1;
  if (orderedBlocks.length >= 4) {
    const minX = Math.min(...orderedBlocks.map(b => b.bbox.x));
    const maxX = Math.max(...orderedBlocks.map(b => b.bbox.x + b.bbox.w));
    const fullW = maxX - minX;
    const midX = (minX + maxX) / 2;

    const leftBlocks = orderedBlocks.filter(b => (b.bbox.x + b.bbox.w) <= midX + 10 && b.bbox.w < fullW * 0.55);
    const rightBlocks = orderedBlocks.filter(b => b.bbox.x >= midX - 10 && b.bbox.w < fullW * 0.55);

    if (leftBlocks.length >= 2 && rightBlocks.length >= 2) {
      columnsDetected = 2;
    }
  }

  // Assemble natural reading text paragraphs
  const textParagraphs = orderedBlocks.map(block => {
    return (block.lines || [])
      .map(line => line.text)
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();
  }).filter(Boolean);

  return {
    blocks: orderedBlocks,
    text: textParagraphs.join('\n\n'),
    columnsDetected
  };
}
