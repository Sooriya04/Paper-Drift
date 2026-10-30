/**
 * @file test/images.test.js
 * @description Unit and integration test suite for Image & Vector Figure Extraction Engine.
 * Tests raster extraction, alpha mask compositing, vector figure detection,
 * spatial markdown embedding, and CLI image extraction.
 * Part of paper-drift - https://github.com/Sooriya04/Paper-Drift
 */

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import assert from 'assert';
import mupdf from 'mupdf';

import {
  toRgbPixmap,
  isUniform,
  hashPixmap,
  compositeWithMask,
  encodePixmap,
  encodeImage,
  readPageRasterImages
} from '../src/images/raster.js';

import {
  detectPageFigures,
  findFigureTitleOrCaption,
  renderFigureRegion
} from '../src/images/figures.js';

import { extractPdfImages } from '../src/images/extractor.js';
import { convertPdfToMarkdown } from '../src/markdown/converter.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const attentionPdf = path.resolve(__dirname, 'fixtures/benchmarks/01-attention-is-all-you-need.pdf');
const resnetPdf = path.resolve(__dirname, 'fixtures/benchmarks/02-resnet-deep-residual-learning.pdf');
const testOutDir = path.resolve(__dirname, 'results/images-test');

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

// Ensure clean test directory
if (fs.existsSync(testOutDir)) {
  fs.rmSync(testOutDir, { recursive: true, force: true });
}
fs.mkdirSync(testOutDir, { recursive: true });

console.log('\n\x1b[1m\x1b[36m=== Testing Image & Figure Extraction Engine ===\x1b[0m\n');

// -------------------------------------------------------------
// 1. Low-level raster utilities
// -------------------------------------------------------------
console.log('\x1b[1m1. Raster Image Utilities\x1b[0m');

runTest('isUniform detects flat single-color pixmaps', () => {
  // Create a 10x10 RGB pixmap with all white pixels
  const whitePix = new mupdf.Pixmap(mupdf.ColorSpace.DeviceRGB, [0, 0, 10, 10], false);
  whitePix.clear(255);
  assert.strictEqual(isUniform(whitePix), true);

  // Alter one pixel to black
  const samples = whitePix.getPixels();
  samples[0] = 0;
  samples[1] = 0;
  samples[2] = 0;
  assert.strictEqual(isUniform(whitePix), false);
});

runTest('hashPixmap produces deterministic SHA-256 for pixmaps', () => {
  const pix1 = new mupdf.Pixmap(mupdf.ColorSpace.DeviceRGB, [0, 0, 8, 8], false);
  pix1.clear(128);
  const hash1 = hashPixmap(pix1);

  const pix2 = new mupdf.Pixmap(mupdf.ColorSpace.DeviceRGB, [0, 0, 8, 8], false);
  pix2.clear(128);
  const hash2 = hashPixmap(pix2);

  assert.strictEqual(typeof hash1, 'string');
  assert.strictEqual(hash1.length, 40);
  assert.strictEqual(hash1, hash2);

  const pix3 = new mupdf.Pixmap(mupdf.ColorSpace.DeviceRGB, [0, 0, 8, 8], false);
  pix3.clear(200);
  const hash3 = hashPixmap(pix3);
  assert.notStrictEqual(hash1, hash3);
});

runTest('compositeWithMask merges RGB pixmap and soft mask into RGBA', () => {
  const rgbPix = new mupdf.Pixmap(mupdf.ColorSpace.DeviceRGB, [0, 0, 4, 4], false);
  rgbPix.clear(255); // pure white
  const maskPix = new mupdf.Pixmap(mupdf.ColorSpace.DeviceGray, [0, 0, 4, 4], false);
  maskPix.clear(128); // semi-transparent (alpha = 128)

  const rgbaPix = compositeWithMask(rgbPix, maskPix);
  assert.strictEqual(rgbaPix.getNumberOfComponents(), 4);
  assert.strictEqual(rgbaPix.getAlpha(), 1);

  const pixels = rgbaPix.getPixels();
  // Check red, green, blue, alpha
  assert.strictEqual(pixels[0], 255); // R
  assert.strictEqual(pixels[1], 255); // G
  assert.strictEqual(pixels[2], 255); // B
  assert.strictEqual(pixels[3], 128); // A
});

runTest('encodePixmap encodes RGBA pixmap to PNG', () => {
  const rgbPix = new mupdf.Pixmap(mupdf.ColorSpace.DeviceRGB, [0, 0, 16, 16], false);
  rgbPix.clear(200);
  const encoded = encodePixmap(rgbPix);

  assert.strictEqual(encoded.width, 16);
  assert.strictEqual(encoded.height, 16);
  assert.ok(encoded.bytes instanceof Uint8Array || Buffer.isBuffer(encoded.bytes));
  assert.ok(encoded.bytes.length > 0);
  assert.ok(encoded.extension === 'png' || encoded.extension === 'jpg');
});

// -------------------------------------------------------------
// 2. Vector figure caption detection & cropping
// -------------------------------------------------------------
console.log('\n\x1b[1m2. Vector Figure Caption Matching & Rendering\x1b[0m');

runTest('findFigureTitleOrCaption identifies figure captions', () => {
  const lines = [
    { text: 'Prose text before diagram.', bbox: [50, 50, 400, 62], fontSize: 10 },
    { text: 'Figure 1: Overall architecture of the transformer model.', bbox: [50, 410, 450, 424], fontSize: 9 },
    { text: 'The model consists of an encoder and decoder.', bbox: [50, 425, 450, 437], fontSize: 9 }
  ];

  // Figure box between y=100 and y=400
  const figureBox = [50, 100, 450, 400];
  const match = findFigureTitleOrCaption(figureBox, lines);

  assert.ok(match !== null);
  assert.strictEqual(match.caption, 'Figure 1: Overall architecture of the transformer model.');
  assert.strictEqual(match.captionLines.length, 1);
});

await runAsyncTest('renderFigureRegion generates crisp cropped PNG from PDF page', async () => {
  const doc = mupdf.Document.openDocument(fs.readFileSync(resnetPdf), 'application/pdf');
  const page = doc.loadPage(0); // page 1 of ResNet
  const rendered = renderFigureRegion(page, [50, 100, 300, 400], 2.0);

  assert.ok(rendered.width > 0);
  assert.ok(rendered.height > 0);
  assert.ok(rendered.bytes.length > 100);
  assert.strictEqual(rendered.extension, 'png');

  // Verify PNG header bytes: 0x89 0x50 0x4E 0x47
  assert.strictEqual(rendered.bytes[0], 0x89);
  assert.strictEqual(rendered.bytes[1], 0x50);
  assert.strictEqual(rendered.bytes[2], 0x4E);
  assert.strictEqual(rendered.bytes[3], 0x47);
});

// -------------------------------------------------------------
// 3. Document-level extractPdfImages engine
// -------------------------------------------------------------
console.log('\n\x1b[1m3. High-Performance Image Extraction Engine\x1b[0m');

await runAsyncTest('extractPdfImages extracts raster images from Attention paper', async () => {
  const outDir = path.join(testOutDir, 'attention_extracted');
  const result = await extractPdfImages(attentionPdf, {
    pages: '1-4',
    dir: outDir
  });

  assert.ok(result.totalPages >= 4);
  assert.strictEqual(result.pagesProcessed, 4);
  assert.ok(result.assets.length > 0, 'Should extract assets from pages 1-4');

  // Verify files were actually written to disk
  for (const asset of result.assets) {
    assert.ok(asset.filePath, 'Asset has filePath');
    assert.ok(fs.existsSync(asset.filePath), `File exists: ${asset.filePath}`);
    const stat = fs.statSync(asset.filePath);
    assert.ok(stat.size > 0, 'File size > 0');
    assert.strictEqual(stat.size, asset.bytes.length);
  }
});

await runAsyncTest('extractPdfImages extracts vector figures from ResNet paper', async () => {
  const outDir = path.join(testOutDir, 'resnet_extracted');
  const result = await extractPdfImages(resnetPdf, {
    pages: '1-3',
    dir: outDir
  });

  assert.ok(result.totalFigures >= 1, 'Should detect at least 1 vector figure in ResNet pp 1-3');
  assert.ok(result.assets.some(a => a.type === 'figure'), 'At least one asset is of type figure');

  const figureAsset = result.assets.find(a => a.type === 'figure');
  assert.ok(fs.existsSync(figureAsset.filePath));
  assert.ok(figureAsset.filename.endsWith('.png'));
  assert.ok(figureAsset.link);
});

// -------------------------------------------------------------
// 4. Markdown Integration
// -------------------------------------------------------------
console.log('\n\x1b[1m4. Spatial Markdown Integration\x1b[0m');

await runAsyncTest('convertPdfToMarkdown embeds extracted images with markdown syntax', async () => {
  const outDir = path.join(testOutDir, 'md_assets');
  const result = await convertPdfToMarkdown(resnetPdf, {
    pages: '1-2',
    extractImages: {
      dir: outDir,
      linkPrefix: 'assets'
    }
  });

  assert.ok(result.markdown.length > 0);
  assert.ok(result.imagesCount > 0, `Expected images extracted, got ${result.imagesCount}`);
  assert.ok(result.markdown.includes('![') || result.assets.length > 0);

  if (result.imagesCount > 0) {
    // Assert link contains prefix
    assert.ok(result.markdown.includes('assets/'));
  }
});

// -------------------------------------------------------------
// 5. CLI Execution
// -------------------------------------------------------------
console.log('\n\x1b[1m5. CLI Execution with -i and --extract-images\x1b[0m');

runTest('CLI extracts images with -i flag', () => {
  const cliOutDir = path.join(testOutDir, 'cli_extracted');
  const cmd = `node bin/cli.js "${attentionPdf}" --pages 3 -i "${cliOutDir}"`;
  const output = execSync(cmd, { encoding: 'utf-8' });

  assert.ok(output.includes('[OK] Extracted'));
  assert.ok(fs.existsSync(cliOutDir));
  const files = fs.readdirSync(cliOutDir);
  assert.ok(files.length > 0, 'Extracted image files should exist');
});

runTest('CLI converts markdown and extracts images simultaneously', () => {
  const cliMdFile = path.join(testOutDir, 'cli_output.md');
  const cliAssetsDir = path.join(testOutDir, 'cli_md_assets');
  const cmd = `node bin/cli.js "${resnetPdf}" "${cliMdFile}" --pages 1-2 -i "${cliAssetsDir}"`;
  const output = execSync(cmd, { encoding: 'utf-8' });

  assert.ok(output.includes('[OK] Converted'));
  assert.ok(fs.existsSync(cliMdFile));
  const mdContent = fs.readFileSync(cliMdFile, 'utf-8');
  assert.ok(mdContent.length > 100);
});

console.log('\n\x1b[32mAll Image & Figure Extraction tests passed successfully!\x1b[0m\n');
