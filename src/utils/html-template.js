/**
 * @file src/utils/html-template.js
 * @description Generates self-contained standalone HTML documents for paper-drift outputs.
 * Provides clean semantic HTML5 layout, responsive typography, styled tables, KaTeX math support, and print styling.
 * Part of paper-drift - https://github.com/Sooriya04/Paper-Drift
 */

/**
 * Escapes HTML characters.
 * @param {string} str
 * @returns {string}
 */
export function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Wraps page markup blocks into a complete, standalone HTML document.
 * @param {Object} params
 * @param {string} params.title - Document title (usually the PDF file name).
 * @param {string[]} params.pagesHtml - Array of HTML page strings.
 * @param {Object} [params.options] - Rendering options.
 * @returns {string} Fully standalone HTML string.
 */
export function buildHtmlDocument({ title, pagesHtml, options = {} }) {
  const isReplica = Boolean(options.replica || options.viewer);

  if (isReplica) {
    return buildReplicaDocument({ title, pagesHtml, options });
  }

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="generator" content="paper-drift">
  <title>${escapeHtml(title)}</title>
  <!-- KaTeX for crisp client-side LaTeX formula rendering -->
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.8/dist/katex.min.css">
  <script defer src="https://cdn.jsdelivr.net/npm/katex@0.16.8/dist/katex.min.js"></script>
  <script defer src="https://cdn.jsdelivr.net/npm/katex@0.16.8/dist/contrib/auto-render.min.js" onload="renderMathInElement(document.body, {delimiters:[{left:'$$',right:'$$',display:true},{left:'$',right:'$',display:false}],throwOnError:false});"></script>
  <style>
    *, *::before, *::after {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }
    html, body {
      background-color: #f8fafc;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      color: #1e293b;
      line-height: 1.7;
      -webkit-font-smoothing: antialiased;
    }
    .pdf-container {
      max-width: 880px;
      margin: 0 auto;
      padding: 40px 20px;
    }
    .pdf-page {
      background: #ffffff;
      border-radius: 10px;
      padding: 48px;
      margin-bottom: 32px;
      box-shadow: 0 1px 4px 0 rgba(0, 0, 0, 0.07), 0 2px 8px -2px rgba(0, 0, 0, 0.05);
      position: relative;
    }
    .pdf-heading {
      color: #0f172a;
      font-weight: 700;
      line-height: 1.3;
      margin: 28px 0 12px 0;
    }
    .pdf-h1 { font-size: 2rem; border-bottom: 1px solid #e2e8f0; padding-bottom: 10px; }
    .pdf-h2 { font-size: 1.5rem; border-bottom: 1px solid #f1f5f9; padding-bottom: 6px; }
    .pdf-h3 { font-size: 1.25rem; }
    .pdf-paragraph {
      margin: 14px 0;
      color: #334155;
      font-size: 1rem;
    }
    .pdf-list {
      margin: 12px 0 16px 24px;
      color: #334155;
    }
    .pdf-list li {
      margin-bottom: 6px;
    }
    .table-container {
      width: 100%;
      overflow-x: auto;
      margin: 28px 0;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      background: #ffffff;
      box-shadow: 0 1px 3px 0 rgba(0, 0, 0, 0.05);
    }
    .table-caption {
      padding: 12px 16px;
      background: #f8fafc;
      border-bottom: 1px solid #e2e8f0;
      font-weight: 600;
      color: #334155;
      font-size: 0.9rem;
      line-height: 1.5;
    }
    .pdf-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 0.88rem;
      line-height: 1.5;
      font-variant-numeric: tabular-nums;
    }
    .pdf-table th {
      background: #f8fafc;
      font-weight: 600;
      color: #0f172a;
      text-align: left;
      padding: 10px 14px;
      border-bottom: 2px solid #cbd5e1;
      white-space: nowrap;
    }
    .pdf-table td {
      padding: 8px 14px;
      border-bottom: 1px solid #f1f5f9;
      color: #334155;
    }
    .pdf-table tbody tr:last-child td {
      border-bottom: none;
    }
    .pdf-table tbody tr:nth-child(even) {
      background-color: #fafbfd;
    }
    .pdf-table tbody tr:hover {
      background-color: #f1f5f9;
    }
    .pdf-table .cell-right { text-align: right; }
    .pdf-table .cell-center { text-align: center; }
    .pdf-caption {
      font-weight: 600;
      color: #475569;
      font-size: 0.925rem;
      margin: 18px 0 8px 0;
      line-height: 1.5;
    }
    .pdf-figure {
      margin: 28px auto;
      text-align: center;
      max-width: 100%;
    }
    .figure-img {
      max-width: min(100%, 650px);
      max-height: 440px;
      width: auto;
      height: auto;
      object-fit: contain;
      display: block;
      margin: 0 auto;
      border-radius: 8px;
      background: #ffffff;
      padding: 6px;
      box-shadow: 0 2px 10px rgba(0, 0, 0, 0.12);
    }
    .figure-caption {
      font-size: 0.875rem;
      color: #64748b;
      margin-top: 10px;
      font-style: italic;
    }
    .math-display {
      padding: 14px 18px;
      background: #f8fafc;
      border-radius: 6px;
      overflow-x: auto;
      font-family: "KaTeX_Main", "Times New Roman", serif;
      margin: 16px 0;
      border-left: 3px solid #3b82f6;
    }
    code {
      background: #f1f5f9;
      padding: 2px 6px;
      border-radius: 4px;
      font-size: 0.875em;
      font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    }
    @media print {
      body { background-color: #ffffff; }
      .pdf-container { padding: 0; max-width: 100%; }
      .pdf-page { box-shadow: none; padding: 24px 0; page-break-after: always; }
    }
  </style>
</head>
<body>
  <main class="pdf-container">
${pagesHtml.join('\n')}
  </main>
</body>
</html>`;
}

function buildReplicaDocument({ title, pagesHtml, options = {} }) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="generator" content="paper-drift">
  <title>${escapeHtml(title)}</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    html, body {
      background-color: #525659;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      color: #111827;
      min-height: 100vh;
      -webkit-font-smoothing: antialiased;
    }
    .pdf-container {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 16px;
      padding: 24px 12px;
      width: 100%;
    }
    .pdf-page {
      position: relative;
      background-color: #ffffff;
      box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
      overflow: hidden;
      margin: 0 auto;
    }
    .pdf-bg-layer {
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      z-index: 1;
      pointer-events: none;
      display: block;
    }
    .pdf-text-layer {
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      z-index: 2;
      pointer-events: auto;
    }
    .pdf-text-layer p {
      position: absolute;
      white-space: pre;
      line-height: 1;
      transform-origin: left top;
    }
    .with-bg .pdf-text-layer { color: transparent; }
    .with-bg .pdf-text-layer ::selection {
      background: rgba(59, 130, 246, 0.35);
      color: transparent;
    }
    @media print {
      body { background-color: #ffffff; }
      .pdf-container { padding: 0; gap: 0; }
      .pdf-page { box-shadow: none; page-break-after: always; }
    }
  </style>
</head>
<body class="${options.withBg !== false ? 'with-bg' : 'text-only'}">
  <main class="pdf-container">
${pagesHtml.join('\n')}
  </main>
</body>
</html>`;
}
