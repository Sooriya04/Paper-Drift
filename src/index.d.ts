/**
 * @file src/index.d.ts
 * @description TypeScript definitions for paper-drift.
 * Part of paper-drift - https://github.com/Sooriya04/Paper-Drift
 */

export interface PageResult {
  pageNumber: number;
  width: number;
  height: number;
  tablesCount?: number;
  headingsCount?: number;
  columnsDetected?: number;
  blocksCount?: number;
  markdown?: string;
  text?: string;
}

export interface ConvertMarkdownOptions {
  /** Target page range (e.g. "1-5", "2,4,6", 1, or [1, 2, 3]). Defaults to "all". */
  pages?: string | number | number[];
  /** Legacy alias for `pages`. */
  pageRange?: string | number | number[];
  /** Optional progress callback. */
  onProgress?: (progress: { current: number; total: number; pageNumber: number; totalPages: number }) => void;
}

export interface ConvertMarkdownResult {
  markdown: string;
  pages: PageResult[];
  totalPages: number;
  pagesProcessed: number;
  durationMs: number;
}

export interface ConvertHtmlOptions {
  /** DPI scale for background raster rendering (default: 2.0). */
  scale?: number;
  /** Whether to render in replica mode with pixel-perfect background canvas overlay (default: false, uses Option 3 Semantic Web DOM). */
  replica?: boolean;
  /** Whether to render lossless background image layer in replica mode (default: true). */
  withBg?: boolean;
  /** Whether to embed background images directly as Base64 strings in the HTML file (default: false when assetsDir is available). */
  inlineImages?: boolean;
  /** Filesystem directory to save extracted page background images. */
  assetsDir?: string;
  /** Relative URL prefix for image src paths in the HTML document. */
  assetsPath?: string;
  /** Destination HTML output file path, used to auto-derive the assets folder if not provided. */
  outputFile?: string;
  /** Target page range (e.g. "1-5", "2,4,6", 1, or [1, 2, 3]). Defaults to "all". */
  pages?: string | number | number[];
  /** Legacy alias for `pages`. */
  pageRange?: string | number | number[];
  /** Document title in HTML head. */
  title?: string;
  /** Target output format ('html', 'text', 'json'). */
  format?: 'html' | 'text' | 'json';
  /** Optional progress callback. */
  onProgress?: (progress: { current: number; total: number; pageNumber: number; totalPages: number }) => void;
}

export interface ConvertHtmlResult {
  html: string;
  text: string;
  pages: PageResult[];
  assetsDir: string | null;
  totalPages: number;
  pagesProcessed: number;
  durationMs: number;
}

export interface InstallSkillOptions {
  /** Install globally to user home directory. */
  global?: boolean;
  /** Target Claude Code workspace (.claude/skills/). */
  claude?: boolean;
  /** Target Cursor workspace rules (.cursor/rules/). */
  cursor?: boolean;
  /** Target open Agent standard (.agent/skills/). */
  agent?: boolean;
  /** Custom destination file path. */
  dest?: string;
}

/**
 * Converts a PDF buffer or file path directly into clean GitHub Flavored Markdown (GFM).
 */
export function convertPdfToMarkdown(
  input: string | Buffer | Uint8Array,
  options?: ConvertMarkdownOptions
): Promise<ConvertMarkdownResult>;

/**
 * Converts a PDF buffer or file path into a standalone high-fidelity HTML document with selectable text overlay.
 */
export function convertPdfToHtml(
  input: string | Buffer | Uint8Array,
  options?: ConvertHtmlOptions
): Promise<ConvertHtmlResult>;

/**
 * Parses page range input into sorted 0-indexed page numbers.
 */
export function parsePageRange(range: string | number | number[] | undefined | null, totalPages: number): number[];

/**
 * Reconstructs a collection of PDF text lines into a standard GFM pipe table.
 */
export function reconstructTableFromLines(
  lines: Array<{ text: string; bbox: { x: number; y: number; w: number; h: number } }>,
  options?: { rowProximity?: number }
): string | null;

/**
 * Normalizes table cell formulas and values into clean Unicode math (e.g. O(n² · d)).
 */
export function formatTableCell(text: string): string;

/**
 * Folds multi-tier header rows into a unified column header array.
 */
export function foldHeaders(headerRows: string[][], colCount: number): string[];

/**
 * Resolves spatial reading order using Recursive XY-Cut.
 */
export function resolveReadingOrder(pageJson: any, pageWidth?: number, pageHeight?: number): {
  blocks: any[];
  text: string;
  columnsDetected: number;
};

/**
 * Installs the paper-drift Agent Skill definition into an agent workspace.
 */
export function installSkill(options?: InstallSkillOptions): string[];

/**
 * Returns the raw markdown content of SKILL.md.
 */
export function getSkillContent(): string;

declare const _default: {
  convertPdfToHtml: typeof convertPdfToHtml;
  convertPdfToMarkdown: typeof convertPdfToMarkdown;
  parsePageRange: typeof parsePageRange;
  reconstructTableFromLines: typeof reconstructTableFromLines;
  formatTableCell: typeof formatTableCell;
  foldHeaders: typeof foldHeaders;
  resolveReadingOrder: typeof resolveReadingOrder;
  installSkill: typeof installSkill;
  getSkillContent: typeof getSkillContent;
};

export default _default;
