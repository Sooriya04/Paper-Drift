/**
 * @file src/ir/types.d.ts
 * @description TypeScript type declarations for Structured Document IR (Intermediate Representation).
 * Part of paper-drift - https://github.com/Sooriya04/Paper-Drift
 */

export type BlockType =
  | 'heading'
  | 'paragraph'
  | 'table'
  | 'image'
  | 'equation'
  | 'caption'
  | 'footnote'
  | 'list';

export interface DocumentBlock {
  /** Normalized block type */
  type: BlockType;
  /** Content text or structured payload (e.g. table rows/columns, image links) */
  content: string | object;
  /** Metadata dictionary for font, level, links, anchors, slugs, etc. */
  metadata?: Record<string, any>;
}

export interface DocumentPageIR {
  /** 1-indexed page number */
  page: number;
  /** Array of structured content blocks on this page */
  content: DocumentBlock[];
}

export interface DocumentOutlineItem {
  title: string;
  uri?: string;
  page?: number;
  open?: boolean;
  children?: DocumentOutlineItem[];
}

export interface DocumentMetadata {
  /** Document title */
  title: string;
  /** Document author if available */
  author?: string | null;
  /** Total count of pages in document */
  pageCount: number;
  /** Document table of contents / outline tree */
  outline?: DocumentOutlineItem[];
  /** Generator identifier */
  generator?: string;
  /** DPI scale factor used */
  scale?: number;
  /** ISO timestamp of generation */
  createdAt?: string;
  /** Additional metadata */
  [key: string]: any;
}

export interface DocumentIR {
  /** Global document metadata dictionary */
  metadata: DocumentMetadata;
  /** Spatially ordered pages with blocks */
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
