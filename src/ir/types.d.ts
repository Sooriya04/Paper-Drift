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
  /** Stable unique ID for this block (e.g., 'blk-p1-0') */
  id: string;
  /** Normalized block type */
  type: BlockType;
  /** Content text or structured payload (e.g. table rows/columns, image links) */
  content: string | object;
  /** 1-indexed page number */
  page: number;
  /** Bounding box coordinates: [x0, y0, x1, y1] */
  bbox: [number, number, number, number] | number[];
  /** Zero-indexed global reading order index */
  order: number;
  /** Metadata dictionary for font, level, links, anchors, etc. */
  metadata: Record<string, any>;
}

export interface DocumentOutlineItem {
  title: string;
  uri?: string;
  page?: number;
  open?: boolean;
  children?: DocumentOutlineItem[];
}

export interface DocumentIR {
  /** Document title */
  title: string;
  /** Document author if available */
  author?: string | null;
  /** Total count of pages in document */
  page_count: number;
  /** Document table of contents / outline tree */
  outline: DocumentOutlineItem[];
  /** Global document metadata dictionary */
  metadata: Record<string, any>;
  /** Spatially ordered blocks */
  blocks: DocumentBlock[];
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
