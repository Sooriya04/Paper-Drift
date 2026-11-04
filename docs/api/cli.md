# CLI Reference: `paper-drift`

The `paper-drift` command-line interface provides high-performance, zero-Chromium WebAssembly conversion from PDFs to Markdown (GFM), high-resolution PNG images, Base64 JSON, standalone HTML, and extracted figures.

---

## Installation & Execution

Run directly via `npx` (no installation required):
```bash
npx paper-drift <input.pdf> [output] [options]
```

Or install globally:
```bash
npm install -g paper-drift
paper-drift <input.pdf> [output] [options]
```

---

## Command Syntax

```bash
paper-drift <input.pdf> [output] [options]
```

### Arguments

| Argument | Description |
| :--- | :--- |
| `<input.pdf>` | **Required.** Path to the source PDF file to convert. |
| `[output]` | *Optional.* Destination file path or directory. If omitted, files are saved in the current working directory using the PDF's base name. |

---

## Options & Flags

| Flag | Values | Default | Description |
| :--- | :--- | :--- | :--- |
| `--format <fmt>` | `image` (or `png`), `markdown` (or `md`), `base64`, `html`, `text`, `json`, `extract-images` | `image` | Output conversion format. Auto-inferred if `output` extension matches (`.md`, `.html`, `.png`, `.json`, `.txt`). |
| `-i`, `--extract-images [dir]` | Directory path *(optional)* | `null` | Extracts embedded raster images and cropped vector figures into disk files. Can be used standalone or combined with Markdown conversion. |
| `--scale <number>` | Float number (e.g. `1.5`, `2.0`, `3.0`) | `2.0` | DPI resolution scale factor (`1.0` = 72 DPI, `2.0` = 144 DPI Retina, `3.0` = 216 DPI). |
| `--pages <range>` | Page range string or number | `all` | Specifies target pages to convert (e.g. `1`, `1-5`, `2,4,6`). |
| `--no-bg` | *None* | `false` | Text-only mode for HTML format (skips raster background image rendering for speed). |
| `-v`, `--version` | *None* | — | Prints the installed package version. |
| `-h`, `--help` | *None* | — | Prints help message and usage guide. |

---

## Format Details & Output Behaviors

### 1. Markdown (`--format markdown` or `--format md`)
Converts the document into GitHub Flavored Markdown (GFM) with:
- Spatially ordered multi-column text (Recursive XY-Cut)
- Reconstructed pipe tables (Academic Booktabs and full grids)
- Interactive citation links and section anchor slugs
- Typographical headings (`#`, `##`, `###`), blockquotes, and lists

```bash
# Export to output.md
paper-drift paper.pdf output.md

# Auto-inferred format from .md extension
paper-drift paper.pdf my-paper.md

# Markdown with embedded images extracted into an assets folder
paper-drift paper.pdf output.md -i assets/
```

### 2. High-Res Images (`--format image` or `--format png`)
Renders document pages as high-resolution PNG images using streaming WebAssembly.
- **Single Page Match:** Writes directly to the target filename or `<input>.png`.
- **Multiple Pages:** Writes numbered pages `<name>-<page>.png`.

```bash
# Convert all pages to PNGs in current working directory
paper-drift document.pdf --format image

# Render page 1 only at 3.0x scale (216 DPI)
paper-drift document.pdf page1.png --pages 1 --scale 3.0

# Export all pages into an images/ folder
paper-drift document.pdf images/ --format image
```

### 3. Base64 JSON (`--format base64`)
Exports rendered page images as Base64 strings inside a structured JSON file. Ideal for feeding multi-page PDFs directly into multimodal vision APIs (Claude 3.5 Sonnet, GPT-4o, Gemini).

```bash
paper-drift paper.pdf --format base64
# Output: paper-base64.json
```

**JSON Schema:**
```json
{
  "document": "paper.pdf",
  "scale": 2.0,
  "totalPages": 8,
  "pagesProcessed": 8,
  "pages": [
    {
      "pageNumber": 1,
      "width": 1224,
      "height": 1584,
      "dataUrl": "data:image/png;base64,iVBORw0KGgo...",
      "base64": "iVBORw0KGgo..."
    }
  ]
}
```

### 4. Standalone HTML Viewer (`--format html`)
Generates a complete, single-file HTML document containing pixel-perfect visual raster backgrounds with point-accurate, selectable text layers overlayed on top.

```bash
paper-drift presentation.pdf viewer.html
```

### 5. Extract Images Only (`-i` or `--format extract-images`)
Extracts all embedded raster photos and vector-drawn diagrams into PNG files.

```bash
# Extracts into default <paper>_extracted_images/ folder
paper-drift paper.pdf -i

# Extracts into specific target directory
paper-drift paper.pdf -i figures/
```

---

## Page Range Specification

The `--pages` option accepts flexible human-readable patterns:

| Syntax | Description | Example |
| :--- | :--- | :--- |
| `all` | Every page in document (default) | `--pages all` |
| Single integer | Specific page number (1-based) | `--pages 1` |
| Hyphenated range | Contiguous range of pages | `--pages 1-5` |
| Comma-separated list | Distinct page numbers | `--pages 1,3,7` |
| Mixed specification | Combinations of ranges and numbers | `--pages 1-3,5,8-10` |

---

## Exit Codes

| Code | Meaning |
| :--- | :--- |
| `0` | Success. File(s) created successfully. |
| `1` | Error. Missing input file, invalid format, or PDF parsing error. |
