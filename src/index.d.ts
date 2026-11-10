/**
 * @file src/index.d.ts
 * @description TypeScript definitions for paper-drift including Structured Document IR.
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
  buffer?: Buffer;
  readonly base64?: string;
  readonly dataUrl?: string;
  pixmap?: any;
  raw?: Buffer;
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
  /** Output format: 'buffer' (PNG Buffer), 'pixmap' (raw MuPDF Pixmap), or 'raw' (uncompressed RGB pixels Buffer). */
  format?: 'buffer' | 'pixmap' | 'raw';
  /** Bounded prefetch window (e.g. true or 1 for 1-page lookahead). */
  prefetch?: boolean | number;
  /** Whether to cache and use DisplayList for rendering and text extraction (default: true). */
  useDisplayList?: boolean;
  /** Optional progress callback. */
  onProgress?: (progress: { current: number; total: number; pageNumber: number; totalPages: number }) => void;
}

export interface RegionOptions {
  scale?: number;
  transparent?: boolean;
  noBg?: boolean;
  withBg?: boolean;
  format?: 'buffer' | 'pixmap' | 'raw';
}

export interface RegionResult {
  buffer?: Buffer;
  base64?: string;
  dataUrl?: string;
  pixmap?: any;
  raw?: Buffer;
  width: number;
  height: number;
  bbox: number[];
}

export declare class DisplayListCache {
  constructor(maxSize?: number);
  get(doc: any, pageIndex: number): { displayList: any; bounds: number[]; widthPt: number; heightPt: number };
  set(pageIndex: number, entry: any): void;
  clear(): void;
}

export declare function renderRegion(target: any, rect: number[], options?: RegionOptions): RegionResult;

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

export interface ExtractedAsset {
  type: 'image' | 'figure';
  pageNumber: number;
  pageIndex: number;
  bbox: number[];
  filename: string;
  filePath: string | null;
  link: string;
  alt: string;
  caption: string | null;
  width: number;
  height: number;
  bytes: Buffer;
  sizeKb: number;
}

export interface ExtractImagesOptions {
  /** Directory to write extracted image files into. */
  dir?: string;
  /** Custom link prefix for markdown images. */
  linkPrefix?: string;
  /** Target page range (e.g. "1-5", "2,4,6", 1, or [1, 2, 3]). Defaults to "all". */
  pages?: string | number | number[];
  /** Legacy alias for `pages`. */
  pageRange?: string | number | number[];
  /** Whether to extract embedded raster images (default: true). */
  extractRaster?: boolean;
  /** Whether to detect and crop vector diagrams (default: true). */
  extractFigures?: boolean;
  /** DPI scale factor for rendered vector figures (default: 2.0). */
  scale?: number;
  /** Optional progress callback. */
  onProgress?: (progress: { phase?: string; current: number; total: number; pageNumber: number; totalPages: number }) => void;
}

export interface ExtractImagesResult {
  byPage: Map<number, ExtractedAsset[]>;
  assets: ExtractedAsset[];
  totalImages: number;
  totalFigures: number;
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
  /** Whether to weave interactive hyperlinks and citation anchors (default: true). */
  links?: boolean;
  /** Whether to extract raster images and figures into disk files and embed links into markdown. */
  extractImages?: boolean | { dir?: string; linkPrefix?: string };
  /** DPI scale factor for rendered vector figures (default: 2.0). */
  imageScale?: number;
  /** Optional progress callback. */
  onProgress?: (progress: { phase?: string; current: number; total: number; pageNumber: number; totalPages: number }) => void;
}

export interface ConvertMarkdownResult {
  markdown: string;
  totalPages: number;
  pagesProcessed: number;
  tablesCount: number;
  imagesCount: number;
  assets: ExtractedAsset[];
  durationMs: number;
}

import { DocumentPageIR, DocumentMetadata, DocumentIR, ConvertDocumentIROptions } from './ir/types.d.ts';
export * from './ir/types.d.ts';

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
 * Converts a PDF into normalized Structured Document IR.
 */
export function convertPdfToDocumentIR(
  input: string | Buffer | Uint8Array,
  options?: ConvertDocumentIROptions
): Promise<DocumentIR>;

/**
 * Validates a document IR object against the required schema structure.
 */
export function validateDocumentIR(doc: any): boolean;

/**
 * Serializes a Document IR object into a formatted JSON string.
 */
export function exportToJson(docIR: DocumentIR): string;

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

/**
 * Extracts content images and drawn figures from a PDF document.
 */
export function extractPdfImages(
  input: string | Buffer | Uint8Array,
  options?: ExtractImagesOptions
): Promise<ExtractImagesResult>;

export interface ExtractedLink {
  bbox: number[];
  midY: number;
  uri: string;
  rawUri: string;
  isExternal: boolean;
  targetPage?: number | null;
  targetY?: number | null;
}

/**
 * Extracts external and internal links with coordinates from a MuPDF page.
 */
export function extractPageLinks(page: object, doc?: object | null): ExtractedLink[];

/**
 * Pre-scans document across pages to index unique internal citation and cross-reference destinations.
 */
export function buildDocumentDestinations(doc: object, pageIndices: number[]): Map<number, Array<{ id: string; name: string; y: number }>>;

/**
 * Weaves Markdown hyperlinks into a text line based on character spatial coordinates.
 */
export function applyLinksToLine(line: object, pageLinks: ExtractedLink[]): string;

/**
 * Finds destination anchors on a page that correspond to a line's coordinate.
 */
export function findDestinationAnchors(line: object, pageDestinations?: Array<{ id: string; y: number }>, claimedIds?: Set<string>): string;

/**
 * Normalizes an internal or external URI into a clean Markdown target anchor slug.
 */
export function formatDestinationSlug(rawUri: string): string;

/**
 * Replaces standard PDF typographic ligatures and normalizes smart quotes.
 */
export function cleanLigatures(text: string): string;

/**
 * Repairs words split across line breaks by hyphens while preserving legitimate compounds and markdown bullet items.
 */
export function repairHyphenation(text: string): string;

/**
 * Normalizes horizontal and vertical whitespace.
 */
export function normalizeWhitespace(text: string): string;

/**
 * Detects and filters recurring running headers and footers across pages.
 */
export function filterRunningHeadersFooters<T extends { page: number; content: string }>(
  pages: T[],
  options?: { strip?: boolean }
): T[];

/**
 * Composes ligature cleanup, hyphenation repair, and whitespace normalization.
 */
export function normalizePageText(rawText: string, options?: object): string;

/**
 * Scientific Metadata Extraction Subsystem.
 */
export const SCIENTIFIC_METADATA_VERSION: string;
export function validateScientificMetadata(metadata: object): boolean;
export function extractScientificMetadata(input: string | Buffer | Uint8Array, options?: object): Promise<object>;

declare const _default: {
  convertPdfToImages: typeof convertPdfToImages;
  streamPdfPages: typeof streamPdfPages;
  convertPdfToHtml: typeof convertPdfToHtml;
  convertPdfToMarkdown: typeof convertPdfToMarkdown;
  extractPdfImages: typeof extractPdfImages;
  extractPageLinks: typeof extractPageLinks;
  buildDocumentDestinations: typeof buildDocumentDestinations;
  applyLinksToLine: typeof applyLinksToLine;
  findDestinationAnchors: typeof findDestinationAnchors;
  formatDestinationSlug: typeof formatDestinationSlug;
  parsePageRange: typeof parsePageRange;
  resolveReadingOrder: typeof resolveReadingOrder;
  convertPdfToDocumentIR: typeof convertPdfToDocumentIR;
  validateDocumentIR: typeof validateDocumentIR;
  exportToJson: typeof exportToJson;
  cleanLigatures: typeof cleanLigatures;
  repairHyphenation: typeof repairHyphenation;
  normalizeWhitespace: typeof normalizeWhitespace;
  filterRunningHeadersFooters: typeof filterRunningHeadersFooters;
  normalizePageText: typeof normalizePageText;
  extractScientificMetadata: typeof extractScientificMetadata;
  validateScientificMetadata: typeof validateScientificMetadata;
  SCIENTIFIC_METADATA_VERSION: typeof SCIENTIFIC_METADATA_VERSION;
};

export default _default;
