#!/usr/bin/env node
/**
 * @file bin/cli.js
 * @description Command-line interface executable for paper-drift.
 * Enables zero-Chromium PDF to high-fidelity HTML, Markdown, and natural spatial text conversion straight from terminal.
 * Part of paper-drift - https://github.com/Sooriya04/Paper-Drift
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { convertPdfToHtml, convertPdfToMarkdown } from '../src/index.js';
import { installSkill, getSkillContent } from '../src/skill/installer.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Read package metadata for version flag
const packageJson = JSON.parse(
  fs.readFileSync(path.join(__dirname, '../package.json'), 'utf-8')
);

function printHelp() {
  console.log(`
\x1b[1m\x1b[36mpaper-drift\x1b[0m v${packageJson.version}
High-fidelity, zero-Chromium PDF parser powered by WebAssembly & spatial layout decomposition.

\x1b[1mUSAGE:\x1b[0m
  $ paper-drift <input.pdf> [output] [options]

\x1b[1mARGUMENTS:\x1b[0m
  input.pdf        Path to the PDF file to convert
  output           (Optional) Destination file path (default: <input>.<ext>)

\x1b[1mOPTIONS:\x1b[0m
  --format <fmt>   Output format: markdown (md) | html | text | json (default: html)
  --scale <num>    DPI scale for background raster rendering (default: 2.0)
  --no-bg          Text-only mode; disables background raster rendering
  --pages <range>  Target pages to convert (e.g. "1-5", "2,4,6", default: "all")
  -v, --version    Show version number
  -h, --help       Display this help message

\x1b[1mEXAMPLES:\x1b[0m
  $ paper-drift document.pdf
  $ paper-drift paper.pdf output.md --format md
  $ paper-drift paper.pdf output.txt --format text
  $ paper-drift paper.pdf output.html --scale 2.5
  $ paper-drift manual.pdf manual.html --pages 1-10 --no-bg

\x1b[1mAGENT SKILL:\x1b[0m
  $ paper-drift skill                 Install skill into agent workspace (.agent/skills)
  $ paper-drift skill --claude        Install skill into Claude workspace (.claude/skills)
  $ paper-drift skill --cursor        Install skill into Cursor rules (.cursor/rules)
  $ paper-drift skill --global        Install skill globally to user home directory
  $ paper-drift skill cat             Output raw SKILL.md to stdout
`);
}

async function run() {
  const args = process.argv.slice(2);

  // Handle agent skill subcommands
  if (args[0] === 'skill' || args.includes('--install-skill')) {
    if (args.includes('cat') || args.includes('print')) {
      process.stdout.write(getSkillContent());
      process.exit(0);
    }

    const isGlobal = args.includes('--global');
    const isClaude = args.includes('--claude');
    const isCursor = args.includes('--cursor');
    const isAgent = args.includes('--agent') || args.includes('--antigravity');
    let dest = null;
    const destIdx = args.indexOf('--dest');
    if (destIdx !== -1 && args[destIdx + 1]) {
      dest = args[destIdx + 1];
    }

    try {
      const installed = installSkill({
        global: isGlobal,
        claude: isClaude,
        cursor: isCursor,
        agent: isAgent,
        dest
      });

      console.log('\n\x1b[1m\x1b[36mpaper-drift\x1b[0m \x1b[32mAgent Skill Installed Successfully!\x1b[0m\n');
      for (const p of installed) {
        console.log(`  \x1b[32m✔\x1b[0m ${path.relative(process.cwd(), p) || p}`);
      }
      console.log('\n\x1b[90mYour AI coding agent can now parse PDFs with zero multimodal token tax.\x1b[0m');
      console.log('\x1b[90mAsk your agent: "Read this PDF" or "Extract Table 1 from paper.pdf"\x1b[0m\n');
      process.exit(0);
    } catch (err) {
      console.error(`\x1b[31mError installing skill:\x1b[0m ${err.message}`);
      process.exit(1);
    }
  }

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
  let format = 'html';
  let scale = 2.0;
  let withBg = true;
  let pageRange = 'all';

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--format') {
      format = (args[++i] || 'html').toLowerCase();
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

  const validFormats = ['html', 'md', 'markdown', 'text', 'json'];
  if (!validFormats.includes(format)) {
    console.error(`\x1b[31mError: Unsupported format "${format}". Supported: markdown (md) | html | text | json\x1b[0m`);
    process.exit(1);
  }

  const isMarkdown = format === 'md' || format === 'markdown';
  const ext = isMarkdown ? 'md' : (format === 'text' ? 'txt' : (format === 'json' ? 'json' : 'html'));
  if (!outputFile) {
    const parsedPath = path.parse(resolvedInput);
    outputFile = path.join(process.cwd(), `${parsedPath.name}.${ext}`);
  } else {
    outputFile = path.resolve(process.cwd(), outputFile);
  }

  console.log(`\x1b[36m⚡ paper-drift\x1b[0m v${packageJson.version}`);
  console.log(`📄 Input:   ${resolvedInput}`);
  console.log(`🎯 Output:  ${outputFile} (Format: ${format.toUpperCase()})`);
  console.log(`⚙️  Config:  Scale=${scale}x, Background=${withBg ? 'lossless' : 'disabled'}, Pages=${pageRange}`);
  console.log('🔄 Running WebAssembly parser with spatial reading order decomposition...');

  try {
    let outputContent = '';
    let durationMs = 0;
    let pagesProcessed = 0;
    let totalPages = 0;
    let columnsOrTablesInfo = '';

    if (isMarkdown) {
      const result = await convertPdfToMarkdown(resolvedInput, {
        pageRange,
        onProgress: ({ current, total, pageNumber }) => {
          process.stdout.write(`   ⏳ Processing page ${pageNumber} (${current}/${total})...\r`);
        }
      });
      outputContent = result.markdown;
      durationMs = result.durationMs;
      pagesProcessed = result.pagesProcessed;
      totalPages = result.totalPages;
      columnsOrTablesInfo = result.pages.map(p => `p${p.pageNumber}:${p.tablesCount}tables`).join(', ');
    } else {
      const result = await convertPdfToHtml(resolvedInput, {
        scale,
        withBg,
        pageRange,
        format,
        onProgress: ({ current, total, pageNumber }) => {
          process.stdout.write(`   ⏳ Processing page ${pageNumber} (${current}/${total})...\r`);
        }
      });
      durationMs = result.durationMs;
      pagesProcessed = result.pagesProcessed;
      totalPages = result.totalPages;
      columnsOrTablesInfo = result.pages.map(p => `p${p.pageNumber}:${p.columnsDetected}col`).join(', ');

      if (format === 'text') {
        outputContent = result.text;
      } else if (format === 'json') {
        outputContent = JSON.stringify(result.pages, null, 2);
      } else {
        outputContent = result.html;
      }
    }

    fs.writeFileSync(outputFile, outputContent, 'utf-8');
    const stats = fs.statSync(outputFile);
    const sizeKb = (stats.size / 1024).toFixed(1);

    console.log(`\n\x1b[32m✔ Conversion complete in ${durationMs}ms!\x1b[0m`);
    console.log(`📊 Converted ${pagesProcessed} of ${totalPages} pages (${sizeKb} KB) [${columnsOrTablesInfo}]`);
    console.log(`✨ Open your file: \x1b[4mfile://${outputFile}\x1b[0m\n`);
  } catch (err) {
    console.error(`\n\x1b[31m❌ Conversion failed:\x1b[0m ${err.message}`);
    process.exit(1);
  }
}

run();
