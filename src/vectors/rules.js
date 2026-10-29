/**
 * @file src/vectors/rules.js
 * @description Ruling line extraction and recurring page furniture (header/footer) filtering.
 * Identifies thin stroke rectangles and differentiates content lines from decorative borders.
 * Part of paper-drift - https://github.com/Sooriya04/Paper-Drift
 */

export const MAX_RULE_THICKNESS = 4.0;
export const MIN_RULE_LENGTH = 8.0;
export const MARGIN_BAND = 0.12;

/**
 * Checks whether a given rectangle has the geometric dimensions of a ruling line.
 * @param {number} width - Stroke width in points
 * @param {number} height - Stroke height in points
 * @returns {boolean}
 */
export function isThinRule(width, height) {
  const w = Math.abs(width);
  const h = Math.abs(height);
  return (h <= MAX_RULE_THICKNESS && w >= MIN_RULE_LENGTH) ||
         (w <= MAX_RULE_THICKNESS && h >= MIN_RULE_LENGTH);
}

/**
 * Extracts ruling lines from a vector object.
 * @param {Object} vector - Object containing bbox and flags
 * @returns {Array<{ left: number, top: number, right: number, bottom: number }>}
 */
export function rulesFromVector(vector) {
  if (!vector || !vector.bbox || vector.bbox.length < 4) {
    return [];
  }
  const { bbox, flags } = vector;
  const left = Math.min(bbox[0], bbox[2]);
  const top = Math.min(bbox[1], bbox[3]);
  const right = Math.max(bbox[0], bbox[2]);
  const bottom = Math.max(bbox[1], bbox[3]);
  const width = right - left;
  const height = bottom - top;

  if (isThinRule(width, height)) {
    return [{ left, top, right, bottom }];
  }

  if (flags?.isStroked && flags?.isRectangle && width >= MIN_RULE_LENGTH && height >= MIN_RULE_LENGTH) {
    return [
      { left, top, right, bottom: top },
      { left, top: bottom, right, bottom },
      { left, top, right: left, bottom },
      { left: right, top, right, bottom }
    ];
  }

  return [];
}

/**
 * Checks if a rule falls within the document page margin band (outer 12%).
 * @param {{ left: number, top: number, right: number, bottom: number }} rule
 * @param {number[]} bounds - Page bounds [x0, y0, x1, y1]
 * @returns {boolean}
 */
export function inMargin(rule, bounds) {
  if (!rule || !bounds || bounds.length < 4) return false;
  const width = bounds[2] - bounds[0];
  const height = bounds[3] - bounds[1];
  if (width <= 0 || height <= 0) return false;

  const midX = (rule.left + rule.right) / 2 - bounds[0];
  const midY = (rule.top + rule.bottom) / 2 - bounds[1];

  return midY <= height * MARGIN_BAND ||
         midY >= height * (1 - MARGIN_BAND) ||
         midX <= width * MARGIN_BAND ||
         midX >= width * (1 - MARGIN_BAND);
}

/**
 * Calculates how many pages a rule must recur on to count as running page furniture.
 * @param {number} pageCount - Total pages in document
 * @returns {number}
 */
export function runningPageThreshold(pageCount) {
  const count = typeof pageCount === 'number' && !isNaN(pageCount) ? pageCount : 0;
  return Math.min(8, Math.max(3, Math.ceil(count * 0.5)));
}

/**
 * Compares two rules for spatial equivalence within a given coordinate tolerance.
 * @param {Object} r1
 * @param {Object} r2
 * @param {number} [tol=2.0]
 * @returns {boolean}
 */
function rulesMatch(r1, r2, tol = 2.0) {
  return Math.abs(r1.left - r2.left) <= tol &&
         Math.abs(r1.top - r2.top) <= tol &&
         Math.abs(r1.right - r2.right) <= tol &&
         Math.abs(r1.bottom - r2.bottom) <= tol;
}

/**
 * Filters out running header/footer rules that recur in page margins across multiple pages.
 *
 * @param {Array<{ index?: number, bounds?: number[], rules?: Array<Object> }>} pagesData
 * @returns {Map<number, Array<Object>>} Zero-indexed page index -> valid content rules
 */
export function filterContentRules(pagesData) {
  if (!pagesData || !Array.isArray(pagesData) || pagesData.length === 0) {
    return new Map();
  }

  const pageCount = pagesData.length;
  const threshold = runningPageThreshold(pageCount);

  // Group recurring margin rules across pages
  const marginClusters = [];

  for (let i = 0; i < pagesData.length; i++) {
    const page = pagesData[i];
    const pageIdx = page.index !== undefined ? page.index : i;
    const bounds = page.bounds || [0, 0, 612, 792];
    const rules = page.rules || [];

    for (const rule of rules) {
      if (inMargin(rule, bounds)) {
        let matchedCluster = marginClusters.find(c => rulesMatch(c.rep, rule, 2.0));
        if (!matchedCluster) {
          matchedCluster = { rep: rule, pageIndices: new Set() };
          marginClusters.push(matchedCluster);
        }
        matchedCluster.pageIndices.add(pageIdx);
      }
    }
  }

  // Identify recurring furniture clusters (>= threshold occurrences)
  const recurringClusters = marginClusters.filter(c => c.pageIndices.size >= threshold);

  const result = new Map();

  for (let i = 0; i < pagesData.length; i++) {
    const page = pagesData[i];
    const pageIdx = page.index !== undefined ? page.index : i;
    const bounds = page.bounds || [0, 0, 612, 792];
    const rules = page.rules || [];

    const validRules = rules.filter(rule => {
      // Content rules outside margin are always preserved
      if (!inMargin(rule, bounds)) {
        return true;
      }
      // Rule is in margin: drop if it matches any recurring cluster
      const isRecurring = recurringClusters.some(c => rulesMatch(c.rep, rule, 2.0));
      return !isRecurring;
    });

    result.set(pageIdx, validRules);
  }

  return result;
}
