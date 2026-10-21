/**
 * @file src/utils/html-template.js
 * @description Generates self-contained standalone HTML documents for paper-drift outputs.
 * Provides CSS reset, seamless page flow, high-DPI background positioning, and selectable text layer styles.
 * Part of paper-drift - https://github.com/Sooriya04/Paper-Drift
 */

/**
 * Wraps page markup blocks into a complete, standalone HTML document.
 * @param {Object} params
 * @param {string} params.title - Document title (usually the PDF file name).
 * @param {string[]} params.pagesHtml - Array of HTML page strings.
 * @param {Object} [params.options] - Rendering options.
 * @returns {string} Fully standalone HTML string.
 */
export function buildHtmlDocument({ title, pagesHtml, options = {} }) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="generator" content="paper-drift">
  <title>${escapeHtml(title)}</title>
  <style>
    /* CSS Reset & Canvas Defaults */
    *, *::before, *::after {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }
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
    .pdf-text-layer p,
    .pdf-text-layer span {
      position: absolute;
      white-space: pre;
      line-height: 1;
      transform-origin: left top;
    }
    /* When visual background is enabled, text layer is transparent for 1:1 selection */
    .with-bg .pdf-text-layer {
      color: transparent;
    }
    .with-bg .pdf-text-layer ::selection {
      background: rgba(59, 130, 246, 0.35);
      color: transparent;
    }
    /* Print optimizations */
    @media print {
      body {
        background-color: #ffffff;
      }
      .pdf-container {
        padding: 0;
        gap: 0;
      }
      .pdf-page {
        box-shadow: none;
        page-break-after: always;
      }
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

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
