#!/usr/bin/env node
/**
 * @file bin/cli.js
 * @description Command-line interface executable for paper-drift.
 * High-performance WebAssembly PDF to Image & Base64 rasterizer, HTML viewer, and spatial text extractor.
 * Part of paper-drift - https://github.com/Sooriya04/Paper-Drift
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { convertPdfToImages, convertPdfToHtml } from '../src/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Read package metadata for version flag
const packageJson = JSON.parse(
  fs.readFileSync(path.join(__dirname, '../package.json'), 'utf-8')
);

function printHelp() {
  console.log(`
\x1b[1m\x1b[36mpaper-drift\x1b[0m v${packageJson.version}
High-performance, zero-Chromium WebAssembly PDF to Image (PNG / Base64) & layout engine.

\x1b[1mUSAGE:\x1b[0m
  $ paper-drift <input.pdf> [output] [options]

\x1b[1mARGUMENTS:\x1b[0m
  input.pdf        Path to the PDF file to convert
  output           (Optional) Destination file or directory path

\x1b[1mOPTIONS:\x1b[0m
  --format <fmt>   Output format: image (png) | base64 | html | text | json (default: image)
  --scale <num>    DPI resolution scale factor (default: 2.0 = Retina 144 DPI, 3.0 = 216 DPI)
  --pages <range>  Target pages to convert (e.g. "1-5", "2,4,6", 1, default: "all")
  --no-bg          Text-only mode for HTML format (disables background raster rendering)
  -v, --version    Show version number
  -h, --help       Display this help message

\x1b[1mEXAMPLES:\x1b[0m
  $ paper-drift paper.pdf --format image              # Convert all pages to high-res PNG images
  $ paper-drift paper.pdf output.png --pages 1        # Convert page 1 to output.png
  $ paper-drift paper.pdf images/ --format image      # Export pages into an images/ directory
  $ paper-drift paper.pdf --format base64             # Export pages as Base64 JSON
  $ paper-drift paper.pdf output.html --format html   # Export standalone HTML viewer
`);
}

async function run() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes('-h') || args.includes('--help')) {
    printHelp();
    process.exit(0);
  }

  if (args.includes('-v') || args.includes('--version')) {
    console.log(`paper-drift v${packageJson.version}`);
    process.exit(0);
  }

  // Parse positional and flag arguments
  let inputFile = null;
  let outputFile = null;
  let format = null;
  let scale = 2.0;
  let withBg = true;
  let pageRange = 'all';

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--format') {
      format = (args[++i] || 'image').toLowerCase();
    } else if (arg === '--scale') {
      scale = parseFloat(args[++i]) || 2.0;
    } else if (arg === '--no-bg') {
      withBg = false;
    } else if (arg === '--pages') {
      pageRange = args[++i] || 'all';
    } else if (!arg.startsWith('-')) {
      if (!inputFile) {
        inputFile = arg;
      } else if (!outputFile) {
        outputFile = arg;
      }
    }
  }

  // Infer format from output file extension if not explicitly specified, otherwise default to image
  if (!format) {
    if (outputFile) {
      const ext = path.extname(outputFile).toLowerCase();
      if (ext === '.html') format = 'html';
      else if (ext === '.png' || ext === '.jpg' || ext === '.jpeg') format = 'image';
      else if (ext === '.json') format = 'json';
      else if (ext === '.txt') format = 'text';
      else format = 'image';
    } else {
      format = 'image';
    }
  }

  if (!inputFile) {
    console.error('\x1b[31mError: Missing required argument <input.pdf>\x1b[0m');
    printHelp();
    process.exit(1);
  }

  const resolvedInput = path.resolve(process.cwd(), inputFile);
  if (!fs.existsSync(resolvedInput)) {
    console.error(`\x1b[31mError: Input file does not exist: ${resolvedInput}\x1b[0m`);
    process.exit(1);
  }

  const validFormats = ['image', 'png', 'img', 'base64', 'html', 'text', 'json'];
  if (!validFormats.includes(format)) {
    console.error(`\x1b[31mError: Unsupported format "${format}". Supported: image (png) | base64 | html | text | json\x1b[0m`);
    process.exit(1);
  }

  const isImageMode = format === 'image' || format === 'png' || format === 'img';
  const isBase64Mode = format === 'base64';

  console.log(`\x1b[36mpaper-drift\x1b[0m v${packageJson.version}`);
  console.log(`Input:   ${resolvedInput}`);
  console.log(`Format:  ${format.toUpperCase()}`);
  console.log(`Config:  Scale=${scale}x (DPI=${Math.round(scale * 72)}), Pages=${pageRange}`);
  console.log('Running WebAssembly PDF rasterizer...');

  try {
    const parsedInput = path.parse(resolvedInput);

    if (isImageMode) {
      const result = await convertPdfToImages(resolvedInput, {
        scale,
        pages: pageRange,
        onProgress: ({ current, total, pageNumber }) => {
          process.stdout.write(`Rendering page ${pageNumber} (${current}/${total})...\r`);
        }
      });

      const generatedFiles = [];
      if (result.pages.length === 1) {
        let destFile;
        if (outputFile) {
          destFile = path.resolve(process.cwd(), outputFile);
          if (!destFile.toLowerCase().endsWith('.png')) destFile += '.png';
        } else {
          destFile = path.join(process.cwd(), `${parsedInput.name}.png`);
        }
        fs.writeFileSync(destFile, result.pages[0].buffer);
        generatedFiles.push(destFile);
      } else {
        // Multi-page export
        let outDir = process.cwd();
        let namePrefix = parsedInput.name;

        if (outputFile) {
          const resolvedOut = path.resolve(process.cwd(), outputFile);
          const parsedOut = path.parse(resolvedOut);
          if (parsedOut.ext) {
            outDir = parsedOut.dir;
            namePrefix = parsedOut.name;
          } else {
            outDir = resolvedOut;
            namePrefix = 'page';
          }
        }

        if (!fs.existsSync(outDir)) {
          fs.mkdirSync(outDir, { recursive: true });
        }

        for (const page of result.pages) {
          const pageFile = path.join(outDir, `${namePrefix}-${page.pageNumber}.png`);
          fs.writeFileSync(pageFile, page.buffer);
          generatedFiles.push(pageFile);
        }
      }

      console.log(`\n\x1b[32m[OK] Rendered ${result.pagesProcessed} page(s) in ${result.durationMs}ms\x1b[0m`);
      for (const f of generatedFiles) {
        const stats = fs.statSync(f);
        const kb = (stats.size / 1024).toFixed(1);
        console.log(`  - ${path.relative(process.cwd(), f) || f} (${kb} KB)`);
      }
      console.log(`Completed successfully.\n`);
    } else if (isBase64Mode) {
      const result = await convertPdfToImages(resolvedInput, {
        scale,
        pages: pageRange,
        onProgress: ({ current, total, pageNumber }) => {
          process.stdout.write(`Extracting base64 page ${pageNumber} (${current}/${total})...\r`);
        }
      });

      let destFile = outputFile ? path.resolve(process.cwd(), outputFile) : path.join(process.cwd(), `${parsedInput.name}-base64.json`);
      if (!destFile.endsWith('.json') && !destFile.endsWith('.txt')) {
        destFile += '.json';
      }

      const outputJson = {
        document: parsedInput.base,
        scale,
        totalPages: result.totalPages,
        pagesProcessed: result.pagesProcessed,
        pages: result.pages.map(p => ({
          pageNumber: p.pageNumber,
          width: p.width,
          height: p.height,
          dataUrl: p.dataUrl,
          base64: p.base64
        }))
      };

      fs.writeFileSync(destFile, JSON.stringify(outputJson, null, 2), 'utf-8');
      const stats = fs.statSync(destFile);
      const kb = (stats.size / 1024).toFixed(1);

      console.log(`\n\x1b[32m[OK] Exported Base64 for ${result.pagesProcessed} page(s) in ${result.durationMs}ms\x1b[0m`);
      console.log(`Output: ${destFile} (${kb} KB)`);
      console.log(`File path: file://${destFile}\n`);
    } else {
      // HTML, text, json format modes
      let destFile = outputFile ? path.resolve(process.cwd(), outputFile) : null;
      const ext = format === 'text' ? 'txt' : (format === 'json' ? 'json' : 'html');
      if (!destFile) {
        destFile = path.join(process.cwd(), `${parsedInput.name}.${ext}`);
      }

      const result = await convertPdfToHtml(resolvedInput, {
        scale,
        withBg,
        pageRange,
        format,
        onProgress: ({ current, total, pageNumber }) => {
          process.stdout.write(`Processing page ${pageNumber} (${current}/${total})...\r`);
        }
      });

      let outputContent;
      if (format === 'text') {
        outputContent = result.text;
      } else if (format === 'json') {
        outputContent = JSON.stringify(result.pages, null, 2);
      } else {
        outputContent = result.html;
      }

      fs.writeFileSync(destFile, outputContent, 'utf-8');
      const stats = fs.statSync(destFile);
      const kb = (stats.size / 1024).toFixed(1);

      console.log(`\n\x1b[32m[OK] Conversion complete in ${result.durationMs}ms\x1b[0m`);
      console.log(`Converted ${result.pagesProcessed} of ${result.totalPages} pages (${kb} KB)`);
      console.log(`File path: file://${destFile}\n`);
    }
  } catch (err) {
    console.error(`\n\x1b[31m[ERROR] Operation failed:\x1b[0m ${err.message}`);
    process.exit(1);
  }
}

run();
