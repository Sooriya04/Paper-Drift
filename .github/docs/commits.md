# Commit Log & Technical Journal

## Commit Log

### feat: initialize paper-drift npm package, zero-chromium cli, and wasm pipeline
- Restructured workspace into a modular npm package (`paper-drift`) with `src/`, `bin/cli.js`, and standardized file headers.
- Implemented zero-Chromium CLI and ESM programmatic API using the MuPDF WebAssembly engine (`convertPdfToHtml`).
- Built dual-layer high-DPI rasterization and selectable HTML text overlay with configurable scales, bounds, and page filtering.
- Reorganized client-side playground with browser WASM execution, progress tracking, live DOM preview, and standalone file export.
- Configured automated GitHub Actions CI testing matrix across Node.js versions and authored architecture guidelines (`AGENT.md`).

### fix(ci): track package-lock.json to resolve actions cache failure
- Removed `package-lock.json` from `.gitignore` to track lockfile for reproducible CI builds.
- Regenerated `package-lock.json` matching `paper-drift` package identity.
- Enabled GitHub Actions npm cache resolution in `actions/setup-node@v4`.
- Updated CI install step to use `npm ci --ignore-scripts` for fast, deterministic dependency installs.

### refactor: reorganize project into clean playground and test directories
- Migrated web playground assets (`index.html`, `playground.js`, `style.css`, `server.js`) into dedicated `playground/` folder.
- Created `test/` directory with fixtures (`test/fixtures/sample.pdf`), generator script (`test/scripts/`), and automated test runner (`test/cli.test.js`).
- Updated `package.json` scripts (`start`, `test`, `convert`) and header docstrings across all files.
- Streamlined CI workflow to run `npm test` and enabled CI triggers on `dev` branch.
- Cleaned root workspace to standard minimal layout.

### feat: add top 20 landmark research paper benchmark suite with zero git bloat
- Curated top 20 landmark AI research papers (Transformers, ResNet, LoRA, DeepSeek-V3, SAM) in `test/scripts/benchmark-papers.js`.
- Implemented automated curl-based fetcher that downloads benchmark PDFs into a gitignored directory.
- Added throughput and fidelity benchmark runner measuring pages/sec and generated HTML size across papers.
- Integrated landmark paper stress testing step into GitHub Actions CI pipeline.
- Added npm script shortcuts (`benchmark`, `benchmark:20`, `benchmark:download`, `benchmark:list`).

### feat: implement multi-column spatial reading order and ci artifact automation
- Implemented pure geometric Recursive XY-Cut in `src/spatial/` resolving multi-column reading flow without hardcoded formats.
- Ordered dual-layer HTML text spans and exported natural reading order text paragraphs across 1-col, 2-col, and 3-col layouts.
- Added automated pre-run output cleanup in test and benchmark runners to prevent file overlap across executions.
- Updated GitHub Actions CI with automated PDF caching and downloadable test artifact packaging (`actions/upload-artifact@v4`).
- Strictly enforced `.gitignore` exclusion for benchmark PDFs and results to guarantee zero repository bloat.

### feat: implement heuristic latex math restoration engine and test suite
- Built Unicode-to-LaTeX dictionary in `src/math/symbols.js` mapping Greek alphabets, math operators, relations, and set glyphs.
- Implemented heuristic sub/superscript detector in `src/math/restorer.js` analyzing font sizes and baseline coordinate shifts.
- Added automatic display equation framing (`$$...$$`), equation numbering tags (`\tag{N}`), and inline math wrapping (`$...$`).
- Created automated test suite in `test/math.test.js` validating math font signatures, operator translation, and expression formatting.
- Integrated math restoration engine into programmatic library exports in `src/index.js` and `npm test`.

### feat: implement direct pdf to markdown conversion and gfm table reconstruction
- Implemented pure geometric table reconstruction in `src/tables/` with column gutter projection, cell slicing, and header folding.
- Built direct WebAssembly PDF-to-Markdown engine in `src/markdown/` detecting typography headings, lists, and LaTeX math blocks.
- Added scientific notation and exponent restoration in table cells (`$2.3 \cdot 10^{19}$`, `$O(n^2 \cdot d)$`).
- Updated CLI (`bin/cli.js`) to support `--format md` / `--format markdown` with page range filtering.
- Created test suites in `test/tables.test.js` and `test/markdown.test.js` validating tables and markdown generation in `npm test`.

### feat: add live markdown katex playground and clean universal table math
- Upgraded web playground with live GFM table preview, KaTeX math auto-rendering, and dual markdown/html downloads.
- Added real-time AI token efficiency analytics banner comparing multimodal vision cost vs markdown ingestion.
- Added `/api/convert-markdown` WebAssembly conversion endpoint to local development server (`playground/server.js`).
- Refined table cell formatter to emit clean universal Unicode math (`O(n² · d)`, `2.3 · 10¹⁹`) without raw dollar signs.
- Updated test suites in `test/tables.test.js` and `test/markdown.test.js` ensuring 100% passing tests.

### release: v0.1.0 initial package release with markdown and html engines
- Added conditional npm publish job in `.github/workflows/ci.yml` strictly restricted to `main` branch pushes.
- Triggered only when commit message mentions a version pattern, skipping publish on dev branch.
- Automatically extracts semantic version from commit message and synchronizes package version before publish.
- Configured `"files"` whitelist and `"exports"` map in `package.json` reducing tarball footprint to 18.9 KB.
- Updated `README.md` showcasing direct Markdown conversion, programmatic APIs, and 90%+ AI token savings.

### feat: add developer landing website and gitignore agent directory
- Built mobile-responsive developer website in `website/` with token comparison, feature pillars, and quickstart tabs.
- Added 1-click copyable terminal command box and interactive integration code switcher.
- Restored `playground/index.html` as the dedicated standalone WebAssembly interactive demo.
- Added `.agent/` directory to `.gitignore` to prevent agent configuration leaks.

### docs: add developer website, github pages ci, and turnkey AI agent skill
- Transformed developer website from `website/` into standard `/docs` directory for GitHub Pages hosting with automated Pages deployment (`.github/workflows/pages.yml`).
- Created standardized turnkey Agent Skill in `skills/paper-drift/SKILL.md` (and `.agent/skills/`) with `npx paper-drift skill` CLI installer and 5 target options.
- Embedded turnkey Agent Skill specification, installation command targets, and 1-click clipboard export into `docs/index.html`.
- Added interactive terminal tabs (`CLI`, `Node.js SDK`, `Agent Quickstart`, `SKILL.md`) with dynamic language indicators and copy actions in `docs/app.js`.
- Integrated official npm vector branding badge into website navigation bar and footer.

### fix: eliminate dependency bloat, add types, license, and fix page filtering
- Removed unused `pdfjs-dist` dependency, cutting 65 transitive packages from `node_modules`.
- Added official Apache-2.0 `LICENSE` file and complete TypeScript definitions (`src/index.d.ts`).
- Fixed `options.pages` handling across Markdown and HTML converters to support numbers, arrays, and ranges.
- Fixed table cell formatting to normalize internal newlines and preserve Markdown table row integrity.
- Added strict CLI `--format` validation and expanded automated unit tests in `test/cli.test.js`, `test/tables.test.js`, and `test/markdown.test.js`.

### docs: expand README with turnkey AI agent skill workflows and installation guide
- Documented the "Multimodal PDF Token Tax" problem and 90%+ token reduction solution for AI coding agents.
- Added comprehensive 1-click CLI installer guide (`npx paper-drift skill`) for Antigravity, Claude Code, and Cursor.
- Added end-to-end user-agent interaction flow example and direct links to live documentation.

### release: v0.1.1 bugfixes, types, license, and ai agent skill documentation
- Bumped package version to `v0.1.1` for npm release and GitHub release.
- Added official Apache-2.0 `LICENSE` file and complete TypeScript definitions (`src/index.d.ts`).
- Removed bloated unused `pdfjs-dist` dependency, cutting 65 transitive packages from `node_modules`.
- Fixed `options.pages` handling across Markdown and HTML converters to support numbers, arrays, and ranges.
- Fixed table cell formatting to normalize internal newlines and preserve Markdown table row integrity.
- Expanded `README.md` and `docs/index.html` with turnkey AI Agent Skill workflows and 1-click `npx` installer.

### release: v0.1.3 - WebAssembly PDF to Image and Base64 rasterizer
- Refocused core engine on high-performance WebAssembly PDF-to-image rasterization and direct Base64 generation.
- Implemented high-DPI scaling factor (`2.0` = Retina 144 DPI, `3.0` = 216 DPI) and transparent background rendering (`--no-bg` / `transparent: true`).
- Added Base64 data URL array export into JSON for direct ingestion into AI multimodal vision models (GPT-4o, Claude 3.5 Sonnet, Gemini).
- Updated CLI with `--format image` and `--format base64` commands and fast page range extraction (`1-5`, `1,3,7`).

### feat: implement memory-efficient streaming generator for massive pdfs
- Implemented `streamPdfPages` async generator in `src/converter.js` yielding rendered pages sequentially with constant $O(1)$ memory usage.
- Integrated `pixmap.clear()` after each page render to immediately release unmanaged MuPDF WebAssembly memory and prevent heap exhaustion.
- Implemented lazy evaluation getters for `page.base64` and `page.dataUrl` so multi-megabyte string conversions only execute on demand.
- Re-implemented `convertPdfToImages` cleanly on top of `streamPdfPages`, preserving 100% backward compatibility for all existing callers and tests.
- Updated CLI `--format image` pipeline in `bin/cli.js` to stream-write pages directly to disk without buffering arrays of images in RAM.
- Added TypeScript type definitions (`StreamPageResult`, `StreamImagesOptions`) in `src/index.d.ts` and exported `streamPdfPages` in `src/index.js`.
- Created comprehensive automated test suite in `test/stream.test.js` covering sequential streaming, lazy getters, range filtering, and clean early termination via `break`.
- Expanded `README.md` and `package.json` with streaming guide, updated descriptions, and integrated `test/stream.test.js` into `npm test`.

### feat: implement publication-grade pdf to markdown engine with vector tables and ast normalizer
- Implemented low-level MuPDF vector stroke walker in `src/vectors/walker.js` extracting line bounding boxes, font metrics, and vector path geometry in a single pass.
- Built ruling line classifier and margin furniture filter in `src/vectors/rules.js` suppressing recurring headers/footers in the 12% margin band while preserving content table rules.
- Implemented path-compressed Disjoint-Set Union clustering and coordinate snapping (`snap = width * 0.004`) in `src/tables/disjoint-set.js`.
- Built geometric table reconstruction in `src/tables/grid.js` supporting both full-grid tables and academic LaTeX Booktabs (horizontal-only rules) via column gutter projection.
- Added normalized GFM pipe table serializer in `src/tables/pipe-renderer.js` with automatic numeric alignment inference (`:---`, `:---:`, `---:`).
- Implemented Unicode sanitizer in `src/markdown/cleaner.js` transliterating Cyrillic/Greek homoglyphs and stripping dangerous invisible zero-width characters and bidi overrides.
- Implemented statistical body font mode ratio calculator in `src/markdown/typography.js` determining dynamic heading levels (H1, H2, captions, footnotes) mathematically.
- Integrated unified AST normalization pipeline in `src/markdown/normalizer.js` with `remark-parse`, `remark-gfm`, and `remark-stringify`.
- Fixed multi-column reading order bleed in `src/markdown/converter.js` by unifying prose lines and table regions directly into `recursiveXyCut` without post-sorting.
- Updated CLI (`bin/cli.js`) to support `--format markdown` / `--format md` and auto-inferred `.md` outputs.
- Fixed broken export in `suite/index.js`, cleaned stale test artifacts, and expanded test suite across `test/vectors.test.js`, `test/tables.test.js`, and `test/markdown.test.js` (53 tests passing).

### feat: implement high-performance image & vector figure extraction engine
- Built embedded raster image extractor in `src/images/raster.js` utilizing MuPDF's `preserve-images` structured text walker.
- Implemented soft-mask alpha compositing combining RGB pixmaps and alpha masks into RGBA pixmaps with transparency preservation.
- Added uniform color variance sampling (`isUniform`) and SHA-1 pixel hashing (`hashPixmap`) to automatically filter out solid backdrops and deduplicate repetitive cross-page watermarks/logos.
- Added adaptive format selection (`encodePixmap` / `encodeImage`) defaulting to lossless PNG and falling back to JPEG when photographic compression yields >40% space savings.
- Built vector figure & chart detector in `src/images/figures.js` clustering vector curves and bounding boxes with density analysis, ignoring thin table divider lines and page borders.
- Implemented adjacent figure caption association (`findFigureTitleOrCaption`) matching "Figure N:" captions and claiming internal diagram text lines to prevent reading order bleed.
- Added high-DPI sub-region rendering via `mupdf.DrawDevice` (`renderFigureRegion`) producing crisp PNG crops of vector diagrams.
- Implemented orchestrator in `src/images/extractor.js` (`extractPdfImages`) sorting assets in reading order and writing numbered files (`p01-01.png`).
- Integrated image extraction directly into `convertPdfToMarkdown` (`src/markdown/converter.js`) with spatial XY-Cut placement, figure caption callouts (`> **Figure N: ...**`), and claimed line deduplication.
- Updated CLI (`bin/cli.js`) with `-i, --extract-images [dir]` for both standalone extraction and combined Markdown generation.
- Added TypeScript definitions in `src/index.d.ts` and barrel exports in `src/index.js` and `src/images/index.js`.
- Authored comprehensive test suite in `test/images.test.js` validating raster utilities, mask compositing, vector figure cropping, Markdown spatial embedding, and CLI flags (100% passing).

### feat: implement spatial hyperlink weaving, citation anchors, and de-hyphenation
- Built hyperlink and cross-reference engine in `src/links/extractor.js` extracting external web URLs, emails, DOIs, and internal named destinations via `page.getLinks()`.
- Implemented character-level spatial weaving in `applyLinksToLine`: matches word tokens against link bounding boxes, isolates sentence-ending punctuation, balances parenthesis/bracket delimiters, and formats clean Markdown links `[text](url)`.
- Pre-scanned document across target pages via `buildDocumentDestinations` resolving target destination page indices and Y-coordinates using MuPDF's `doc.resolveLinkDestination(uri)`.
- Implemented automatic HTML anchor tag insertion (`findDestinationAnchors`) mapping citations directly to their entries in the References section (`<a id="cite-..."></a>`), figures (`<a id="figure-N"></a>`), and tables (`<a id="table-N"></a>`).
- Added smart paragraph de-hyphenation in `src/markdown/converter.js` stitching line-split words (e.g. `transfor-` + `mer` -> `transformer`) across line wraps while preserving genuine compound words.
- Stored character origin coordinates in `src/vectors/walker.js` enabling precise character-level link tagging without layout distortion.
- Added TypeScript definitions in `src/index.d.ts` and barrel exports in `src/index.js` and `src/links/index.js`.
- Authored automated test suite in `test/links.test.js` covering slug normalization, page link extraction, destination mapping, link weaving, de-hyphenation, and end-to-end Markdown conversion (100% passing across 8 suites).

