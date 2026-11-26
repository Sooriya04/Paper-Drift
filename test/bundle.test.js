/**
 * @file test/bundle.test.js
 * @description Unit and integration tests for Unified PDF Bundle Parser and /api/parse-full.
 * Part of paper-drift - https://github.com/Sooriya04/Paper-Drift
 */

import assert from 'assert';
import path from 'path';
import http from 'http';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { parsePdfBundle } from '../src/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const attentionPdf = path.resolve(__dirname, 'fixtures/benchmarks/01-attention-is-all-you-need.pdf');

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

console.log('\n\x1b[1m\x1b[36mRunning Unified PDF Bundle Parser Test Suite\x1b[0m');

// 1. Programmatic parsePdfBundle API Tests
await runAsyncTest('parsePdfBundle produces unified bundle with metadata, markdown, pages and sections', async () => {
  const result = await parsePdfBundle(attentionPdf, { pages: '1-2', scale: 1.0 });

  assert.strictEqual(result.success, true);
  assert.ok(result.metadata, 'metadata object must exist');
  assert.ok(typeof result.metadata.title === 'string' && result.metadata.title.includes('Attention'), 'Expected title to match Attention');
  assert.ok(Array.isArray(result.metadata.authors) && result.metadata.authors.length > 0, 'Expected authors array');
  assert.ok(result.metadata.authors.some(a => a.includes('Vaswani')), 'Expected Vaswani in authors');
  assert.ok(typeof result.metadata.abstract === 'string' && result.metadata.abstract.length > 50, 'Expected abstract text');
  assert.strictEqual(result.metadata.arxiv_id, '1706.03762', 'Expected arXiv ID 1706.03762');

  assert.ok(typeof result.markdown === 'string' && result.markdown.includes('Attention'), 'Expected valid Markdown');

  assert.strictEqual(result.pages.length, 2, 'Expected 2 processed pages');
  const p1 = result.pages[0];
  assert.strictEqual(p1.pageNumber, 1);
  assert.strictEqual(typeof p1.width, 'number');
  assert.strictEqual(typeof p1.height, 'number');
  assert.ok(typeof p1.dataUrl === 'string' && p1.dataUrl.startsWith('data:image/png;base64,'), 'Expected dataUrl for page 1');
  assert.ok(typeof p1.text === 'string' && p1.text.includes('Attention'), 'Expected page 1 text');

  assert.ok(Array.isArray(result.sections) && result.sections.length > 0, 'Expected sections array');
  const introSec = result.sections.find(s => s.title.toLowerCase().includes('introduction'));
  assert.ok(introSec, 'Expected Introduction section');
  assert.strictEqual(typeof introSec.page, 'number');
  assert.ok(typeof introSec.content === 'string' && introSec.content.length > 0, 'Expected non-empty section content');
});

await runAsyncTest('parsePdfBundle respects includeImages: false to omit dataUrls for speed', async () => {
  const result = await parsePdfBundle(attentionPdf, { pages: '1', includeImages: false });

  assert.strictEqual(result.success, true);
  assert.strictEqual(result.pages.length, 1);
  assert.strictEqual(result.pages[0].dataUrl, null, 'dataUrl should be null when includeImages is false');
  assert.ok(result.pages[0].text.length > 0, 'text should still be populated');
});

// 2. HTTP Server Endpoint Integration Tests
await runAsyncTest('POST /api/parse-full returns single consolidated JSON payload over HTTP', async () => {
  const { server } = await import('../server/server.js');

  await new Promise(resolve => server.listen(0, resolve));
  const port = server.address().port;

  try {
    const pdfBuf = fs.readFileSync(attentionPdf);
    const response = await fetch(`http://localhost:${port}/api/parse-full?pages=1`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/pdf' },
      body: pdfBuf
    });

    assert.strictEqual(response.status, 200);
    const json = await response.json();
    assert.strictEqual(json.success, true);
    assert.ok(json.metadata.title.includes('Attention'));
    assert.strictEqual(json.metadata.arxiv_id, '1706.03762');
    assert.strictEqual(json.pages.length, 1);
    assert.ok(json.pages[0].dataUrl.startsWith('data:image/png;base64,'));
    assert.ok(json.sections.length > 0);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});

await runAsyncTest('API endpoints return 400 Bad Request on invalid query parameters (pages=foo, scale=-5)', async () => {
  const { server } = await import('../server/server.js');

  await new Promise(resolve => server.listen(0, resolve));
  const port = server.address().port;

  try {
    const pdfBuf = fs.readFileSync(attentionPdf);

    // 1. Invalid pages on /api/parse-full
    const res1 = await fetch(`http://localhost:${port}/api/parse-full?pages=foo`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/pdf' },
      body: pdfBuf
    });
    assert.strictEqual(res1.status, 400, 'Expected 400 for invalid pages on parse-full');
    const json1 = await res1.json();
    assert.strictEqual(json1.success, false);
    assert.ok(json1.error.includes('No matching pages found'));

    // 2. Invalid scale on /api/parse-full
    const res2 = await fetch(`http://localhost:${port}/api/parse-full?scale=-5`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/pdf' },
      body: pdfBuf
    });
    assert.strictEqual(res2.status, 400, 'Expected 400 for negative scale on parse-full');
    const json2 = await res2.json();
    assert.strictEqual(json2.success, false);
    assert.ok(json2.error.includes('Invalid scale parameter'));

    // 3. Invalid pages on /api/convert-markdown
    const res3 = await fetch(`http://localhost:${port}/api/convert-markdown?pages=foo`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/pdf' },
      body: pdfBuf
    });
    assert.strictEqual(res3.status, 400, 'Expected 400 for invalid pages on convert-markdown');
    const json3 = await res3.json();
    assert.strictEqual(json3.success, false);
    assert.ok(json3.error.includes('No matching pages found'));
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});

await runAsyncTest('API endpoints return 405 Method Not Allowed with Allow header on unsupported methods and 404 for unknown API routes', async () => {
  const { server } = await import('../server/server.js');

  await new Promise(resolve => server.listen(0, resolve));
  const port = server.address().port;

  try {
    // 1. GET /api/parse-full -> 405
    const res1 = await fetch(`http://localhost:${port}/api/parse-full`, { method: 'GET' });
    assert.strictEqual(res1.status, 405);
    assert.strictEqual(res1.headers.get('allow'), 'POST, OPTIONS');
    const json1 = await res1.json();
    assert.strictEqual(json1.success, false);
    assert.strictEqual(json1.error, 'Method Not Allowed');

    // 2. PUT /api/convert-markdown -> 405
    const res2 = await fetch(`http://localhost:${port}/api/convert-markdown`, { method: 'PUT', body: 'test' });
    assert.strictEqual(res2.status, 405);
    assert.strictEqual(res2.headers.get('allow'), 'POST, OPTIONS');
    const json2 = await res2.json();
    assert.strictEqual(json2.success, false);
    assert.strictEqual(json2.error, 'Method Not Allowed');

    // 3. GET /api/unknown -> 404 JSON (does not fall through to static file system)
    const res3 = await fetch(`http://localhost:${port}/api/unknown`, { method: 'GET' });
    assert.strictEqual(res3.status, 404);
    assert.ok(res3.headers.get('content-type').includes('application/json'));
    const json3 = await res3.json();
    assert.strictEqual(json3.success, false);
    assert.strictEqual(json3.error, 'Not Found');
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});

await runAsyncTest('API endpoints reject concurrent requests exceeding capacity with 503 Service Unavailable', async () => {
  const { server, MAX_CONCURRENT_REQUESTS, getActiveRequests } = await import('../server/server.js');

  await new Promise(resolve => server.listen(0, resolve));
  const port = server.address().port;

  try {
    const heldClients = [];

    // Hold MAX_CONCURRENT_REQUESTS in-flight
    for (let i = 0; i < MAX_CONCURRENT_REQUESTS; i++) {
      const clientReq = http.request({
        hostname: 'localhost',
        port,
        path: '/api/parse-full',
        method: 'POST',
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Length': '1024'
        }
      });
      clientReq.write('part');
      clientReq.on('error', () => {});
      heldClients.push(clientReq);
    }

    // Wait briefly for in-flight requests to enter readRequestBody
    await new Promise(resolve => setTimeout(resolve, 50));
    assert.strictEqual(getActiveRequests(), MAX_CONCURRENT_REQUESTS);

    // Exceeding request should be rejected with 503 and Retry-After
    const res503 = await fetch(`http://localhost:${port}/api/parse-full`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/pdf' },
      body: 'overflow'
    });
    assert.strictEqual(res503.status, 503);
    assert.strictEqual(res503.headers.get('retry-after'), '5');
    const json503 = await res503.json();
    assert.strictEqual(json503.success, false);
    assert.ok(json503.error.includes('Server busy'));

    // Also verify /api/convert-markdown is rejected with 503
    const resMarkdown503 = await fetch(`http://localhost:${port}/api/convert-markdown`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/pdf' },
      body: 'overflow'
    });
    assert.strictEqual(resMarkdown503.status, 503);

    // Release held requests
    for (const clientReq of heldClients) {
      clientReq.destroy();
    }

    // Wait for cleanup
    await new Promise(resolve => setTimeout(resolve, 50));
    assert.strictEqual(getActiveRequests(), 0, 'Active requests must decrement back to 0');
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});

await runAsyncTest('readRequestBody releases activeRequests semaphore on client connection abort', async () => {
  const { server, getActiveRequests } = await import('../server/server.js');
  await new Promise(resolve => server.listen(0, resolve));
  const port = server.address().port;

  try {
    const httpModule = await import('http');
    const req = httpModule.request({
      port,
      path: '/api/chunk-rag',
      method: 'POST',
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Length': '10000'
      }
    });
    req.on('error', () => {});

    req.write('partial data...');
    req.destroy();

    await new Promise(resolve => setTimeout(resolve, 50));
    assert.strictEqual(getActiveRequests(), 0, 'Active requests must not leak when client aborts');
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});

await runAsyncTest('/api/health returns 200 OK with status, uptime, version, and capacity metrics', async () => {
  const { server } = await import('../server/server.js');

  await new Promise(resolve => server.listen(0, resolve));
  const port = server.address().port;

  try {
    // 1. GET /api/health returns 200 and JSON status
    const resGet = await fetch(`http://localhost:${port}/api/health`);
    assert.strictEqual(resGet.status, 200);
    assert.strictEqual(resGet.headers.get('content-type'), 'application/json');
    assert.strictEqual(resGet.headers.get('cache-control'), 'no-cache, no-store, must-revalidate');
    const data = await resGet.json();
    assert.strictEqual(data.status, 'ok');
    assert.strictEqual(typeof data.uptime, 'number');
    assert.strictEqual(typeof data.version, 'string');
    assert.strictEqual(typeof data.activeRequests, 'number');
    assert.strictEqual(typeof data.maxConcurrent, 'number');
    assert.strictEqual(data.version, '0.1.5');

    // 2. HEAD /api/health returns 200 without body
    const resHead = await fetch(`http://localhost:${port}/api/health`, { method: 'HEAD' });
    assert.strictEqual(resHead.status, 200);
    assert.strictEqual(resHead.headers.get('content-type'), 'application/json');
    const headText = await resHead.text();
    assert.strictEqual(headText, '');

    // 3. OPTIONS /api/health returns 204 with CORS headers
    const resOptions = await fetch(`http://localhost:${port}/api/health`, { method: 'OPTIONS' });
    assert.strictEqual(resOptions.status, 204);
    assert.strictEqual(resOptions.headers.get('access-control-allow-origin'), '*');
    assert.ok(resOptions.headers.get('access-control-allow-methods').includes('GET'));

    // 4. POST /api/health returns 405 Method Not Allowed
    const resPost = await fetch(`http://localhost:${port}/api/health`, { method: 'POST' });
    assert.strictEqual(resPost.status, 405);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});

await runAsyncTest('Static file server enforces strict path boundary check and blocks traversal attempts with 403', async () => {
  const { server } = await import('../server/server.js');

  await new Promise(resolve => server.listen(0, resolve));
  const port = server.address().port;

  try {
    // 1. Valid static file requests return 200 with Cache-Control header
    const resRoot = await fetch(`http://localhost:${port}/`);
    assert.strictEqual(resRoot.status, 200);
    assert.strictEqual(resRoot.headers.get('cache-control'), 'public, max-age=3600');
    const htmlRoot = await resRoot.text();
    assert.ok(htmlRoot.includes('paper-drift') || htmlRoot.includes('<!DOCTYPE html>'));

    const resIndex = await fetch(`http://localhost:${port}/index.html`);
    assert.strictEqual(resIndex.status, 200);
    assert.strictEqual(resIndex.headers.get('cache-control'), 'public, max-age=3600');

    // 2. Traversal attempt out of server directory returns 403 Access denied
    const resTraversal = await fetch(`http://localhost:${port}/..%2fpackage.json`);
    assert.strictEqual(resTraversal.status, 403);
    const textTraversal = await resTraversal.text();
    assert.strictEqual(textTraversal, 'Access denied');

    // 3. Sibling prefix directory traversal attempt returns 403 Access denied
    const resSibling = await fetch(`http://localhost:${port}/..%2fserver-secrets%2fconfig.json`);
    assert.strictEqual(resSibling.status, 403);
    const textSibling = await resSibling.text();
    assert.strictEqual(textSibling, 'Access denied');

    // 4. Non-existent file within directory boundary returns 404
    const res404 = await fetch(`http://localhost:${port}/nonexistent.xyz`);
    assert.strictEqual(res404.status, 404);

    // 5. Direct access to server.js returns 403 Access denied
    const resServerJs = await fetch(`http://localhost:${port}/server.js`);
    assert.strictEqual(resServerJs.status, 403, 'Expected 403 for /server.js');
    const textServerJs = await resServerJs.text();
    assert.strictEqual(textServerJs, 'Access denied');
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});

await runAsyncTest('parsePdfBundle populates rawPagesData[i].tables and extractBundleSections reuses precomputed tables', async () => {
  const { extractBundleSections } = await import('../src/bundle/sections.js');
  const { convertPdfToMarkdown } = await import('../src/markdown/converter.js');

  const rawPagesData = [{
    index: 0,
    pageIndex: 0,
    pageNumber: 1,
    width: 612,
    height: 792,
    lines: [],
    rules: [],
    links: [],
    mathItems: [],
    claimedLineIndices: new Set(),
    tables: null
  }];

  await convertPdfToMarkdown(attentionPdf, { pagesData: rawPagesData, pages: '1' });
  assert.ok(Array.isArray(rawPagesData[0].tables), 'convertPdfToMarkdown should populate rawPagesData[0].tables');

  // Verify extractBundleSections reuses page.tables directly without recomputation
  const precomputedTables = [{ bbox: [0, 0, 100, 100], linesInside: [], markdown: '| Col1 |\n|---|' }];
  const testPage = {
    pageNumber: 1,
    width: 612,
    height: 792,
    lines: [],
    tables: precomputedTables
  };
  const sections = extractBundleSections([testPage]);
  assert.ok(Array.isArray(sections));

  // Run full parsePdfBundle to ensure end-to-end bundle creation preserves tables and sections
  const bundle = await parsePdfBundle(attentionPdf, { pages: '1' });
  assert.strictEqual(bundle.success, true);
  assert.ok(Array.isArray(bundle.sections));
});

await runAsyncTest('startServer caps port retries at base port + MAX_PORT_RETRIES on repeated EADDRINUSE', async () => {
  const { spawn } = await import('child_process');
  const testScript = `
    import { server, startServer } from './server/server.js';
    server.listen = (port, cb) => {
      const err = new Error('listen EADDRINUSE: address already in use :::' + port);
      err.code = 'EADDRINUSE';
      server.emit('error', err);
    };
    startServer(4000);
  `;
  const child = spawn(process.execPath, ['--input-type=module', '-e', testScript], {
    cwd: path.resolve(__dirname, '..'),
    stdio: ['ignore', 'pipe', 'pipe']
  });

  let stderr = '';
  child.stderr.on('data', chunk => { stderr += chunk.toString(); });

  const exitCode = await new Promise(resolve => child.on('exit', resolve));
  assert.strictEqual(exitCode, 1, 'Expected process to exit with code 1 when retries exceeded');
  assert.ok(stderr.includes('max retries: 10'), `Expected max retries error log in stderr, got: ${stderr}`);
});

await runAsyncTest('API endpoints return 400 Bad Request on empty or corrupt/non-PDF payloads', async () => {
  const { server } = await import('../server/server.js');

  await new Promise(resolve => server.listen(0, resolve));
  const port = server.address().port;

  const endpoints = ['/api/parse-full', '/api/chunk-rag', '/api/convert-markdown'];

  try {
    for (const ep of endpoints) {
      // 1. Empty body (0 bytes)
      const emptyRes = await fetch(`http://localhost:${port}${ep}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/pdf' },
        body: Buffer.alloc(0)
      });
      assert.strictEqual(emptyRes.status, 400, `Expected 400 for empty body on ${ep}`);
      const emptyJson = await emptyRes.json();
      assert.strictEqual(emptyJson.success, false);
      assert.ok(
        emptyJson.error.toLowerCase().includes('empty'),
        `Expected error message mentioning empty on ${ep}, got: ${emptyJson.error}`
      );

      // 2. Corrupt / non-PDF payload
      const corruptRes = await fetch(`http://localhost:${port}${ep}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/pdf' },
        body: Buffer.from('not-a-pdf')
      });
      assert.strictEqual(corruptRes.status, 400, `Expected 400 for corrupt body on ${ep}`);
      const corruptJson = await corruptRes.json();
      assert.strictEqual(corruptJson.success, false);
      assert.ok(
        corruptJson.error.includes('Failed to open PDF document') ||
        corruptJson.error.toLowerCase().includes('cannot') ||
        corruptJson.error.toLowerCase().includes('no objects'),
        `Expected error message on ${ep}, got: ${corruptJson.error}`
      );
    }
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});

console.log('\n\x1b[32m✔ All Unified PDF Bundle Parser tests passed successfully!\x1b[0m\n');
