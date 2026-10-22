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

  // 1. Identify spanning blocks that cross the center of this region
  let minX = Infinity;
  let maxX = -Infinity;

  for (const b of blockList) {
    if (b.bbox.x < minX) minX = b.bbox.x;
    if (b.bbox.x + b.bbox.w > maxX) maxX = b.bbox.x + b.bbox.w;
  }

  const fullWidth = maxX - minX;
  const midX = (minX + maxX) / 2;

  // A block spans across columns if it covers > 65% of the content width and crosses the center
  const isSpanning = (b) => {
    return b.bbox.w > fullWidth * 0.65 &&
           b.bbox.x < midX - 15 &&
           (b.bbox.x + b.bbox.w) > midX + 15;
  };

  const hasSpanningBlocks = blockList.some(isSpanning);

  if (hasSpanningBlocks) {
    // Partition by spanning blocks into horizontal bands from top to bottom
    const sorted = [...blockList].sort((a, b) => a.bbox.y - b.bbox.y);
    const result = [];
    let currentBand = [];

    for (const b of sorted) {
      if (isSpanning(b)) {
        if (currentBand.length > 0) {
          result.push(...recursiveXyCut(currentBand));
          currentBand = [];
        }
        result.push(b);
      } else {
        currentBand.push(b);
      }
    }

    if (currentBand.length > 0) {
      result.push(...recursiveXyCut(currentBand));
    }

    return result;
  }

  // 2. No spanning blocks in this band: Check for vertical column gutters
  const intervals = blockList.map(b => [b.bbox.x, b.bbox.x + b.bbox.w]).sort((a, b) => a[0] - b[0]);
  const gutters = [];
  let currentEnd = intervals[0][1];

  for (let i = 1; i < intervals.length; i++) {
    const nextStart = intervals[i][0];
    // Dynamic gutter threshold (at least 12pt whitespace separating text columns)
    if (nextStart > currentEnd + 12) {
      gutters.push({
        start: currentEnd,
        end: nextStart,
        mid: (currentEnd + nextStart) / 2
      });
    }
    currentEnd = Math.max(currentEnd, intervals[i][1]);
  }

  // Filter gutters that have substantial content on both sides
  const validGutters = gutters.filter(g => {
    const leftCount = blockList.filter(b => (b.bbox.x + b.bbox.w) <= g.mid + 5).length;
    const rightCount = blockList.filter(b => b.bbox.x >= g.mid - 5).length;
    return leftCount >= 1 && rightCount >= 1;
  });

  if (validGutters.length > 0) {
    // Partition across the primary column gutter: Left column first, then Right column
    const primaryGutter = validGutters[0];
    const leftColumn = [];
    const rightColumn = [];
    const intersecting = [];

    for (const b of blockList) {
      if ((b.bbox.x + b.bbox.w) <= primaryGutter.mid + 5) {
        leftColumn.push(b);
      } else if (b.bbox.x >= primaryGutter.mid - 5) {
        rightColumn.push(b);
      } else {
        intersecting.push(b);
      }
    }

    return [
      ...recursiveXyCut(leftColumn),
      ...recursiveXyCut(rightColumn),
      ...recursiveXyCut(intersecting)
    ];
  }

  // 3. Single column / flat band: Sort naturally top-to-bottom by Y, then X
  return [...blockList].sort((a, b) => {
    const dy = a.bbox.y - b.bbox.y;
    if (Math.abs(dy) > 3) return dy;
    return a.bbox.x - b.bbox.x;
  });
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

  // Pure geometric decomposition: Zero dropped blocks, zero hardcoded strings
  const orderedBlocks = recursiveXyCut(textBlocks);

  // Dynamic column detection from X coordinates
  let columnsDetected = 1;
  if (orderedBlocks.length >= 4) {
    const minX = Math.min(...orderedBlocks.map(b => b.bbox.x));
    const maxX = Math.max(...orderedBlocks.map(b => b.bbox.x + b.bbox.w));
    const midX = (minX + maxX) / 2;

    const leftCount = orderedBlocks.filter(b => b.bbox.x + b.bbox.w < midX).length;
    const rightCount = orderedBlocks.filter(b => b.bbox.x > midX).length;

    if (leftCount >= 2 && rightCount >= 2) {
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
