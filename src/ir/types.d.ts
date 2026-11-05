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

export interface DocumentPageIR {
  /** 1-indexed page number */
  page: number;
  /** Clean plain-text string of page in reading order */
  content: string;
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
  stripRepeatedLines?: boolean;
  links?: boolean;
  extractImages?: boolean | { dir?: string; linkPrefix?: string };
  title?: string;
  scale?: number;
}
