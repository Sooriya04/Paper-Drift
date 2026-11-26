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
import { convertPdfToMarkdown, convertPdfToHtml, parsePdfBundle, chunkPdfForRag } from '../src/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Read package metadata for health checks and version reporting
const packageJson = JSON.parse(
  fs.readFileSync(path.join(__dirname, '../package.json'), 'utf-8')
);

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
    req.on('end', () => {
      const buffer = Buffer.concat(chunks);
      if (buffer.length === 0) {
        return reject(new Error('Empty PDF payload: request body contains 0 bytes.'));
      }
      resolve(buffer);
    });
    req.on('error', reject);
    req.on('close', () => {
      if (!req.readableEnded) {
        reject(new Error('Client aborted request'));
      }
    });
  });
}

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type'
};

const MAX_CONCURRENT_REQUESTS = parseInt(process.env.MAX_CONCURRENT_REQUESTS, 10) || 4;
let activeRequests = 0;

function getActiveRequests() {
  return activeRequests;
}

async function handleApiPost(req, res, handler) {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, CORS_HEADERS);
    return res.end();
  }

  if (req.method !== 'POST') {
    res.writeHead(405, {
      'Content-Type': 'application/json',
      'Allow': 'POST, OPTIONS',
      'Access-Control-Allow-Origin': '*'
    });
    return res.end(JSON.stringify({ success: false, error: 'Method Not Allowed' }));
  }

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
    await handler();
  } catch (err) {
    if (res.writableEnded || res.destroyed) return;
    const msg = err.message || '';
    const msgLower = msg.toLowerCase();
    const isClientError = msgLower.includes('empty pdf') ||
                          msgLower.includes('empty') ||
                          msgLower.includes('failed to open pdf') ||
                          msgLower.includes('cannot recognize') ||
                          msgLower.includes('no objects') ||
                          msgLower.includes('cannot find') ||
                          msgLower.includes('invalid') ||
                          msgLower.includes('corrupt') ||
                          msgLower.includes('no matching pages found') ||
                          msgLower.includes('page range') ||
                          msgLower.includes('aborted') ||
                          err.name === 'ValidationError' ||
                          err.name === 'TypeError';
    const status = msg.includes('Payload too large') ? 413 : (isClientError ? 400 : 500);
    try {
      res.writeHead(status, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      res.end(JSON.stringify({ success: false, error: err.message }));
    } catch {}
  } finally {
    activeRequests--;
  }
}

const server = http.createServer(async (req, res) => {
  const urlObj = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  let reqPath = urlObj.pathname;

  // API Endpoint: Microservice Health & Capacity Check
  if (reqPath === '/api/health') {
    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type'
      });
      return res.end();
    }

    if (req.method === 'GET' || req.method === 'HEAD') {
      const payload = JSON.stringify({
        status: 'ok',
        uptime: Math.round(process.uptime()),
        version: packageJson.version,
        activeRequests: getActiveRequests(),
        maxConcurrent: MAX_CONCURRENT_REQUESTS
      });

      res.writeHead(200, {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'no-cache, no-store, must-revalidate'
      });

      if (req.method === 'HEAD') {
        return res.end();
      }
      return res.end(payload);
    }

    res.writeHead(405, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    return res.end(JSON.stringify({ success: false, error: 'Method Not Allowed' }));
  }

  // API Endpoint: The Unified "All-in-One" Bundle
  if (reqPath === '/api/parse-full') {
    return handleApiPost(req, res, async () => {
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
    });
  }

  // API Endpoint: Native Semantic Chunking for RAG
  if (reqPath === '/api/chunk-rag') {
    return handleApiPost(req, res, async () => {
      let maxChunkChars;
      if (urlObj.searchParams.has('max_chunk_chars') || urlObj.searchParams.has('maxChunkChars')) {
        const raw = urlObj.searchParams.get('max_chunk_chars') || urlObj.searchParams.get('maxChunkChars');
        const parsed = parseInt(raw, 10);
        if (isNaN(parsed) || parsed <= 50) {
          res.writeHead(400, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
          return res.end(JSON.stringify({ success: false, error: `Invalid max_chunk_chars parameter: "${raw}". Must be a number greater than 50.` }));
        }
        maxChunkChars = parsed;
      }

      const buffer = await readRequestBody(req);
      const pageRange = urlObj.searchParams.get('pages') || 'all';

      const chunks = await chunkPdfForRag(buffer, {
        pages: pageRange,
        max_chunk_chars: maxChunkChars
      });

      res.writeHead(200, {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      });
      return res.end(JSON.stringify(chunks));
    });
  }

  // API Endpoint: Direct PDF to Markdown conversion
  if (reqPath === '/api/convert-markdown') {
    return handleApiPost(req, res, async () => {
      const buffer = await readRequestBody(req);
      const pageRange = urlObj.searchParams.get('pages') || 'all';

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
    });
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
  let decodedPath = reqPath;
  try {
    decodedPath = decodeURIComponent(reqPath);
  } catch {
    res.writeHead(400, { 'Content-Type': 'text/plain' });
    return res.end('Bad Request');
  }
  const filePath = path.normalize(path.join(__dirname, decodedPath));

  if (filePath !== __dirname && !filePath.startsWith(__dirname + path.sep)) {
    res.writeHead(403, { 'Content-Type': 'text/plain' });
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
      'Cache-Control': 'public, max-age=3600',
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

const DEFAULT_PORT = parseInt(process.env.PORT, 10) || 7490;
const MAX_PORT_RETRIES = parseInt(process.env.MAX_PORT_RETRIES, 10) || 10;
let basePort = DEFAULT_PORT;
let currentPort = DEFAULT_PORT;

function startServer(p = DEFAULT_PORT, isRetry = false) {
  if (!isRetry) {
    basePort = p;
    currentPort = p;
  }
  return new Promise((resolve) => {
    server.listen(currentPort, () => {
      console.log(`\n======================================================`);
      console.log(`[INFO] paper-drift Server running at:`);
      console.log(`       http://localhost:${currentPort}`);
      console.log(`======================================================\n`);
      resolve(server);
    });
  });
}

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    if (currentPort >= basePort + MAX_PORT_RETRIES) {
      console.error(`[ERROR] Ports ${basePort} to ${currentPort} are all in use (max retries: ${MAX_PORT_RETRIES}). Exiting.`);
      process.exit(1);
    }
    currentPort++;
    startServer(currentPort, true);
  } else {
    console.error('Server error:', err);
  }
});

export { server, startServer, MAX_CONCURRENT_REQUESTS, getActiveRequests, MAX_PORT_RETRIES };

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  startServer(DEFAULT_PORT);
}
