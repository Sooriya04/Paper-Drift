/**
 * @file src/vectors/rules.js
 * @description Ruling line extraction and recurring page furniture (header/footer) filtering.
 * Identifies thin stroke rectangles and differentiates content lines from decorative borders.
 * Part of paper-drift - https://github.com/Sooriya04/Paper-Drift
 */

export const MAX_RULE_THICKNESS = 4.0;
export const MIN_RULE_LENGTH = 8.0;
export const MIN_FRACTION_BAR_LENGTH = 2.0;
export const MARGIN_BAND = 0.12;

/**
 * Checks whether a color array is achromatic/monochrome and sufficiently dark to be a structural ruling line.
 * Rejects colored diagram and heatmap fills.
 *
 * @param {number[]|null} color - RGBA or RGB float color array [r, g, b] in [0, 1] range
 * @returns {boolean}
 */
export function isDarkMonochrome(color) {
  if (!color || !Array.isArray(color) || color.length === 0) {
    return true; // Assume standard stroke color if unspecified
  }
  if (color.length === 1) {
    return color[0] <= 0.35;
  }
  if (color.length >= 3) {
    const [r, g, b] = color;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    // Strict achromatic check: |r-g| <= 0.05, |g-b| <= 0.05, max <= 0.35
    return (max - min) <= 0.05 && max <= 0.35;
  }
  return true;
}

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
 * Classifies a vector element into its semantic role.
 *
 * @param {Object} vector - Vector object with bbox, flags, color
 * @returns {'table_rule'|'fraction_bar'|'diagram_element'|'fill'}
 */
export function classifyVector(vector) {
  if (!vector || !vector.bbox || vector.bbox.length < 4) {
    return 'diagram_element';
  }
  const left = Math.min(vector.bbox[0], vector.bbox[2]);
  const top = Math.min(vector.bbox[1], vector.bbox[3]);
  const right = Math.max(vector.bbox[0], vector.bbox[2]);
  const bottom = Math.max(vector.bbox[1], vector.bbox[3]);
  const width = right - left;
  const height = bottom - top;
  const isStroked = Boolean(vector.flags?.isStroked);
  const isRect = Boolean(vector.flags?.isRectangle);
  const colorOk = isStroked || isDarkMonochrome(vector.color);

  // Stroked or dark monochrome thin line >= 8.0pt -> table_rule
  if (isThinRule(width, height)) {
    if (!colorOk) {
      return 'diagram_element';
    }
    return 'table_rule';
  }

  // Short horizontal line (e.g. math fraction bar / vinculum: length 2-8pt, thickness <= 1.5pt)
  const minDim = Math.min(width, height);
  const maxDim = Math.max(width, height);
  if (minDim <= 1.5 && maxDim >= MIN_FRACTION_BAR_LENGTH && maxDim < MIN_RULE_LENGTH) {
    if (isStroked || colorOk) {
      return 'fraction_bar';
    }
    return 'diagram_element';
  }

  // Stroked hollow box >= 8pt
  if (isStroked && isRect && width >= MIN_RULE_LENGTH && height >= MIN_RULE_LENGTH) {
    return 'table_rule';
  }

  // Colored unstroked fills or larger blocks
  if (!isStroked) {
    return 'fill';
  }

  return 'diagram_element';
}

/**
 * Extracts ruling lines from a vector object.
 * Rejects unstroked colored diagram/heatmap fills to prevent false tables.
 *
 * @param {Object} vector - Object containing bbox, flags, and color
 * @returns {Array<{ left: number, top: number, right: number, bottom: number }>}
 */
export function rulesFromVector(vector) {
  if (!vector || !vector.bbox || vector.bbox.length < 4) {
    return [];
  }
  const { bbox, flags, color } = vector;
  const left = Math.min(bbox[0], bbox[2]);
  const top = Math.min(bbox[1], bbox[3]);
  const right = Math.max(bbox[0], bbox[2]);
  const bottom = Math.max(bbox[1], bbox[3]);
  const width = right - left;
  const height = bottom - top;

  const isStroked = Boolean(flags?.isStroked);
  const colorOk = isStroked || isDarkMonochrome(color);

  if (isThinRule(width, height)) {
    // If not stroked and has a non-monochrome / light color, it's a diagram/heatmap fill, not a rule
    if (!colorOk) {
      return [];
    }
    return [{ left, top, right, bottom }];
  }

  if (isStroked && flags?.isRectangle && width >= MIN_RULE_LENGTH && height >= MIN_RULE_LENGTH) {
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
 * Merges adjacent or overlapping collinear ruling lines into unified segments.
 *
 * @param {Array<{ left: number, top: number, right: number, bottom: number }>} rules
 * @param {number} [maxGap=2.5] - Maximum gap in points between adjacent segments to bridge
 * @returns {Array<{ left: number, top: number, right: number, bottom: number }>}
 */
export function mergeCollinearRules(rules, maxGap = 2.5) {
  if (!rules || !Array.isArray(rules) || rules.length <= 1) {
    return rules || [];
  }

  const horizontals = [];
  const verticals = [];
  const others = [];

  for (const r of rules) {
    const w = r.right - r.left;
    const h = r.bottom - r.top;
    if (h <= MAX_RULE_THICKNESS && w >= h) {
      horizontals.push({ ...r });
    } else if (w <= MAX_RULE_THICKNESS && h > w) {
      verticals.push({ ...r });
    } else {
      others.push({ ...r });
    }
  }

  // Merge horizontal collinear segments
  // Group by near-identical vertical elevation (within 1.5pt)
  const mergedHoriz = [];
  horizontals.sort((a, b) => a.top - b.top || a.left - b.left);

  let currentGroup = [];
  for (const r of horizontals) {
    if (currentGroup.length === 0) {
      currentGroup.push(r);
    } else {
      const repY = (currentGroup[0].top + currentGroup[0].bottom) / 2;
      const curY = (r.top + r.bottom) / 2;
      if (Math.abs(repY - curY) <= 1.5) {
        currentGroup.push(r);
      } else {
        mergedHoriz.push(...merge1DIntervals(currentGroup, 'horizontal', maxGap));
        currentGroup = [r];
      }
    }
  }
  if (currentGroup.length > 0) {
    mergedHoriz.push(...merge1DIntervals(currentGroup, 'horizontal', maxGap));
  }

  // Merge vertical collinear segments
  // Group by near-identical horizontal position (within 1.5pt)
  const mergedVert = [];
  verticals.sort((a, b) => a.left - b.left || a.top - b.top);

  currentGroup = [];
  for (const r of verticals) {
    if (currentGroup.length === 0) {
      currentGroup.push(r);
    } else {
      const repX = (currentGroup[0].left + currentGroup[0].right) / 2;
      const curX = (r.left + r.right) / 2;
      if (Math.abs(repX - curX) <= 1.5) {
        currentGroup.push(r);
      } else {
        mergedVert.push(...merge1DIntervals(currentGroup, 'vertical', maxGap));
        currentGroup = [r];
      }
    }
  }
  if (currentGroup.length > 0) {
    mergedVert.push(...merge1DIntervals(currentGroup, 'vertical', maxGap));
  }

  return [...mergedHoriz, ...mergedVert, ...others];
}

/**
 * Merges sorted intervals along a single line axis.
 * @private
 */
function merge1DIntervals(items, direction, maxGap) {
  if (items.length <= 1) return items;
  if (direction === 'horizontal') {
    items.sort((a, b) => a.left - b.left);
    const result = [];
    let cur = { ...items[0] };
    for (let i = 1; i < items.length; i++) {
      const next = items[i];
      if (next.left <= cur.right + maxGap) {
        cur.right = Math.max(cur.right, next.right);
        cur.top = Math.min(cur.top, next.top);
        cur.bottom = Math.max(cur.bottom, next.bottom);
      } else {
        result.push(cur);
        cur = { ...next };
      }
    }
    result.push(cur);
    return result;
  } else {
    items.sort((a, b) => a.top - b.top);
    const result = [];
    let cur = { ...items[0] };
    for (let i = 1; i < items.length; i++) {
      const next = items[i];
      if (next.top <= cur.bottom + maxGap) {
        cur.bottom = Math.max(cur.bottom, next.bottom);
        cur.left = Math.min(cur.left, next.left);
        cur.right = Math.max(cur.right, next.right);
      } else {
        result.push(cur);
        cur = { ...next };
      }
    }
    result.push(cur);
    return result;
  }
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
 * Compares two margin rules for spatial equivalence with fuzzy geometric alignment.
 * Handles recto/verso alternating header shifts (where horizontal rules share elevation
 * but shift horizontally or vary in length).
 *
 * @param {Object} r1 - First rule
 * @param {Object} r2 - Second rule
 * @param {number} [tol=2.0] - Strict coordinate tolerance
 * @returns {boolean}
 */
function rulesMatchFuzzy(r1, r2, tol = 2.0) {
  // Strict match first
  if (Math.abs(r1.left - r2.left) <= tol &&
      Math.abs(r1.top - r2.top) <= tol &&
      Math.abs(r1.right - r2.right) <= tol &&
      Math.abs(r1.bottom - r2.bottom) <= tol) {
    return true;
  }

  const w1 = r1.right - r1.left;
  const h1 = r1.bottom - r1.top;
  const w2 = r2.right - r2.left;
  const h2 = r2.bottom - r2.top;

  const isH1 = h1 <= MAX_RULE_THICKNESS && w1 >= h1;
  const isH2 = h2 <= MAX_RULE_THICKNESS && w2 >= h2;

  // Both horizontal rules at same vertical elevation in top/bottom margin
  if (isH1 && isH2) {
    const yMid1 = (r1.top + r1.bottom) / 2;
    const yMid2 = (r2.top + r2.bottom) / 2;
    if (Math.abs(yMid1 - yMid2) <= 3.5) {
      // Check significant horizontal overlap or recto/verso alternating header span
      const overlapStart = Math.max(r1.left, r2.left);
      const overlapEnd = Math.min(r1.right, r2.right);
      const overlap = Math.max(0, overlapEnd - overlapStart);
      const minLen = Math.min(w1, w2);
      // If rules overlap by at least 30% of their length or both span > 200pt across the page
      if ((minLen > 0 && overlap / minLen >= 0.3) || (w1 >= 200 && w2 >= 200)) {
        return true;
      }
    }
  }

  // Both vertical rules at same horizontal position in left/right margin
  const isV1 = w1 <= MAX_RULE_THICKNESS && h1 > w1;
  const isV2 = w2 <= MAX_RULE_THICKNESS && h2 > w2;
  if (isV1 && isV2) {
    const xMid1 = (r1.left + r1.right) / 2;
    const xMid2 = (r2.left + r2.right) / 2;
    if (Math.abs(xMid1 - xMid2) <= 3.5) {
      const overlapStart = Math.max(r1.top, r2.top);
      const overlapEnd = Math.min(r1.bottom, r2.bottom);
      const overlap = Math.max(0, overlapEnd - overlapStart);
      const minLen = Math.min(h1, h2);
      if (minLen > 0 && overlap / minLen >= 0.3) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Filters out running header/footer rules that recur in page margins across multiple pages.
 * Incorporates fuzzy geometric alignment to suppress recto/verso alternating headers.
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
        let matchedCluster = marginClusters.find(c => rulesMatchFuzzy(c.rep, rule, 2.0));
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
      const isRecurring = recurringClusters.some(c => rulesMatchFuzzy(c.rep, rule, 2.0));
      return !isRecurring;
    });

    result.set(pageIdx, validRules);
  }

  return result;
}
