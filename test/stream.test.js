/**
 * @file test/stream.test.js
 * @description Automated test suite for streamPdfPages async generator.
 * Validates sequential memory-efficient page streaming, lazy getters, range filtering, and early termination.
 * Part of paper-drift - https://github.com/Sooriya04/Paper-Drift
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import mupdf from 'mupdf';
import { streamPdfPages, convertPdfToImages, renderRegion, DisplayListCache } from '../src/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const samplePdfPath = path.resolve(__dirname, 'fixtures/sample.pdf');

function createMultiPagePdf(pageCount) {
  const doc = new mupdf.PDFDocument();
  for (let i = 0; i < pageCount; i++) {
    const stream = `0.5 0.5 0.5 rg 50 50 512 692 re f 0 0 0 rg 72 700 200 40 re f`;
    const pageObj = doc.addPage([0, 0, 612, 792], 0, null, stream);
    doc.insertPage(-1, pageObj);
  }
  const buf = doc.saveToBuffer();
  return Buffer.from(buf.asUint8Array());
}

async function runAsyncTest(name, fn) {
  try {
    await fn();
    console.log(`  \x1b[32m✔\x1b[0m ${name}`);
  } catch (err) {
    console.error(`  \x1b[31m✖\x1b[0m ${name}`);
    console.error(`    ${err.stack || err.message}`);
    process.exit(1);
  }
}

console.log('\n\x1b[1m\x1b[36mRunning Stream Generator Test Suite\x1b[0m');

// 1. Basic streaming of single-page PDF
await runAsyncTest('streamPdfPages yields single page with valid PNG buffer and metadata', async () => {
  let count = 0;
  for await (const page of streamPdfPages(samplePdfPath, { scale: 1.5 })) {
    count++;
    if (page.pageNumber !== 1) throw new Error(`Expected pageNumber 1, got ${page.pageNumber}`);
    if (page.pageIndex !== 0) throw new Error(`Expected pageIndex 0, got ${page.pageIndex}`);
    if (page.totalPages !== 1) throw new Error(`Expected totalPages 1, got ${page.totalPages}`);
    if (page.totalMatchingPages !== 1) throw new Error(`Expected totalMatchingPages 1, got ${page.totalMatchingPages}`);
    if (!Buffer.isBuffer(page.buffer)) throw new Error('page.buffer is not a Buffer');
    if (page.buffer.length < 1000) throw new Error('page.buffer is too small');
    if (page.width <= 0 || page.height <= 0) throw new Error('Invalid dimensions');
  }
  if (count !== 1) throw new Error(`Expected 1 page yielded, got ${count}`);
});

// 2. Lazy getter verification for base64 & dataUrl
await runAsyncTest('lazy getters for base64 and dataUrl evaluate accurately on-demand', async () => {
  for await (const page of streamPdfPages(samplePdfPath, { scale: 1.0 })) {
    // Access base64
    const b64 = page.base64;
    if (typeof b64 !== 'string' || b64.length < 500) {
      throw new Error('base64 getter did not produce expected string');
    }
    // Verify memoized identity
    if (page.base64 !== b64) {
      throw new Error('base64 getter should cache value on subsequent calls');
    }

    // Access dataUrl
    const url = page.dataUrl;
    if (!url.startsWith('data:image/png;base64,' + b64.slice(0, 20))) {
      throw new Error('dataUrl does not contain base64 content');
    }
    if (page.dataUrl !== url) {
      throw new Error('dataUrl getter should cache value on subsequent calls');
    }
  }
});

// 3. extractText: false option
await runAsyncTest('streamPdfPages respects extractText: false option for speed', async () => {
  for await (const page of streamPdfPages(samplePdfPath, { extractText: false })) {
    if (page.text !== '') {
      throw new Error(`Expected empty text when extractText: false, got "${page.text}"`);
    }
  }
});

// 4. Multi-page document streaming with range filtering
await runAsyncTest('streamPdfPages correctly iterates subset of pages from multi-page document', async () => {
  const multiPdfBuffer = createMultiPagePdf(10);
  const progressReports = [];
  const pagesReceived = [];

  for await (const page of streamPdfPages(multiPdfBuffer, {
    pages: '2-4',
    scale: 1.0,
    onProgress: (p) => progressReports.push(p)
  })) {
    pagesReceived.push(page.pageNumber);
  }

  if (JSON.stringify(pagesReceived) !== JSON.stringify([2, 3, 4])) {
    throw new Error(`Expected pages [2, 3, 4], got: ${JSON.stringify(pagesReceived)}`);
  }
  if (progressReports.length !== 3) {
    throw new Error(`Expected 3 progress events, got ${progressReports.length}`);
  }
});

// 5. Early generator exit / cancellation without memory leak
await runAsyncTest('generator can be aborted early via break without error', async () => {
  const multiPdfBuffer = createMultiPagePdf(10);
  let seen = 0;
  for await (const page of streamPdfPages(multiPdfBuffer)) {
    seen++;
    if (seen === 2) break; // Break early
  }
  if (seen !== 2) {
    throw new Error(`Expected exactly 2 iterations before break, got ${seen}`);
  }
});

// 6. Consumer-controlled backpressure with bounded prefetch
await runAsyncTest('streamPdfPages supports bounded prefetch lookahead', async () => {
  const multiPdfBuffer = createMultiPagePdf(5);
  const pagesSeen = [];
  for await (const page of streamPdfPages(multiPdfBuffer, { prefetch: 1 })) {
    pagesSeen.push(page.pageNumber);
    // simulate slow consumer processing
    await new Promise(r => setTimeout(r, 5));
  }
  if (pagesSeen.length !== 5 || pagesSeen[4] !== 5) {
    throw new Error(`Expected 5 sequential pages, got: ${pagesSeen.join(',')}`);
  }
});

// 7. Output format selection (raw Pixmap vs raw Buffer vs PNG)
await runAsyncTest('streamPdfPages supports raw Buffer and Pixmap formats without PNG overhead', async () => {
  // Test raw format
  for await (const page of streamPdfPages(samplePdfPath, { format: 'raw', scale: 1.0 })) {
    if (!Buffer.isBuffer(page.raw) || !Buffer.isBuffer(page.buffer)) {
      throw new Error('Expected raw Buffer output');
    }
    const expectedBytes = page.width * page.height * 3;
    if (page.raw.length !== expectedBytes) {
      throw new Error(`Raw buffer size mismatch: got ${page.raw.length}, expected ${expectedBytes}`);
    }
    // Verify raw buffer is a detached Node.js Buffer copy, not sharing freed WASM heap
    if (page.raw.buffer === mupdf.HEAPU8?.buffer) {
      throw new Error('Raw buffer must be an independent copy, not directly pointing to WASM heap memory');
    }
  }

  // Test pixmap format
  for await (const page of streamPdfPages(samplePdfPath, { format: 'pixmap', scale: 1.0 })) {
    if (!page.pixmap || typeof page.pixmap.destroy !== 'function') {
      throw new Error('Expected MuPDF Pixmap instance');
    }
    if (page.pixmap.getWidth() !== page.width) {
      throw new Error('Pixmap dimension mismatch');
    }
    page.pixmap.destroy(); // Explicit consumer release
  }
});

// 8. Region-based sub-rect rendering
await runAsyncTest('renderRegion accurately renders sub-rectangles with crisp bounds', async () => {
  const doc = mupdf.Document.openDocument(fs.readFileSync(samplePdfPath), 'application/pdf');
  try {
    const page = doc.loadPage(0);
    try {
      const region = renderRegion(page, [50, 50, 200, 200], { scale: 2.0 });
      if (!Buffer.isBuffer(region.buffer)) {
        throw new Error('Region buffer is not a Buffer');
      }
      if (region.width !== 300 || region.height !== 300) {
        throw new Error(`Expected 300x300 region, got ${region.width}x${region.height}`);
      }
      if (typeof region.base64 !== 'string' || !region.dataUrl.startsWith('data:image/png;base64,')) {
        throw new Error('Region base64/dataUrl lazy evaluation failed');
      }

      // Raw format region test
      const rawRegion = renderRegion(page, [50, 50, 200, 200], { scale: 2.0, format: 'raw' });
      if (rawRegion.raw.length !== 300 * 300 * 3) {
        throw new Error('Raw region byte length mismatch');
      }
    } finally {
      page.destroy();
    }
  } finally {
    doc.destroy();
  }
});

// 9. DisplayListCache eviction and memory release
await runAsyncTest('DisplayListCache caches, evicts oldest entry, and clears all WASM allocations', async () => {
  const multiPdfBuffer = createMultiPagePdf(5);
  const doc = mupdf.Document.openDocument(multiPdfBuffer, 'application/pdf');
  try {
    const cache = new DisplayListCache(2);
    const p0 = cache.get(doc, 0);
    const p1 = cache.get(doc, 1);
    if (cache.cache.size !== 2) throw new Error('Expected cache size 2');

    // Access p0 to make p1 oldest
    cache.get(doc, 0);
    // Add p2 -> evicts p1
    const p2 = cache.get(doc, 2);
    if (cache.cache.size !== 2 || cache.cache.has(1)) {
      throw new Error('p1 should have been evicted');
    }

    cache.clear();
    if (cache.cache.size !== 0) throw new Error('Expected empty cache after clear');
  } finally {
    doc.destroy();
  }
});

console.log('\n\x1b[32m✔ All stream generator tests passed successfully!\x1b[0m\n');
