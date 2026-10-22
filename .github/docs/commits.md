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
