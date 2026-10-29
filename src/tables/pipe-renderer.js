/**
 * @file src/tables/pipe-renderer.js
 * @description Renders 2D cell matrices into normalized GitHub Flavored Markdown (GFM) pipe tables.
 * Formats column alignments, escapes pipe delimiters, and handles variable row lengths cleanly.
 * Part of paper-drift - https://github.com/Sooriya04/Paper-Drift
 */

/**
 * Escapes pipe delimiters and collapses whitespace in a table cell string.
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
    .trim();
}

/**
 * Renders a structured grid of cell strings into standard GFM pipe table format.
 *
 * @param {string[][]} matrix - 2D array of cell contents [rows][cols]
 * @param {Array<'left'|'center'|'right'|string>} [alignments=[]] - Column alignment specifications
 * @returns {string} Valid GitHub Flavored Markdown table string
 */
export function renderPipeTable(matrix, alignments = []) {
  if (!matrix || !Array.isArray(matrix) || matrix.length === 0) return '';

  const colCount = Math.max(0, ...matrix.map(row => (Array.isArray(row) ? row.length : 0)));
  if (colCount === 0) return '';

  const normalized = matrix.map(row => {
    const cells = Array.isArray(row) ? [...row] : [];
    while (cells.length < colCount) cells.push('');
    return cells.slice(0, colCount).map(escapeTableCell);
  });

  const header = normalized[0];
  const bodyRows = normalized.slice(1);

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
