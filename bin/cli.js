#!/usr/bin/env node
/**
 * @file bin/cli.js
 * @description Command-line interface executable for paper-drift.
 * Enables zero-Chromium PDF to high-fidelity HTML conversion straight from terminal.
 * Part of paper-drift - https://github.com/Sooriya04/Paper-Drift
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { convertPdfToHtml } from '../src/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Read package metadata for version flag
const packageJson = JSON.parse(
  fs.readFileSync(path.join(__dirname, '../package.json'), 'utf-8')
);

function printHelp() {
  console.log(`
\x1b[1m\x1b[36mpaper-drift\x1b[0m v${packageJson.version}
High-fidelity, zero-Chromium PDF to HTML parser powered by WebAssembly.

\x1b[1mUSAGE:\x1b[0m
  $ paper-drift <input.pdf> [output.html] [options]

\x1b[1mARGUMENTS:\x1b[0m
  input.pdf        Path to the PDF file to convert
  output.html      (Optional) Destination HTML file path (default: <input>.html)

\x1b[1mOPTIONS:\x1b[0m
  --scale <num>    DPI scale for background raster rendering (default: 2.0)
  --no-bg          Text-only mode; disables background image rendering
  --pages <range>  Target pages to convert (e.g. "1-5", "2,4,6", default: "all")
  -v, --version    Show version number
  -h, --help       Display this help message

\x1b[1mEXAMPLES:\x1b[0m
  $ paper-drift document.pdf
  $ paper-drift paper.pdf output.html --scale 2.5
  $ paper-drift manual.pdf manual.html --pages 1-10 --no-bg
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
  let scale = 2.0;
  let withBg = true;
  let pageRange = 'all';

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--scale') {
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

  if (!outputFile) {
    const parsedPath = path.parse(resolvedInput);
    outputFile = path.join(process.cwd(), `${parsedPath.name}.html`);
  } else {
    outputFile = path.resolve(process.cwd(), outputFile);
  }

  console.log(`\x1b[36m⚡ paper-drift\x1b[0m v${packageJson.version}`);
  console.log(`📄 Input:   ${resolvedInput}`);
  console.log(`🎯 Output:  ${outputFile}`);
  console.log(`⚙️  Config:  Scale=${scale}x, Background=${withBg ? 'lossless' : 'disabled'}, Pages=${pageRange}`);
  console.log('🔄 Initializing WebAssembly runtime...');

  try {
    const result = await convertPdfToHtml(resolvedInput, {
      scale,
      withBg,
      pageRange,
      onProgress: ({ current, total, pageNumber }) => {
        process.stdout.write(`   ⏳ Processing page ${pageNumber} (${current}/${total})...\r`);
      }
    });

    fs.writeFileSync(outputFile, result.html, 'utf-8');
    const stats = fs.statSync(outputFile);
    const sizeKb = (stats.size / 1024).toFixed(1);

    console.log(`\n\x1b[32m✔ Conversion complete in ${result.durationMs}ms!\x1b[0m`);
    console.log(`📊 Converted ${result.pagesProcessed} of ${result.totalPages} pages (${sizeKb} KB)`);
    console.log(`✨ Open your file: \x1b[4mfile://${outputFile}\x1b[0m\n`);
  } catch (err) {
    console.error(`\n\x1b[31m❌ Conversion failed:\x1b[0m ${err.message}`);
    process.exit(1);
  }
}

run();
