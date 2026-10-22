# AGENT.md - Development & Architectural Guidelines for `paper-drift`

## Project Identity & Vision
**`paper-drift`** is a high-performance, zero-Python, zero-Chromium PDF parsing and conversion tool powered by WebAssembly (WASM) and modern JavaScript.

### Core Philosophy
1. **Zero-Python & Zero-Docker**: No PyTorch, no heavy Docker containers, no unmaintainable microservices.
2. **Zero-Chromium**: Never require Puppeteer, Playwright, or headless Chrome to parse or render documents.
3. **High Fidelity & Interactivity**: Visual precision matching the original PDF layout, while keeping all text selectable, searchable, and accessible.
4. **RAG & Developer Friendly**: Designed to bridge the gap between static PDFs and modern LLM / AI vector ingestion (structured trees, clean Markdown, LaTeX preservation).

---

## Workspace Structure & Rules

```
paper-drift/
├── .github/
│   ├── docs/
│   │   └── commits.md            # Commit log with concise technical explanations
│   └── workflows/
│       └── ci.yml                # CI/CD pipeline (Node 18.x, 20.x, 22.x)
├── .gitignore                    # Ignored files (node_modules, test artifacts)
├── AGENT.md                      # This specification, guidelines, and roadmap file
├── bin/
│   └── cli.js                    # CLI executable (paper-drift command-line runner)
├── src/
│   ├── index.js                  # Main programmatic library export
│   ├── converter.js              # Core conversion engine using WebAssembly (MuPDF)
│   └── utils/
│       └── html-template.js      # Standalone HTML template generator & CSS styling
├── playground/                   # Dedicated browser playground / demo
│   ├── index.html                # Browser playground interface
│   ├── playground.js             # Browser client-side interaction script (PDF.js)
│   ├── style.css                 # Dark-themed styling for playground
│   └── server.js                 # Dev server for playground (COOP/COEP WASM headers)
├── test/                         # Dedicated test suite & test assets
│   ├── fixtures/
│   │   └── sample.pdf            # Sample test PDF
│   ├── scripts/
│   │   └── generate-sample.js    # Script to regenerate sample.pdf
│   └── cli.test.js               # Automated test runner (CLI & API smoke tests)
├── package.json                  # NPM package configuration (bin, main, scripts)
└── README.md                     # Public project documentation & quickstart
```

---

## File Header Standard
Every code file in this repository **must** include a descriptive header docstring at the top of the file:
```javascript
/**
 * @file <path/filename>
 * @description <Concise 2-3 sentence description of file purpose, responsibilities, inputs, and outputs>
 * Part of paper-drift - https://github.com/Sooriya04/Paper-Drift
 */
```

---

## CLI Specifications (`bin/cli.js`)
- **Usage**: `paper-drift <input.pdf> [output.html] [options]`
- **Options**:
  - `--scale <number>`: Rendering scale factor for background layer (default: `2.0`).
  - `--no-bg`: Skip raster background generation and output clean structured text HTML only.
  - `--pages <range>`: Page range filter (e.g. `1-3`, `2,4,6`, default: `all`).
  - `-h, --help`: Display help and options.
  - `-v, --version`: Display current package version.
