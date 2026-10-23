/**
 * @file playground/server.js
 * @description Lightweight local HTTP development server for the paper-drift web playground.
 * Configures WebAssembly MIME headers and provides API endpoints for direct PDF-to-Markdown and HTML conversion.
 * Part of paper-drift - https://github.com/Sooriya04/Paper-Drift
 */

import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { convertPdfToMarkdown, convertPdfToHtml } from '../src/index.js';

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

const server = http.createServer((req, res) => {
  const urlObj = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  let reqPath = urlObj.pathname;

  // API Endpoint: Direct PDF to Markdown conversion
  if (req.method === 'POST' && reqPath === '/api/convert-markdown') {
    const chunks = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', async () => {
      try {
        const buffer = Buffer.concat(chunks);
        const pageRange = urlObj.searchParams.get('pages') || 'all';

        const result = await convertPdfToMarkdown(buffer, { pageRange });
        const visionTokens = result.pagesProcessed * 1600;
        const markdownTokens = Math.max(1, Math.round(result.markdown.length / 4));
        const savingsPercent = Math.max(0, Math.min(99.9, ((visionTokens - markdownTokens) / visionTokens) * 100)).toFixed(1);

        res.writeHead(200, {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        });
        res.end(JSON.stringify({
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
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });
    return;
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

    fs.createReadStream(filePath).pipe(res);
  });
});

let port = parseInt(process.env.PORT, 10) || 3000;

function startServer(p) {
  server.listen(p, () => {
    console.log(`\n======================================================`);
    console.log(`⚡ paper-drift Playground Server running at:`);
    console.log(`   👉 http://localhost:${p}`);
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

startServer(port);
