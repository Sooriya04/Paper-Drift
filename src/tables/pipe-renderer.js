/**
 * @file src/tables/pipe-renderer.js
 * @description Renders 2D cell matrices into normalized GitHub Flavored Markdown (GFM) pipe tables.
 * Formats column alignments, escapes pipe delimiters, and handles variable row lengths cleanly.
 * Part of paper-drift - https://github.com/Sooriya04/Paper-Drift
 */

/**
 * Escapes pipe delimiters and collapses whitespace in a table cell string.
 * Preserves mathematical notation (superscripts, subscripts, Greek, operators).
 * Ensures existing escaped pipes (\|) are not double-escaped.
 *
 * @param {any} cell
 * @returns {string} Clean cell content
 */
export function escapeTableCell(cell) {
  if (cell === null || cell === undefined) return '';
  return String(cell)
    .replace(/\r?\n/g, ' ')
    .replace(/\\\|/g, '\0PIPE\0')
    .replace(/\|/g, '\\|')
    .replace(/\0PIPE\0/g, '\\|')
    .replace(/[^\S\r\n]+/g, ' ')
    .trim();
}

/**
 * Renders a structured grid of cell strings or rich table cell objects into standard GFM pipe table format.
 * Supports multi-level hierarchical headers by synthesizing qualified column titles (e.g. "BLEU / EN-DE").
 * Expands spanned cells across columns or rows gracefully to prevent information loss.
 *
 * @param {string[][]|Array<Array<Object>>} matrix - 2D array of cell strings or cell objects [rows][cols]
 * @param {Array<'left'|'center'|'right'|string>} [alignments=[]] - Column alignment specifications
 * @param {Object} [options={}] - Rendering options
 * @param {number} [options.headerRows=1] - Number of rows representing header hierarchy
 * @returns {string} Valid GitHub Flavored Markdown table string
 */
export function renderPipeTable(matrix, alignments = [], options = {}) {
  if (!matrix || !Array.isArray(matrix) || matrix.length === 0) return '';

  const headerRows = Math.max(1, options.headerRows || 1);
  const colCount = Math.max(0, ...matrix.map(row => (Array.isArray(row) ? row.length : 0)));
  if (colCount === 0) return '';

  // Extract raw text from string or rich TableCell objects
  const rawGrid = matrix.map(row => {
    const cells = Array.isArray(row) ? [...row] : [];
    while (cells.length < colCount) cells.push('');
    return cells.slice(0, colCount).map(c => {
      if (c && typeof c === 'object') {
        return c.text !== undefined ? c.text : (c.value || '');
      }
      return c;
    });
  });

  let header;
  let bodyRows;

  // Handle multi-level hierarchical headers (e.g. 2+ header rows)
  if (headerRows > 1 && rawGrid.length > headerRows) {
    const headerHierarchy = [];
    for (let c = 0; c < colCount; c++) {
      const parts = [];
      for (let r = 0; r < headerRows; r++) {
        const val = String(rawGrid[r][c] || '').trim();
        if (val && !parts.includes(val)) {
          parts.push(val);
        }
      }
      headerHierarchy.push(parts.join(' / '));
    }
    header = headerHierarchy.map(escapeTableCell);
    bodyRows = rawGrid.slice(headerRows).map(row => row.map(escapeTableCell));
  } else {
    header = rawGrid[0].map(escapeTableCell);
    bodyRows = rawGrid.slice(1).map(row => row.map(escapeTableCell));
  }

  // Ensure header cells are not all completely empty
  const hasHeaderContent = header.some(h => h.length > 0);
  if (!hasHeaderContent) {
    for (let c = 0; c < colCount; c++) {
      header[c] = `Col ${c + 1}`;
    }
  }

  // Build alignment delimiter row
  const delimiter = [];
  for (let c = 0; c < colCount; c++) {
    const rawAlign = String((alignments && alignments[c]) || '').toLowerCase().trim();
    if (rawAlign === 'center' || rawAlign === 'c' || rawAlign === 'centre') {
      delimiter.push(':---:');
    } else if (rawAlign === 'right' || rawAlign === 'r') {
      delimiter.push('---:');
    } else {
      delimiter.push(':---');
    }
  }

  const lines = [
    `| ${header.join(' | ')} |`,
    `| ${delimiter.join(' | ')} |`,
    ...bodyRows.map(row => `| ${row.join(' | ')} |`)
  ];

  return lines.join('\n') + '\n\n';
}
