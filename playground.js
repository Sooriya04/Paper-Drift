/**
 * @file playground.js
 * @description Client-side controller script for the paper-drift web playground.
 * Manages PDF drag-and-drop, UI settings, client-side WebAssembly execution via PDF.js worker,
 * live visual preview rendering, code inspection, and file downloads.
 * Part of paper-drift - https://github.com/Sooriya04/Paper-Drift
 */

// Configure PDF.js WebAssembly worker
if (window.pdfjsLib) {
  pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
}

// Elements
const dropZone = document.getElementById('dropZone');
const fileInput = document.getElementById('fileInput');
const browseBtn = document.getElementById('browseBtn');
const fileInfo = document.getElementById('fileInfo');
const convertBtn = document.getElementById('convertBtn');
const downloadBtn = document.getElementById('downloadBtn');
const conversionMode = document.getElementById('conversionMode');
const renderScale = document.getElementById('renderScale');
const pageRange = document.getElementById('pageRange');
const progressContainer = document.getElementById('progressContainer');
const progressStatus = document.getElementById('progressStatus');
const progressPercent = document.getElementById('progressPercent');
const progressFill = document.getElementById('progressFill');
const previewSection = document.getElementById('previewSection');
const previewContainer = document.getElementById('previewContainer');
const codeViewer = document.getElementById('codeViewer');
const previewStats = document.getElementById('previewStats');
const tabBtns = document.querySelectorAll('.tab-btn');

let currentFile = null;
let currentPdfData = null;
let generatedHtml = '';

// Drag and drop handlers
dropZone.addEventListener('click', (e) => {
  if (e.target !== browseBtn) fileInput.click();
});
browseBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  fileInput.click();
});

['dragenter', 'dragover'].forEach(eventName => {
  dropZone.addEventListener(eventName, (e) => {
    e.preventDefault();
    e.stopPropagation();
    dropZone.classList.add('dragover');
  });
});

['dragleave', 'drop'].forEach(eventName => {
  dropZone.addEventListener(eventName, (e) => {
    e.preventDefault();
    e.stopPropagation();
    dropZone.classList.remove('dragover');
  });
});

dropZone.addEventListener('drop', (e) => {
  const files = e.dataTransfer.files;
  if (files && files.length > 0 && files[0].type === 'application/pdf') {
    handleFileSelected(files[0]);
  } else {
    alert('Please drop a valid PDF file.');
  }
});

fileInput.addEventListener('change', (e) => {
  if (e.target.files && e.target.files.length > 0) {
    handleFileSelected(e.target.files[0]);
  }
});

function handleFileSelected(file) {
  currentFile = file;
  fileInfo.textContent = `Selected: ${file.name} (${(file.size / 1024 / 1024).toFixed(2)} MB)`;
  convertBtn.disabled = false;
  downloadBtn.disabled = true;
  previewSection.style.display = 'none';

  const reader = new FileReader();
  reader.onload = function(evt) {
    currentPdfData = new Uint8Array(evt.target.result);
  };
  reader.readAsArrayBuffer(file);
}

// Tab switcher
tabBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    tabBtns.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    const tab = btn.dataset.tab;
    document.getElementById('tabRendered').style.display = tab === 'rendered' ? 'block' : 'none';
    document.getElementById('tabCode').style.display = tab === 'code' ? 'block' : 'none';
  });
});

// Update progress
function setProgress(percent, text) {
  progressContainer.style.display = 'flex';
  progressFill.style.width = `${percent}%`;
  progressPercent.textContent = `${Math.round(percent)}%`;
  if (text) progressStatus.textContent = text;
}

function parsePageRange(rangeStr, totalPages) {
  if (!rangeStr || rangeStr.trim().toLowerCase() === 'all') {
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }
  const pages = new Set();
  const parts = rangeStr.split(',');
  for (const part of parts) {
    const trimmed = part.trim();
    if (trimmed.includes('-')) {
      const [start, end] = trimmed.split('-').map(Number);
      if (!isNaN(start) && !isNaN(end)) {
        for (let p = Math.max(1, start); p <= Math.min(totalPages, end); p++) {
          pages.add(p);
        }
      }
    } else {
      const p = parseInt(trimmed, 10);
      if (!isNaN(p) && p >= 1 && p <= totalPages) {
        pages.add(p);
      }
    }
  }
  return Array.from(pages).sort((a, b) => a - b);
}

// Conversion core
convertBtn.addEventListener('click', async () => {
  if (!currentPdfData) return;

  convertBtn.disabled = true;
  downloadBtn.disabled = true;
  previewSection.style.display = 'none';
  previewContainer.innerHTML = '';
  setProgress(5, 'Loading PDF in WebAssembly runtime...');

  try {
    const loadingTask = pdfjsLib.getDocument({
      data: currentPdfData,
      cMapUrl: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/cmaps/',
      cMapPacked: true,
      enableXfa: true
    });
    const pdfDoc = await loadingTask.promise;
    const totalPages = pdfDoc.numPages;

    const scale = parseFloat(renderScale.value);
    const mode = conversionMode.value;
    const targetPages = parsePageRange(pageRange.value, totalPages);

    if (targetPages.length === 0) {
      alert('No valid pages selected for conversion.');
      convertBtn.disabled = false;
      return;
    }

    const pagesHtml = [];
    const startTime = performance.now();

    for (let i = 0; i < targetPages.length; i++) {
      const pageNum = targetPages[i];
      const progress = 10 + (i / targetPages.length) * 80;
      setProgress(progress, `Processing Page ${pageNum} of ${totalPages}...`);

      const page = await pdfDoc.getPage(pageNum);
      // Viewport at 1.0 for CSS coordinates
      const unscaledViewport = page.getViewport({ scale: 1.0 });
      // Viewport scaled for crisp rendering
      const scaledViewport = page.getViewport({ scale: scale });

      const pageWidth = unscaledViewport.width;
      const pageHeight = unscaledViewport.height;

      // Extract text content for selectable text overlay
      const textContent = await page.getTextContent();
      let textSpansHtml = '';

      const textItems = textContent.items;
      for (const item of textItems) {
        if (!item.str || item.str.trim() === '') continue;

        // Convert PDF coordinates (bottom-up) to DOM coordinates (top-down)
        const tx = item.transform[4];
        const ty = item.transform[5];
        const fontSize = Math.sqrt(item.transform[0] * item.transform[0] + item.transform[1] * item.transform[1]);

        const top = pageHeight - ty - fontSize;
        const left = tx;

        const fontScaleX = item.transform[0] / (fontSize || 1);
        const transformCss = Math.abs(fontScaleX - 1.0) > 0.05 ? `transform: scaleX(${fontScaleX.toFixed(2)}); transform-origin: left top;` : '';

        const escapedText = item.str
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;');

        // In pixel-perfect mode, text is transparent so it highlights the underlying visual layer accurately
        const colorStyle = mode === 'dual' 
          ? 'color: transparent; user-select: text; -webkit-user-select: text;' 
          : 'color: #111827; user-select: text; -webkit-user-select: text;';

        textSpansHtml += `  <span class="pdf-text-span" style="position: absolute; left: ${left.toFixed(1)}px; top: ${top.toFixed(1)}px; font-size: ${fontSize.toFixed(1)}px; font-family: ${item.fontName || 'sans-serif'}, sans-serif; height: ${item.height || fontSize}px; line-height: 1; white-space: pre; ${colorStyle} ${transformCss}">${escapedText}</span>\n`;
      }

      let bgLayerHtml = '';
      if (mode === 'dual') {
        // High-DPI canvas render
        const canvas = document.createElement('canvas');
        canvas.width = scaledViewport.width;
        canvas.height = scaledViewport.height;
        const ctx = canvas.getContext('2d');

        // Fill canvas with white first to prevent transparent image artifacts
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        const renderContext = {
          canvasContext: ctx,
          viewport: scaledViewport
        };
        await page.render(renderContext).promise;

        const bgDataUrl = canvas.toDataURL('image/png');
        bgLayerHtml = `<img src="${bgDataUrl}" class="pdf-bg-layer" alt="Page ${pageNum}" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; pointer-events: none; z-index: 1; display: block;" />\n`;
      }

      // Continuous seamless page container
      const pageMarkup = `
<!-- Page ${pageNum} -->
<div class="pdf-page" id="page-${pageNum}" style="position: relative; width: ${pageWidth.toFixed(1)}px; height: ${pageHeight.toFixed(1)}px; margin: 0 auto; background: #ffffff; overflow: hidden; display: block;">
  ${bgLayerHtml}
  <div class="pdf-text-layer" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; z-index: 2; pointer-events: auto;">
${textSpansHtml}  </div>
</div>`;

      pagesHtml.push(pageMarkup);
    }

    setProgress(95, 'Generating standalone HTML document...');

    generatedHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${currentFile.name.replace(/\.pdf$/i, '')}</title>
  <style>
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }
    html, body {
      background-color: #525659;
      margin: 0;
      padding: 0;
    }
    .pdf-document {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 16px;
      padding: 24px 0;
      width: 100%;
    }
    .pdf-page {
      box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.2);
    }
    ::selection {
      background: rgba(59, 130, 246, 0.4);
      color: transparent;
    }
    @media print {
      body {
        padding: 0;
      }
      .pdf-page {
        page-break-after: always;
      }
    }
  </style>
</head>
<body>
  <div class="pdf-document">
${pagesHtml.join('\n')}
  </div>
</body>
</html>`;

    // Render Preview
    previewContainer.innerHTML = pagesHtml.join('\n');
    codeViewer.textContent = generatedHtml.slice(0, 5000) + (generatedHtml.length > 5000 ? '\n\n... [truncated for display, full document available on download] ...' : '');

    const elapsed = ((performance.now() - startTime) / 1000).toFixed(2);
    previewStats.textContent = `Converted ${targetPages.length} pages in ${elapsed}s (${(generatedHtml.length / 1024).toFixed(1)} KB HTML)`;

    setProgress(100, 'Conversion completed successfully!');
    previewSection.style.display = 'flex';
    downloadBtn.disabled = false;
  } catch (err) {
    console.error('Conversion failed:', err);
    alert('Conversion error: ' + err.message);
    setProgress(0, 'Failed');
  } finally {
    convertBtn.disabled = false;
  }
});

// Download button handler
downloadBtn.addEventListener('click', () => {
  if (!generatedHtml) return;
  const blob = new Blob([generatedHtml], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${(currentFile ? currentFile.name : 'document').replace(/\.pdf$/i, '')}.html`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
});
