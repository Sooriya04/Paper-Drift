# Ponytail Code & Architecture Audit Report: Paper-Drift Structured IR

**Repository:** `Paper-Drift`  
**Branch:** `feat/structured-document-ir`  
**Target:** Structured Document IR (`src/ir/schema.js`, `src/ir/types.d.ts`, `bin/cli.js`, `src/images/extractor.js`, `src/links/extractor.js`, `src/markdown/converter.js`)  
**Methodology:** Ponytail (Lazy, strict, high-signal, zero-fluff).

---

## Executive Summary

The Structured Document IR introduces normalized block extraction (`heading`, `paragraph`, `table`, `image`, `equation`, `caption`, `footnote`, `list`), outline extraction, and JSON schema validation. However, a deep architectural dive identified critical discrepancies:
1. **Total Image Block Drop:** `options.extractImages` reads raster placements into `rawPagesData`, but `blocksToOrder` omits them completely. No `type: 'image'` blocks are ever emitted into `docIR.blocks`.
2. **Anchor / In-Document Hyperlink Drop:** `findDestinationAnchors` is imported but never called in `src/ir/schema.js`. `metadata.anchorId` and `metadata.slug` are completely omitted.
3. **Typography Metadata Font Bug:** `metadata.fontSize` references non-existent property `line.size` instead of `line.font?.size`.
4. **Outline Schema Mismatch:** `src/ir/types.d.ts` defines `children?: DocumentOutlineItem[]`, but MuPDF's `doc.loadOutline()` returns `down?: OutlineItem[]`.

---

## Prioritized Findings

| ID | Priority | Category | File & Line | Summary |
|---|---|---|---|---|
| **ISSUE-01** | **Must Fix** | Functional / Data Loss | `src/ir/schema.js:125,178-194` | Image extraction extracts images but completely drops them from IR blocks. |
| **ISSUE-02** | **Must Fix** | Feature Incomplete | `src/ir/schema.js:23,215-258` | Anchor tags and in-document destination slugs are dropped; metadata missing anchor IDs. |
| **ISSUE-03** | **Should Fix** | Bug / Schema Drift | `src/ir/schema.js:254` | `line.size` is undefined; `metadata.fontSize` always serialized as `null`. |
| **ISSUE-04** | **Should Fix** | Schema / Type Drift | `src/ir/types.d.ts:39`, `src/ir/schema.js:272-276` | Outline tree uses `down` in MuPDF vs `children` in TypeScript definitions. |
| **ISSUE-05** | **Edge Case** | Memory Management | `src/converter.js:133,306` | Unmanaged `page.toStructuredText()` StructuredText handles in fallback/HTML paths. |
| **ISSUE-06** | **Edge Case** | Coordinate Precision | `src/ir/schema.js:250` | `line.width` / `line.height` floating point rounding differences vs `line.right` / `line.bottom`. |

---

## Detailed Audit Breakdown

### 1. Image Extraction in IR (ISSUE-01 — Must Fix)
- **Location:** `src/ir/schema.js:84, 125, 178-194`
- **Root Cause:**
  When `options.extractImages !== false`, line 125 extracts `rasterImages` into `pData.rasterImages`. However, unlike `src/markdown/converter.js:156-228`, `src/ir/schema.js`:
  1. Never calls `extractPdfImages(...)` to process and deduplicate raster images or vector figures.
  2. Does not incorporate any image items into `blocksToOrder`.
  3. Consequently, `blocks` never receives any `type: 'image'` items, rendering the `image` block type dead code.
- **Diff Fix:**
```diff
--- a/src/ir/schema.js
+++ b/src/ir/schema.js
@@ -171,6 +171,17 @@ export async function convertPdfToDocumentIR(input, options = {}) {
       }
 
+      // Include extracted raster images in spatial ordering
+      const pageImages = (pData.rasterImages || []).map((img) => ({
+        bbox: {
+          x: img.bbox[0],
+          y: img.bbox[1],
+          w: img.bbox[2] - img.bbox[0],
+          h: img.bbox[3] - img.bbox[1]
+        },
+        type: 'image',
+        data: img
+      }));
+
       const claimedLines = new Set([
         ...pageTables.flatMap(t => t.linesInside)
       ]);
@@ -193,6 +204,7 @@ export async function convertPdfToDocumentIR(input, options = {}) {
           type: 'table',
           data: t
-        }))
+        })),
+        ...pageImages
       ];
 
       const contentItems = recursiveXyCut(blocksToOrder, 0, 0, pData.width, pData.height);
@@ -213,6 +225,18 @@ export async function convertPdfToDocumentIR(input, options = {}) {
             order: globalOrder++,
             metadata: { tableType: t.type || 'grid' }
           });
+        } else if (item.type === 'image') {
+          const img = item.data;
+          blocks.push({
+            id: `blk-p${pData.pageNumber}-${globalOrder}`,
+            type: 'image',
+            content: {
+              format: 'raster',
+              widthPt: img.widthPt,
+              heightPt: img.heightPt
+            },
+            page: pData.pageNumber,
+            bbox: [img.bbox[0], img.bbox[1], img.bbox[2], img.bbox[3]],
+            order: globalOrder++,
+            metadata: {}
+          });
         } else {
```

---

### 2. Anchor / In-Document Hyperlink Drop (ISSUE-02 — Must Fix)
- **Location:** `src/ir/schema.js:23, 110, 161, 215-258`
- **Root Cause:**
  `src/ir/schema.js` imports `findDestinationAnchors` at line 23, builds `documentDestinations` at line 110, and initializes `claimedAnchorIds = new Set()` at line 161.
  Yet inside the line processing loop, `findDestinationAnchors` is **never called**, and `claimedAnchorIds` is never populated. Any section, equation, table, or reference anchor destination (`#cite-...`, `#section-...`) indexed in `documentDestinations` is silently discarded.
- **Diff Fix:**
```diff
--- a/src/ir/schema.js
+++ b/src/ir/schema.js
@@ -215,6 +215,10 @@ export async function convertPdfToDocumentIR(input, options = {}) {
         } else {
           const line = item.data;
+          const pageDests = documentDestinations.get(pData.index) || [];
+          const anchorTags = enableLinks ? findDestinationAnchors(line, pageDests, claimedAnchorIds) : '';
+          const anchorMatches = anchorTags ? Array.from(anchorTags.matchAll(/id="([^"]+)"/g)).map(m => m[1]) : [];
+
           const formattedText = enableLinks ? applyLinksToLine(line, pData.links) : line.text;
           const text = (formattedText || '').trim();
           if (!text) continue;
@@ -226,10 +230,18 @@ export async function convertPdfToDocumentIR(input, options = {}) {
           if (role === 'title') {
             irType = 'heading';
             metadata.level = 'title';
           } else if (role === 'h1') {
             irType = 'heading';
             metadata.level = 'h1';
+            const secMatch = line.text.trim().match(/^(\d+(?:\.\d+)*)\.?\s+/);
+            if (secMatch) metadata.slug = `section-${secMatch[1].replace(/\./g, '-')}`;
           } else if (role === 'h2') {
             irType = 'heading';
             metadata.level = 'h2';
+            const secMatch = line.text.trim().match(/^(\d+(?:\.\d+)*)\.?\s+/);
+            if (secMatch) {
+              const prefix = secMatch[1].includes('.') ? 'subsection' : 'section';
+              metadata.slug = `${prefix}-${secMatch[1].replace(/\./g, '-')}`;
+            }
           } else if (role === 'caption') {
@@ -254,6 +266,7 @@ export async function convertPdfToDocumentIR(input, options = {}) {
             metadata: {
               font: line.font || null,
-              fontSize: line.size || null,
+              fontSize: line.font?.size || line.size || null,
+              ...(anchorMatches.length > 0 ? { anchorIds: anchorMatches } : {}),
               ...metadata
             }
           });
```

---

### 3. Font Size Metadata Always Null (ISSUE-03 — Should Fix)
- **Location:** `src/ir/schema.js:254`
- **Root Cause:**
  `extractPageVectorsAndText` in `src/vectors/walker.js` stores font data on `currentLine.font = { name, size, ... }`. The top-level line object has no `.size` property. Line 254 reads:
  ```js
  fontSize: line.size || null,
  ```
  This always evaluates to `null`.
- **Fix:** Change to `line.font?.size || null`.

---

### 4. Outline / TOC Serialization & Schema Drift (ISSUE-04 — Should Fix)
- **Location:** `src/ir/schema.js:270-277`, `src/ir/types.d.ts:34-40`
- **Analysis:**
  - **Circular Structure Check:** In MuPDF's JavaScript bindings (`node_modules/mupdf/dist/mupdf.js:1554-1582`), `loadOutline()` executes a JS function `to_outline(outline)` that walks the C outline tree recursively and returns plain JS objects: `{ title, uri, open, page, down }`. It does NOT return raw pointers or circular references. All 20 benchmark papers (including Attention, GPT-3, ResNet) serialized without throwing `TypeError: Converting circular structure to JSON`.
  - **Schema Drift:** While JSON serialization succeeds, MuPDF names the child array property **`down`**, whereas `src/ir/types.d.ts:39` defines:
    ```ts
    children?: DocumentOutlineItem[];
    ```
    This causes a contract mismatch for consumers of the TypeScript types or clients expecting standard AST `children`.
- **Diff Fix:**
```diff
--- a/src/ir/schema.js
+++ b/src/ir/schema.js
@@ -270,7 +270,12 @@ export async function convertPdfToDocumentIR(input, options = {}) {
     let docOutline = [];
     try {
       const rawOutline = doc.loadOutline();
-      if (Array.isArray(rawOutline)) {
-        docOutline = rawOutline;
-      }
+      const normalizeOutline = (items) => (Array.isArray(items) ? items.map(item => ({
+        title: item.title,
+        uri: item.uri,
+        page: item.page,
+        open: item.open,
+        children: item.down ? normalizeOutline(item.down) : []
+      })) : []);
+      docOutline = normalizeOutline(rawOutline);
     } catch {}
```

---

### 5. WASM Resource Leaks & Bounding Box Math (Audit Items 1 & 2)

#### 5.1 WASM Resource Leaks Audit:
- **`src/ir/schema.js`:**
  - `doc = mupdf.Document.openDocument(...)` wrapped in `try { ... } finally { doc.destroy(); }` (lines 102, 292). **Safe.**
  - `page = doc.loadPage(pageIndex)` wrapped in `try { ... } finally { page.destroy(); }` (lines 118, 147). **Safe.**
- **`src/markdown/converter.js`:**
  - `doc.destroy()` and `page.destroy()` are guarded in `finally` blocks. **Safe.**
- **`src/images/extractor.js`:**
  - `doc.destroy()`, `page.destroy()`, and `rgbPix.destroy()` are guarded. **Safe.**
- **Edge Case Leak (`src/converter.js:133, 306`):**
  - MuPDF's `StructuredText` instances returned by `page.toStructuredText()` have an unmanaged `destroy()` method (`libmupdf._wasm_drop_structured_text`). In high-throughput batch servers processing thousands of pages, wrapping `st.destroy()` in `try ... finally` prevents WASM heap fragmentation.

#### 5.2 Bounding Box & Coordinate Math Inconsistencies Audit:
- **`src/ir/schema.js:250`:**
  ```js
  bbox: [line.left, line.top, line.left + line.width, line.top + line.height]
  ```
  Matches MuPDF's standard `[x0, y0, x1, y1]`, where:
  - `x0 = line.left`
  - `y0 = line.top`
  - `x1 = line.left + line.width` (matches `line.right` within float rounding)
  - `y1 = line.top + line.height` (matches `line.bottom` within float rounding)
  - Table bboxes in `reconstructTables` also use `[t.bbox[0], t.bbox[1], t.bbox[2], t.bbox[3]]` which is `[x0, y0, x1, y1]`.
  - **Verdict:** Consistent coordinate standard across line and table blocks.

---

## Conclusion
- **Ponytail Rule:** Minimal inline patches directly resolve data loss and schema drift without extra layers.
- Full bug report artifact saved to `suite/ir-audit.md`.
