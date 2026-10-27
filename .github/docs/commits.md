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

### feat: implement Option 3 semantic CSS & structure extraction and polish Markdown generation
- Implemented pure Web DOM semantic HTML5 engine (`src/html/semantic.js`) generating responsive semantic structures (`<h1>-<h6>`, `<p>`, `<table>`, `<figure>`, `<div class="math-display">`) without background canvas overlays.
- Extracted standalone embedded figures and diagrams as companion PNGs via WebAssembly (`src/utils/image-extractor.js`), eliminating multi-megabyte Base64 HTML bloat.
- Polished Markdown generation with de-hyphenation across line wraps, running page number and header watermark filtering, and strict heading constraints (`isShortTitle`).
- Enhanced LaTeX math restoration for multi-clause equations, sinusoidal positional encodings, and variable index sequences.
- Added `--replica` flag support to preserve legacy full-page canvas screenshot overlays when explicitly requested.

### fix(html,css): fix table fragmentation, caption deduplication, and table styling
- Resolved multi-block table fragmentation by absorbing consecutive tabular blocks across sub-section labels (`(A)`, `(B)`, `(C)`), preserving complete 25-row academic tables.
- Eliminated duplicate `<figcaption>` and `<p class="pdf-caption">` rendering on extracted figure blocks.
- Bound table captions directly inside `<div class="table-container">` with `.table-caption` header styling.
- Prevented escaped cell pipes (`\|`) from splitting table cells into erroneous extra columns.
- Upgraded table CSS in `src/utils/html-template.js` and `playground/style.css` with responsive overflow, tabular numbers font variants, zebra striping, and column alignment classes.

### fix(math,tables): normalize combining negation slash and dynamic table row proximity
- Fixed client-side KaTeX parse errors caused by Unicode combining solidus overlays (`\u0338=` $\to$ `\neq`) in graph theory formulas.
- Implemented dynamic table row proximity scaling based on median line height (`medianHeight >= 6.5 ? 4.5 : Math.max(1.8, medianHeight * 0.5)`), resolving row collapsing in compact 2-column IEEE papers.
- Handled multi-line table caption continuations (e.g. `TABLE III ... GRAPH`) to ensure clean table header identification.
- Added regression tests for complex multi-block tables in `test/tables.test.js`.
