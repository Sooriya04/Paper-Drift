/**
 * @file server/app.js
 * @description Client-side controller script for the paper-drift Web Studio.
 * Manages PDF drag-and-drop, UI settings, Unified Bundle API calls, live Markdown & KaTeX formula rendering,
 * GFM table preview, HTML raster layers, and AI token savings analytics.
 * Part of paper-drift - https://github.com/Sooriya04/Paper-Drift
 */

// Configure PDF.js WebAssembly worker
if (window.pdfjsLib) {
  pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
}

// UI Elements
const dropZone = document.getElementById('dropZone');
const fileInput = document.getElementById('fileInput');
const browseBtn = document.getElementById('browseBtn');
const fileInfo = document.getElementById('fileInfo');
const convertBtn = document.getElementById('convertBtn');
const downloadBundleBtn = document.getElementById('downloadBundleBtn');
const downloadChunksBtn = document.getElementById('downloadChunksBtn');
const downloadMdBtn = document.getElementById('downloadMdBtn');
const downloadHtmlBtn = document.getElementById('downloadHtmlBtn');
const copyBtn = document.getElementById('copyBtn');
const outputTarget = document.getElementById('outputTarget');
const renderScale = document.getElementById('renderScale');
const pageRange = document.getElementById('pageRange');
const maxChunkChars = document.getElementById('maxChunkChars');
const chunkSizeCard = document.getElementById('chunkSizeCard');
const progressContainer = document.getElementById('progressContainer');
const progressStatus = document.getElementById('progressStatus');
const progressPercent = document.getElementById('progressPercent');
const progressFill = document.getElementById('progressFill');
const previewSection = document.getElementById('previewSection');
const previewContainer = document.getElementById('previewContainer');
const markdownRendered = document.getElementById('markdownRendered');
const mdCodeViewer = document.getElementById('mdCodeViewer');
const bundleJsonViewer = document.getElementById('bundleJsonViewer');
const chunksList = document.getElementById('chunksList');
const chunksJsonViewer = document.getElementById('chunksJsonViewer');
const chunksCount = document.getElementById('chunksCount');
const chunksAvgChars = document.getElementById('chunksAvgChars');
const chunksAtomicStats = document.getElementById('chunksAtomicStats');
const metaTitle = document.getElementById('metaTitle');
const metaAuthors = document.getElementById('metaAuthors');
const metaArxiv = document.getElementById('metaArxiv');
const metaAbstract = document.getElementById('metaAbstract');
const sectionsList = document.getElementById('sectionsList');
const previewStats = document.getElementById('previewStats');
const tokenSavingsBanner = document.getElementById('tokenSavingsBanner');
const tokenSavingsPct = document.getElementById('tokenSavingsPct');
const statVisionTokens = document.getElementById('statVisionTokens');
const statMarkdownTokens = document.getElementById('statMarkdownTokens');
const statSpeedup = document.getElementById('statSpeedup');
const tabBtns = document.querySelectorAll('.tab-btn');

let currentFile = null;
let currentPdfData = null;
let generatedBundle = null;
let generatedChunks = null;
let generatedMarkdown = '';
let generatedHtml = '';
let activeTab = 'bundle';

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
  dropZone.classList.add('has-file');
  convertBtn.disabled = false;
  downloadBundleBtn.disabled = true;
  downloadChunksBtn.disabled = true;
  downloadMdBtn.disabled = true;
  downloadHtmlBtn.disabled = true;
  previewSection.style.display = 'none';
  tokenSavingsBanner.style.display = 'none';

  const reader = new FileReader();
  reader.onload = function(evt) {
    currentPdfData = new Uint8Array(evt.target.result);
  };
  reader.readAsArrayBuffer(file);
}

// Automatically reveal chunk tuning options when RAG chunks mode is selected
outputTarget.addEventListener('change', () => {
  const disclosure = document.querySelector('.advanced-disclosure');
  if (outputTarget.value === 'chunks' && disclosure) {
    disclosure.open = true;
    if (maxChunkChars) maxChunkChars.focus();
  }
});

// Tab navigation
tabBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    tabBtns.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    activeTab = btn.getAttribute('data-tab');

    document.querySelectorAll('.tab-content').forEach(c => c.style.display = 'none');

    if (activeTab === 'bundle') {
      document.getElementById('tabBundle').style.display = 'block';
    } else if (activeTab === 'chunks') {
      document.getElementById('tabChunks').style.display = 'block';
    } else if (activeTab === 'markdown') {
      document.getElementById('tabMarkdown').style.display = 'block';
    } else if (activeTab === 'md-code') {
      document.getElementById('tabMdCode').style.display = 'block';
    } else if (activeTab === 'rendered') {
      document.getElementById('tabRendered').style.display = 'block';
    }
  });
});

function setProgress(pct, statusText) {
  progressContainer.style.display = 'flex';
  progressPercent.textContent = `${Math.round(pct)}%`;
  progressFill.style.width = `${pct}%`;
  if (statusText) progressStatus.textContent = statusText;
}

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// Convert Document Execution
convertBtn.addEventListener('click', async () => {
  if (!currentPdfData) return;

  convertBtn.disabled = true;
  downloadBundleBtn.disabled = true;
  downloadMdBtn.disabled = true;
  downloadHtmlBtn.disabled = true;
  setProgress(5, 'Opening document in WebAssembly pipeline...');

  const startTime = Date.now();
  const targetFormat = outputTarget.value;
  const requestedPages = pageRange.value.trim() || 'all';
  const scale = parseFloat(renderScale.value);

  try {
    if (targetFormat === 'bundle' || targetFormat === 'both') {
      setProgress(25, 'Processing unified bundle via WASM engine...');

      const response = await fetch(`/api/parse-full?pages=${encodeURIComponent(requestedPages)}&scale=${scale}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/pdf' },
        body: currentPdfData
      });

      if (!response.ok) {
        throw new Error(`Server returned HTTP ${response.status}`);
      }

      const bundle = await response.json();
      if (!bundle.success) {
        throw new Error(bundle.error || 'Parsing bundle failed');
      }

      generatedBundle = bundle;
      generatedMarkdown = bundle.markdown || '';

      // Populate Metadata Card
      metaTitle.textContent = bundle.metadata?.title || 'Untitled Document';
      metaAuthors.textContent = (bundle.metadata?.authors || []).join(', ') || 'Unknown';
      metaArxiv.textContent = bundle.metadata?.arxiv_id ? `arXiv:${bundle.metadata.arxiv_id}` : (bundle.metadata?.doi || 'None detected');
      metaAbstract.textContent = bundle.metadata?.abstract || 'No abstract detected in frontmatter.';

      // Populate RAG Sections
      sectionsList.innerHTML = '';
      if (Array.isArray(bundle.sections) && bundle.sections.length > 0) {
        for (const sec of bundle.sections) {
          const item = document.createElement('div');
          item.className = 'section-item';
          item.innerHTML = `
            <div class="section-item-header">
              <span class="section-item-title">${escapeHtml(sec.title)}</span>
              <div class="section-item-meta">
                <span class="section-tag">Level ${sec.level}</span>
                <span class="section-tag">Page ${sec.page}</span>
              </div>
            </div>
            <div class="section-item-body">${escapeHtml(sec.content || '(No direct content)')}</div>
          `;
          sectionsList.appendChild(item);
        }
      } else {
        sectionsList.innerHTML = '<div style="color: #94a3b8; font-size: 0.85rem;">No sections detected.</div>';
      }

      // Populate JSON and Markdown viewers
      bundleJsonViewer.textContent = JSON.stringify(bundle, null, 2);
      mdCodeViewer.textContent = generatedMarkdown;
      renderMarkdownWithKaTeX(generatedMarkdown);

      // Populate Efficiency Metric
      const totalPages = bundle.pages ? bundle.pages.length : 1;
      const visionTokens = totalPages * 1600;
      const markdownTokens = Math.max(1, Math.round(generatedMarkdown.length / 4));
      const savingsPct = Math.max(0, Math.min(99.9, ((visionTokens - markdownTokens) / visionTokens) * 100)).toFixed(1);
      tokenSavingsPct.textContent = `${savingsPct}% Saved`;
      statVisionTokens.textContent = `~${visionTokens.toLocaleString()} tokens`;
      statMarkdownTokens.textContent = `~${markdownTokens.toLocaleString()} tokens`;
      const speedup = Math.max(2, Math.round(visionTokens / markdownTokens));
      statSpeedup.textContent = `${speedup}x Faster`;
      tokenSavingsBanner.style.display = 'flex';

      downloadBundleBtn.disabled = false;
      downloadMdBtn.disabled = false;
    } else if (targetFormat === 'chunks') {
      setProgress(25, 'Slicing document into semantic RAG chunks...');
      const chunkChars = parseInt(maxChunkChars.value, 10) || 1500;
      const response = await fetch(`/api/chunk-rag?max_chunk_chars=${chunkChars}&pages=${encodeURIComponent(requestedPages)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/pdf' },
        body: currentPdfData
      });

      if (!response.ok) {
        throw new Error(`Server returned HTTP ${response.status}`);
      }

      const chunks = await response.json();
      if (!Array.isArray(chunks)) {
        throw new Error(chunks.error || 'Failed to extract RAG chunks');
      }

      generatedChunks = chunks;
      renderChunksView(chunks);

      // Activate Chunks Tab
      tabBtns.forEach(b => b.classList.toggle('active', b.getAttribute('data-tab') === 'chunks'));
      document.querySelectorAll('.tab-content').forEach(c => c.style.display = 'none');
      document.getElementById('tabChunks').style.display = 'block';
      activeTab = 'chunks';

      downloadChunksBtn.disabled = false;
    } else {
      // Direct Markdown or HTML mode
      setProgress(30, 'Converting document to Markdown...');
      const response = await fetch(`/api/convert-markdown?pages=${encodeURIComponent(requestedPages)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/pdf' },
        body: currentPdfData
      });

      const res = await response.json();
      if (!res.success) throw new Error(res.error || 'Conversion failed');

      generatedMarkdown = res.markdown;
      mdCodeViewer.textContent = generatedMarkdown;
      renderMarkdownWithKaTeX(generatedMarkdown);

      tokenSavingsPct.textContent = `${res.savingsPercent}% Saved`;
      statVisionTokens.textContent = `~${res.visionTokens.toLocaleString()} tokens`;
      statMarkdownTokens.textContent = `~${res.markdownTokens.toLocaleString()} tokens`;
      statSpeedup.textContent = `12x Faster`;
      tokenSavingsBanner.style.display = 'flex';
      downloadMdBtn.disabled = false;
    }

    setProgress(100, 'Done!');
    setTimeout(() => { progressContainer.style.display = 'none'; }, 600);

    const totalDuration = Date.now() - startTime;
    previewStats.textContent = `Processed in ${totalDuration}ms`;
    previewSection.style.display = 'flex';
  } catch (err) {
    alert(`Conversion error: ${err.message}`);
    progressContainer.style.display = 'none';
  } finally {
    convertBtn.disabled = false;
  }
});

function renderMarkdownWithKaTeX(markdownText) {
  if (window.marked) {
    marked.setOptions({ gfm: true, breaks: true });
    markdownRendered.innerHTML = marked.parse(markdownText);

    if (window.renderMathInElement) {
      renderMathInElement(markdownRendered, {
        delimiters: [
          { left: '$$', right: '$$', display: true },
          { left: '$', right: '$', display: false }
        ],
        throwOnError: false
      });
    }
  } else {
    markdownRendered.textContent = markdownText;
  }
}

function renderChunksView(chunks) {
  chunksList.innerHTML = '';
  if (!Array.isArray(chunks) || chunks.length === 0) {
    chunksList.innerHTML = '<div style="color: #94a3b8; font-size: 0.85rem;">No chunks generated.</div>';
    chunksCount.textContent = '0 Chunks';
    chunksAvgChars.textContent = '0 avg chars';
    chunksAtomicStats.textContent = '0 atomic blocks';
    chunksJsonViewer.textContent = '[]';
    return;
  }

  const totalChars = chunks.reduce((acc, c) => acc + (c.content ? c.content.length : 0), 0);
  const avgChars = Math.round(totalChars / chunks.length);
  const tableChunks = chunks.filter(c => c.has_table).length;
  const mathChunks = chunks.filter(c => c.has_math).length;

  chunksCount.textContent = `${chunks.length} Chunks`;
  chunksAvgChars.textContent = `${avgChars} avg chars`;
  chunksAtomicStats.textContent = `${tableChunks} table chunks • ${mathChunks} math chunks`;

  for (const chunk of chunks) {
    const item = document.createElement('div');
    item.className = 'section-item';
    const charLen = chunk.content ? chunk.content.length : 0;
    const estTokens = Math.max(1, Math.round(charLen / 4));
    item.innerHTML = `
      <div class="section-item-header">
        <span class="section-item-title">${escapeHtml(chunk.chunk_id)}: ${escapeHtml(chunk.section || 'General')}</span>
        <div class="section-item-meta">
          <span class="section-tag tag-page">Page ${chunk.page}</span>
          <span class="section-tag">${charLen} chars (~${estTokens} tokens)</span>
          ${chunk.has_table ? '<span class="section-tag tag-table">Table</span>' : ''}
          ${chunk.has_math ? '<span class="section-tag tag-math">Math</span>' : ''}
        </div>
      </div>
      <div class="section-item-body">${escapeHtml(chunk.content || '(empty)')}</div>
    `;
    chunksList.appendChild(item);
  }

  chunksJsonViewer.textContent = JSON.stringify(chunks, null, 2);
}

// Download handlers
downloadBundleBtn.addEventListener('click', () => {
  if (!generatedBundle) return;
  const baseName = currentFile ? currentFile.name.replace(/\.[^/.]+$/, '') : 'document';
  downloadFile(`${baseName}-bundle.json`, JSON.stringify(generatedBundle, null, 2), 'application/json');
});

downloadChunksBtn.addEventListener('click', () => {
  if (!generatedChunks) return;
  const baseName = currentFile ? currentFile.name.replace(/\.[^/.]+$/, '') : 'document';
  downloadFile(`${baseName}-chunks.json`, JSON.stringify(generatedChunks, null, 2), 'application/json');
});

downloadMdBtn.addEventListener('click', () => {
  if (!generatedMarkdown) return;
  const baseName = currentFile ? currentFile.name.replace(/\.[^/.]+$/, '') : 'document';
  downloadFile(`${baseName}.md`, generatedMarkdown, 'text/markdown');
});

downloadHtmlBtn.addEventListener('click', () => {
  if (!generatedHtml) return;
  const baseName = currentFile ? currentFile.name.replace(/\.[^/.]+$/, '') : 'document';
  downloadFile(`${baseName}.html`, generatedHtml, 'text/html');
});

function downloadFile(filename, content, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// Copy button
copyBtn.addEventListener('click', () => {
  let content = '';
  if (activeTab === 'bundle' && generatedBundle) {
    content = JSON.stringify(generatedBundle, null, 2);
  } else if (activeTab === 'chunks' && generatedChunks) {
    content = JSON.stringify(generatedChunks, null, 2);
  } else if (activeTab === 'markdown' || activeTab === 'md-code') {
    content = generatedMarkdown;
  } else if (activeTab === 'rendered') {
    content = generatedHtml;
  }

  if (content) {
    navigator.clipboard.writeText(content).then(() => {
      const originalText = copyBtn.querySelector('span').textContent;
      copyBtn.querySelector('span').textContent = 'Copied!';
      setTimeout(() => { copyBtn.querySelector('span').textContent = originalText; }, 1500);
    });
  }
});
