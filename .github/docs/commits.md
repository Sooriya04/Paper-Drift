# Commit Log & Technical Journal

## Commit Log

### feat: initialize paper-drift npm package, zero-chromium cli, and wasm pipeline
**Technical Summary:**
- Restructured workspace into a modular npm package (`paper-drift`) with `src/`, `bin/cli.js`, and standardized file headers.
- Implemented zero-Chromium CLI and ESM programmatic API using the MuPDF WebAssembly engine (`convertPdfToHtml`).
- Built dual-layer high-DPI rasterization and selectable HTML text overlay with configurable scales, bounds, and page filtering.
- Reorganized client-side playground with browser WASM execution, progress tracking, live DOM preview, and standalone file export.
- Configured automated GitHub Actions CI testing matrix across Node.js versions and authored architecture guidelines (`AGENT.md`).
