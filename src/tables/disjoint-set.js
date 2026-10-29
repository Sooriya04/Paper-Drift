/**
 * @file src/tables/disjoint-set.js
 * @description Path-compressed Disjoint-Set Union (DSU) for clustering meeting vector rules.
 * Groups abutting and intersecting line segments within coordinate snapping tolerance.
 * Part of paper-drift - https://github.com/Sooriya04/Paper-Drift
 */

/**
 * Path-compressed Disjoint-Set Union (DSU) with union-by-rank.
 */
export class DisjointSet {
  /**
   * @param {number} size - Number of elements
   */
  constructor(size) {
    this.parent = new Int32Array(size);
    this.rank = new Int32Array(size);
    for (let i = 0; i < size; i++) {
      this.parent[i] = i;
    }
  }

  /**
   * Finds the representative root of element i with full path compression.
   * @param {number} i
   * @returns {number}
   */
  find(i) {
    let root = i;
    while (root !== this.parent[root]) {
      root = this.parent[root];
    }
    // Path compression
    let curr = i;
    while (curr !== root) {
      const next = this.parent[curr];
      this.parent[curr] = root;
      curr = next;
    }
    return root;
  }

  /**
   * Unites sets containing i and j by rank.
   * @param {number} i
   * @param {number} j
   * @returns {boolean} True if sets were disjoint and merged; false if already in same set.
   */
  union(i, j) {
    const rootI = this.find(i);
    const rootJ = this.find(j);
    if (rootI === rootJ) return false;

    if (this.rank[rootI] < this.rank[rootJ]) {
      this.parent[rootI] = rootJ;
    } else if (this.rank[rootI] > this.rank[rootJ]) {
      this.parent[rootJ] = rootI;
    } else {
      this.parent[rootI] = rootJ;
      this.rank[rootJ]++;
    }
    return true;
  }

  /**
   * Checks whether elements i and j belong to the same set.
   * @param {number} i
   * @param {number} j
   * @returns {boolean}
   */
  connected(i, j) {
    return this.find(i) === this.find(j);
  }
}

/**
 * Normalizes rule coordinates to standard { left, top, right, bottom } format.
 *
 * @param {Object|Array} rule
 * @returns {{ left: number, top: number, right: number, bottom: number }}
 */
export function getRuleBounds(rule) {
  if (!rule) {
    return { left: 0, top: 0, right: 0, bottom: 0 };
  }
  if (rule.left !== undefined && rule.right !== undefined) {
    return {
      left: Math.min(rule.left, rule.right),
      top: Math.min(rule.top, rule.bottom),
      right: Math.max(rule.left, rule.right),
      bottom: Math.max(rule.top, rule.bottom)
    };
  }
  if (Array.isArray(rule) && rule.length >= 4) {
    return {
      left: Math.min(rule[0], rule[2]),
      top: Math.min(rule[1], rule[3]),
      right: Math.max(rule[0], rule[2]),
      bottom: Math.max(rule[1], rule[3])
    };
  }
  if (rule.x !== undefined && rule.width !== undefined) {
    return {
      left: rule.x,
      top: rule.y || 0,
      right: rule.x + rule.width,
      bottom: (rule.y || 0) + (rule.height || 0)
    };
  }
  return { left: 0, top: 0, right: 0, bottom: 0 };
}

/**
 * Checks whether two ruling lines intersect or abut within snapping distance.
 *
 * @param {Object} ruleA
 * @param {Object} ruleB
 * @param {number} snap
 * @returns {boolean}
 */
export function rulesMeet(ruleA, ruleB, snap = 2.0) {
  const a = getRuleBounds(ruleA);
  const b = getRuleBounds(ruleB);

  return (
    a.left - snap <= b.right + snap &&
    b.left - snap <= a.right + snap &&
    a.top - snap <= b.bottom + snap &&
    b.top - snap <= a.bottom + snap
  );
}

/**
 * Groups intersecting and abutting vector rules into isolated table candidates.
 * Uses Disjoint-Set Union (DSU) with path compression and coordinate snapping.
 *
 * @param {Array<Object>} rules - Array of vector rules
 * @param {number|{ snap?: number, pageWidth?: number }} [snap=2.0] - Snapping tolerance distance or config
 * @returns {Array<Array<Object>>} Clusters of connected rules
 */
export function connectedRules(rules, snap = 2.0) {
  if (!rules || rules.length === 0) return [];
  if (rules.length === 1) return [[rules[0]]];

  let tolerance = 2.0;
  if (typeof snap === 'number') {
    tolerance = snap;
  } else if (snap && typeof snap === 'object') {
    if (typeof snap.snap === 'number') {
      tolerance = snap.snap;
    } else if (typeof snap.pageWidth === 'number' && snap.pageWidth > 0) {
      tolerance = snap.pageWidth * 0.004;
    }
  }

  const dsu = new DisjointSet(rules.length);

  for (let i = 0; i < rules.length; i++) {
    for (let j = i + 1; j < rules.length; j++) {
      if (rulesMeet(rules[i], rules[j], tolerance)) {
        dsu.union(i, j);
      }
    }
  }

  const groups = new Map();
  for (let i = 0; i < rules.length; i++) {
    const root = dsu.find(i);
    if (!groups.has(root)) {
      groups.set(root, []);
    }
    groups.get(root).push(rules[i]);
  }

  return Array.from(groups.values());
}
