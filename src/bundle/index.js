/**
 * @file src/bundle/index.js
 * @description The Unified "All-in-One" PDF Parser Bundle.
 * Opens the WASM document once, extracting Base64 images, GFM Markdown,
 * scientific metadata, and RAG-ready sections in a single unified execution.
 * Part of paper-drift - https://github.com/Sooriya04/Paper-Drift
 */

import fs from 'fs';
import mupdf from 'mupdf';
import { parsePageRange } from '../converter.js';
import { extractPageVectorsAndText } from '../vectors/walker.js';
import { rulesFromVector } from '../vectors/rules.js';
import { extractPageLinks } from '../links/extractor.js';
import { reconstructPageMath } from '../math/detector.js';
import { detectPageFigures, maskFigureContent } from '../images/figures.js';
import { extractScientificHeader } from '../metadata/header.js';
import { convertPdfToMarkdown } from '../markdown/converter.js';
import { extractBundleSections } from './sections.js';

/**
 * Parses a PDF in a single WASM pass and produces a complete, consolidated bundle payload:
 * metadata, GFM markdown, page rendering (Base64 dataUrl + text), and RAG sections.
 *
 * @param {string|Buffer|Uint8Array} input - PDF file path or binary buffer
 * @param {Object} [options={}] - Conversion options
 * @param {string} [options.pages='all'] - Page range (e.g. '1-5', '1', 'all')
 * @param {number} [options.scale=1.5] - Render scale for reader dataUrls
 * @param {boolean} [options.includeImages=true] - Whether to generate Base64 PNG dataUrls for pages
 * @returns {Promise<{ success: boolean, metadata: Object, markdown: string, pages: Array<Object>, sections: Array<Object> }>}
 */
export async function parsePdfBundle(input, options = {}) {
  let pdfBuffer;
  if (typeof input === 'string') {
    if (!fs.existsSync(input)) {
      throw new Error(`File not found: ${input}`);
    }
    pdfBuffer = fs.readFileSync(input);
  } else if (Buffer.isBuffer(input) || input instanceof Uint8Array) {
    pdfBuffer = input;
  } else {
    throw new TypeError('Input must be a valid file path string, Buffer, or Uint8Array.');
  }

  const doc = mupdf.Document.openDocument(pdfBuffer, 'application/pdf');
  try {
    const totalPages = doc.countPages();
    const pageRangeStr = options.pages || options.pageRange || 'all';
    const targetIndices = parsePageRange(pageRangeStr, totalPages);

    if (targetIndices.length === 0) {
      throw new Error(`No matching pages found for page range: "${pageRangeStr}" (Document has ${totalPages} pages).`);
    }

    const scale = typeof options.scale === 'number' ? options.scale : 1.5;
    const includeImages = options.includeImages !== false;

    const rawPagesData = [];
    const bundlePages = [];

    // Single-pass page iteration: Extract reader images and semantic data concurrently
    for (let step = 0; step < targetIndices.length; step++) {
      const pageIndex = targetIndices[step];
      const pageNumber = pageIndex + 1;
      const page = doc.loadPage(pageIndex);

      try {
        const bounds = page.getBounds();
        const width = bounds[2] - bounds[0];
        const height = bounds[3] - bounds[1];

        // 1. Reader UI image rendering
        let dataUrl = null;
        if (includeImages) {
          const matrix = mupdf.Matrix.scale(scale, scale);
          const pixmap = page.toPixmap(matrix, mupdf.ColorSpace.DeviceRGB, false);
          try {
            const pngBuf = Buffer.from(pixmap.asPNG());
            dataUrl = `data:image/png;base64,${pngBuf.toString('base64')}`;
          } finally {
            try {
              pixmap.destroy();
            } catch {}
          }
        }

        // 2. Vector and semantic text extraction
        const { lines, vectors } = extractPageVectorsAndText(page);
        const links = extractPageLinks(page, doc);

        const figures = detectPageFigures({ bounds, lines, vectors });
        const { lines: cleanLines, vectors: cleanVectors } = maskFigureContent(lines, vectors, figures);

        const rules = [];
        for (const v of cleanVectors) {
          rules.push(...rulesFromVector(v));
        }

        const { mathItems, claimedLineIndices } = reconstructPageMath(cleanLines, cleanVectors, width, height);
        const pageText = cleanLines.map(l => l.text).join('\n');

        bundlePages.push({
          pageNumber,
          width,
          height,
          dataUrl,
          text: pageText
        });

        rawPagesData.push({
          index: pageIndex,
          pageIndex,
          pageNumber,
          bounds,
          width,
          height,
          lines: cleanLines,
          rawLines: lines,
          vectors: cleanVectors,
          rawVectors: vectors,
          figures,
          rules,
          links,
          rasterImages: [],
          mathItems,
          claimedLineIndices
        });
      } finally {
        try {
          page.destroy();
        } catch {}
      }
    }

    // 3. Extract scientific metadata from in-memory pages
    const header = extractScientificHeader(rawPagesData, null);

    let arxiv_id = null;
    const firstPageLines = rawPagesData[0]?.lines || [];
    for (const l of firstPageLines) {
      const arxMatch = (l.text || '').match(/\barXiv:\s*(\d{4}\.\d{4,5})(?:v\d+)?\b/i);
      if (arxMatch) {
        arxiv_id = arxMatch[1];
        break;
      }
    }

    const metadata = {
      title: header.title?.value || null,
      authors: Array.isArray(header.authors)
        ? header.authors.map(a => (typeof a === 'string' ? a : a.name || a.value)).filter(Boolean)
        : [],
      abstract: header.abstract?.value || null,
      doi: header.doi?.value || null,
      arxiv_id
    };

    // 4. Derive GFM Markdown reusing pre-extracted rawPagesData and open doc
    const mdResult = await convertPdfToMarkdown(pdfBuffer, {
      ...options,
      pagesData: rawPagesData,
      doc
    });

    // 5. Extract RAG-ready section slices
    const sections = extractBundleSections(rawPagesData);

    return {
      success: true,
      metadata,
      markdown: mdResult.markdown,
      pages: bundlePages,
      sections
    };
  } finally {
    try {
      doc.destroy();
    } catch {}
  }
}
