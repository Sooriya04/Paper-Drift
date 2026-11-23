/**
 * @file server/server.js
 * @description Lightweight local HTTP server and API service for paper-drift.
 * Configures WebAssembly MIME headers and provides API endpoints for direct PDF-to-Markdown and all-in-one bundle conversion.
 * Part of paper-drift - https://github.com/Sooriya04/Paper-Drift
 */

import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { convertPdfToMarkdown, convertPdfToHtml, parsePdfBundle } from '../src/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const MIME_TYPES = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.wasm': 'application/wasm',
  '.pdf': 'application/pdf',
  '.md': 'text/markdown'
};

function readRequestBody(req, maxBytes = 50 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const contentLength = parseInt(req.headers['content-length'], 10);
    if (contentLength > maxBytes) {
      return reject(new Error('Payload too large. Maximum PDF size is 50MB.'));
    }
    const chunks = [];
    let receivedBytes = 0;
    req.on('data', chunk => {
      receivedBytes += chunk.length;
      if (receivedBytes > maxBytes) {
        req.destroy();
        return reject(new Error('Payload too large. Maximum PDF size is 50MB.'));
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type'
};

const MAX_CONCURRENT_REQUESTS = parseInt(process.env.MAX_CONCURRENT_REQUESTS, 10) || 4;
let activeRequests = 0;

function getActiveRequests() {
  return activeRequests;
}

const server = http.createServer(async (req, res) => {
  const urlObj = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  let reqPath = urlObj.pathname;

  // API Endpoint: The Unified "All-in-One" Bundle
  if (reqPath === '/api/parse-full') {
    if (req.method === 'OPTIONS') {
      res.writeHead(204, CORS_HEADERS);
      return res.end();
    }

    if (req.method === 'POST') {
      if (activeRequests >= MAX_CONCURRENT_REQUESTS) {
        res.writeHead(503, {
          'Content-Type': 'application/json',
          'Retry-After': '5',
          'Access-Control-Allow-Origin': '*'
        });
        return res.end(JSON.stringify({
          success: false,
          error: 'Server busy: maximum concurrent parsing capacity reached. Please retry shortly.'
        }));
      }

      activeRequests++;
      try {
        if (urlObj.searchParams.has('scale')) {
          const rawScale = urlObj.searchParams.get('scale');
          const parsedScale = parseFloat(rawScale);
          if (isNaN(parsedScale) || parsedScale <= 0) {
            res.writeHead(400, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
            return res.end(JSON.stringify({ success: false, error: `Invalid scale parameter: "${rawScale}". Scale must be a positive number.` }));
          }
        }

        const buffer = await readRequestBody(req);
        const pageRange = urlObj.searchParams.get('pages') || 'all';
        const scaleParam = parseFloat(urlObj.searchParams.get('scale'));
        const scale = !isNaN(scaleParam) && scaleParam > 0 ? scaleParam : 1.5;
        const includeImages = urlObj.searchParams.get('images') !== 'false';

        // SHORTCUT: MuPDF WebAssembly parsing is executed synchronously on the Node.js main event loop.
        // In local development / playground mode, single-user synchronous execution is optimal to
        // avoid worker thread IPC and serialization overhead. For multi-tenant production traffic,
        // offload parsePdfBundle calls to a Node.js worker_threads pool (e.g. Piscina or a 2-4 worker
        // thread pool) so heavy multi-page PDF parsing does not block event loop I/O or static file serving.
        const result = await parsePdfBundle(buffer, {
          pages: pageRange,
          scale,
          includeImages
        });

        res.writeHead(200, {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        });
        return res.end(JSON.stringify(result));
      } catch (err) {
        const isClientError = err.message.includes('No matching pages found') ||
                              err.message.includes('page range') ||
                              err.message.includes('Invalid') ||
                              err.name === 'ValidationError';
        const status = err.message.includes('Payload too large') ? 413 : (isClientError ? 400 : 500);
        res.writeHead(status, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
        return res.end(JSON.stringify({ success: false, error: err.message }));
      } finally {
        activeRequests--;
      }
    }

    res.writeHead(405, {
      'Content-Type': 'application/json',
      'Allow': 'POST, OPTIONS',
      'Access-Control-Allow-Origin': '*'
    });
    return res.end(JSON.stringify({ success: false, error: 'Method Not Allowed' }));
  }

  // API Endpoint: Direct PDF to Markdown conversion
  if (reqPath === '/api/convert-markdown') {
    if (req.method === 'OPTIONS') {
      res.writeHead(204, CORS_HEADERS);
      return res.end();
    }

    if (req.method === 'POST') {
      if (activeRequests >= MAX_CONCURRENT_REQUESTS) {
        res.writeHead(503, {
          'Content-Type': 'application/json',
          'Retry-After': '5',
          'Access-Control-Allow-Origin': '*'
        });
        return res.end(JSON.stringify({
          success: false,
          error: 'Server busy: maximum concurrent parsing capacity reached. Please retry shortly.'
        }));
      }

      activeRequests++;
      try {
        const buffer = await readRequestBody(req);
        const pageRange = urlObj.searchParams.get('pages') || 'all';

        // SHORTCUT: MuPDF WebAssembly parsing is executed synchronously on the Node.js main event loop.
        // In local development / playground mode, single-user synchronous execution is optimal to
        // avoid worker thread IPC and serialization overhead. For multi-tenant production traffic,
        // offload convertPdfToMarkdown calls to a Node.js worker_threads pool (e.g. Piscina or a 2-4 worker
        // thread pool) so heavy multi-page PDF parsing does not block event loop I/O or static file serving.
        const result = await convertPdfToMarkdown(buffer, { pageRange });
        const visionTokens = result.pagesProcessed * 1600;
        const markdownTokens = Math.max(1, Math.round(result.markdown.length / 4));
        const savingsPercent = Math.max(0, Math.min(99.9, ((visionTokens - markdownTokens) / visionTokens) * 100)).toFixed(1);

        res.writeHead(200, {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        });
        return res.end(JSON.stringify({
          success: true,
          markdown: result.markdown,
          totalPages: result.totalPages,
          pagesProcessed: result.pagesProcessed,
          durationMs: result.durationMs,
          visionTokens,
          markdownTokens,
          savingsPercent
        }));
      } catch (err) {
        const isClientError = err.message.includes('No matching pages found') ||
                              err.message.includes('page range') ||
                              err.message.includes('Invalid') ||
                              err.name === 'ValidationError';
        const status = err.message.includes('Payload too large') ? 413 : (isClientError ? 400 : 500);
        res.writeHead(status, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
        return res.end(JSON.stringify({ success: false, error: err.message }));
      } finally {
        activeRequests--;
      }
    }

    res.writeHead(405, {
      'Content-Type': 'application/json',
      'Allow': 'POST, OPTIONS',
      'Access-Control-Allow-Origin': '*'
    });
    return res.end(JSON.stringify({ success: false, error: 'Method Not Allowed' }));
  }

  // API Route fallthrough prevention
  if (reqPath.startsWith('/api/')) {
    res.writeHead(404, {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*'
    });
    return res.end(JSON.stringify({ success: false, error: 'Not Found' }));
  }

  // Static files
  if (reqPath === '/') reqPath = '/index.html';
  const filePath = path.join(__dirname, reqPath);

  if (!filePath.startsWith(__dirname)) {
    res.writeHead(403);
    return res.end('Access denied');
  }

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      return res.end('404 Not Found');
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    res.writeHead(200, {
      'Content-Type': contentType,
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
      'Access-Control-Allow-Origin': '*'
    });

    fs.createReadStream(filePath)
      .on('error', () => {
        if (!res.headersSent) res.writeHead(404);
        res.end();
      })
      .pipe(res);
  });
});

let port = parseInt(process.env.PORT, 10) || 3000;

function startServer(p) {
  server.listen(p, () => {
    console.log(`\n======================================================`);
    console.log(`[INFO] paper-drift Server running at:`);
    console.log(`       http://localhost:${p}`);
    console.log(`======================================================\n`);
  });
}

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    port++;
    startServer(port);
  } else {
    console.error('Server error:', err);
  }
});

export { server, startServer, MAX_CONCURRENT_REQUESTS, getActiveRequests };

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  startServer(port);
}
