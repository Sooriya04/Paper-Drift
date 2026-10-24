# paper-drift

[![CI](https://github.com/Sooriya04/Paper-Drift/actions/workflows/ci.yml/badge.svg)](https://github.com/Sooriya04/Paper-Drift/actions/workflows/ci.yml)
[![License: Apache-2.0](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)
[![Node Version](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen.svg)](https://nodejs.org)
[![WASM Powered](https://img.shields.io/badge/engine-WebAssembly-purple.svg)](https://webassembly.org/)

> **Zero-Python, zero-Chromium WebAssembly document parser, HTML renderer, and Markdown engine with GFM tables and math.**

Convert complex academic research papers and enterprise PDFs directly into clean, structured **Markdown** or standalone **HTML** with pixel-perfect visual fidelity—without Puppeteer, Python, Docker, or external servers. Drastically reduces LLM token consumption compared to sending raw PDFs or vision images.

---

## ⚡ Why paper-drift?

Most PDF conversion pipelines in JavaScript suffer from two major flaws:
1. **The Heavyweight Trap**: Requiring Headless Chromium (Puppeteer / Playwright) or Python microservices (`unstructured`, `poppler`, `nougat`) that need 500MB+ Docker images, multi-second cold boots, and high cloud costs.
2. **The "Text Soup" Trap**: Spatially naive parsers that dump unordered lines, break multi-column layouts, and butcher tabular grids.

**`paper-drift` solves this natively:**
* **Zero-Python & Zero-Chromium**: Runs compiled WebAssembly directly in any V8 runtime (Node.js, Bun, or modern browsers). Zero external microservices or headless browsers required.
* **Direct Markdown Engine**: Converts directly into GitHub Flavored Markdown (GFM) with auto-detected `#`, `##` headings, list markers, and clean math.
* **Geometric Table Reconstruction**: Discovers column gutters and slices cells into standard pipe tables (`| col1 | col2 |`) with clean universal math exponents (`O(n² · d)`, `10¹⁹`).
* **Multi-Column Spatial Ordering**: Resolves 2-column papers via Recursive XY-Cut without column interweaving.
* **Dual-Layer HTML Mode**: High-DPI background raster rendering paired with a 1:1 selectable, searchable text layer.
* **100% Private & Instant**: Ingests pages in under 50ms locally. Zero data leaves your machine.

---

## 🚀 Quick Start (CLI)

### Run with `npx` (Zero installation required)
```bash
# Convert to Markdown (for Claude, LLMs, or AI Agents)
npx paper-drift paper.pdf output.md --format md

# Convert to Standalone HTML (for human viewing)
npx paper-drift paper.pdf output.html
```

### Install Globally
```bash
npm install -g paper-drift
```

### Common Commands
```bash
# Convert to clean Markdown
paper-drift research-paper.pdf paper.md --format md

# Convert specific pages to Markdown
paper-drift paper.pdf output.md --format md --pages 1-5,8

# Convert to pixel-perfect HTML at 2.0x Retina scale
paper-drift report.pdf output.html --scale 2.0

# Text-only HTML mode (skips background raster)
paper-drift book.pdf book.html --no-bg
```

### CLI Options

| Flag | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `<input.pdf>` | `string` | *(required)* | Path to the source PDF file |
| `[output]` | `string` | `<name>.<ext>` | Destination output file path |
| `--format <fmt>` | `string` | `html` | Output format: `markdown` (`md`) \| `html` \| `text` \| `json` |
| `--pages <range>` | `string` | `"all"` | Target page range (e.g. `1-10`, `2,4,6`) |
| `--scale <num>` | `number` | `2.0` | DPI multiplier for background raster rendering in HTML mode |
| `--no-bg` | `boolean` | `false` | Disables background rasterization (text-only HTML) |
| `-v, --version` | `flag` | — | Display current version |
| `-h, --help` | `flag` | — | Display CLI help menu |

---

## 💻 Programmatic API (Node.js / Bun)

Install in your project:
```bash
npm install paper-drift
```

### Direct PDF to Markdown
```javascript
import { convertPdfToMarkdown } from 'paper-drift';

const result = await convertPdfToMarkdown('research-paper.pdf', {
  pageRange: '1-10'
});

console.log(`Converted ${result.pagesProcessed} pages in ${result.durationMs}ms`);
console.log(result.markdown);
```

### PDF to Standalone HTML
```javascript
import { convertPdfToHtml } from 'paper-drift';
import fs from 'fs';

const result = await convertPdfToHtml('document.pdf', {
  scale: 2.0,
  withBg: true
});

fs.writeFileSync('output.html', result.html);
```

### Buffer Input Support
Both functions accept raw `Buffer` or `Uint8Array` inputs:
```javascript
import { convertPdfToMarkdown } from 'paper-drift';

const pdfBuffer = await fetch('https://example.com/paper.pdf').then(r => r.arrayBuffer());
const { markdown } = await convertPdfToMarkdown(Buffer.from(pdfBuffer));
```

---

## 💸 Reduce Token Costs for AI Agents

Sending raw PDF documents or full-page screenshots to LLMs wastes massive amounts of context window tokens and introduces vision hallucinations on formulas and tabular data.

**`paper-drift` converts PDFs into clean, structured Markdown before sending them to the model:**
* **Drastically Reduced Token Footprint**: Markdown transmits only the actual text, pipe tables, and math equations—eliminating the heavy pixel-tiling token overhead of multimodal vision models and unstructured OCR dumps.
* **100% Reading Order Accuracy**: Recursive XY-Cut sequences multi-column research papers in natural human reading order without column line-mixing.
* **High-Fidelity Tables & Math**: Tables are converted to clean GFM pipe tables (`| col1 | col2 |`) and math is preserved as clean Unicode/LaTeX without visual distortion.
* **Fast & Lightweight Ingestion**: Ingests pages locally via WebAssembly in milliseconds, slashing API latency and context costs.

---

## 🤖 Turnkey AI Agent Skill (Claude, Cursor, Antigravity)

`paper-drift` is built from the ground up as a native **AI Agent Skill** to eliminate the **"Multimodal PDF Token Tax"**. 

When an AI coding or research agent ingests raw PDFs as images, it burns thousands of vision tokens per page and quickly crowds context windows. By equipping your agent with the `paper-drift` skill, the agent pre-processes PDFs locally via WebAssembly into clean Markdown, GFM tables, and LaTeX equations in milliseconds—drastically reducing token consumption compared to sending raw PDFs.

### 1-Click Skill Installation

Install the canonical [`SKILL.md`](skills/paper-drift/SKILL.md) into any workspace with a single command:

```bash
# 1. Default: Auto-install to current workspace (.agent/skills/paper-drift/SKILL.md)
npx paper-drift skill

# 2. Target Claude Code workspace (.claude/skills/paper-drift/SKILL.md)
npx paper-drift skill --claude

# 3. Target Cursor workspace rules (.cursor/rules/paper-drift.md)
npx paper-drift skill --cursor

# 4. Install globally for all projects (~/.gemini/... & ~/.claude/...)
npx paper-drift skill --global

# 5. Output raw SKILL.md to stdout (for piping or custom paths)
npx paper-drift skill cat
```

### How the Agent Uses It

Once installed, your agent automatically activates the skill whenever you provide a PDF:

```text
User: "Summarize the experimental results from attention-is-all-you-need.pdf"

Agent (Internal):
  1. Detects paper-drift skill
  2. Executes: npx -y paper-drift attention-is-all-you-need.pdf --format md --pages 6-8
  3. Receives clean GFM Table 1 and BLEU score comparisons in < 250ms
  4. Answers your query directly from clean Markdown text without burning multimodal vision tokens!
```

- 📖 **Skill Specification:** [`skills/paper-drift/SKILL.md`](skills/paper-drift/SKILL.md)
- 🌐 **Interactive Documentation:** [https://sooriya04.github.io/Paper-Drift/#skill](https://sooriya04.github.io/Paper-Drift/#skill)

---

## 🌐 Interactive Web Playground

`paper-drift` includes a local WebAssembly playground with live GFM table and KaTeX formula preview:

1. Start the local server:
   ```bash
   npm start
   ```
2. Open your browser at **http://localhost:3000** and drag-and-drop any PDF.

---

## 🧪 Testing & Benchmarks

Run the complete test suite:
```bash
npm test
```

Benchmark throughput and layout fidelity across landmark ArXiv papers:
```bash
npm run benchmark
```

---

## 📄 License

Apache-2.0 License. See [LICENSE](LICENSE) for details.
