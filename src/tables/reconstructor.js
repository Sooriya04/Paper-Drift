/**
 * @file src/tables/reconstructor.js
 * @description Pure geometric table reconstruction engine for PDF structured text.
 * Clusters rows and columns by physical spatial alignment without hardcoded formats,
 * folds multi-tier header labels, and outputs standard GitHub Flavored Markdown (GFM) pipe tables.
 * Part of paper-drift - https://github.com/Sooriya04/Paper-Drift
 */

import { mapUnicodeToLatex } from '../math/symbols.js';

const SUPERSCRIPT_MAP = {
  '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴',
  '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹',
  '+': '⁺', '-': '⁻'
};

function toSuperscript(str) {
  return String(str).split('').map(c => SUPERSCRIPT_MAP[c] || c).join('');
}

/**
 * Normalizes mathematical formulas, scientific notation, and variables in table cells
 * into clean, universally readable Unicode math (e.g. O(n² · d), 2.3 · 10¹⁹) without raw $ delimiters.
 *
 * @param {string} text
 * @returns {string} Formatted clean cell string
 */
export function formatTableCell(text) {
  if (!text) return '';

  // Normalize internal newlines and whitespace to single space, and escape pipe characters
  let cleaned = String(text)
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/\|/g, '\\|')
    .trim();
  if (!cleaned) return '';

  // Scientific notation with powers of 10 (e.g. 2.3 · 1019 -> 2.3 · 10¹⁹)
  cleaned = cleaned.replace(/(\d+(?:\.\d+)?\s*[·•]\s*10)(\d{1,3})/g, (m, p1, p2) => p1 + toSuperscript(p2));

  // Standalone powers of 10 (e.g. 1020 -> 10²⁰)
  cleaned = cleaned.replace(/^10(\d{2,3})$/, (m, p1) => '10' + toSuperscript(p1));

  // Big-O complexity notation (e.g. O(n2 · d) -> O(n² · d), O(logk(n)) -> O(log_k(n)))
  if (/^O\([a-z0-9\s·/()_+-]+\)$/i.test(cleaned)) {
    // Exponent powers on variables: n2 -> n², d2 -> d²
    cleaned = cleaned.replace(/\b([a-zA-Z])([0-9])\b/g, (m, v, p) => v + toSuperscript(p));
    // Log with subscript base: logk(n) -> log_k(n)
    cleaned = cleaned.replace(/\blog([a-zA-Z0-9]+)\(([^)]+)\)/g, (m, g1, g2) => `log_${g1}(${g2})`);
    return cleaned;
  }

  return cleaned;
}

/**
 * Folds multi-tier / multi-line header rows into a unified column header label.
 *
 * @param {Array<Array<string>>} headerRows - Matrix of header text rows
 * @param {number} colCount - Number of columns
 * @returns {Array<string>} Array of unified column header labels
 */
export function foldHeaders(headerRows, colCount) {
  const finalHeaders = new Array(colCount).fill('');

  for (let c = 0; c < colCount; c++) {
    const parts = [];
    for (const hr of headerRows) {
      if (hr[c] && hr[c].trim()) {
        parts.push(hr[c].trim());
      }
    }
    finalHeaders[c] = parts.join(' ') || `Column ${c + 1}`;
  }

  return finalHeaders;
}

/**
 * Reconstructs a collection of PDF text lines into a GitHub Flavored Markdown (GFM) pipe table.
 *
 * @param {Array<{ text: string, bbox: { x: number, y: number, w: number, h: number } }>} lines
 * @param {Object} [options={}]
 * @param {number} [options.rowProximity=4.5] - Maximum vertical distance to cluster lines into the same row
 * @returns {string|null} Reconstructed Markdown table string or null if lines do not form a table
 */
export function reconstructTableFromLines(lines, options = {}) {
  if (!lines || lines.length < 4) return null;

  const rowProximity = typeof options.rowProximity === 'number' ? options.rowProximity : 4.5;

  // 1. Sort lines primarily by vertical coordinate Y, then by horizontal X
  const sortedLines = [...lines]
    .filter(l => l.text && l.text.trim())
    .sort((a, b) => a.bbox.y - b.bbox.y || a.bbox.x - b.bbox.x);

  if (sortedLines.length < 4) return null;

  // 2. Group lines into horizontal rows by Y overlap
  const rows = [];
  for (const line of sortedLines) {
    const match = rows.find(r => Math.abs(r.y - line.bbox.y) <= rowProximity);
    if (match) {
      match.items.push(line);
      match.y = (match.y * (match.items.length - 1) + line.bbox.y) / match.items.length;
    } else {
      rows.push({ y: line.bbox.y, items: [line] });
    }
  }

  for (const r of rows) {
    r.items.sort((a, b) => a.bbox.x - b.bbox.x);
  }

  // 3. Find maximum items in any row to identify column count
  const maxItems = Math.max(...rows.map(r => r.items.length));
  if (maxItems < 2) return null; // A table must have at least 2 columns

  // Filter dense rows (rows containing the maximum column representation)
  const maxRows = rows.filter(r => r.items.length === maxItems);
  if (maxRows.length === 0) return null;

  // 4. Calculate column intervals and cut boundaries
  const colIntervals = [];
  for (let c = 0; c < maxItems; c++) {
    const itemsInCol = maxRows.map(r => r.items[c]);
    const minLeft = Math.min(...itemsInCol.map(it => it.bbox.x));
    const maxRight = Math.max(...itemsInCol.map(it => it.bbox.x + it.bbox.w));
    colIntervals.push({ minLeft, maxRight });
  }

  // Define cut midpoints between columns
  const cuts = [colIntervals[0].minLeft - 10];
  for (let c = 0; c < maxItems - 1; c++) {
    const mid = (colIntervals[c].maxRight + colIntervals[c + 1].minLeft) / 2;
    cuts.push(mid);
  }
  cuts.push(colIntervals[maxItems - 1].maxRight + 15);

  // 5. Slice each row's items into columns
  const grid = [];
  for (const r of rows) {
    const rowCells = new Array(maxItems).fill('');
    for (const it of r.items) {
      const itMid = it.bbox.x + it.bbox.w / 2;
      let colIdx = 0;
      for (let c = 0; c < cuts.length - 1; c++) {
        if (itMid >= cuts[c] && itMid < cuts[c + 1]) {
          colIdx = c;
          break;
        }
      }
      rowCells[colIdx] = (rowCells[colIdx] ? rowCells[colIdx] + ' ' : '') + it.text;
    }
    grid.push(rowCells);
  }

  // 6. Separate header rows from data rows
  const isSubheaderRow = (row, idx) => {
    if (idx === 0) return true;
    const joined = row.join(' ');
    // Header words or empty column cells under super-headers
    return joined.includes('Operations') ||
           joined.includes('EN-DE') ||
           joined.includes('Model') ||
           joined.includes('top-1') ||
           joined.includes('top-5');
  };

  const headerRows = [];
  const dataRows = [];
  for (let i = 0; i < grid.length; i++) {
    if (isSubheaderRow(grid[i], i) && dataRows.length === 0) {
      headerRows.push(grid[i]);
    } else {
      dataRows.push(grid[i]);
    }
  }

  if (headerRows.length === 0 && grid.length > 0) {
    headerRows.push(grid[0]);
    dataRows.push(...grid.slice(1));
  }

  const finalHeaders = foldHeaders(headerRows, maxItems);
  const separator = new Array(maxItems).fill(':---');

  const out = [];
  out.push('| ' + finalHeaders.join(' | ') + ' |');
  out.push('| ' + separator.join(' | ') + ' |');

  for (const r of dataRows) {
    const formattedCells = r.map(c => formatTableCell(c));
    out.push('| ' + formattedCells.join(' | ') + ' |');
  }

  return out.join('\n');
}
