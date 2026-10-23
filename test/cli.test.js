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
import { convertPdfToHtml, parsePageRange } from '../src/index.js';

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

  // 4. CLI agent skill installer test
  runTest('CLI installs agent skill via skill subcommand', () => {
    const customSkillPath = path.join(resultsOutputDir, 'test-skill.md');
    execSync(`node bin/cli.js skill --dest "${customSkillPath}"`, { stdio: 'pipe' });
    if (!fs.existsSync(customSkillPath)) throw new Error('Skill file was not written to target');
    const skillContent = fs.readFileSync(customSkillPath, 'utf-8');
    if (!skillContent.includes('name: paper-drift')) throw new Error('Invalid skill header in generated file');
  });

  // 5. CLI agent skill cat test
  runTest('CLI outputs raw skill via skill cat', () => {
    const catOutput = execSync('node bin/cli.js skill cat', { encoding: 'utf-8' });
    if (!catOutput.startsWith('---') || !catOutput.includes('Agent Skill')) {
      throw new Error('skill cat did not output expected markdown frontmatter');
    }
  });

  // 6. CLI file conversion test
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

  // 5. Programmatic API with Buffer input
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
