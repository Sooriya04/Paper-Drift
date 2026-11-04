# SDK API Reference: `paper-drift`

High-performance WebAssembly PDF engine: high-res image rasterization, streaming page iterator, standalone HTML viewer, publication-grade GFM Markdown conversion, and geometric table extraction.

---

## Table of Contents

- [Installation](#installation)
- [Importing](#importing)
- [Functions](#functions)
  - [`convertPdfToMarkdown(input, options)`](#convertpdftomarkdowninput-options)
  - [`streamPdfPages(input, options)`](#streampdfpagesinput-options)
  - [`convertPdfToImages(input, options)`](#convertpdftoimagesinput-options)
  - [`convertPdfToHtml(input, options)`](#convertpdftohtmlinput-options)
  - [`extractPdfImages(input, options)`](#extractpdfimagesinput-options)
  - [`parsePageRange(range, totalPages)`](#parsepagerangerange-totalpages)
  - [`resolveReadingOrder(pageJson, pageWidth, pageHeight)`](#resolvereadingorderpagejson-pagewidth-pageheight)
  - [`recursiveXyCut(blockList)`](#recursivexycutblocklist)
- [Input Types](#input-types)
- [Common Patterns & Examples](#common-patterns--examples)

---

## Installation

```bash
npm install paper-drift
```

---

## Importing

ESM:
```javascript
import {
  convertPdfToMarkdown,
  streamPdfPages,
  convertPdfToImages,
  convertPdfToHtml,
  extractPdfImages,
  parsePageRange
} from 'paper-drift';

// Or default import:
import paperDrift from 'paper-drift';
```

TypeScript:
```typescript
import {
  convertPdfToMarkdown,
  ConvertMarkdownOptions,
  ConvertMarkdownResult
} from 'paper-drift';
```

---

## Functions

### `convertPdfToMarkdown(input, options)`

Converts a PDF file or binary buffer into publication-grade GitHub Flavored Markdown (GFM). Automatically reconstructs tables, identifies titles and section headers, preserves footnotes, weaves interactive links and citations, and optionally extracts figures.

```typescript
function convertPdfToMarkdown(
  input: string | Buffer | Uint8Array,
  options?: ConvertMarkdownOptions
): Promise<ConvertMarkdownResult>
```

#### Parameters

- **`input`** (`string | Buffer | Uint8Array`, **required**): File path to PDF or binary buffer in memory.
- **`options`** (`ConvertMarkdownOptions`, *optional*):
  - **`pages`** (`string | number | number[]`, default: `'all'`): Page selection. Examples: `'1-5'`, `'1,3,7'`, `2`, or `[1, 2, 3]`.
  - **`tables`** (`boolean`, default: `true`): Reconstruct vector rules and cell alignments into GFM pipe tables. Set `false` to output raw text lines instead.
  - **`stripRepeatedLines`** (`boolean`, default: `true`): Automatically detect and suppress recurring header/footer rules in the margin band across pages.
  - **`links`** (`boolean`, default: `true`): Weave external hyperlinks, citation links (`[1]`), and in-document section anchors.
  - **`extractImages`** (`boolean | { dir?: string, linkPrefix?: string }`, default: `false`):
    - `true`: Extracts raster images and vector diagrams into an auto-generated `<pdf_name>_assets/` directory and embeds markdown links.
    - `{ dir: './assets', linkPrefix: 'assets' }`: Custom directory and markdown image link prefix.
  - **`imageScale`** (`number`, default: `2.0`): DPI rendering scale for cropped vector figures (2.0 = 144 DPI).
  - **`onProgress`** (`function`, *optional*): Callback `({ phase, current, total, pageNumber, totalPages }) => void`.

#### Return Value (`ConvertMarkdownResult`)

```typescript
{
  markdown: string;         // Clean, normalized GFM Markdown text
  totalPages: number;       // Total page count in document
  pagesProcessed: number;   // Number of pages actually converted
  tablesCount: number;      // Number of tables detected and converted
  imagesCount: number;      // Number of extracted figures and images
  assets: ExtractedAsset[]; // Metadata of extracted image/figure files
  durationMs: number;       // Processing time in milliseconds
}
```

#### Example

```javascript
import { convertPdfToMarkdown } from 'paper-drift';

const result = await convertPdfToMarkdown('research-paper.pdf', {
  pages: '1-10',
  tables: true,
  extractImages: { dir: './images', linkPrefix: 'images' },
  onProgress: ({ current, total }) => console.log(`Processing page ${current}/${total}`)
});

console.log(result.markdown);
console.log(`Detected ${result.tablesCount} tables in ${result.durationMs}ms`);
```

---

### `streamPdfPages(input, options)`

Asynchronous generator yielding rendered pages one at a time. Employs constant $O(1)$ memory usage by destroying each WebAssembly pixmap immediately upon yielding, making it ideal for large documents (100+ pages).

```typescript
function streamPdfPages(
  input: string | Buffer | Uint8Array,
  options?: StreamImagesOptions
): AsyncGenerator<StreamPageResult, void, unknown>
```

#### Parameters

- **`input`** (`string | Buffer | Uint8Array`, **required**): File path or memory buffer.
- **`options`** (`StreamImagesOptions`, *optional*):
  - **`scale`** (`number`, default: `2.0`): DPI scale multiplier (`1.0` = 72 DPI, `2.0` = 144 DPI Retina, `3.0` = 216 DPI).
  - **`pages`** (`string | number | number[]`, default: `'all'`): Page range specification.
  - **`transparent`** (`boolean`, default: `false`): Render with transparent background instead of opaque white. (Alias: `noBg`).
  - **`extractText`** (`boolean`, default: `true`): Extract plain text for the page. Set `false` for maximum image rendering speed.
  - **`onProgress`** (`function`, *optional*): Callback `({ current, total, pageNumber, totalPages }) => void`.

#### Yielded Object (`StreamPageResult`)

```typescript
{
  pageNumber: number;          // 1-indexed page number
  pageIndex: number;           // 0-indexed page number
  totalPages: number;          // Document total pages
  totalMatchingPages: number;  // Number of pages matching filter
  width: number;               // Pixel width at current scale
  height: number;              // Pixel height at current scale
  widthPt: number;             // Native PDF width points
  heightPt: number;            // Native PDF height points
  scale: number;               // Applied scale
  buffer: Buffer;              // Lossless PNG buffer
  readonly base64: string;     // Lazy getter: Base64 string evaluated only when read
  readonly dataUrl: string;    // Lazy getter: data:image/png;base64,... evaluated only when read
  text: string;                // Plain extracted text
}
```

#### Example

```javascript
import { streamPdfPages } from 'paper-drift';
import fs from 'fs';

for await (const page of streamPdfPages('huge-book.pdf', { scale: 1.5 })) {
  console.log(`Rendered page ${page.pageNumber} (${page.width}x${page.height})`);
  fs.writeFileSync(`page-${page.pageNumber}.png`, page.buffer);

  // Early break exits cleanly and frees all remaining WASM memory
  if (page.pageNumber >= 5) break;
}
```

---

### `convertPdfToImages(input, options)`

Convenience wrapper over `streamPdfPages` that collects and returns an array of all converted page images.

```typescript
function convertPdfToImages(
  input: string | Buffer | Uint8Array,
  options?: ConvertImagesOptions
): Promise<ConvertImagesResult>
```

#### Parameters

Accepts identical options to `streamPdfPages`.

#### Return Value (`ConvertImagesResult`)

```typescript
{
  pages: Array<{
    pageNumber: number;
    width: number;
    height: number;
    buffer: Buffer;
    base64: string;
    dataUrl: string;
    text: string;
  }>;
  totalPages: number;
  pagesProcessed: number;
  durationMs: number;
}
```

#### Example

```javascript
import { convertPdfToImages } from 'paper-drift';

// Direct Base64 data URLs for multimodal AI models (GPT-4o / Claude / Gemini)
const { pages } = await convertPdfToImages('slide.pdf', { pages: 1, scale: 1.5 });
const aiPayload = {
  image_url: { url: pages[0].dataUrl }
};
```

---

### `convertPdfToHtml(input, options)`

Converts PDF pages into a standalone HTML viewer. Renders high-DPI background raster layers with an overlaid, selectable, transparent text layer positioned with point accuracy.

```typescript
function convertPdfToHtml(
  input: string | Buffer | Uint8Array,
  options?: ConvertHtmlOptions
): Promise<ConvertHtmlResult>
```

#### Parameters

- **`input`** (`string | Buffer | Uint8Array`, **required**): File path or buffer.
- **`options`** (`ConvertHtmlOptions`, *optional*):
  - **`scale`** (`number`, default: `2.0`): DPI scale for background layer.
  - **`withBg`** (`boolean`, default: `true`): Include rasterized background layer.
  - **`pages`** (`string | number | number[]`, default: `'all'`): Page range.
  - **`title`** (`string`, *optional*): Title tag in HTML head. Defaults to filename.
  - **`format`** (`'html' | 'text' | 'json'`, default: `'html'`): Target output format.
  - **`onProgress`** (`function`, *optional*): Progress callback.

#### Return Value (`ConvertHtmlResult`)

```typescript
{
  html: string;           // Complete standalone HTML document string
  text: string;           // Full plain text separated by page breaks
  pages: Array<{
    pageNumber: number;
    width: number;
    height: number;
    columnsDetected: number;
    blocksCount: number;
    text: string;
  }>;
  totalPages: number;
  pagesProcessed: number;
  durationMs: number;
}
```

---

### `extractPdfImages(input, options)`

Extracts embedded raster images and detects vector diagrams/charts across document pages, writing them to disk as PNG/JPEG files.

```typescript
function extractPdfImages(
  input: string | Buffer | Uint8Array,
  options?: ExtractImagesOptions
): Promise<ExtractImagesResult>
```

#### Parameters

- **`options`** (`ExtractImagesOptions`, *optional*):
  - **`dir`** (`string`, *optional*): Directory to save extracted images. If omitted, files are not written to disk but returned in memory.
  - **`linkPrefix`** (`string`, *optional*): Custom URL/path prefix for generated image links.
  - **`pages`** (`string | number | number[]`, default: `'all'`): Target pages.
  - **`extractRaster`** (`boolean`, default: `true`): Extract embedded photo and diagram bitmaps.
  - **`extractFigures`** (`boolean`, default: `true`): Detect, cluster, and crop vector drawn diagrams.
  - **`scale`** (`number`, default: `2.0`): Render resolution scale for vector figures.

#### Return Value (`ExtractImagesResult`)

```typescript
{
  byPage: Map<number, ExtractedAsset[]>; // Page number -> assets on that page
  assets: ExtractedAsset[];              // Flat array of all assets
  totalImages: number;                   // Count of raster images extracted
  totalFigures: number;                  // Count of vector figures extracted
  totalPages: number;
  pagesProcessed: number;
  durationMs: number;
}
```

---

### `parsePageRange(range, totalPages)`

Parses human-readable page specifications into a sorted array of 0-indexed page integers.

```typescript
function parsePageRange(
  range: string | number | number[] | undefined,
  totalPages: number
): number[]
```

#### Examples

```javascript
parsePageRange('1-3', 10);      // [0, 1, 2]
parsePageRange('1, 5, 8', 10);   // [0, 4, 7]
parsePageRange(4, 10);          // [3]
parsePageRange('all', 5);        // [0, 1, 2, 3, 4]
parsePageRange([1, 2, 2, 5], 5); // [0, 1, 4]
```

---

### `resolveReadingOrder(pageJson, pageWidth, pageHeight)`

Low-level spatial reading order analysis on structured MuPDF text blocks. Applies geometric Recursive XY-Cut to partition multi-column pages without hardcoded rules.

```typescript
function resolveReadingOrder(
  pageJson: object,
  pageWidth?: number,
  pageHeight?: number
): {
  blocks: object[];
  text: string;
  columnsDetected: number;
}
```

---

### `recursiveXyCut(blockList)`

Core geometric decomposition algorithm. Partitions bounding boxes across spanning blocks and column gutters into natural top-to-bottom, left-to-right reading order.

```typescript
function recursiveXyCut(
  blockList: Array<{ bbox: { x: number; y: number; w: number; h: number }; [key: string]: any }>
): Array<typeof blockList[number]>
```

---

## Input Types

All core conversion functions accept any of the following input formats:

1. **File Path** (`string`): Absolute or relative filesystem path.
   ```javascript
   await convertPdfToMarkdown('./input.pdf');
   ```
2. **Node.js Buffer** (`Buffer`):
   ```javascript
   const buffer = fs.readFileSync('input.pdf');
   await convertPdfToMarkdown(buffer);
   ```
3. **Uint8Array** (`Uint8Array`):
   ```javascript
   const u8 = new Uint8Array(arrayBuffer);
   await convertPdfToMarkdown(u8);
   ```

---

## Common Patterns & Examples

### Convert PDF Buffer in Memory to Markdown
```javascript
import { convertPdfToMarkdown } from 'paper-drift';

export async function processUploadedPdf(pdfBuffer) {
  const result = await convertPdfToMarkdown(pdfBuffer, {
    tables: true,
    links: true
  });
  return result.markdown;
}
```

### Save Multi-Page PDF to PNG Files with Progress
```javascript
import { streamPdfPages } from 'paper-drift';
import fs from 'fs';
import path from 'path';

async function exportPages(pdfPath, outDir) {
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  for await (const page of streamPdfPages(pdfPath, { scale: 2.0 })) {
    const filename = path.join(outDir, `page-${page.pageNumber}.png`);
    fs.writeFileSync(filename, page.buffer);
    console.log(`Saved ${filename}`);
  }
}
```
