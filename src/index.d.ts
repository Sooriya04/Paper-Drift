/**
 * @file src/index.d.ts
 * @description TypeScript definitions for paper-drift.
 * Part of paper-drift - https://github.com/Sooriya04/Paper-Drift
 */

export interface ImagePageResult {
  pageNumber: number;
  width: number;
  height: number;
  widthPt: number;
  heightPt: number;
  scale: number;
  buffer: Buffer;
  base64: string;
  dataUrl: string;
  text: string;
}

export interface StreamPageResult {
  pageNumber: number;
  pageIndex: number;
  totalPages: number;
  totalMatchingPages: number;
  width: number;
  height: number;
  widthPt: number;
  heightPt: number;
  scale: number;
  buffer: Buffer;
  readonly base64: string;
  readonly dataUrl: string;
  text: string;
}

export interface StreamImagesOptions {
  /** DPI scale factor (default: 2.0). */
  scale?: number;
  /** Whether to render with a transparent background instead of opaque white (default: false). */
  transparent?: boolean;
  /** Alias for `transparent`. */
  noBg?: boolean;
  /** Target page range (e.g. "1-5", "2,4,6", 1, or [1, 2, 3]). Defaults to "all". */
  pages?: string | number | number[];
  /** Legacy alias for `pages`. */
  pageRange?: string | number | number[];
  /** Whether to extract plain text for the page (default: true). Set false for even faster rendering. */
  extractText?: boolean;
  /** Optional progress callback. */
  onProgress?: (progress: { current: number; total: number; pageNumber: number; totalPages: number }) => void;
}

export interface ConvertImagesOptions extends StreamImagesOptions {}

export interface ConvertImagesResult {
  pages: ImagePageResult[];
  totalPages: number;
  pagesProcessed: number;
  durationMs: number;
}

export interface HtmlPageResult {
  pageNumber: number;
  width: number;
  height: number;
  columnsDetected?: number;
  blocksCount?: number;
  text?: string;
}

export interface ConvertHtmlOptions {
  /** DPI scale for background raster rendering (default: 2.0). */
  scale?: number;
  /** Whether to render lossless background image layer (default: true). */
  withBg?: boolean;
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
  pages: HtmlPageResult[];
  totalPages: number;
  pagesProcessed: number;
  durationMs: number;
}

export interface ConvertMarkdownOptions {
  /** Target page range (e.g. "1-5", "2,4,6", 1, or [1, 2, 3]). Defaults to "all". */
  pages?: string | number | number[];
  /** Legacy alias for `pages`. */
  pageRange?: string | number | number[];
  /** Whether to reconstruct vector tables into GFM pipe tables (default: true). */
  tables?: boolean;
  /** Whether to strip running headers and footers from page margins (default: true). */
  stripRepeatedLines?: boolean;
  /** Optional progress callback. */
  onProgress?: (progress: { phase?: string; current: number; total: number; pageNumber: number; totalPages: number }) => void;
}

export interface ConvertMarkdownResult {
  markdown: string;
  totalPages: number;
  pagesProcessed: number;
  tablesCount: number;
  durationMs: number;
}

/**
 * Converts a PDF buffer or file path into high-resolution images and Base64 strings.
 */
export function convertPdfToImages(
  input: string | Buffer | Uint8Array,
  options?: ConvertImagesOptions
): Promise<ConvertImagesResult>;

/**
 * Converts a PDF buffer or file path into publication-grade GitHub Flavored Markdown (GFM).
 */
export function convertPdfToMarkdown(
  input: string | Buffer | Uint8Array,
  options?: ConvertMarkdownOptions
): Promise<ConvertMarkdownResult>;

/**
 * Asynchronously streams rendered PDF pages one by one as an async generator.
 * Ideal for large documents (100+ pages) to keep memory footprint minimal and constant O(1).
 */
export function streamPdfPages(
  input: string | Buffer | Uint8Array,
  options?: StreamImagesOptions
): AsyncGenerator<StreamPageResult, void, unknown>;

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
 * Organizes any PDF page into natural reading order without dropping any content.
 */
export function resolveReadingOrder(
  pageJson: object,
  pageWidth?: number,
  pageHeight?: number
): {
  blocks: Array<object>;
  text: string;
  columnsDetected: number;
};

declare const _default: {
  convertPdfToImages: typeof convertPdfToImages;
  streamPdfPages: typeof streamPdfPages;
  convertPdfToHtml: typeof convertPdfToHtml;
  convertPdfToMarkdown: typeof convertPdfToMarkdown;
  parsePageRange: typeof parsePageRange;
  resolveReadingOrder: typeof resolveReadingOrder;
};

export default _default;
