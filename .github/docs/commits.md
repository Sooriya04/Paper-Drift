# Commit Log & Technical Journal

## Commit Log

### feat: initialize paper-drift npm package, zero-chromium cli, and wasm pipeline
**Technical Summary:**
- Restructured workspace into a modular npm package (`paper-drift`) with `src/`, `bin/cli.js`, and standardized file headers.
- Implemented zero-Chromium CLI and ESM programmatic API using the MuPDF WebAssembly engine (`convertPdfToHtml`).
- Built dual-layer high-DPI rasterization and selectable HTML text overlay with configurable scales, bounds, and page filtering.
- Reorganized client-side playground with browser WASM execution, progress tracking, live DOM preview, and standalone file export.
- Configured automated GitHub Actions CI testing matrix across Node.js versions and authored architecture guidelines (`AGENT.md`).

### fix(ci): track package-lock.json to resolve actions cache failure
**Technical Summary:**
- Removed `package-lock.json` from `.gitignore` to track lockfile for reproducible CI builds.
- Regenerated `package-lock.json` matching `paper-drift` package identity.
- Enabled GitHub Actions npm cache resolution in `actions/setup-node@v4`.
- Updated CI install step to use `npm ci --ignore-scripts` for fast, deterministic dependency installs.

### refactor: reorganize project into clean playground and test directories
**Technical Summary:**
- Migrated web playground assets (`index.html`, `playground.js`, `style.css`, `server.js`) into dedicated `playground/` folder.
- Created `test/` directory with fixtures (`test/fixtures/sample.pdf`), generator script (`test/scripts/`), and automated test runner (`test/cli.test.js`).
- Updated `package.json` scripts (`start`, `test`, `convert`) and header docstrings across all files.
- Streamlined CI workflow to run `npm test` and enabled CI triggers on `dev` branch.
- Cleaned root workspace to standard minimal layout.

### feat: add top 20 landmark research paper benchmark suite with zero git bloat
**Technical Summary:**
- Curated top 20 landmark AI research papers (Transformers, ResNet, LoRA, DeepSeek-V3, SAM) in `test/scripts/benchmark-papers.js`.
- Implemented automated curl-based fetcher that downloads benchmark PDFs into a gitignored directory.
- Added throughput and fidelity benchmark runner measuring pages/sec and generated HTML size across papers.
- Integrated landmark paper stress testing step into GitHub Actions CI pipeline.
- Added npm script shortcuts (`benchmark`, `benchmark:20`, `benchmark:download`, `benchmark:list`).
