/**
 * @file src/spatial/geometry.js
 * @description Bounding box geometry, projection intervals, and whitespace gutter detection utilities.
 * Provides the mathematical primitives for multi-column spatial reading order detection.
 * Part of paper-drift - https://github.com/Sooriya04/Paper-Drift
 */

/**
 * Checks if two bounding boxes vertically overlap.
 * @param {{ y: number, h: number }} a
 * @param {{ y: number, h: number }} b
 * @returns {boolean}
 */
export function verticalOverlap(a, b) {
  const topA = a.y;
  const bottomA = a.y + a.h;
  const topB = b.y;
  const bottomB = b.y + b.h;
  return Math.max(topA, topB) < Math.min(bottomA, bottomB);
}

/**
 * Checks if two bounding boxes horizontally overlap.
 * @param {{ x: number, w: number }} a
 * @param {{ x: number, w: number }} b
 * @returns {boolean}
 */
export function horizontalOverlap(a, b) {
  const leftA = a.x;
  const rightA = a.x + a.w;
  const leftB = b.x;
  const rightB = b.x + b.w;
  return Math.max(leftA, leftB) < Math.min(rightA, rightB);
}

/**
 * Finds continuous horizontal gaps (whitespace rivers) between intervals.
 * @param {Array<[number, number]>} intervals - Array of [start, end] ranges.
 * @param {number} minBound - Start of the domain (e.g. left margin).
 * @param {number} maxBound - End of the domain (e.g. right margin).
 * @param {number} minGapWidth - Minimum gap size to qualify as a column gutter.
 * @returns {Array<{ start: number, end: number, width: number }>}
 */
export function findWhitespaceGutters(intervals, minBound, maxBound, minGapWidth = 12) {
  if (intervals.length === 0) return [];

  // Sort and merge overlapping intervals
  const sorted = intervals
    .map(([s, e]) => [Math.max(minBound, s), Math.min(maxBound, e)])
    .filter(([s, e]) => s < e)
    .sort((a, b) => a[0] - b[0]);

  const merged = [];
  let curr = sorted[0];

  for (let i = 1; i < sorted.length; i++) {
    const next = sorted[i];
    if (next[0] <= curr[1]) {
      curr[1] = Math.max(curr[1], next[1]);
    } else {
      merged.push(curr);
      curr = next;
    }
  }
  merged.push(curr);

  // Find gaps between merged intervals
  const gutters = [];
  for (let i = 0; i < merged.length - 1; i++) {
    const gapStart = merged[i][1];
    const gapEnd = merged[i + 1][0];
    const width = gapEnd - gapStart;
    if (width >= minGapWidth) {
      gutters.push({ start: gapStart, end: gapEnd, width });
    }
  }

  return gutters;
}

/**
 * Computes bounding box encompassing all input blocks.
 * @param {Array<{ bbox: { x: number, y: number, w: number, h: number } }>} blocks
 * @returns {{ x: number, y: number, w: number, h: number }}
 */
export function getBoundingBox(blocks) {
  if (!blocks || blocks.length === 0) {
    return { x: 0, y: 0, w: 0, h: 0 };
  }

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const b of blocks) {
    const bbox = b.bbox;
    if (bbox.x < minX) minX = bbox.x;
    if (bbox.y < minY) minY = bbox.y;
    if (bbox.x + bbox.w > maxX) maxX = bbox.x + bbox.w;
    if (bbox.y + bbox.h > maxY) maxY = bbox.y + bbox.h;
  }

  return {
    x: minX,
    y: minY,
    w: maxX - minX,
    h: maxY - minY
  };
}
