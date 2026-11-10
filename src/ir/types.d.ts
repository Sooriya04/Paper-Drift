/**
 * @file src/ir/types.d.ts
 * @description TypeScript type declarations for Minimal Plain-Text Structured Document IR.
 * Part of paper-drift - https://github.com/Sooriya04/Paper-Drift
 */

export interface DocumentMetadata {
  /** Document title */
  title: string;
  /** Total count of pages in document */
  pageCount: number;
}

export interface TableCellIR {
  /** Row index (0-indexed) */
  row: number;
  /** Column index (0-indexed) */
  col: number;
  /** Number of rows spanned (default: 1) */
  rowspan?: number;
  /** Number of columns spanned (default: 1) */
  colspan?: number;
  /** Normalized cell text */
  text: string;
  /** Physical bounding box coordinates [left, top, right, bottom] */
  bbox?: number[];
  /** Whether cell belongs to table header */
  isHeader?: boolean;
}

export interface TableIR {
  /** Unique table identifier */
  id: string;
  /** Physical bounding box of table */
  bbox: number[];
  /** Number of rows in table */
  rows: number;
  /** Number of columns in table */
  cols: number;
  /** GFM pipe table markdown representation */
  markdown: string;
  /** Array of structured cells */
  cells: TableCellIR[];
  /** Hierarchical multi-level headers representation */
  headers?: Array<{ text: string; col: number; colspan: number; children?: string[] }>;
  /** Multi-page table continuation metadata */
  continuation?: {
    isContinuation: boolean;
    continuesFromPage?: number;
    continuesToPage?: number;
    repeatedHeader?: boolean;
  };
}

export interface DocumentPageIR {
  /** 1-indexed page number */
  page: number;
  /** Clean plain-text string of page in reading order */
  content: string;
  /** Structured table models extracted on page */
  tables?: TableIR[];
}

export interface DocumentIR {
  /** Global document metadata */
  metadata: DocumentMetadata;
  /** Spatially ordered pages with plain-text content */
  pages: DocumentPageIR[];
}

export interface ConvertDocumentIROptions {
  pages?: string | number | number[];
  pageRange?: string | number | number[];
  tables?: boolean;
  structuredTables?: boolean;
  stripRepeatedLines?: boolean;
  links?: boolean;
  extractImages?: boolean | { dir?: string; linkPrefix?: string };
  title?: string;
  scale?: number;
}
