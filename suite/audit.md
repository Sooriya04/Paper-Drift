# Quality & Architecture Audit: paper-drift

## What this repo does
`paper-drift` is a lightweight, zero-Chromium WebAssembly (WASM) PDF engine built on MuPDF. It converts PDF documents into high-resolution images, streaming Base64 tokens, interactive HTML views, and publication-grade GitHub Flavored Markdown (GFM) with tables and diagrams. The audit assumed a dual workload: a developer running CLI conversions on multi-page documents (10 to 100+ pages), and a shared local HTTP playground server processing concurrent conversion requests from web browsers.

---

## Must Fix

### 1. WASM memory leak in streamPdfPages: pixmaps are never freed (`src/converter.js:L122-128`)
- **What this is:** `streamPdfPages` is the core streaming generator designed to process massive 100+ page documents with constant memory usage.
- **Problem:** Line 125 calls `pixmap.clear()` instead of `pixmap.destroy()`. In MuPDF, `clear()` only zeroes out pixel values inside the existing image, while `destroy()` actually frees the underlying WebAssembly C heap memory.
- **Fix:** Replace `pixmap.clear()` with `try { pixmap.destroy(); } catch {}` immediately after extracting the PNG buffer.
- **If we skip it:** Rendering large documents or running continuous conversions leaks megabytes of unmanaged WASM memory on every page until the process crashes.

### 2. Unclosed Document and Page handles leak memory across conversions (`src/converter.js:L93-117`, `src/markdown/converter.js:L65-125`, `src/images/extractor.js:L74-123`)
- **What this is:** Core conversion functions open PDF documents with `mupdf.Document.openDocument(...)` and load pages with `doc.loadPage(...)`.
- **Problem:** Neither `doc.destroy()` nor `page.destroy()` is called when conversions finish. V8's garbage collector cannot see unmanaged WebAssembly memory, so opened documents and loaded pages remain pinned in memory indefinitely.
- **Fix:** Wrap conversion loops in `try ... finally` blocks and explicitly call `page.destroy()` after processing each page, and `doc.destroy()` when the document is completed.
- **If we skip it:** Long-running services such as the playground server or API backends accumulate gigabytes of orphaned WASM memory on every request.

### 3. Page handles leak in document destinations pre-scan (`src/links/extractor.js:L118-125`)
- **What this is:** Before generating Markdown, `buildDocumentDestinations` scans all target pages to index internal links and citation targets.
- **Problem:** The function calls `doc.loadPage(pageIndex)` for every page in the document, but never calls `page.destroy()`. On a 50-page paper, 50 page instances stay allocated in memory before the main converter loop even starts.
- **Fix:** Wrap the page scan in a `try ... finally` block and call `page.destroy()` at the end of each iteration in the pre-scan loop.
- **If we skip it:** Memory usage spikes during the initial pass on long research papers.

### 4. Playground server crashes on stream read errors (`playground/server.js:L118`)
- **What this is:** The local HTTP development server pipes static assets from disk to browser responses using `fs.createReadStream(filePath).pipe(res)`.
- **Problem:** There is no `'error'` event listener on the read stream. In Node.js, if a client disconnects abruptly or a file cannot be read, an unhandled stream error throws an uncaught exception and terminates the server.
- **Fix:** Attach an error handler to the stream before piping: `fs.createReadStream(filePath).on('error', () => { if (!res.headersSent) res.writeHead(404); res.end(); }).pipe(res)`.
- **If we skip it:** Aborted requests or transient filesystem errors crash the entire playground server.

---

## Should Fix

### 5. LaTeX section titles split across boxes fail heading detection (`src/vectors/walker.js:L29-82`, `src/markdown/typography.js:L67-75`)
- **What this is:** The typography engine classifies lines as titles, section headings (`h1`), subsections (`h2`), or body paragraphs.
- **Problem:** In standard LaTeX papers (such as the Attention paper), section numbers (e.g. `1`) and section names (e.g. `Introduction`) are emitted as two separate text boxes on the same horizontal baseline. The walker outputs them as two distinct lines; neither line matches `SECTION_NUMBER_REGEX`, so "1 Introduction" is emitted as regular body text rather than a heading.
- **Fix:** Merge consecutive text spans that share the same font, font size, and vertical Y baseline when the horizontal gap between them is within standard word spacing (`< 20pt`).
- **If we skip it:** Major numbered section headers across standard academic papers fail to generate Markdown `#` or `##` headings and lose their in-document anchor IDs.

### 6. Academic 12pt section headings fall below h1 font ratio threshold (`src/markdown/typography.js:L67-75`)
- **What this is:** Distinguishes major section headings (`h1`) from subsections (`h2`) using font size ratios relative to body text.
- **Problem:** In standard 10pt research papers (like NeurIPS and IEEE), `\section` is 12pt bold, giving a ratio of `12 / 10 = 1.20`. This is below the hardcoded `ratio >= 1.25` requirement for `h1`, causing top-level sections to be demoted to `h2` (`###`) or plain body text.
- **Fix:** Lower the `h1` ratio threshold to `1.18`, or check `line.font?.isBold && ratio >= 1.15` when assigning top-level heading status.
- **If we skip it:** Top-level paper sections become H3 sub-headings or plain body paragraphs.

### 7. Main section headings erroneously assigned subsection anchor IDs (`src/markdown/converter.js:L333-345`)
- **What this is:** Generates HTML anchor tags (e.g. `<a id="section-1"></a>`) so in-document hyperlinks can jump to sections.
- **Problem:** When a heading is classified as `h2`, line 338 always prefixes the anchor with `subsection-` (e.g. `subsection-1`), even when the section number has no dots (like `1. Introduction`). Standard PDF hyperref links point to `#section-1`, so they fail to find the anchor.
- **Fix:** Check whether `secMatch[1]` contains dots: use `section-${id}` for single integers (`1`), and `subsection-${id}` only for decimal sub-numbers (`1.1`).
- **If we skip it:** Links pointing to main sections fail to navigate to their targets in Markdown viewers.

### 8. CORS preflight (OPTIONS) requests fail on playground API (`playground/server.js:L34-40`)
- **What this is:** The `/api/convert-markdown` endpoint allows browser clients to convert uploaded PDF buffers.
- **Problem:** The endpoint sets CORS headers on `POST`, but does not handle HTTP `OPTIONS` requests. Modern browsers make an automatic `OPTIONS` preflight call for cross-origin requests, which falls through to static file lookups and returns 404.
- **Fix:** Handle `req.method === 'OPTIONS'` at the top of the route by returning `204 No Content` with `Access-Control-Allow-Methods: POST, OPTIONS` and `Access-Control-Allow-Headers: Content-Type`.
- **If we skip it:** Web apps hosted on other ports or domains cannot invoke the `/api/convert-markdown` endpoint.

### 9. Multi-page CLI image exports lose document name in output filenames (`bin/cli.js:L170-174`)
- **What this is:** Converts PDF pages to PNG images saved in an output directory (e.g. `paper-drift report.pdf out/ --format image`).
- **Problem:** When an output directory is specified, line 172 hardcodes `namePrefix = 'page'`. A single-page PDF is saved as `report.png`, but a multi-page PDF is saved as `page-1.png`, `page-2.png`, dropping the original document name.
- **Fix:** Set `namePrefix = parsedOut.name || parsedInput.name`, falling back to `parsedInput.name` when the output path is a directory.
- **If we skip it:** Converting different PDF files into the same destination directory overwrites previous pages.

---

## Nice to Have

### 10. Hash test description misnames SHA-1 as SHA-256 (`test/images.test.js:L91-104`)
- **What this is:** A test verifying pixel hashing for image deduplication across pages.
- **Problem:** The test label states `hashPixmap produces deterministic SHA-256 for pixmaps`, but the implementation in `src/images/raster.js:71` uses `sha1` and asserts a 40-character hash.
- **Fix:** Update the test description in `test/images.test.js` to read `SHA-1`.
- **If we skip it:** Confuses developers reading the test output.

---

- **Verdict:** The core conversion and spatial layout algorithms are robust and all 8 test suites pass, but WebAssembly handle cleanup must be fixed first to prevent memory exhaustion under load.
- **Lean:** 0 extra dependencies.
- **Not checked:** Browser WebAssembly loading in `playground/playground.js` inside an actual browser environment (requires a live browser window).
