/**
 * @file src/metadata/provenance.js
 * @description Provenance tracking helper for scientific metadata extraction.
 * Distinguishes extracted values from inferred or unavailable values,
 * and attaches page + bounding box coordinates where present.
 * Part of paper-drift - https://github.com/Sooriya04/Paper-Drift
 */

/**
 * Creates a field entry with explicit provenance.
 *
 * @template T
 * @param {T} value - Extracted or inferred value (null if unavailable)
 * @param {'extracted'|'inferred'|'unavailable'} source - Provenance category
 * @param {number|null} [page=null] - 1-indexed page number
 * @param {[number, number, number, number]|null} [bbox=null] - Bounding box [x0, y0, x1, y1]
 * @param {number} [confidence=1.0] - Extraction confidence score (0.0 to 1.0)
 * @returns {{ value: T, source: 'extracted'|'inferred'|'unavailable', page: number|null, bbox: [number, number, number, number]|null, confidence: number }}
 */
export function createProvenanceField(value, source = 'extracted', page = null, bbox = null, confidence = 1.0) {
  if (value === null || value === undefined || (Array.isArray(value) && value.length === 0) || value === '') {
    return {
      value: null,
      source: 'unavailable',
      page: null,
      bbox: null,
      confidence: 0.0
    };
  }

  return {
    value,
    source,
    page: typeof page === 'number' ? page : null,
    bbox: Array.isArray(bbox) && bbox.length === 4 ? bbox.map(v => Math.round(v * 100) / 100) : null,
    confidence: Math.round(confidence * 100) / 100
  };
}

/**
 * Merges bounding boxes into an encompassing bounding box.
 *
 * @param {Array<[number, number, number, number]>} bboxes
 * @returns {[number, number, number, number]|null}
 */
export function mergeBboxes(bboxes) {
  if (!Array.isArray(bboxes) || bboxes.length === 0) return null;
  const valid = bboxes.filter(b => Array.isArray(b) && b.length === 4);
  if (valid.length === 0) return null;

  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;

  for (const b of valid) {
    if (b[0] < x0) x0 = b[0];
    if (b[1] < y0) y0 = b[1];
    if (b[2] > x1) x1 = b[2];
    if (b[3] > y1) y1 = b[3];
  }

  if (x0 === Infinity) return null;
  return [
    Math.round(x0 * 100) / 100,
    Math.round(y0 * 100) / 100,
    Math.round(x1 * 100) / 100,
    Math.round(y1 * 100) / 100
  ];
}
