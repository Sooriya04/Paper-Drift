/**
 * @file src/html/semantic.js
 * @description Direct WebAssembly PDF to Semantic HTML5 converter (Pure Web DOM).
 * Reconstructs clean, accessible, responsive HTML5 structures:
 * <h1>-<h6>, <p>, <table>, <figure>, <div class="math-display"> with CSS styling and zero background image bloat.
 * Part of paper-drift - https://github.com/Sooriya04/Paper-Drift
 */

/**
 * Escapes characters for safe HTML attribute and text rendering.
 * @param {string} str
 * @returns {string}
 */
export function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Formats inline Markdown styling (bold, italic, code, math) into HTML.
 * @param {string} text
 * @returns {string}
 */
export function formatInlineElements(text) {
  if (!text) return '';

  let html = escapeHtml(text);

  // 1. Inline math: $...$ -> <span class="math-inline">$...$</span>
  html = html.replace(/\$([^\$\n]+)\$/g, '<span class="math-inline">$$$1$$</span>');

  // 2. Inline code: `...` -> <code>...</code>
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');

  // 3. Bold: **...** -> <strong>...</strong>
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');

  // 4. Italic: *...* -> <em>...</em> (when not part of bold)
  html = html.replace(/(^|[^\*])\*([^*]+)\*([^\*]|$)/g, '$1<em>$2</em>$3');

  return html;
}

/**
 * Converts a GFM Markdown pipe table string into a semantic HTML <table> element.
 * @param {string} tableMd
 * @returns {string}
 */
export function markdownTableToHtml(tableMd) {
  const lines = tableMd.trim().split('\n').filter(l => l.trim().startsWith('|'));
  if (lines.length < 2) return '';

  const parseRow = (line) => {
    return line
      .split('|')
      .slice(1, -1)
      .map(c => c.trim());
  };

  const headerCells = parseRow(lines[0]);
  const dataLines = lines.slice(2); // skip separator line (| :--- | :--- |)

  let html = '<div class="table-container">\n  <table class="pdf-table">\n';
  html += '    <thead>\n      <tr>\n';
  for (const cell of headerCells) {
    html += `        <th>${formatInlineElements(cell)}</th>\n`;
  }
  html += '      </tr>\n    </thead>\n';

  if (dataLines.length > 0) {
    html += '    <tbody>\n';
    for (const rowLine of dataLines) {
      const cells = parseRow(rowLine);
      html += '      <tr>\n';
      for (const cell of cells) {
        html += `        <td>${formatInlineElements(cell)}</td>\n`;
      }
      html += '      </tr>\n';
    }
    html += '    </tbody>\n';
  }

  html += '  </table>\n</div>';
  return html;
}

/**
 * Converts a structured page Markdown section into semantic HTML5 markup.
 * @param {string} pageMarkdown
 * @param {number} pageNumber
 * @param {Object} [options={}]
 * @returns {string}
 */
export function pageMarkdownToSemanticHtml(pageMarkdown, pageNumber, options = {}) {
  if (!pageMarkdown || !pageMarkdown.trim()) {
    return `  <article class="pdf-page" id="page-${pageNumber}" data-page="${pageNumber}">\n    <div class="pdf-content"></div>\n  </article>`;
  }

  const sections = pageMarkdown.split(/\n\n+/);
  const htmlBlocks = [];
  let currentList = [];

  const flushList = () => {
    if (currentList.length > 0) {
      htmlBlocks.push(`    <ul class="pdf-list">\n${currentList.map(li => `      <li>${li}</li>`).join('\n')}\n    </ul>`);
      currentList = [];
    }
  };

  for (let i = 0; i < sections.length; i++) {
    const raw = sections[i].trim();
    if (!raw) continue;

    // List item: - item or * item
    if (/^[•–\-*]\s+/.test(raw)) {
      const itemText = formatInlineElements(raw.replace(/^[•–\-*]\s+/, ''));
      currentList.push(itemText);
      continue;
    }
    flushList();

    // 1. Table
    if (raw.startsWith('|') && raw.includes('\n|')) {
      const tableHtml = markdownTableToHtml(raw);
      if (tableHtml) {
        htmlBlocks.push(tableHtml);
        continue;
      }
    }

    // 2. Heading: #, ##, ###
    const hMatch = raw.match(/^(#{1,6})\s+(.*)$/);
    if (hMatch) {
      const level = hMatch[1].length;
      const headingText = formatInlineElements(hMatch[2]);
      htmlBlocks.push(`    <h${level} class="pdf-heading pdf-h${level}">${headingText}</h${level}>`);
      continue;
    }

    // 3. Figure Image: ![Alt](url)
    const imgMatch = raw.match(/^!\[([^\]]*)\]\(([^)]+)\)$/);
    if (imgMatch) {
      const alt = escapeHtml(imgMatch[1]);
      const src = escapeHtml(imgMatch[2]);
      htmlBlocks.push(`    <figure class="pdf-figure">\n      <img src="${src}" alt="${alt}" loading="lazy" class="figure-img" />\n      <figcaption class="figure-caption">${alt}</figcaption>\n    </figure>`);
      continue;
    }

    // 4. Display Math: $$ ... $$
    if (raw.startsWith('$$') && raw.endsWith('$$')) {
      const latex = raw.slice(2, -2).trim();
      htmlBlocks.push(`    <div class="math-display" data-latex="${escapeHtml(latex)}">$$${escapeHtml(latex)}$$</div>`);
      continue;
    }

    // 5. Captions: **Table 1: ...** or **Figure 1: ...**
    if (/^\*\*(Table|TABLE|Figure|Fig\.|FIGURE)\s+([0-9]+|[IVXLCDM]+)[:.]?\s*(.*)\*\*$/i.test(raw)) {
      const inner = raw.slice(2, -2);
      htmlBlocks.push(`    <p class="pdf-caption"><strong>${escapeHtml(inner)}</strong></p>`);
      continue;
    }

    // 6. Regular Paragraph
    const formattedParagraph = formatInlineElements(raw);
    htmlBlocks.push(`    <p class="pdf-paragraph">${formattedParagraph}</p>`);
  }

  flushList();

  return `  <!-- Page ${pageNumber} -->
  <article class="pdf-page" id="page-${pageNumber}" data-page="${pageNumber}">
    <div class="pdf-content pdf-text-layer">
${htmlBlocks.join('\n\n')}
    </div>
  </article>`;
}
