/**
 * @file test/tables.test.js
 * @description Unit and integration tests for geometric table extraction and GFM rendering.
 * Validates path-compressed DSU clustering, pipe table generation, and Booktabs reconstruction.
 * Part of paper-drift - https://github.com/Sooriya04/Paper-Drift
 */

import { DisjointSet, connectedRules, rulesMeet, getRuleBounds } from '../src/tables/disjoint-set.js';
import { renderPipeTable, escapeTableCell } from '../src/tables/pipe-renderer.js';
import { reconstructTables, projectColumnGutters, groupLinesIntoRows } from '../src/tables/grid.js';

function assert(condition, message) {
  if (!condition) {
    throw new Error(message || 'Assertion failed');
  }
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`${message ? `${message} - ` : ''}Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

function runTest(name, fn) {
  try {
    fn();
    console.log(`  \x1b[32m✔\x1b[0m ${name}`);
  } catch (err) {
    console.error(`  \x1b[31m✖\x1b[0m ${name}`);
    console.error(`    ${err.message}`);
    process.exit(1);
  }
}

console.log('\n\x1b[1m\x1b[36mRunning Table Geometry & Rendering Test Suite\x1b[0m');

// ============================================================================
// 1. Disjoint-Set Union (DSU) & Synthetic Rule Clustering Tests
// ============================================================================
runTest('DisjointSet class maintains sets and performs path compression correctly', () => {
  const dsu = new DisjointSet(6);

  assert(!dsu.connected(0, 1), 'Initially disjoint elements must not be connected');

  assert(dsu.union(0, 1) === true, 'Unioning distinct sets must return true');
  assert(dsu.union(1, 2) === true, 'Unioning transitively must return true');
  assert(dsu.union(0, 2) === false, 'Unioning already connected elements must return false');

  assert(dsu.connected(0, 2), 'Transitive connection 0 <-> 2 must hold');
  assert(dsu.find(0) === dsu.find(2), 'Roots of connected elements must match');

  dsu.union(3, 4);
  dsu.union(4, 5);
  assert(dsu.connected(3, 5), 'Transitive connection 3 <-> 5 must hold');
  assert(!dsu.connected(0, 3), 'Distinct components must remain separate');

  // Merge the two components
  dsu.union(2, 3);
  assert(dsu.connected(0, 5), 'Merged components must connect all elements');
});

runTest('connectedRules clusters 4 intersecting rules of a rectangle into a single group', () => {
  // Rectangle of 4 rules: top, bottom, left, right
  const rectangleRules = [
    { left: 50, top: 100, right: 300, bottom: 100 }, // Top horizontal
    { left: 50, top: 200, right: 300, bottom: 200 }, // Bottom horizontal
    { left: 50, top: 100, right: 50, bottom: 200 },  // Left vertical
    { left: 300, top: 100, right: 300, bottom: 200 } // Right vertical
  ];

  const clusters = connectedRules(rectangleRules, 2.0);
  assertEqual(clusters.length, 1, 'Intersecting rectangle rules must form exactly 1 cluster');
  assertEqual(clusters[0].length, 4, 'Cluster must contain all 4 rules');
});

runTest('connectedRules clusters abutting rules within snap tolerance', () => {
  // Two horizontal rules abutting horizontally with a 1.0pt gap
  const abuttingRules = [
    { left: 10, top: 50, right: 100, bottom: 50 },
    { left: 101, top: 50, right: 200, bottom: 50 }
  ];

  // Snap = 2.0pt -> gap 1.0pt <= 2.0pt -> should cluster
  const clustersSnap2 = connectedRules(abuttingRules, 2.0);
  assertEqual(clustersSnap2.length, 1, 'Rules with 1.0pt gap must cluster when snap = 2.0');

  // Snap = 0.2pt -> gap 1.0pt > 0.4pt total -> should NOT cluster
  const clustersSnapSmall = connectedRules(abuttingRules, 0.2);
  assertEqual(clustersSnapSmall.length, 2, 'Rules with 1.0pt gap must stay separate when snap = 0.2');
});

runTest('connectedRules respects coordinate snapping calculated from pageWidth (snap = pageWidth * 0.004)', () => {
  const pageWidth = 500; // snap = 500 * 0.004 = 2.0
  const rules = [
    { left: 10, top: 50, right: 100, bottom: 50 },
    { left: 101.5, top: 50, right: 200, bottom: 50 }, // Gap = 1.5pt (within 2.0 snap)
    { left: 300, top: 50, right: 400, bottom: 50 }    // Distant rule
  ];

  const clusters = connectedRules(rules, { pageWidth });
  assertEqual(clusters.length, 2, 'Must cluster proximate rules and separate distant rule');
  assert(clusters.some(c => c.length === 2), 'First cluster must contain 2 abutting rules');
  assert(clusters.some(c => c.length === 1), 'Second cluster must contain 1 isolated rule');
});

runTest('connectedRules handles empty and single-rule edge cases', () => {
  assertEqual(connectedRules([]).length, 0, 'Empty rules must return empty array');
  assertEqual(connectedRules(null).length, 0, 'Null rules must return empty array');

  const single = [{ left: 10, top: 10, right: 50, bottom: 10 }];
  const singleCluster = connectedRules(single);
  assertEqual(singleCluster.length, 1, 'Single rule must return 1 cluster');
  assertEqual(singleCluster[0].length, 1, 'Cluster must contain single rule');
});

// ============================================================================
// 2. Pipe-Renderer Alignment and Pipe Escaping Tests
// ============================================================================
runTest('escapeTableCell escapes pipes without double-escaping and collapses newlines', () => {
  assertEqual(escapeTableCell('normal text'), 'normal text');
  assertEqual(escapeTableCell('price | cost'), 'price \\| cost', 'Unescaped pipe must be escaped');
  assertEqual(escapeTableCell('price \\| cost'), 'price \\| cost', 'Pre-escaped pipe must not be double-escaped');
  assertEqual(escapeTableCell('a | b | c'), 'a \\| b \\| c', 'Multiple pipes must all be escaped');
  assertEqual(escapeTableCell('line 1\nline 2'), 'line 1 line 2', 'Newlines must collapse to spaces');
  assertEqual(escapeTableCell('  padded  '), 'padded', 'Whitespace must be trimmed');
  assertEqual(escapeTableCell(null), '', 'Null must return empty string');
  assertEqual(escapeTableCell(undefined), '', 'Undefined must return empty string');
});

runTest('renderPipeTable produces valid GFM table with column alignments', () => {
  const matrix = [
    ['Item', 'Qty', 'Price'],
    ['Apples', '10', '$3.50'],
    ['Oranges', '5', '$2.00']
  ];
  const alignments = ['left', 'center', 'right'];

  const markdown = renderPipeTable(matrix, alignments);
  const lines = markdown.trim().split('\n');

  assertEqual(lines.length, 4, 'Must have header, delimiter, and 2 body rows');
  assertEqual(lines[0], '| Item | Qty | Price |', 'Header row format');
  assertEqual(lines[1], '| :--- | :---: | ---: |', 'Delimiter row must reflect alignments');
  assertEqual(lines[2], '| Apples | 10 | $3.50 |', 'Body row 1');
  assertEqual(lines[3], '| Oranges | 5 | $2.00 |', 'Body row 2');
});

runTest('renderPipeTable handles variable row lengths and escapes pipes inside cells', () => {
  const matrix = [
    ['Header A', 'Header B | Extra'], // Row length 2 with pipe
    ['Value 1'],                      // Row length 1 (shorter)
    ['V1', 'V2', 'V3 | Sub']          // Row length 3 (longest)
  ];
  const alignments = ['left', 'right'];

  const markdown = renderPipeTable(matrix, alignments);
  const lines = markdown.trim().split('\n');

  // Max cols = 3. Header and all rows must be normalized to 3 columns.
  assertEqual(lines[0], '| Header A | Header B \\| Extra |  |', 'Header row padded to 3 cols with escaped pipe');
  assertEqual(lines[1], '| :--- | ---: | :--- |', 'Delimiter row padded with default left alignment');
  assertEqual(lines[2], '| Value 1 |  |  |', 'Short row padded to 3 cols');
  assertEqual(lines[3], '| V1 | V2 | V3 \\| Sub |', 'Long row with escaped pipe');
});

runTest('renderPipeTable handles single row header-only table and empty input', () => {
  assertEqual(renderPipeTable([]), '', 'Empty matrix must return empty string');
  assertEqual(renderPipeTable([[]]), '', 'Matrix with empty row must return empty string');

  const singleRow = [['Col 1', 'Col 2']];
  const markdown = renderPipeTable(singleRow);
  const lines = markdown.trim().split('\n');
  assertEqual(lines.length, 2, 'Single row matrix produces header and delimiter');
  assertEqual(lines[0], '| Col 1 | Col 2 |');
  assertEqual(lines[1], '| :--- | :--- |');
});

// ============================================================================
// 3. Academic Booktabs Table Reconstruction Tests
// ============================================================================
runTest('reconstructTables extracts academic Booktabs tables (horizontal rules only)', () => {
  // Academic Booktabs table: toprule (y=100), midrule (y=125), bottomrule (y=210)
  // No vertical rules exist on page
  const rules = [
    { left: 50, top: 100, right: 450, bottom: 100 }, // toprule
    { left: 50, top: 125, right: 450, bottom: 125 }, // midrule
    { left: 50, top: 210, right: 450, bottom: 210 }  // bottomrule
  ];

  // Text lines inside table forming 3 columns:
  // Column 1: Model names (left ~60)
  // Column 2: Parameter counts (left ~220)
  // Column 3: Top-1 Accuracy percentages (left ~360)
  const lines = [
    // Header row (y between 100 and 125)
    { left: 60, top: 106, right: 110, bottom: 118, text: 'Architecture' },
    { left: 220, top: 106, right: 260, bottom: 118, text: 'Params' },
    { left: 360, top: 106, right: 410, bottom: 118, text: 'Top-1 Acc' },

    // Data row 1 (y between 125 and 150)
    { left: 60, top: 135, right: 120, bottom: 147, text: 'ResNet-50' },
    { left: 220, top: 135, right: 250, bottom: 147, text: '25.6M' },
    { left: 360, top: 135, right: 400, bottom: 147, text: '76.1%' },

    // Data row 2 (y between 155 and 175)
    { left: 60, top: 160, right: 130, bottom: 172, text: 'Transformer-B' },
    { left: 220, top: 160, right: 245, bottom: 172, text: '86M' },
    { left: 360, top: 160, right: 395, bottom: 172, text: '81.8%' },

    // Data row 3 (y between 180 and 200)
    { left: 60, top: 185, right: 115, bottom: 197, text: 'ViT-Large' },
    { left: 220, top: 185, right: 255, bottom: 197, text: '307M' },
    { left: 360, top: 185, right: 400, bottom: 197, text: '85.4%' },

    // Outside prose line (must NOT be claimed by table)
    { left: 50, top: 250, right: 450, bottom: 262, text: 'Table 1: Comparison of baseline visual architectures on ImageNet-1K.' }
  ];

  const tables = reconstructTables(rules, lines, 500, 700);

  assertEqual(tables.length, 1, 'Must reconstruct exactly 1 Booktabs table');
  const table = tables[0];

  // Bounding box should enclose the rules
  assertEqual(table.bbox[0], 50, 'BBox left');
  assertEqual(table.bbox[1], 100, 'BBox top');
  assertEqual(table.bbox[2], 450, 'BBox right');
  assertEqual(table.bbox[3], 210, 'BBox bottom');

  // Matrix checks: 4 rows x 3 columns
  assertEqual(table.matrix.length, 4, 'Must have 4 rows (1 header + 3 data rows)');
  assertEqual(table.matrix[0].length, 3, 'Must have 3 columns');
  assertEqual(table.matrix[0][0], 'Architecture');
  assertEqual(table.matrix[0][1], 'Params');
  assertEqual(table.matrix[0][2], 'Top-1 Acc');

  assertEqual(table.matrix[1][0], 'ResNet-50');
  assertEqual(table.matrix[1][2], '76.1%');

  assertEqual(table.matrix[3][0], 'ViT-Large');
  assertEqual(table.matrix[3][1], '307M');
  assertEqual(table.matrix[3][2], '85.4%');

  // Claimed lines checks: exactly 12 table lines claimed, outside prose line excluded
  assertEqual(table.linesInside.length, 12, 'Must claim all 12 table text lines');
  assert(!table.linesInside.some(l => l.text.startsWith('Table 1:')), 'Outside prose line must not be claimed');

  // Markdown validation: check that Top-1 Acc column is right-aligned for percentage numbers
  assert(table.markdown.includes('| Architecture | Params | Top-1 Acc |'), 'Markdown header check');
  assert(table.markdown.includes('---:'), 'Percentage column must be right-aligned (---:)');
});

runTest('reconstructTables extracts full-grid tables with vertical and horizontal rules', () => {
  // 3x3 grid table (3 horizontal rules, 3 vertical rules -> 2x2 cells)
  const rules = [
    // Horizontals
    { left: 100, top: 100, right: 300, bottom: 100 },
    { left: 100, top: 150, right: 300, bottom: 150 },
    { left: 100, top: 200, right: 300, bottom: 200 },
    // Verticals
    { left: 100, top: 100, right: 100, bottom: 200 },
    { left: 200, top: 100, right: 200, bottom: 200 },
    { left: 300, top: 100, right: 300, bottom: 200 }
  ];

  const lines = [
    { left: 110, top: 120, right: 160, bottom: 135, text: 'Col A' },
    { left: 210, top: 120, right: 260, bottom: 135, text: 'Col B' },
    { left: 110, top: 170, right: 150, bottom: 185, text: 'Val 1' },
    { left: 210, top: 170, right: 250, bottom: 185, text: 'Val 2' }
  ];

  const tables = reconstructTables(rules, lines, 500, 700);

  assertEqual(tables.length, 1, 'Must reconstruct 1 full-grid table');
  const table = tables[0];

  assertEqual(table.matrix.length, 2, '2 rows (header + 1 data row)');
  assertEqual(table.matrix[0].length, 2, '2 columns');
  assertEqual(table.matrix[0][0], 'Col A');
  assertEqual(table.matrix[0][1], 'Col B');
  assertEqual(table.matrix[1][0], 'Val 1');
  assertEqual(table.matrix[1][1], 'Val 2');
});

runTest('reconstructTables correctly assigns multi-word lines into column bounds', () => {
  // A table where each row is a single line spanning multiple columns
  const rules = [
    { left: 50, top: 100, right: 350, bottom: 100 },
    { left: 50, top: 125, right: 350, bottom: 125 },
    { left: 50, top: 160, right: 350, bottom: 160 }
  ];

  // Lines with words separated by gaps
  const lines = [
    {
      left: 60, top: 105, right: 340, bottom: 118,
      text: 'Metric    Baseline    Fine-Tuned'
    },
    {
      left: 60, top: 135, right: 340, bottom: 148,
      text: 'Accuracy  78.4%       89.1%'
    }
  ];

  const tables = reconstructTables(rules, lines, 500, 700);
  assertEqual(tables.length, 1, 'Must reconstruct multi-word line table');
  const table = tables[0];

  assertEqual(table.matrix.length, 2, '2 rows extracted');
  assertEqual(table.matrix[0][0], 'Metric');
  assertEqual(table.matrix[0][1], 'Baseline');
  assertEqual(table.matrix[0][2], 'Fine-Tuned');

  assertEqual(table.matrix[1][0], 'Accuracy');
  assertEqual(table.matrix[1][1], '78.4%');
  assertEqual(table.matrix[1][2], '89.1%');
});

runTest('reconstructTables ignores non-table rules and returns empty list', () => {
  // Single rule (e.g. divider line)
  const singleRule = [{ left: 50, top: 100, right: 500, bottom: 100 }];
  const lines = [{ left: 50, top: 120, right: 200, bottom: 135, text: 'Some text' }];

  assertEqual(reconstructTables(singleRule, lines, 500, 700).length, 0, 'Single rule is not a table');
  assertEqual(reconstructTables([], lines, 500, 700).length, 0, 'No rules returns empty');
  assertEqual(reconstructTables(singleRule, [], 500, 700).length, 0, 'No lines returns empty');
});

console.log('\n\x1b[1m\x1b[32m✔ All Table Geometry & Rendering tests passed successfully!\x1b[0m\n');
