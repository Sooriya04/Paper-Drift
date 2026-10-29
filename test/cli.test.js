/**
 * @file test/cli.test.js
 * @description Automated test suite for paper-drift CLI and programmatic API.
 * Validates CLI flags, WebAssembly PDF parsing, dual-layer HTML generation, and page filters.
 * Part of paper-drift - https://github.com/Sooriya04/Paper-Drift
 */

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { convertPdfToHtml, convertPdfToImages, parsePageRange } from '../src/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const samplePdfPath = path.resolve(__dirname, 'fixtures/sample.pdf');
const resultsOutputDir = path.resolve(__dirname, 'results/cli-test');

function runTest(name, fn) {
  try {
    fn();
    console.log(`  \x1b[32m✔\x1b[0m ${name}`);
  } catch (err) {
    console.error(`  \x1b[31m✖\x1b[0m ${name}`);
    console.error(`    ${err.message}`);
    process.exit(1);
  }
}

async function runAsyncTest(name, fn) {
  try {
    await fn();
    console.log(`  \x1b[32m✔\x1b[0m ${name}`);
  } catch (err) {
    console.error(`  \x1b[31m✖\x1b[0m ${name}`);
    console.error(`    ${err.message}`);
    process.exit(1);
  }
}

console.log('\n\x1b[1m\x1b[36mRunning paper-drift Test Suite\x1b[0m');

// Ensure fixture exists
if (!fs.existsSync(samplePdfPath)) {
  execSync(`node "${path.resolve(__dirname, 'scripts/generate-sample.js')}"`, { stdio: 'inherit' });
}

// Clean stale previous outputs before starting this run to avoid overlapping
if (fs.existsSync(resultsOutputDir)) {
  fs.rmSync(resultsOutputDir, { recursive: true, force: true });
}
fs.mkdirSync(resultsOutputDir, { recursive: true });

try {
  // 1. Page range parser unit test
  runTest('parsePageRange() parses numeric ranges and lists correctly', () => {
    const range1 = parsePageRange('1-3', 5);
    if (JSON.stringify(range1) !== JSON.stringify([0, 1, 2])) throw new Error(`Unexpected range: ${JSON.stringify(range1)}`);

    const range2 = parsePageRange('1,3,5', 5);
    if (JSON.stringify(range2) !== JSON.stringify([0, 2, 4])) throw new Error(`Unexpected range: ${JSON.stringify(range2)}`);

    const range3 = parsePageRange('all', 3);
    if (JSON.stringify(range3) !== JSON.stringify([0, 1, 2])) throw new Error(`Unexpected range: ${JSON.stringify(range3)}`);

    const range4 = parsePageRange(2, 5);
    if (JSON.stringify(range4) !== JSON.stringify([1])) throw new Error(`Unexpected single number range: ${JSON.stringify(range4)}`);

    const range5 = parsePageRange([1, 3], 5);
    if (JSON.stringify(range5) !== JSON.stringify([0, 2])) throw new Error(`Unexpected array range: ${JSON.stringify(range5)}`);
  });

  // 2. CLI --help flag
  runTest('CLI responds to --help flag', () => {
    const output = execSync('node bin/cli.js --help', { encoding: 'utf-8' });
    if (!output.includes('paper-drift') || !output.includes('USAGE:')) {
      throw new Error('Help output missing expected headers');
    }
  });

  // 3. CLI --version flag
  runTest('CLI responds to --version flag', () => {
    const output = execSync('node bin/cli.js --version', { encoding: 'utf-8' });
    if (!output.includes('paper-drift v')) {
      throw new Error('Version output missing expected version string');
    }
  });

  // 4. CLI file conversion test
  const cliOutputFile = path.join(resultsOutputDir, 'sample.html');
  runTest('CLI converts PDF to standalone HTML with background', () => {
    if (fs.existsSync(cliOutputFile)) fs.unlinkSync(cliOutputFile);
    execSync(`node bin/cli.js "${samplePdfPath}" "${cliOutputFile}" --scale 1.5`, { stdio: 'pipe' });

    if (!fs.existsSync(cliOutputFile)) throw new Error('Output HTML was not created');
    const content = fs.readFileSync(cliOutputFile, 'utf-8');
    if (!content.includes('class="pdf-page"') || !content.includes('paper-drift')) {
      throw new Error('Output HTML missing expected page markup');
    }
  });

  // 7. CLI format validation test
  runTest('CLI rejects unsupported --format and exits with non-zero code', () => {
    let failed = false;
    try {
      execSync(`node bin/cli.js "${samplePdfPath}" --format invalidFormat`, { stdio: 'pipe' });
    } catch (err) {
      failed = true;
    }
    if (!failed) throw new Error('CLI should have failed with invalid format');
  });

  // 8. CLI image conversion test
  const cliOutputImage = path.join(resultsOutputDir, 'sample.png');
  runTest('CLI converts PDF to high-res PNG image via --format image', () => {
    if (fs.existsSync(cliOutputImage)) fs.unlinkSync(cliOutputImage);
    execSync(`node bin/cli.js "${samplePdfPath}" "${cliOutputImage}" --format image --scale 1.5`, { stdio: 'pipe' });

    if (!fs.existsSync(cliOutputImage)) throw new Error('Output PNG was not created');
    const stats = fs.statSync(cliOutputImage);
    if (stats.size < 1000) throw new Error('Generated PNG file is too small');
  });

  // 9. CLI base64 export test
  const cliOutputBase64 = path.join(resultsOutputDir, 'sample-base64.json');
  runTest('CLI exports Base64 JSON via --format base64', () => {
    if (fs.existsSync(cliOutputBase64)) fs.unlinkSync(cliOutputBase64);
    execSync(`node bin/cli.js "${samplePdfPath}" "${cliOutputBase64}" --format base64`, { stdio: 'pipe' });

    if (!fs.existsSync(cliOutputBase64)) throw new Error('Output Base64 JSON was not created');
    const jsonContent = JSON.parse(fs.readFileSync(cliOutputBase64, 'utf-8'));
    if (!jsonContent.pages || jsonContent.pages.length === 0) throw new Error('Base64 JSON missing pages array');
    if (!jsonContent.pages[0].dataUrl.startsWith('data:image/png;base64,')) throw new Error('Invalid dataUrl format');
  });

  // 10. Programmatic convertPdfToImages API test
  await runAsyncTest('Programmatic convertPdfToImages API returns PNG buffer and base64', async () => {
    const result = await convertPdfToImages(samplePdfPath, { scale: 1.0 });
    if (result.pagesProcessed !== 1) throw new Error(`Expected 1 page, got ${result.pagesProcessed}`);
    const page = result.pages[0];
    if (!Buffer.isBuffer(page.buffer)) throw new Error('page.buffer is not a Buffer');
    if (!page.base64 || page.base64.length < 500) throw new Error('page.base64 is missing or invalid');
    if (!page.dataUrl.startsWith('data:image/png;base64,')) throw new Error('page.dataUrl is invalid');
  });

  // 11. Programmatic API with Buffer input
  await runAsyncTest('Programmatic API converts Buffer input with text layer', async () => {
    const buffer = fs.readFileSync(samplePdfPath);
    const result = await convertPdfToHtml(buffer, {
      title: 'Buffer Test',
      withBg: false
    });

    if (result.pagesProcessed !== 1) throw new Error(`Expected 1 page, got ${result.pagesProcessed}`);
    if (!result.html.includes('Buffer Test')) throw new Error('Title missing from generated document');
    if (!result.html.includes('pdf-text-layer')) throw new Error('Text layer missing from generated document');
  });

  console.log('\n\x1b[32m✔ All tests completed successfully! Outputs preserved in test/results/cli-test/\x1b[0m\n');
} finally {
  // Retain output results on disk per user request
}
