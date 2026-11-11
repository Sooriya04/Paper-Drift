/**
 * @file src/markdown/converter.js
 * @description High-level WebAssembly PDF to Markdown conversion engine.
 * Combines MuPDF vector walking, geometric table extraction, dynamic typography, and Remark AST normalization.
 * Part of paper-drift - https://github.com/Sooriya04/Paper-Drift
 */

import fs from 'fs';
import path from 'path';
import mupdf from 'mupdf';
import { extractPageVectorsAndText } from '../vectors/walker.js';
import { rulesFromVector, filterContentRules } from '../vectors/rules.js';
import { reconstructTables } from '../tables/grid.js';
import { calculateBodyFontSizeMode, classifyTypography } from './typography.js';
import { normalizeMarkdown } from './normalizer.js';
import { parsePageRange } from '../converter.js';
import { recursiveXyCut } from '../spatial/reading-order.js';
import { extractPdfImages } from '../images/extractor.js';
import { readPageRasterImages } from '../images/raster.js';
import {
  extractPageLinks,
  buildDocumentDestinations,
  applyLinksToLine,
  findDestinationAnchors,
  groupLinksByLine
} from '../links/extractor.js';
import { reconstructPageMath } from '../math/index.js';

/**
 * Converts a PDF buffer or file path into publication-grade GitHub Flavored Markdown (GFM).
 *
 * @param {string|Buffer|Uint8Array} input - File path or binary buffer of the PDF.
 * @param {Object} [options={}] - Conversion options.
 * @param {string|number|number[]} [options.pages='all'] - Page range specification (e.g. "1-5", "2,4", "all").
 * @param {string|number|number[]} [options.pageRange='all'] - Legacy alias for `pages`.
 * @param {boolean} [options.tables=true] - Whether to reconstruct vector tables into GFM pipe tables.
 * @param {boolean} [options.stripRepeatedLines=true] - Whether to drop running headers/footers in margins.
 * @param {boolean} [options.links=true] - Whether to weave interactive hyperlinks and citation anchors.
 * @param {boolean|Object} [options.extractImages=false] - Whether to extract raster images and figures into disk files.
 * @param {string} [options.extractImages.dir] - Directory to write image files into.
 * @param {string} [options.extractImages.linkPrefix] - Custom link prefix for markdown images.
 * @param {number} [options.imageScale=2.0] - DPI scale factor for rendered vector figures.
 * @param {function} [options.onProgress] - Optional progress callback.
 * @returns {Promise<{ markdown: string, totalPages: number, pagesProcessed: number, tablesCount: number, imagesCount: number, assets: Array<Object>, durationMs: number }>}
 */
export async function convertPdfToMarkdown(input, options = {}) {
  const startTime = Date.now();
  const pageRangeStr = options.pages !== undefined ? options.pages : (options.pageRange || 'all');
  const enableTables = options.tables !== false;
  const stripRepeatedLines = options.stripRepeatedLines !== false;
  const enableLinks = options.links !== false;
  const extractImagesOption = options.extractImages;
  const shouldExtractImages = Boolean(extractImagesOption);

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
    const targetIndices = parsePageRange(pageRangeStr, totalPages);

    if (targetIndices.length === 0) {
      throw new Error(`No matching pages found for page range: "${pageRangeStr}" (Document has ${totalPages} pages).`);
    }

      // 1. First pass: Walk all target pages to collect text lines, vectors, and image candidates
      const rawPagesData = [];
      try {
        for (let step = 0; step < targetIndices.length; step++) {
          const pageIndex = targetIndices[step];
          const pageNumber = pageIndex + 1;

          if (typeof options.onProgress === 'function') {
            options.onProgress({
              phase: 'reading',
              current: step + 1,
              total: targetIndices.length,
              pageNumber,
              totalPages
            });
          }

          const page = doc.loadPage(pageIndex);
          try {
            const bounds = page.getBounds();
            const width = bounds[2] - bounds[0];
            const height = bounds[3] - bounds[1];

            const { lines, vectors } = extractPageVectorsAndText(page);
            const links = enableLinks ? extractPageLinks(page, doc) : [];

            const pageImages = shouldExtractImages ? readPageRasterImages(page, pageIndex) : [];
            for (const img of pageImages) {
              img.page = page;
              img.bounds = bounds;
            }

            const rules = [];
            for (const v of vectors) {
              rules.push(...rulesFromVector(v));
            }

            const { mathItems, claimedLineIndices } = reconstructPageMath(lines, vectors, width, height);

            rawPagesData.push({
              index: pageIndex,
              pageIndex,
              pageNumber,
              bounds,
              width,
              height,
              lines,
              vectors,
              rules,
              links,
              rasterImages: pageImages,
              mathItems,
              claimedLineIndices
            });
          } finally {
            try {
              page.destroy();
            } catch {}
          }
        }

        // Build document destinations across target pages (with fallback to bibliography entries if native links missing)
        const allPagesLines = new Map(rawPagesData.map(p => [p.index, p.lines]));
        const documentDestinations = enableLinks
          ? buildDocumentDestinations(doc, targetIndices, allPagesLines)
          : new Map();

        // Index known numbered citation anchors for fallback weaving
        const knownCitations = new Map();
        for (const list of documentDestinations.values()) {
          for (const d of list) {
            if (d.id.startsWith('cite-')) {
              const numKey = d.id.replace('cite-', '');
              knownCitations.set(numKey, `#${d.id}`);
            }
          }
        }

      // Optional image and figure extraction reusing preloaded page data
      let imageExtractionResult = null;
      if (shouldExtractImages) {
        let imagesDir = null;
        let linkPrefix = '';

        if (typeof extractImagesOption === 'object' && extractImagesOption !== null) {
          imagesDir = extractImagesOption.dir || null;
          linkPrefix = extractImagesOption.linkPrefix !== undefined
            ? extractImagesOption.linkPrefix
            : (imagesDir ? path.basename(imagesDir) : 'assets');
        } else if (extractImagesOption === true) {
          if (typeof input === 'string') {
            const parsedPath = path.parse(path.resolve(process.cwd(), input));
            imagesDir = path.join(parsedPath.dir, `${parsedPath.name}_assets`);
            linkPrefix = `${parsedPath.name}_assets`;
          } else {
            imagesDir = path.resolve(process.cwd(), 'document_assets');
            linkPrefix = 'document_assets';
          }
        }

        imageExtractionResult = await extractPdfImages(input, {
          pages: pageRangeStr,
          dir: imagesDir,
          linkPrefix,
          scale: options.imageScale || 2.0,
          pagesData: rawPagesData
        });
      }

      // 2. Filter out recurring margin rules (running headers / footers)
      const contentRulesByPage = stripRepeatedLines
        ? filterContentRules(rawPagesData)
        : new Map(rawPagesData.map(p => [p.index, p.rules]));

      // Calculate global body font mode across all lines in the document
      const allLines = rawPagesData.flatMap(p => p.lines);
      const bodyMode = calculateBodyFontSizeMode(allLines);

      const documentMarkdownBlocks = [];
      const claimedAnchorIds = new Set();
      let totalTablesCount = 0;

      // 3. Process each page: Extract tables, resolve reading flow, and apply typography
      for (let i = 0; i < rawPagesData.length; i++) {
        const pData = rawPagesData[i];
        const validRules = contentRulesByPage.get(pData.index) || [];

        // Extract tables
        let pageTables = [];
        if (enableTables) {
          pageTables = reconstructTables(validRules, pData.lines, pData.width, pData.height);
          totalTablesCount += pageTables.length;
        }

        // Pre-group links by line to eliminate vertical bounding-box overlap on tightly spaced text
        const pageLinksByLine = enableLinks ? groupLinksByLine(pData.lines, pData.links) : new Map();

        // Extracted images and figures for this page
        const pageImages = (imageExtractionResult?.byPage.get(pData.pageNumber)) || [];

        // Set of lines claimed by tables, figures, and math so they are not duplicated in prose
        const mathItems = pData.mathItems || [];
        const claimedLineIndices = pData.claimedLineIndices || new Set();

        const claimedLines = new Set([
          ...pageTables.flatMap(t => t.linesInside),
          ...pageImages.flatMap(img => img.insideLines || []),
          ...Array.from(claimedLineIndices).map(idx => pData.lines[idx])
        ]);

        // Remaining prose lines (filtering out vertical running margin lines like arXiv side banners)
        const proseLines = pData.lines.filter(l => {
          if (claimedLines.has(l)) return false;
          if (stripRepeatedLines && l.left < 45 && l.height > l.width * 2) return false;
          return true;
        });

        // Combine prose blocks, table regions, image/figure blocks, and math items into unified reading order blocks
        const blocksToOrder = [
          ...proseLines.map(l => ({
            bbox: { x: l.left, y: l.top, w: l.width, h: l.height },
            type: 'line',
            data: l
          })),
          ...pageTables.map(t => ({
            bbox: {
              x: t.bbox[0],
              y: t.bbox[1],
              w: t.bbox[2] - t.bbox[0],
              h: t.bbox[3] - t.bbox[1]
            },
            type: 'table',
            data: t
          })),
          ...pageImages.map(img => ({
            bbox: {
              x: img.bbox[0],
              y: img.bbox[1],
              w: img.bbox[2] - img.bbox[0],
              h: img.bbox[3] - img.bbox[1]
            },
            type: 'image',
            data: img
          })),
          ...mathItems.map(m => ({
            bbox: {
              x: m.bbox[0],
              y: m.bbox[1],
              w: m.bbox[2] - m.bbox[0],
              h: m.bbox[3] - m.bbox[1]
            },
            type: 'math',
            data: m
          }))
        ];

        // Spatially order all items preserving multi-column reading flow
        const contentItems = recursiveXyCut(blocksToOrder, 0, 0, pData.width, pData.height);

        // Build markdown for this page
        const pageMarkdownParts = [];
        let currentParagraph = [];
        let currentList = [];
        let lastLine = null;

        function joinParagraphLines(lines) {
          let result = '';
          for (let j = 0; j < lines.length; j++) {
            const lineText = lines[j];
            if (j === 0) {
              result = lineText;
              continue;
            }
            // De-hyphenate if previous line ended with a hyphen and next line starts with lowercase
            if (/(\p{L}+)-$/u.test(result) && /^\p{Ll}/u.test(lineText)) {
              result = result.slice(0, -1) + lineText;
            } else {
              result += ' ' + lineText;
            }
          }
          return result;
        }

        function flushParagraph() {
          if (currentParagraph.length > 0) {
            pageMarkdownParts.push(joinParagraphLines(currentParagraph));
            currentParagraph = [];
          }
        }

        function flushList() {
          if (currentList.length > 0) {
            pageMarkdownParts.push(currentList.join('\n'));
            currentList = [];
          }
        }

        function flushAll() {
          flushParagraph();
          flushList();
        }

        for (const item of contentItems) {
          if (item.type === 'table') {
            flushAll();
            lastLine = null;
            const tableMatch = (item.data.markdown || '').match(/\bTable\s+([A-Z]?\d+(?:[.-]\d+)*[a-z]?)/i);
            let tableAnchor = '';
            if (tableMatch) {
              const tId = `table-${tableMatch[1].replace(/[\.:%]/g, '-').toLowerCase()}`;
              if (!claimedAnchorIds.has(tId)) {
                claimedAnchorIds.add(tId);
                tableAnchor = `<a id="${tId}"></a>\n\n`;
              }
            }
            pageMarkdownParts.push(tableAnchor + item.data.markdown);
          } else if (item.type === 'math') {
            flushAll();
            lastLine = null;
            pageMarkdownParts.push(item.data.markdown);
          } else if (item.type === 'image') {
            flushAll();
            lastLine = null;
            const img = item.data;
            let figAnchor = '';
            if (img.caption) {
              const figMatch = img.caption.match(/\b(?:Figure|Fig\.)\s+([A-Z]?\d+(?:[.-]\d+)*[a-z]?)/i);
              if (figMatch) {
                const fId = `figure-${figMatch[1].replace(/[\.:%]/g, '-').toLowerCase()}`;
                if (!claimedAnchorIds.has(fId)) {
                  claimedAnchorIds.add(fId);
                  figAnchor = `<a id="${fId}"></a>`;
                }
              }
            }
            const safeLink = /\s/.test(img.link) ? `<${img.link}>` : img.link;
            pageMarkdownParts.push(`![${img.alt}](${safeLink})`);
            if (img.caption) {
              pageMarkdownParts.push(`> ${figAnchor}**${img.caption}**`);
            } else if (figAnchor) {
              pageMarkdownParts.push(figAnchor);
            }
          } else {
            const line = item.data;
            const pageDests = documentDestinations.get(pData.index) || [];
            const anchorTag = enableLinks ? findDestinationAnchors(line, pageDests, claimedAnchorIds) : '';
            const lineLinks = enableLinks ? (pageLinksByLine.get(line) || []) : [];
            const formattedText = enableLinks ? applyLinksToLine(line, lineLinks, { knownCitations }) : line.text;
            const text = (anchorTag + formattedText).trim();
            if (!text) continue;

            const role = classifyTypography(line, bodyMode, pData.height, pData.pageIndex);

            if (role === 'margin_artifact') {
              continue;
            }

            if (role === 'title') {
              flushAll();
              pageMarkdownParts.push(`# ${text}`);
              lastLine = null;
            } else if (role === 'h1') {
              flushAll();
              let secAnchor = '';
              const secMatch = line.text.trim().match(/^(\d+(?:\.\d+)*)\.?\s+/);
              if (secMatch) {
                const secId = `section-${secMatch[1].replace(/\./g, '-')}`;
                if (!claimedAnchorIds.has(secId)) {
                  claimedAnchorIds.add(secId);
                  secAnchor = `<a id="${secId}"></a>`;
                }
              }
              pageMarkdownParts.push(`## ${secAnchor}${text}`);
              lastLine = null;
            } else if (role === 'h2') {
              flushAll();
              let secAnchor = '';
              const secMatch = line.text.trim().match(/^(\d+(?:\.\d+)*)\.?\s+/);
              if (secMatch) {
                const prefix = secMatch[1].includes('.') ? 'subsection' : 'section';
                const secId = `${prefix}-${secMatch[1].replace(/\./g, '-')}`;
                if (!claimedAnchorIds.has(secId)) {
                  claimedAnchorIds.add(secId);
                  secAnchor = `<a id="${secId}"></a>`;
                }
              }
              pageMarkdownParts.push(`### ${secAnchor}${text}`);
              lastLine = null;
            } else if (role === 'h3') {
              flushAll();
              let secAnchor = '';
              const secMatch = line.text.trim().match(/^(\d+(?:\.\d+)*)\.?\s+/);
              if (secMatch) {
                const secId = `subsubsection-${secMatch[1].replace(/\./g, '-')}`;
                if (!claimedAnchorIds.has(secId)) {
                  claimedAnchorIds.add(secId);
                  secAnchor = `<a id="${secId}"></a>`;
                }
              }
              pageMarkdownParts.push(`#### ${secAnchor}${text}`);
              lastLine = null;
            } else if (role === 'h4') {
              flushAll();
              pageMarkdownParts.push(`##### ${text}`);
              lastLine = null;
            } else if (role === 'caption') {
              flushAll();
              let captionAnchor = '';
              const tableMatch = text.match(/\bTable\s+([A-Z]?\d+(?:[.-]\d+)*[a-z]?)/i);
              const figMatch = !tableMatch ? text.match(/\b(?:Figure|Fig\.)\s+([A-Z]?\d+(?:[.-]\d+)*[a-z]?)/i) : null;
              if (tableMatch) {
                const tId = `table-${tableMatch[1].replace(/[\.:%]/g, '-').toLowerCase()}`;
                if (!claimedAnchorIds.has(tId)) {
                  claimedAnchorIds.add(tId);
                  captionAnchor = `<a id="${tId}"></a>`;
                }
              } else if (figMatch) {
                const fId = `figure-${figMatch[1].replace(/[\.:%]/g, '-').toLowerCase()}`;
                if (!claimedAnchorIds.has(fId)) {
                  claimedAnchorIds.add(fId);
                  captionAnchor = `<a id="${fId}"></a>`;
                }
              }
              pageMarkdownParts.push(`> ${captionAnchor}**${text}**`);
              lastLine = null;
            } else if (role === 'footnote') {
              flushAll();
              pageMarkdownParts.push(`*${text}*`);
              lastLine = null;
            } else {
              // Standard body line or list item
              const isListItem = /^[-*•]\s+/.test(text) || /^\d+\.\s+/.test(text);

              if (isListItem) {
                flushParagraph();
                const normalizedItem = text.replace(/^[•*]\s+/, '- ');
                currentList.push(normalizedItem);
                lastLine = null;
              } else {
                flushList();

                // Check if vertical gap, preceding colon, or column switch indicates a paragraph break
                const lineBottom = lastLine ? (lastLine.bottom || (lastLine.top + lastLine.height)) : null;
                const lineGap = (lastLine && lineBottom !== null) ? (line.top - lineBottom) : 0;
                const isSignificantGap = lastLine && lineGap > Math.max(6, bodyMode * 0.5);
                const prevEndedWithColon = lastLine && (lastLine.text || '').trim().endsWith(':');
                const isColumnSwitch = lastLine && (line.top < lastLine.top - 10 || Math.abs(line.left - lastLine.left) > pData.width * 0.25);

                if (isSignificantGap || prevEndedWithColon || isColumnSwitch) {
                  flushParagraph();
                }

                currentParagraph.push(text);
                lastLine = line;
              }
            }
          }
        }

        flushAll();

        if (pageMarkdownParts.length > 0) {
          documentMarkdownBlocks.push(pageMarkdownParts.join('\n\n'));
        }
      }

      const rawDocumentMarkdown = documentMarkdownBlocks.join('\n\n');

      // 4. Normalize through Unified / Remark AST
      const normalizedMarkdown = await normalizeMarkdown(rawDocumentMarkdown);

      return {
        markdown: normalizedMarkdown,
        totalPages,
        pagesProcessed: targetIndices.length,
        tablesCount: totalTablesCount,
        imagesCount: imageExtractionResult ? imageExtractionResult.assets.length : 0,
        assets: imageExtractionResult ? imageExtractionResult.assets : [],
        durationMs: Date.now() - startTime
      };
    } finally {
      // Pages are destroyed immediately during pass 1
    }
  } finally {
    try {
      doc.destroy();
    } catch {}
  }
}
