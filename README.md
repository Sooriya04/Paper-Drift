# paper-drift

[![CI](https://github.com/Sooriya04/Paper-Drift/actions/workflows/ci.yml/badge.svg)](https://github.com/Sooriya04/Paper-Drift/actions/workflows/ci.yml)
[![License: Apache-2.0](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)
[![Node Version](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen.svg)](https://nodejs.org)
[![WASM Powered](https://img.shields.io/badge/engine-WebAssembly-purple.svg)](https://webassembly.org/)

> **High-fidelity, zero-Python, zero-Chromium PDF parser and converter powered by WebAssembly.**

Transform fixed-coordinate PDF documents into standalone, interactive HTML pages with pixel-perfect visual fidelity and selectable text overlays—without Puppeteer, Docker, or external servers.

---

## ⚡ Why paper-drift?

Most PDF conversion pipelines in JavaScript suffer from two major flaws:
1. **The Heavyweight Trap**: Requiring Headless Chromium (Puppeteer / Playwright) or Python microservices (`unstructured`, `poppler`, `nougat`) that need 500MB+ Docker images, multi-second cold boots, and high cloud costs.
2. **The "Text Soup" Trap**: Spatially naive parsers that dump unordered lines, break multi-column layouts, and butcher formatting.

**`paper-drift` solves this natively:**
* **Zero-Python & Zero-Chromium**: Runs compiled WebAssembly directly in any V8 runtime (Node.js, Bun, or modern browsers).
* **Dual-Layer Architecture**: Renders high-DPI raster graphics and vector art behind an aligned, selectable, searchable HTML text overlay.
* **Instant Execution**: Boots in milliseconds and converts pages in under 150ms.
* **100% Private**: Runs entirely on the client or server without transmitting document data to third-party APIs.

---

## 🚀 Quick Start (CLI)

### Run with `npx` (No installation needed)
```bash
npx paper-drift sample.pdf
```

### Install Globally
```bash
npm install -g paper-drift
```

### Convert a Document
```bash
# Basic conversion to <filename>.html
paper-drift research-paper.pdf

# Specify custom output path
paper-drift paper.pdf output.html

# Render at 3.0x Ultra-HD DPI
paper-drift report.pdf output.html --scale 3.0

# Text-only mode (skips background rasterization)
paper-drift book.pdf book.html --no-bg

# Convert specific pages
paper-drift manual.pdf output.html --pages 1-5,8,12
```

### CLI Options

| Flag | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `<input.pdf>` | `string` | *(required)* | Path to the source PDF file |
| `[output.html]` | `string` | `<name>.html` | Destination path for generated standalone HTML |
| `--scale <num>` | `number` | `2.0` | DPI multiplier for background raster rendering |
| `--no-bg` | `boolean` | `false` | Disables background image generation (text-only) |
| `--pages <range>` | `string` | `"all"` | Target page range (e.g. `1-10`, `2,4,6`) |
| `-v, --version` | `flag` | — | Display current version |
| `-h, --help` | `flag` | — | Display CLI help menu |

---

## 💻 Programmatic API (Node.js / Bun)

Install in your project:
```bash
npm install paper-drift
```

### Basic Usage
```javascript
import { convertPdfToHtml } from 'paper-drift';
import fs from 'fs';

// Convert from file path
const result = await convertPdfToHtml('document.pdf', {
  scale: 2.0,
  withBg: true,
  pageRange: '1-5'
});

console.log(`Converted ${result.pagesProcessed} pages in ${result.durationMs}ms`);
fs.writeFileSync('output.html', result.html);
```

### Buffer Input & Progress Tracking
```javascript
import { convertPdfToHtml } from 'paper-drift';

const buffer = await fetchPdfBuffer();

const { html } = await convertPdfToHtml(buffer, {
  title: 'Financial Quarterly Report',
  scale: 2.5,
  onProgress: ({ current, total, pageNumber }) => {
    console.log(`Processing page ${pageNumber} (${current}/${total})...`);
  }
});
```

---

## 🌐 Browser Playground

`paper-drift` includes a zero-backend web demo running completely client-side.

1. Start the local server:
   ```bash
   npm start
   ```
2. Open your browser at:
   ```
   http://localhost:3000
   ```
3. Drag and drop any PDF to preview live rendered HTML and download the standalone output.

---

## 🧪 Testing & Benchmarking

### Unit & Smoke Tests
Run the automated test suite locally:
```bash
npm test
```

### Landmark Research Paper Stress Tests (Top 20 ArXiv Papers)
`paper-drift` includes a curated benchmark suite featuring the **Top 20 landmark AI research papers** (Transformers, ResNet, LoRA, BERT, GAN, DeepSeek-V3, SAM, etc.). Papers are downloaded on-the-fly and gitignored:

```bash
# List all 20 curated landmark papers with ArXiv IDs and layout notes
npm run benchmark:list

# Download all 20 papers locally to test/fixtures/benchmarks/ (gitignored)
npm run benchmark:download

# Run quick benchmark against top 3 papers (Attention, ResNet, LoRA)
npm run benchmark

# Run benchmark against all 20 papers
npm run benchmark:20
```

---

## 📄 License

Apache-2.0 License &copy; 2026 [Sooriya](https://github.com/Sooriya04)
