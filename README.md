# paper-drift

[![License: Apache-2.0](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)
[![Node Version](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen.svg)](https://nodejs.org)
[![WASM Powered](https://img.shields.io/badge/engine-WebAssembly-purple.svg)](https://webassembly.org/)

> **Zero-Python, zero-Chromium WebAssembly PDF rasterizer and Base64 engine.**

Convert complex academic research papers, technical specs, and enterprise PDFs directly into high-resolution PNG images and Base64 data URIs. No Puppeteer, no Chromium, no Python, no Poppler, and no external servers. 100% local WebAssembly execution.

---

## Why paper-drift?

Most PDF rendering pipelines in JavaScript rely on:
1. **Headless Chromium (Puppeteer / Playwright)**: Requires a 400MB+ browser binary, slow cold starts, high memory overhead, and sandboxing nightmares.
2. **Python microservices (`pdf2image`, `poppler-utils`)**: Needs system-level C++ binaries, external package managers, and Docker containers.

**paper-drift provides a native WebAssembly alternative:**
* **Zero System Dependencies**: Powered by compiled MuPDF WebAssembly. Runs natively in any modern Node.js, Bun, or serverless runtime.
* **Direct Base64 & Data URL Generation**: Renders lossless page images directly into `data:image/png;base64,...` data URIs and raw Base64 strings.
* **Lossless High-DPI Scaling**: Configurable scale factor (`scale=2.0` for 144 DPI Retina, `scale=3.0` for 216 DPI ultra-crisp renders).
* **Transparent Background Support**: Render with opaque white background or transparent background (`--no-bg` / `transparent: true`).
* **Fast Page-Range Extraction**: Render single pages, contiguous ranges (`1-5`), or non-contiguous lists (`1,3,7`).
* **Standalone HTML Viewer**: Includes dual-layer HTML output with embedded background image and selectable text layer.

---

## Quick Start (CLI)

### Run with `npx` (No installation needed)
```bash
# Render all pages as high-resolution PNG images
npx paper-drift paper.pdf --format image

# Render page 1 as a PNG image
npx paper-drift paper.pdf output.png --pages 1

# Export pages as Base64 JSON data
npx paper-drift paper.pdf --format base64
```

### Install Globally
```bash
npm install -g paper-drift
```

### Common Commands
```bash
# Render all pages to high-res PNGs in current folder
paper-drift research-paper.pdf --format image

# Render specific pages into a custom directory
paper-drift research-paper.pdf images/ --pages 1-3

# Export Base64 data URL array into a JSON file
paper-drift report.pdf report-base64.json --format base64

# Render with 3.0x ultra-high DPI scaling
paper-drift diagram.pdf diagram.png --scale 3.0 --pages 1

# Render transparent PNG (no white background)
paper-drift icon.pdf icon.png --no-bg

# Export standalone HTML viewer
paper-drift document.pdf document.html --format html
```

### CLI Options

| Flag | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `<input.pdf>` | `string` | *(required)* | Path to the source PDF file |
| `[output]` | `string` | `<name>.<ext>` | Destination file or directory path |
| `--format <fmt>` | `string` | `image` | Output format: `image` (`png`) \| `base64` \| `html` \| `text` \| `json` |
| `--pages <range>` | `string` | `"all"` | Target page range (e.g. `1-5`, `2,4,6`, `1`) |
| `--scale <num>` | `number` | `2.0` | DPI resolution scale factor (2.0 = 144 DPI, 3.0 = 216 DPI) |
| `--no-bg` | `boolean` | `false` | Renders with transparent background instead of opaque white |
| `-v, --version` | `flag` | - | Display current version |
| `-h, --help` | `flag` | - | Display CLI help menu |

---

## Programmatic API (Node.js / Bun)

Install in your project:
```bash
npm install paper-drift
```

### Direct PDF to Images & Base64
```javascript
import { convertPdfToImages } from 'paper-drift';
import fs from 'node:fs';

const result = await convertPdfToImages('isam.pdf', {
  scale: 2.0,          // 2x Retina (144 DPI)
  pages: '1-3',        // Page range: 'all', '1-5', '2,4', 1
  transparent: false   // Set true for transparent background
});

console.log(`Rendered ${result.pagesProcessed} page(s) in ${result.durationMs}ms`);

for (const page of result.pages) {
  console.log(`Page ${page.pageNumber}: ${page.width}x${page.height}px`);

  // Raw Base64 string (ideal for custom APIs and storage)
  console.log(page.base64);

  // Ready-to-use Data URL: "data:image/png;base64,iVBORw..."
  console.log(page.dataUrl);

  // Binary PNG Buffer (ready for fs.writeFileSync)
  fs.writeFileSync(`page-${page.pageNumber}.png`, page.buffer);

  // Clean plain text extracted from this page
  console.log(page.text);
}
```

### Memory-Efficient Streaming Generator (500+ Page Documents)
For massive PDFs, books, and reports, avoid buffering all page renders into RAM. `streamPdfPages` yields each page sequentially as an async generator, keeping memory usage constant `O(1)`:

```javascript
import { streamPdfPages } from 'paper-drift';
import fs from 'node:fs/promises';

// Asynchronously stream pages one-by-one
for await (const page of streamPdfPages('500-page-book.pdf', { scale: 2.0 })) {
  console.log(`Processing page ${page.pageNumber} of ${page.totalPages}...`);

  // Save directly to disk - buffer is garbage-collected immediately
  await fs.writeFile(`output/page-${page.pageNumber}.png`, page.buffer);

  // base64 and dataUrl are lazy getters, computed only on demand
  // console.log(page.dataUrl);
}
```

### Feeding Base64 to AI Vision Models
The generated `dataUrl` or `base64` strings can be passed directly to multimodal vision models:

```javascript
import { convertPdfToImages } from 'paper-drift';

const { pages } = await convertPdfToImages('paper.pdf', { pages: 1 });
const pageOne = pages[0];

// Pass pageOne.dataUrl or pageOne.base64 directly to your AI SDK:
// e.g. Gemini 1.5, OpenAI GPT-4o, Anthropic Claude 3.5 Sonnet
const imagePart = {
  inlineData: {
    data: pageOne.base64,
    mimeType: 'image/png'
  }
};
```

### PDF to Standalone HTML Viewer
```javascript
import { convertPdfToHtml } from 'paper-drift';
import fs from 'node:fs';

const result = await convertPdfToHtml('document.pdf', {
  scale: 2.0,
  withBg: true
});

fs.writeFileSync('output.html', result.html);
```

### Buffer Input Support
Both functions accept raw `Buffer` or `Uint8Array` inputs:
```javascript
import { convertPdfToImages } from 'paper-drift';
import fs from 'node:fs';

const pdfBuffer = fs.readFileSync('document.pdf');
const result = await convertPdfToImages(pdfBuffer, { scale: 1.5 });
```

---

## Agent Skill Installation

`paper-drift` can be installed directly into AI coding agent workspaces:

```bash
# Install skill into current agent workspace (.agent/skills)
npx paper-drift skill

# Install into Claude Code workspace (.claude/skills)
npx paper-drift skill --claude

# Install into Cursor rules (.cursor/rules)
npx paper-drift skill --cursor

# Output raw skill markdown to stdout
npx paper-drift skill cat
```

---

## Testing

Run the test suite:
```bash
npm test
```

---

## License

Apache-2.0 License. See [LICENSE](LICENSE) for details.
