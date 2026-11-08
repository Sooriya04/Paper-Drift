/**
 * @file src/tables/grid.js
 * @description Geometric table grid reconstruction for full-grid and academic Booktabs tables.
 * Maps text lines into 2D cell matrices based on rule intersections, projection profiles, and character-level alignment.
 * Part of paper-drift - https://github.com/Sooriya04/Paper-Drift
 */

import { DisjointSet, connectedRules, getRuleBounds } from './disjoint-set.js';
import { renderPipeTable } from './pipe-renderer.js';

/**
 * Checks whether a given rule is horizontal.
 *
 * @param {Object} rule
 * @returns {boolean}
 */
export function isHorizontal(rule) {
  const b = getRuleBounds(rule);
  return (b.right - b.left) >= (b.bottom - b.top);
}

/**
 * Checks whether a rule is an isolated footnote divider rule rather than a table boundary.
 *
 * @param {Object} rule
 * @param {number} pageHeight
 * @returns {boolean}
 */
export function isFootnoteDivider(rule, pageHeight = 792) {
  const b = getRuleBounds(rule);
  const w = b.right - b.left;
  const h = b.bottom - b.top;
  return h <= 2.0 && w >= 60 && w <= 220 && b.left < 180 && b.top >= pageHeight * 0.65;
}

/**
 * Clusters 1D numeric coordinates within snapping tolerance.
 *
 * @param {number[]} positions - Array of 1D coordinates
 * @param {number} snap - Cluster distance tolerance
 * @returns {number[]} Centroids of sorted coordinate clusters
 */
export function cluster1D(positions, snap) {
  if (!positions || positions.length === 0) return [];

  const sorted = [...positions].sort((a, b) => a - b);
  const clusters = [];

  for (const pos of sorted) {
    const last = clusters[clusters.length - 1];
    if (last && pos - last.max <= snap) {
      last.values.push(pos);
      last.max = pos;
      last.center = last.values.reduce((s, v) => s + v, 0) / last.values.length;
    } else {
      clusters.push({ center: pos, max: pos, values: [pos] });
    }
  }

  return clusters.map(c => c.center);
}

/**
 * Extracts word tokens with physical horizontal bounds from a text line.
 * Uses exact character positions and font metrics when available; otherwise splits on whitespace.
 * Preserves multi-word cells when separated by single spaces while splitting multi-column items.
 *
 * @param {Object} line - Text line object
 * @returns {Array<{ text: string, left: number, right: number, top: number, bottom: number }>}
 */
export function getWordsFromLine(line) {
  if (!line) return [];

  const lineLeft = line.left ?? (line.bbox ? line.bbox[0] : 0);
  const lineRight = line.right ?? (line.bbox ? line.bbox[2] : lineLeft);
  const lineTop = line.top ?? (line.bbox ? line.bbox[1] : 0);
  const lineBottom = line.bottom ?? (line.bbox ? line.bbox[3] : lineTop);

  // 1. If explicit precomputed word tokens exist, use them
  if (Array.isArray(line.words) && line.words.length > 0) {
    return line.words.map(w => ({
      text: String(w.text ?? w.str ?? '').trim(),
      left: w.left ?? (w.bbox ? w.bbox[0] : lineLeft),
      right: w.right ?? (w.bbox ? w.bbox[2] : lineRight),
      top: w.top ?? (w.bbox ? w.bbox[1] : lineTop),
      bottom: w.bottom ?? (w.bbox ? w.bbox[3] : lineBottom)
    })).filter(w => w.text.length > 0);
  }

  // 2. Character-level spatial segmentation using physical font sizes & gaps
  if (Array.isArray(line.chars) && line.chars.length > 0) {
    const chars = line.chars;
    const tokens = [];
    let curText = chars[0].char;
    let startX = chars[0].x;
    let endX = chars[0].x + (chars[0].size * 0.5 || 5);

    for (let i = 1; i < chars.length; i++) {
      const c = chars[i];
      const prev = chars[i - 1];
      const fontSize = Math.max(6, c.size || (lineBottom - lineTop) || 10);
      const gap = c.x - (prev.x + (prev.size * 0.45 || 4));

      // If gap between characters exceeds a column gutter threshold (~0.75x font size or 7pt)
      if (gap >= Math.max(7.0, fontSize * 0.75)) {
        const trimmed = curText.trim();
        if (trimmed) {
          tokens.push({ text: trimmed, left: startX, right: endX, top: lineTop, bottom: lineBottom });
        }
        curText = c.char;
        startX = c.x;
        endX = c.x + (c.size * 0.5 || 5);
      } else {
        curText += c.char;
        endX = Math.max(endX, c.x + (c.size * 0.5 || 5));
      }
    }
    const trimmed = curText.trim();
    if (trimmed) {
      tokens.push({ text: trimmed, left: startX, right: endX, top: lineTop, bottom: lineBottom });
    }
    if (tokens.length > 0) {
      return tokens;
    }
  }

  // 3. Fallback: string whitespace analysis
  const rawText = String(line.text || '').trim();
  if (!rawText) return [];

  const hasMultiSpace = /\s{2,}/.test(line.text);
  const regex = hasMultiSpace ? /\S+(?:\s\S+)*/g : /\S+/g;
  const matches = [];
  let match;
  while ((match = regex.exec(line.text)) !== null) {
    matches.push({
      text: match[0],
      start: match.index,
      end: match.index + match[0].length
    });
  }

  if (matches.length <= 1) {
    return [{
      text: rawText,
      left: lineLeft,
      right: lineRight,
      top: lineTop,
      bottom: lineBottom
    }];
  }

  const totalChars = (line.text || '').length;
  const lineWidth = Math.max(1, lineRight - lineLeft);
  const charWidth = lineWidth / totalChars;

  return matches.map(m => ({
    text: m.text,
    left: lineLeft + m.start * charWidth,
    right: lineLeft + m.end * charWidth,
    top: lineTop,
    bottom: lineBottom
  }));
}

/**
 * Projects column boundaries and gutters from text X-positions and whitespace intervals.
 *
 * @param {Array<Object>} words - Array of word tokens inside the table
 * @param {number} tableLeft - Left boundary of table
 * @param {number} tableRight - Right boundary of table
 * @param {number} snap - Snapping tolerance
 * @returns {number[]} Sorted column boundaries from left to right
 */
export function projectColumnGutters(words, tableLeft, tableRight, snap) {
  const tableWidth = tableRight - tableLeft;
  if (!words || words.length === 0 || tableWidth <= 0) {
    return [tableLeft, tableRight];
  }

  // Filter out spanning words (spanning > 85% of table)
  const candidateWords = words.filter(w => (w.right - w.left) < tableWidth * 0.85);
  const tokens = candidateWords.length > 0 ? candidateWords : words;

  // 1. Merge overlapping and proximal horizontal intervals
  const sortedTokens = [...tokens].sort((a, b) => a.left - b.left);
  const tolerance = Math.min(1.5, snap * 0.5);
  const intervals = [];

  for (const t of sortedTokens) {
    const tLeft = Math.max(tableLeft, t.left);
    const tRight = Math.min(tableRight, t.right);
    const last = intervals[intervals.length - 1];

    if (!last) {
      intervals.push({ left: tLeft, right: tRight });
    } else if (tLeft <= last.right + tolerance) {
      last.right = Math.max(last.right, tRight);
    } else {
      intervals.push({ left: tLeft, right: tRight });
    }
  }

  const minGutter = Math.max(3.0, snap);
  const dividers = [];

  for (let i = 0; i < intervals.length - 1; i++) {
    const gap = intervals[i + 1].left - intervals[i].right;
    if (gap >= minGutter) {
      dividers.push((intervals[i].right + intervals[i + 1].left) / 2);
    }
  }

  // 2. If no clear whitespace gutters were found via intervals, check whitespace histogram valleys
  if (dividers.length === 0) {
    const W = Math.ceil(tableWidth);
    const hist = new Int32Array(W + 1);
    for (const t of tokens) {
      const x0 = Math.max(0, Math.floor(t.left - tableLeft));
      const x1 = Math.min(W, Math.ceil(t.right - tableLeft));
      for (let x = x0; x <= x1; x++) hist[x]++;
    }

    let vStart = null;
    for (let x = 0; x <= W; x++) {
      if (hist[x] === 0) {
        if (vStart === null) vStart = x;
      } else {
        if (vStart !== null) {
          if (x - vStart >= minGutter) {
            const midX = (vStart + x - 1) / 2 + tableLeft;
            if (midX > tableLeft + 8 && midX < tableRight - 8) {
              dividers.push(midX);
            }
          }
          vStart = null;
        }
      }
    }
  }

  // 3. Fallback: cluster column start coordinates
  if (dividers.length === 0) {
    const starts = cluster1D(tokens.map(w => w.left), Math.max(12, snap * 3));
    if (starts.length >= 2) {
      for (let i = 0; i < starts.length - 1; i++) {
        dividers.push((starts[i] + starts[i + 1]) / 2);
      }
    }
  }

  const boundaries = [tableLeft, ...dividers, tableRight];
  boundaries.sort((a, b) => a - b);

  // Deduplicate proximal boundaries
  const unique = [];
  for (const b of boundaries) {
    if (unique.length === 0 || b - unique[unique.length - 1] >= Math.max(6, snap * 2)) {
      unique.push(b);
    }
  }

  if (unique.length < 2) {
    return [tableLeft, tableRight];
  }

  unique[0] = Math.min(unique[0], tableLeft);
  unique[unique.length - 1] = Math.max(unique[unique.length - 1], tableRight);

  return unique;
}

/**
 * Groups lines into horizontal rows based on vertical proximity and gaps.
 *
 * @param {Array<Object>} lines - Text lines inside the table
 * @param {number} snap - Snapping tolerance
 * @returns {Array<{ top: number, bottom: number, midY: number, lines: Array<Object> }>}
 */
export function groupLinesIntoRows(lines, snap) {
  const sorted = [...lines].sort((a, b) => {
    const topA = a.top ?? (a.bbox ? a.bbox[1] : 0);
    const topB = b.top ?? (b.bbox ? b.bbox[1] : 0);
    return topA - topB;
  });

  const rowClusters = [];

  for (const line of sorted) {
    const lTop = line.top ?? (line.bbox ? line.bbox[1] : 0);
    const lBottom = line.bottom ?? (line.bbox ? line.bbox[3] : lTop);
    const lMidY = (lTop + lBottom) / 2;
    const lHeight = Math.max(6, lBottom - lTop);

    let matched = rowClusters.find(r => {
      const yOverlap = Math.min(r.bottom, lBottom) - Math.max(r.top, lTop);
      return yOverlap > 0 || Math.abs(r.midY - lMidY) <= Math.max(snap * 2, lHeight * 0.45);
    });

    if (matched) {
      matched.lines.push(line);
      matched.top = Math.min(matched.top, lTop);
      matched.bottom = Math.max(matched.bottom, lBottom);
      matched.midY = (matched.top + matched.bottom) / 2;
    } else {
      rowClusters.push({
        top: lTop,
        bottom: lBottom,
        midY: lMidY,
        lines: [line]
      });
    }
  }

  return rowClusters.sort((a, b) => a.midY - b.midY);
}

/**
 * Reconstructs tables from vector rules and page text lines.
 * Supports both full-grid tables (vertical + horizontal rules) and
 * academic Booktabs tables (horizontal rules only).
 *
 * @param {Array<Object>} rules - Vector ruling lines on the page
 * @param {Array<Object>} lines - Text lines on the page
 * @param {number} [pageWidth=612] - Page width in points
 * @param {number} [pageHeight=792] - Page height in points
 * @returns {Array<{ bbox: number[], markdown: string, matrix: string[][], linesInside: Array<Object>, claimedLines: Array<Object>, geometry: Object }>}
 */
export function reconstructTables(rules, lines, pageWidth = 612, pageHeight = 792) {
  if (!rules || rules.length === 0 || !lines || lines.length === 0) return [];

  const snap = (pageWidth && pageWidth > 0) ? pageWidth * 0.004 : 2.0;

  // Filter out isolated footnote separator rules
  const candidateRules = rules.filter(r => !isFootnoteDivider(r, pageHeight));
  const normalizedRules = candidateRules.map(r => ({ ...getRuleBounds(r), orig: r }));

  // Separate horizontal and vertical rules
  const horizontals = normalizedRules.filter(isHorizontal);
  const verticals = normalizedRules.filter(r => !isHorizontal(r));

  const tableCandidates = [];
  const claimedRuleSet = new Set();

  // 1. Full-grid tables: Intersecting vertical and horizontal rules
  if (verticals.length >= 1 && horizontals.length >= 2) {
    const fullGridClusters = connectedRules(normalizedRules, snap);

    for (const cluster of fullGridClusters) {
      const groupHoriz = cluster.filter(isHorizontal);
      const groupVert = cluster.filter(r => !isHorizontal(r));

      // A full-grid table candidate requires at least 2 horizontal rules and at least 1 vertical rule
      if (groupHoriz.length >= 2 && groupVert.length >= 1) {
        groupHoriz.forEach(r => claimedRuleSet.add(r.orig));
        groupVert.forEach(r => claimedRuleSet.add(r.orig));

        const xCoords = groupVert.flatMap(v => [v.left, v.right]);
        const colBoundaries = cluster1D(xCoords, snap * 2);

        const yCoords = groupHoriz.flatMap(h => [h.top, h.bottom]);
        const rowBoundaries = cluster1D(yCoords, snap * 2);

        tableCandidates.push({
          rules: cluster,
          isFullGrid: true,
          colBoundaries,
          rowBoundaries
        });
      }
    }
  }

  // 2. Academic Booktabs tables: Horizontal rules only (no vertical rules connecting them)
  const unclaimedHorizontals = horizontals.filter(h => !claimedRuleSet.has(h.orig));
  const booktabsRules = unclaimedHorizontals.filter(h => (h.right - h.left) >= 30);

  if (booktabsRules.length >= 2) {
    booktabsRules.sort((a, b) => a.top - b.top);
    const dsu = new DisjointSet(booktabsRules.length);

    for (let i = 0; i < booktabsRules.length; i++) {
      for (let j = i + 1; j < booktabsRules.length; j++) {
        const h1 = booktabsRules[i];
        const h2 = booktabsRules[j];

        const xOverlap = Math.min(h1.right, h2.right) - Math.max(h1.left, h2.left);
        const minW = Math.min(h1.right - h1.left, h2.right - h2.left);
        if (minW <= 0 || (xOverlap / minW) < 0.5) continue;

        const yDist = Math.abs(h2.top - h1.top);
        // Table height between consecutive rules should be reasonable (<= 180pt max gap between rules)
        if (yDist < 4 || yDist > 180) continue;

        // Group consecutive aligned rules
        if (j === i + 1) {
          dsu.union(i, j);
        }
      }
    }

    const booktabsGroups = new Map();
    for (let i = 0; i < booktabsRules.length; i++) {
      const root = dsu.find(i);
      if (!booktabsGroups.has(root)) {
        booktabsGroups.set(root, []);
      }
      booktabsGroups.get(root).push(booktabsRules[i]);
    }

    for (const group of booktabsGroups.values()) {
      if (group.length >= 2) {
        tableCandidates.push({
          rules: group,
          isFullGrid: false,
          colBoundaries: null,
          rowBoundaries: null
        });
      }
    }
  }

  // 3. Process candidate rule groups into table models
  const tables = [];

  for (const candidate of tableCandidates) {
    const cRules = candidate.rules;
    const left = Math.min(...cRules.map(r => r.left));
    const right = Math.max(...cRules.map(r => r.right));
    const top = Math.min(...cRules.map(r => r.top));
    const bottom = Math.max(...cRules.map(r => r.bottom));

    const width = right - left;
    const height = bottom - top;

    // Minimum sensible dimensions for a table
    if (width < 35 || height < 12) continue;

    // Collect all text lines that lie inside this bounding box
    const linesInside = lines.filter(l => {
      const lLeft = l.left ?? (l.bbox ? l.bbox[0] : 0);
      const lRight = l.right ?? (l.bbox ? l.bbox[2] : 0);
      const lTop = l.top ?? (l.bbox ? l.bbox[1] : 0);
      const lBottom = l.bottom ?? (l.bbox ? l.bbox[3] : lTop);

      return (
        lLeft >= left - snap * 2 &&
        lRight <= right + snap * 2 &&
        lTop >= top - snap * 2 &&
        lBottom <= bottom + snap * 2
      );
    });

    if (linesInside.length < 2) continue;

    let colBoundaries = candidate.colBoundaries;
    let rowBoundaries = candidate.rowBoundaries;

    // Full-grid 2D cell matrix mapping
    if (candidate.isFullGrid && colBoundaries && rowBoundaries && colBoundaries.length >= 1 && rowBoundaries.length >= 2) {
      const fullXCoords = cluster1D([left, ...colBoundaries, right], snap * 2);
      const fullYCoords = cluster1D([top, ...rowBoundaries, bottom], snap * 2);

      const numGridRows = fullYCoords.length - 1;
      const numGridCols = fullXCoords.length - 1;

      if (numGridRows >= 1 && numGridCols >= 2) {
        const gridCells = Array.from({ length: numGridRows }, () => Array.from({ length: numGridCols }, () => []));

        for (const line of linesInside) {
          const lMidY = (line.top + line.bottom) / 2;
          const lMidX = (line.left + line.right) / 2;

          let rIdx = numGridRows - 1;
          for (let r = 0; r < numGridRows; r++) {
            if (lMidY >= fullYCoords[r] - snap && lMidY < fullYCoords[r + 1] + snap) {
              rIdx = r;
              break;
            }
          }

          let cIdx = numGridCols - 1;
          for (let c = 0; c < numGridCols; c++) {
            if (lMidX >= fullXCoords[c] - snap && lMidX < fullXCoords[c + 1] + snap) {
              cIdx = c;
              break;
            }
          }

          gridCells[rIdx][cIdx].push(line.text);
        }

        const matrix = gridCells.map(row => row.map(cellLines => cellLines.join(' ').trim()));
        const nonEmptyRows = matrix.filter(r => r.some(c => c.length > 0));

        if (nonEmptyRows.length >= 2) {
          const alignments = buildAlignments(nonEmptyRows, numGridCols);
          const markdown = renderPipeTable(nonEmptyRows, alignments);

          tables.push({
            bbox: [left, top, right, bottom],
            markdown,
            matrix: nonEmptyRows,
            linesInside,
            claimedLines: linesInside,
            geometry: {
              isFullGrid: true,
              rows: numGridRows,
              cols: numGridCols,
              colBoundaries: fullXCoords,
              rowBoundaries: fullYCoords
            }
          });
          continue;
        }
      }
    }

    // Booktabs or unstructured table reconstruction
    if (colBoundaries && candidate.isFullGrid) {
      colBoundaries = cluster1D([left, ...colBoundaries, right], snap * 2);
    }
    if (!colBoundaries || colBoundaries.length < 2) {
      const words = linesInside.flatMap(getWordsFromLine);
      colBoundaries = projectColumnGutters(words, left, right, snap);
    }

    colBoundaries = [...new Set(colBoundaries)].sort((a, b) => a - b);
    if (colBoundaries.length < 2) {
      colBoundaries = [left, right];
    }

    const numCols = colBoundaries.length - 1;
    if (numCols < 1) continue;

    // Group lines into rows by vertical gaps
    const rowClusters = groupLinesIntoRows(linesInside, snap);
    if (rowClusters.length < 2) continue;

    // Map words/cells into 2D matrix
    const matrix = [];
    for (const row of rowClusters) {
      const wordsInRow = row.lines.flatMap(getWordsFromLine);
      wordsInRow.sort((a, b) => a.left - b.left);

      const rowCells = new Array(numCols).fill('');
      for (const w of wordsInRow) {
        const midX = (w.left + w.right) / 2;
        let colIdx = 0;
        for (let c = 0; c < numCols; c++) {
          if (midX >= colBoundaries[c] && midX < colBoundaries[c + 1]) {
            colIdx = c;
            break;
          }
        }
        if (midX >= colBoundaries[numCols]) colIdx = numCols - 1;
        rowCells[colIdx] = rowCells[colIdx] ? `${rowCells[colIdx]} ${w.text}` : w.text;
      }

      const trimmedCells = rowCells.map(c => c.trim());
      if (trimmedCells.some(c => c.length > 0)) {
        matrix.push(trimmedCells);
      }
    }

    if (matrix.length < 2) continue;

    // Validate that table has meaningful column structure (not a single text block masquerading as table)
    const maxFilledCols = Math.max(...matrix.map(r => r.filter(Boolean).length));
    if (numCols === 1 && maxFilledCols <= 1 && height > 200) {
      continue; // Skip single-column tall boxes (often abstracts or text blocks enclosed by horizontal rules)
    }

    const alignments = buildAlignments(matrix, numCols);
    const markdown = renderPipeTable(matrix, alignments);

    tables.push({
      bbox: [left, top, right, bottom],
      markdown,
      matrix,
      linesInside,
      claimedLines: linesInside,
      geometry: {
        isFullGrid: false,
        rows: matrix.length,
        cols: numCols,
        colBoundaries
      }
    });
  }

  return tables;
}

/**
 * Derives column alignments (left vs right) based on numeric density.
 * @private
 */
function buildAlignments(matrix, numCols) {
  const alignments = [];
  const NUMERIC_REGEX = /^[-+]?[$€£]?\s*[-+]?\d+(?:[.,]\d+)*(?:[eE][-+]?\d+)?%?$/;

  for (let c = 0; c < numCols; c++) {
    const cellVals = matrix.slice(1).map(r => r[c]?.trim() || '').filter(Boolean);
    const numericCount = cellVals.filter(v => NUMERIC_REGEX.test(v)).length;
    if (cellVals.length > 0 && (numericCount / cellVals.length) >= 0.5) {
      alignments.push('right');
    } else {
      alignments.push('left');
    }
  }

  return alignments;
}
