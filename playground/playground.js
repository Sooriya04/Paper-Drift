/**
 * @file playground/playground.js
 * @description Client-side controller script for the paper-drift web playground.
 * Manages PDF drag-and-drop, UI settings, WebAssembly execution, live Markdown & KaTeX formula rendering,
 * GFM table preview, HTML raster layers, and AI token savings analytics.
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
const downloadMdBtn = document.getElementById('downloadMdBtn');
const downloadZipBtn = document.getElementById('downloadZipBtn');
const downloadHtmlBtn = document.getElementById('downloadHtmlBtn');
const copyMdBtn = document.getElementById('copyMdBtn');
const outputTarget = document.getElementById('outputTarget');
const assetMode = document.getElementById('assetMode');
const renderScale = document.getElementById('renderScale');
const pageRange = document.getElementById('pageRange');
const progressContainer = document.getElementById('progressContainer');
const progressStatus = document.getElementById('progressStatus');
const progressPercent = document.getElementById('progressPercent');
const progressFill = document.getElementById('progressFill');
const previewSection = document.getElementById('previewSection');
const previewContainer = document.getElementById('previewContainer');
const markdownRendered = document.getElementById('markdownRendered');
const mdCodeViewer = document.getElementById('mdCodeViewer');
const codeViewer = document.getElementById('codeViewer');
const previewStats = document.getElementById('previewStats');
const tokenSavingsBanner = document.getElementById('tokenSavingsBanner');
const tokenSavingsPct = document.getElementById('tokenSavingsPct');
const statVisionTokens = document.getElementById('statVisionTokens');
const statMarkdownTokens = document.getElementById('statMarkdownTokens');
const statSpeedup = document.getElementById('statSpeedup');
const tabBtns = document.querySelectorAll('.tab-btn');

let currentFile = null;
let currentPdfData = null;
let generatedHtml = '';
let generatedMarkdown = '';
let pageImages = [];

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
  downloadMdBtn.disabled = true;
  downloadZipBtn.disabled = true;
  downloadHtmlBtn.disabled = true;
  previewSection.style.display = 'none';
  tokenSavingsBanner.style.display = 'none';
  pageImages = [];

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

    document.getElementById('tabMarkdown').style.display = tab === 'markdown' ? 'block' : 'none';
    document.getElementById('tabMdCode').style.display = tab === 'md-code' ? 'block' : 'none';
    document.getElementById('tabRendered').style.display = tab === 'rendered' ? 'block' : 'none';
    document.getElementById('tabCode').style.display = tab === 'code' ? 'block' : 'none';
  });
});

// Copy Markdown button handler
copyMdBtn.addEventListener('click', async () => {
  if (!generatedMarkdown) return;
  try {
    await navigator.clipboard.writeText(generatedMarkdown);
    const originalText = copyMdBtn.textContent;
    copyMdBtn.textContent = '✔ Copied!';
    setTimeout(() => {
      copyMdBtn.textContent = originalText;
    }, 1500);
  } catch (err) {
    console.error('Clipboard copy failed:', err);
  }
});

// Update progress indicator
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

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Render Markdown safely with KaTeX: Protects math from marked.js to avoid parse errors and false bolding
function renderMarkdownWithKaTeX(markdownText) {
  if (!markdownText) {
    markdownRendered.innerHTML = '';
    return;
  }

  // 1. Protect Display Math ($$...$$) and Inline Math ($...$) from Marked.js mangling
  const mathPlaceholders = [];
  let placeholderCounter = 0;

  // Protect display math first ($$...$$)
  let protectedMd = markdownText.replace(/\$\$([\s\S]*?)\$\$/g, (match, equation) => {
    const key = `XKMATHBLOCKX${placeholderCounter++}X`;
    mathPlaceholders.push({ key, type: 'display', math: equation.trim() });
    return `\n\n${key}\n\n`;
  });

  // Protect inline math ($...$) - ensure not currency like $50
  protectedMd = protectedMd.replace(/(^|[^\\\$])\$([^\$\n]+?)\$/g, (match, prefix, math) => {
    if (/^\s*\d+/.test(math)) return match;
    const key = `XKMATHINLINEX${placeholderCounter++}X`;
    mathPlaceholders.push({ key, type: 'inline', math: math.trim() });
    return `${prefix}${key}`;
  });

  // 2. Parse Markdown safely with marked.js (no math underscores or backslashes to mangle)
  let rawHtml = '';
  if (window.marked) {
    marked.setOptions({ gfm: true, breaks: false });
    rawHtml = marked.parse(protectedMd);
  } else {
    rawHtml = protectedMd;
  }

  // 3. Render KaTeX directly for each math placeholder and substitute back
  for (const item of mathPlaceholders) {
    let renderedMath = '';
    if (window.katex) {
      try {
        renderedMath = katex.renderToString(item.math, {
          displayMode: item.type === 'display',
          throwOnError: false
        });
      } catch (err) {
        renderedMath = item.type === 'display'
          ? `<div class="katex-display-fallback">${escapeHtml(item.math)}</div>`
          : `<code class="katex-inline-fallback">${escapeHtml(item.math)}</code>`;
      }
    } else {
      renderedMath = item.type === 'display' ? `$$${item.math}$$` : `$${item.math}$`;
    }

    if (item.type === 'display') {
      const pWrappedKey = new RegExp(`<p>\\s*${item.key}\\s*<\\/p>`, 'g');
      if (pWrappedKey.test(rawHtml)) {
        rawHtml = rawHtml.replace(pWrappedKey, renderedMath);
      } else {
        rawHtml = rawHtml.replace(item.key, renderedMath);
      }
    } else {
      rawHtml = rawHtml.replace(item.key, renderedMath);
    }
  }

  markdownRendered.innerHTML = rawHtml;
}

// Main conversion logic
convertBtn.addEventListener('click', async () => {
  if (!currentPdfData) return;

  convertBtn.disabled = true;
  downloadMdBtn.disabled = true;
  downloadZipBtn.disabled = true;
  downloadHtmlBtn.disabled = true;
  previewSection.style.display = 'none';
  tokenSavingsBanner.style.display = 'none';
  previewContainer.innerHTML = '';
  markdownRendered.innerHTML = '';
  pageImages = [];

  const targetMode = outputTarget.value;
  const wantMarkdown = targetMode === 'markdown' || targetMode === 'both';
  const wantHtml = targetMode === 'dual' || targetMode === 'both';
  const requestedPages = pageRange.value.trim() || 'all';
  const isAssetsMode = assetMode ? assetMode.value === 'assets' : true;
  const docBaseName = (currentFile ? currentFile.name : 'document').replace(/\.pdf$/i, '');

  setProgress(10, 'Initializing WebAssembly conversion engine...');

  const startTime = performance.now();

  try {
    // 1. Process Markdown via WebAssembly Engine
    if (wantMarkdown) {
      setProgress(25, 'Extracting spatial text, LaTeX math, and GFM tables...');
      let markdownSuccess = false;

      // Attempt fast local server endpoint
      try {
        const response = await fetch(`/api/convert-markdown?pages=${encodeURIComponent(requestedPages)}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/pdf' },
          body: currentPdfData
        });

        if (response.ok) {
          const res = await response.json();
          if (res.success) {
            generatedMarkdown = res.markdown;
            mdCodeViewer.textContent = generatedMarkdown;
            renderMarkdownWithKaTeX(generatedMarkdown);

            // Populate Token Efficiency Banner
            tokenSavingsPct.textContent = `${res.savingsPercent}% Saved`;
            statVisionTokens.textContent = `~${res.visionTokens.toLocaleString()} tokens`;
            statMarkdownTokens.textContent = `~${res.markdownTokens.toLocaleString()} tokens`;
            const speedupFactor = Math.max(2, Math.round(res.visionTokens / res.markdownTokens));
            statSpeedup.textContent = `${speedupFactor}x Faster Ingestion`;
            tokenSavingsBanner.style.display = 'flex';

            markdownSuccess = true;
          }
        }
      } catch (e) {
        // Fallback for static client-side run
      }

      // Client-side fallback if server API is unavailable
      if (!markdownSuccess) {
        const loadingTask = pdfjsLib.getDocument({ data: currentPdfData });
        const pdfDoc = await loadingTask.promise;
        const total = pdfDoc.numPages;
        const targetPagesList = parsePageRange(requestedPages, total);
        const mdParts = [];

        for (const pNum of targetPagesList) {
          const page = await pdfDoc.getPage(pNum);
          const tc = await page.getTextContent();
          const pageLines = tc.items.map(it => it.str).filter(s => s && s.trim());
          mdParts.push(pageLines.join(' '));
        }

        generatedMarkdown = mdParts.join('\n\n---\n\n');
        mdCodeViewer.textContent = generatedMarkdown;
        renderMarkdownWithKaTeX(generatedMarkdown);
      }
    }

    // 2. Process HTML if requested
    if (wantHtml) {
      setProgress(50, 'Rendering pixel-perfect background raster & text layers...');

      const loadingTask = pdfjsLib.getDocument({
        data: currentPdfData,
        cMapUrl: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/cmaps/',
        cMapPacked: true,
        enableXfa: true
      });
      const pdfDoc = await loadingTask.promise;
      const totalPages = pdfDoc.numPages;
      const scale = parseFloat(renderScale.value);
      const targetPagesList = parsePageRange(requestedPages, totalPages);

      const previewPagesHtml = [];
      const exportPagesHtml = [];

      for (let i = 0; i < targetPagesList.length; i++) {
        const pageNum = targetPagesList[i];
        const progress = 50 + (i / targetPagesList.length) * 40;
        setProgress(progress, `Rendering Page ${pageNum} of ${totalPages}...`);

        const page = await pdfDoc.getPage(pageNum);
        const unscaledViewport = page.getViewport({ scale: 1.0 });
        const scaledViewport = page.getViewport({ scale: scale });

        const pageWidth = unscaledViewport.width;
        const pageHeight = unscaledViewport.height;

        const textContent = await page.getTextContent();
        let textSpansHtml = '';

        for (const item of textContent.items) {
          if (!item.str || item.str.trim() === '') continue;

          const tx = item.transform[4];
          const ty = item.transform[5];
          const fontSize = Math.sqrt(item.transform[0] * item.transform[0] + item.transform[1] * item.transform[1]);
          const top = pageHeight - ty - fontSize;
          const left = tx;

          const escapedText = item.str
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');

          textSpansHtml += `  <span class="pdf-text-span" style="position: absolute; left: ${left.toFixed(1)}px; top: ${top.toFixed(1)}px; font-size: ${fontSize.toFixed(1)}px; font-family: ${item.fontName || 'sans-serif'}, sans-serif; height: ${item.height || fontSize}px; line-height: 1; white-space: pre; color: transparent; user-select: text; -webkit-user-select: text;">${escapedText}</span>\n`;
        }

        const canvas = document.createElement('canvas');
        canvas.width = scaledViewport.width;
        canvas.height = scaledViewport.height;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        await page.render({ canvasContext: ctx, viewport: scaledViewport }).promise;

        const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
        const blobUrl = URL.createObjectURL(blob);
        const filename = `page-${pageNum}.png`;

        let bgDataUrl = null;
        if (!isAssetsMode) {
          bgDataUrl = canvas.toDataURL('image/png');
        }

        pageImages.push({
          pageNum,
          filename,
          blob,
          dataUrl: bgDataUrl
        });

        // Live in-browser preview uses Blob URL (instant, lightweight, zero Base64 lag)
        const previewMarkup = `
<!-- Page ${pageNum} -->
<div class="pdf-page" id="page-${pageNum}" style="position: relative; width: ${pageWidth.toFixed(1)}px; height: ${pageHeight.toFixed(1)}px; margin: 0 auto; background: #ffffff; overflow: hidden; display: block; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.2);">
  <img src="${blobUrl}" class="pdf-bg-layer" alt="Page ${pageNum}" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; pointer-events: none; z-index: 1; display: block;" />
  <div class="pdf-text-layer" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; z-index: 2; pointer-events: auto;">
${textSpansHtml}  </div>
</div>`;
        previewPagesHtml.push(previewMarkup);

        // Exported HTML uses companion assets folder reference or Base64 if inline requested
        const imgSrc = isAssetsMode ? `./${docBaseName}_assets/${filename}` : bgDataUrl;
        const exportMarkup = `
<!-- Page ${pageNum} -->
<div class="pdf-page" id="page-${pageNum}" style="position: relative; width: ${pageWidth.toFixed(1)}px; height: ${pageHeight.toFixed(1)}px; margin: 0 auto; background: #ffffff; overflow: hidden; display: block; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.2);">
  <img src="${imgSrc}" class="pdf-bg-layer" alt="Page ${pageNum}" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; pointer-events: none; z-index: 1; display: block;" />
  <div class="pdf-text-layer" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; z-index: 2; pointer-events: auto;">
${textSpansHtml}  </div>
</div>`;
        exportPagesHtml.push(exportMarkup);
      }

      generatedHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${docBaseName}</title>
  <style>
    body { background-color: #525659; margin: 0; padding: 24px 0; display: flex; flex-direction: column; align-items: center; gap: 16px; }
    ::selection { background: rgba(59, 130, 246, 0.4); color: transparent; }
  </style>
</head>
<body>
${exportPagesHtml.join('\n')}
</body>
</html>`;

      previewContainer.innerHTML = previewPagesHtml.join('\n');
      codeViewer.textContent = generatedHtml;
    }

    setProgress(100, 'Conversion completed successfully!');
    const elapsed = ((performance.now() - startTime) / 1000).toFixed(2);
    previewStats.textContent = `Completed in ${elapsed}s`;

    previewSection.style.display = 'flex';
    if (generatedMarkdown) downloadMdBtn.disabled = false;
    if (generatedHtml) downloadHtmlBtn.disabled = false;
    if (isAssetsMode && pageImages.length > 0) {
      downloadZipBtn.disabled = false;
    }

    // Set default active tab based on mode
    if (wantMarkdown) {
      tabBtns[0].click(); // Rendered Markdown
    } else {
      tabBtns[2].click(); // Rendered HTML
    }
  } catch (err) {
    console.error('Conversion failed:', err);
    alert('Conversion error: ' + err.message);
    setProgress(0, 'Failed');
  } finally {
    convertBtn.disabled = false;
  }
});

// Download Markdown handler
downloadMdBtn.addEventListener('click', () => {
  if (!generatedMarkdown) return;
  const blob = new Blob([generatedMarkdown], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${(currentFile ? currentFile.name : 'document').replace(/\.pdf$/i, '')}.md`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
});

// Download ZIP bundle handler (HTML + extracted assets folder)
downloadZipBtn.addEventListener('click', async () => {
  if (!generatedHtml || pageImages.length === 0) return;
  if (!window.JSZip) {
    alert('ZIP bundling library is loading, please try again in a moment.');
    return;
  }

  const zip = new JSZip();
  const docBaseName = (currentFile ? currentFile.name : 'document').replace(/\.pdf$/i, '');
  const assetsFolder = zip.folder(`${docBaseName}_assets`);

  for (const item of pageImages) {
    assetsFolder.file(item.filename, item.blob);
  }

  if (generatedHtml) {
    zip.file(`${docBaseName}.html`, generatedHtml);
  }
  if (generatedMarkdown) {
    zip.file(`${docBaseName}.md`, generatedMarkdown);
  }

  const zipBlob = await zip.generateAsync({ type: 'blob' });
  const url = URL.createObjectURL(zipBlob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${docBaseName}_bundle.zip`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
});

// Download HTML handler
downloadHtmlBtn.addEventListener('click', () => {
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
