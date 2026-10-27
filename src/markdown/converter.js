/**
 * @file src/markdown/converter.js
 * @description Direct WebAssembly PDF to GitHub Flavored Markdown (GFM) conversion engine.
 * Converts academic papers and enterprise documents directly into clean, token-efficient Markdown
 * with spatial reading order, GFM pipe tables, LaTeX math restoration, and typography detection.
 * Part of paper-drift - https://github.com/Sooriya04/Paper-Drift
 */

import mupdf from 'mupdf';
import fs from 'fs';
import path from 'path';
import { parsePageRange } from '../converter.js';
import { resolveReadingOrder } from '../spatial/reading-order.js';
import { reconstructTableFromLines } from '../tables/reconstructor.js';
import { mapUnicodeToLatex, normalizeMathIndices, formatInlineMath, restoreBlockMath } from '../math/index.js';
import { extractPageImages } from '../utils/image-extractor.js';

/**
 * Converts a structured page JSON representation into clean, structured Markdown.
 *
 * @param {Object} pageJson - Parsed JSON from `page.toStructuredText().asJSON()`
 * @param {number} widthPt - Page width in points
 * @param {number} heightPt - Page height in points
 * @param {Object} [options={}]
 * @param {Array<Object>} [pageImages=[]] - Extracted images available on this page
 * @returns {{ markdown: string, tablesCount: number, headingsCount: number }}
 */
export function pageToMarkdown(pageJson, widthPt, heightPt, options = {}, pageImages = []) {
  const spatial = resolveReadingOrder(pageJson, widthPt, heightPt);
  const blocks = spatial.blocks || [];
  const remainingImages = [...pageImages];

  if (blocks.length === 0) {
    let emptyMd = '';
    for (const img of remainingImages) {
      emptyMd += `![Figure](${img.src})\n\n`;
    }
    return { markdown: emptyMd.trim(), tablesCount: 0, headingsCount: 0 };
  }

  // Calculate median body font size across all lines on this page
  const fontSizes = [];
  for (const b of blocks) {
    for (const l of (b.lines || [])) {
      if (l.font?.size) fontSizes.push(l.font.size);
    }
  }
  fontSizes.sort((a, b) => a - b);
  const medianFontSize = fontSizes.length > 0 ? fontSizes[Math.floor(fontSizes.length / 2)] : 10.0;

  const mdSections = [];
  let tablesCount = 0;
  let headingsCount = 0;

  let i = 0;
  while (i < blocks.length) {
    const block = blocks[i];
    const lines = block.lines || [];
    if (lines.length === 0) {
      i++;
      continue;
    }

    let blockText = lines.map(l => l.text).join(' ').trim();

    // Rejoin soft line-wrap hyphens: "transduc- tion" -> "transduction"
    blockText = blockText.replace(/(\w+)-\s+(\w+)/g, (match, w1, w2) => {
      if (/^(non|multi|pre|post|semi|self|cross|re)$/i.test(w1)) {
        return `${w1}-${w2}`;
      }
      return `${w1}${w2}`;
    });

    // Strip isolated running page numbers at the bottom of the page
    if (/^\d+$/.test(blockText) && block.bbox.y > heightPt - 70) {
      i++;
      continue;
    }

    // Strip header metadata / arXiv timestamp banner at the very top of page 1
    if (block.bbox.y < 50 && (/^arXiv:\d+\.\d+/i.test(blockText) || /^\d+\s*\[[a-zA-Z.-]+\]/i.test(blockText))) {
      i++;
      continue;
    }

    // Strip conference / journal running footer banner
    if (block.bbox.y > heightPt - 60 && /Conference on Neural Information|IEEE|ACM|Proceedings|Transactions/i.test(blockText)) {
      i++;
      continue;
    }

    // 1. Check for Figure Caption (e.g. "Figure 1: ...", "Figure 2. ...", "Fig. 1: ...")
    if (/^(Figure|Fig\.|FIGURE)\s+([0-9]+|[IVXLCDM]+)[:.]/i.test(blockText)) {
      if (remainingImages.length > 0) {
        const img = remainingImages.shift();
        mdSections.push(`![${blockText}](${img.src})`);
      }
      mdSections.push(`**${blockText}**`);
      i++;
      continue;
    }

    // 2. Check for Table Caption (e.g. "Table 1: ...", "Table 2. ...", "TABLE I: ...")
    if (/^(Table|TABLE)\s+([0-9]+|[IVXLCDM]+)[:.]/i.test(blockText)) {
      mdSections.push(`**${blockText}**`);

      // Look ahead to collect consecutive table rows/blocks directly beneath this caption
      const tableLines = [];
      let j = i + 1;
      let lastBlockBottom = block.bbox.y + block.bbox.h;

      while (j < blocks.length) {
        const nextB = blocks[j];
        const nextLines = nextB.lines || [];
        if (nextLines.length === 0) { j++; continue; }

        const nextText = nextLines.map(l => l.text).join(' ').trim();
        const isParagraph = nextText.split(/\s+/).length > 16 && /[.!?]$/.test(nextText);
        if (isParagraph) {
          break;
        }

        const gap = nextB.bbox.y - lastBlockBottom;
        if (tableLines.length > 0 && gap > 45) {
          break;
        }

        tableLines.push(...nextLines);
        lastBlockBottom = Math.max(lastBlockBottom, nextB.bbox.y + nextB.bbox.h);
        j++;
      }

      if (tableLines.length >= 4) {
        const tableMd = reconstructTableFromLines(tableLines);
        if (tableMd) {
          mdSections.push(tableMd);
          tablesCount++;
          i = j;
          continue;
        }
      }

      i++;
      continue;
    }

    // 3. Check for Table Grid within a single block
    if (lines.length >= 4 && !lines.some(l => (l.bbox?.w || 0) > 250 && (l.text || '').split(' ').length > 8)) {
      const tableMd = reconstructTableFromLines(lines);
      if (tableMd) {
        mdSections.push(tableMd);
        tablesCount++;
        i++;
        continue;
      }
    }

    // 4. Check for Display Math Equations (e.g. Attention, Softmax, PE, or equation tags)
    const wordCount = blockText.split(/\s+/).length;
    const isProseNarrative = wordCount > 16 || (wordCount > 7 && /\b(the|we|in|this|that|which|and|with|for|are|our|using|from|while|when|between|these|those|also|each|other|same)\b/i.test(blockText));

    const mathCheck = !isProseNarrative && restoreBlockMath(block);
    const hasMathOperators = !isProseNarrative && (
      (mathCheck && mathCheck.isMath) ||
      /=\s*(sin|cos|tan|softmax|exp|\sum|\int|arg|Attention|Concat|MultiHead|FFN|max)/i.test(blockText) ||
      /PE\(/i.test(blockText) ||
      (/\(\d+(\.\d+)?\)$/.test(blockText) && /[=+\-·×/]/.test(blockText))
    );

    if (hasMathOperators) {
      // Lookahead: check if consecutive blocks form a compound equation (e.g. numerator + denominator + tag)
      let combinedEquation = blockText;
      let j = i + 1;

      while (j < blocks.length) {
        const nextB = blocks[j];
        const nextText = (nextB.lines || []).map(l => l.text).join(' ').trim();
        const nextWordCount = nextText.split(/\s+/).length;
        const nextIsProse = nextWordCount > 10 && /\b(the|we|in|this|that|which|and|has|mean|variance)\b/i.test(nextText);
        if (nextIsProse) break;

        const yGap = nextB.bbox.y - (block.bbox.y + block.bbox.h);
        const hasOpenParen = (combinedEquation.split('(').length > combinedEquation.split(')').length);

        // If next block is close vertically (<= 25pt) and contains formula components or closing equation tag
        if (yGap <= 25 && (
          hasOpenParen ||
          nextText.startsWith('√') ||
          nextText.startsWith('/') ||
          /^\)[A-Za-z0-9\s()]*\(\d+\)$/.test(nextText) ||
          /^\(\d+(\.\d+)?\)$/.test(nextText)
        )) {
          if (nextText.startsWith('√')) {
            combinedEquation += ` / ${nextText}`;
          } else {
            combinedEquation += ` ${nextText}`;
          }
          j++;
        } else {
          break;
        }
      }

      // Reconstruct equation into standard LaTeX
      let formulaText = mapUnicodeToLatex(combinedEquation);
      formulaText = formulaText.replace(/\((\d+(\.\d+)?)\)\s*$/, '\\tag{$1}');

      // Clean square roots, variables, and matrix transpose
      formulaText = formulaText.replace(/\\?sqrt\s*\{?([a-zA-Z0-9_{}]+)\}?/g, '\\sqrt{$1}');
      formulaText = normalizeMathIndices(formulaText);
      formulaText = formulaText.replace(/\\sqrt\{([a-zA-Z0-9]+)_\{([a-zA-Z0-9]+)\}\}/g, '\\sqrt{$1_$2}');
      formulaText = formulaText.replace(/\\sqrt\{\{?([a-zA-Z0-9_]+)\}?\}/g, '\\sqrt{$1}');
      formulaText = formulaText.replace(/\bQKT\b/g, 'Q K^T');
      formulaText = formulaText.replace(/\bwhere\s+head\s*i\b/gi, '\\text{where } \\text{head}_i');
      formulaText = formulaText.replace(/\bwhere\s+\\text\{head\}/gi, '\\text{where } \\text{head}');
      formulaText = formulaText.replace(/\bQW\s*Q\s*i\b/g, 'Q W_i^Q');
      formulaText = formulaText.replace(/\bKW\s*K\s*i\b/g, 'K W_i^K');
      formulaText = formulaText.replace(/\bVW\s*V\s*i\b/g, 'V W_i^V');
      formulaText = formulaText.replace(/\b([Ww])\s*([QKV])\s*([i-k0-9])/g, '$1_$3^$2');
      formulaText = formulaText.replace(/\b([QKV])\s*([Ww])/g, '$1 $2');
      formulaText = formulaText.replace(/\bMultiHead\s*\(/g, '\\text{MultiHead}(');
      formulaText = formulaText.replace(/\bConcat\s*\(/g, '\\text{Concat}(');
      formulaText = formulaText.replace(/\bhead([0-9a-zA-Z]+)\b/g, '\\text{head}_{$1}');
      formulaText = formulaText.replace(/\bW\s*O\b/g, 'W^O');
      formulaText = formulaText.replace(/\bFFN\s*\(/g, '\\text{FFN}(');
      formulaText = formulaText.replace(/\bmax\s*\(/g, '\\max(');
      formulaText = formulaText.replace(/\bPE\((pos,\s*[0-9a-zA-Z+]+)\)/g, (m, args) => `\\text{PE}_{(${args})}`);
      formulaText = formulaText.replace(/pos\s*\/\s*10000\s*2\s*i\s*\/\s*d(model|_\{?\\?text\{model\}\}?)/gi, '\\frac{pos}{10000^{2i / d_{\\text{model}}}}');
      formulaText = formulaText.replace(/\bsin\s*\(/g, '\\sin\\left(');
      formulaText = formulaText.replace(/\bcos\s*\(/g, '\\cos\\left(');

      // Reconstruct fractions: A / \sqrt{B} or A / B -> \frac{A}{B}
      formulaText = formulaText.replace(/([A-Za-z0-9^_{}\s]+?)\s*\/\s*(\\sqrt\{[a-zA-Z0-9_{}]+\}|[A-Za-z0-9_{}]+)/g, (match, num, den) => {
        if (!num.includes('=') && !num.includes('(') && !num.includes('\\frac') && !num.includes('{') && num.trim().length <= 25) {
          return `\\frac{${num.trim()}}{${den.trim()}}`;
        }
        return match;
      });

      formulaText = formulaText.replace(/\bsoftmax\s*\((.*?)\)/gi, '\\text{softmax}\\left($1\\right)');
      formulaText = formulaText.replace(/\bAttention\s*\(/gi, '\\text{Attention}(');
      formulaText = formulaText.replace(/\\right\)\s*([A-Za-z])/g, '\\right) $1');
      formulaText = formulaText.replace(/=\s*\\(sin|cos)\\left\((.*?)\)\s*$/, '= \\$1\\left($2\\right)');

      mdSections.push(`$$\n${formulaText.trim()}\n$$`);
      i = j;
      continue;
    }

    // 5. Check for Document Typography & Headings
    const firstLine = lines[0];
    const fontSize = firstLine.font?.size || medianFontSize;
    const isBold = firstLine.font?.weight >= 700 || /bold/i.test(firstLine.font?.family || '');
    const isNumberedHeading = /^(\d+(\.\d+)*)\s+[A-Z]/.test(blockText);
    const isShortTitle = blockText.length <= 80 && wordCount <= 12 && !/[.!?]$/.test(blockText);
    const isWatermarkOrMargin = /^arXiv:\d+\.\d+/i.test(blockText) || /^\d+\s*\[[a-zA-Z.-]+\]/i.test(blockText);

    if (isWatermarkOrMargin) {
      i++;
      continue;
    }

    if (fontSize >= medianFontSize * 1.45 && isShortTitle) {
      mdSections.push(`# ${blockText}`);
      headingsCount++;
    } else if ((fontSize >= medianFontSize * 1.15 && isShortTitle) || isNumberedHeading) {
      mdSections.push(`## ${blockText}`);
      headingsCount++;
    } else if (fontSize >= medianFontSize * 1.05 && isBold && isShortTitle) {
      mdSections.push(`### ${blockText}`);
      headingsCount++;
    } else if (/^[•–\-*]\s+/.test(blockText)) {
      // Unordered list item with inline math support
      const cleanedItem = blockText.replace(/^[•–\-*]\s+/, '');
      mdSections.push(`- ${formatInlineMath(cleanedItem)}`);
    } else {
      // 6. Standard body paragraph with inline LaTeX math restoration
      let formattedPara = lines
        .map(l => l.text)
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim();

      // Rejoin soft line-wrap hyphens: "transduc- tion" -> "transduction"
      formattedPara = formattedPara.replace(/(\w+)-\s+(\w+)/g, (match, w1, w2) => {
        if (/^(non|multi|pre|post|semi|self|cross|re)$/i.test(w1)) {
          return `${w1}-${w2}`;
        }
        return `${w1}${w2}`;
      });

      if (formattedPara) {
        const withMath = formatInlineMath(formattedPara);
        const prev = mdSections[mdSections.length - 1];
        // If previous section was a prose paragraph without terminal punctuation, and current line starts with lowercase or continuation
        if (
          prev &&
          !prev.startsWith('#') &&
          !prev.startsWith('|') &&
          !prev.startsWith('$$') &&
          !prev.startsWith('!') &&
          !prev.startsWith('**') &&
          !prev.startsWith('-') &&
          !/[.!?:]\s*$/.test(prev) &&
          /^[a-z(]/.test(formattedPara)
        ) {
          mdSections[mdSections.length - 1] = `${prev} ${withMath}`;
        } else {
          mdSections.push(withMath);
        }
      }
    }

    i++;
  }

  // If there are uncaptioned figures remaining on this page, append them
  while (remainingImages.length > 0) {
    const img = remainingImages.shift();
    mdSections.push(`![Figure](${img.src})`);
  }

  return {
    markdown: mdSections.join('\n\n'),
    tablesCount,
    headingsCount
  };
}

/**
 * Converts a PDF buffer or file path directly into GitHub Flavored Markdown (GFM).
 *
 * @param {string|Buffer|Uint8Array} input - File path or binary buffer of the PDF.
 * @param {Object} [options={}] - Conversion options.
 * @param {string|number[]} [options.pageRange='all'] - Page range to process (e.g. "1-5", "2,4", "all").
 * @param {function} [options.onProgress] - Optional progress callback `({ current, total, pageNumber }) => void`.
 * @returns {Promise<{ markdown: string, pages: Array<Object>, totalPages: number, pagesProcessed: number, durationMs: number }>}
 */
export async function convertPdfToMarkdown(input, options = {}) {
  const startTime = Date.now();
  const pageRangeStr = options.pages !== undefined ? options.pages : (options.pageRange || 'all');
  let effectiveAssetsDir = options.assetsDir ? path.resolve(process.cwd(), options.assetsDir) : null;
  let effectiveAssetsPath = options.assetsPath !== undefined ? options.assetsPath : null;

  if (!effectiveAssetsDir && !options.inlineImages) {
    if (options.outputFile) {
      const outParsed = path.parse(path.resolve(process.cwd(), options.outputFile));
      effectiveAssetsDir = path.join(outParsed.dir, `${outParsed.name}_assets`);
      effectiveAssetsPath = `./${outParsed.name}_assets`;
    } else if (typeof input === 'string') {
      const inParsed = path.parse(path.resolve(process.cwd(), input));
      effectiveAssetsDir = path.join(inParsed.dir, `${inParsed.name}_assets`);
      effectiveAssetsPath = `./${inParsed.name}_assets`;
    }
  }

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
  const totalPages = doc.countPages();
  const targetIndices = parsePageRange(pageRangeStr, totalPages);

  if (targetIndices.length === 0) {
    throw new Error(`No matching pages found for page range: "${pageRangeStr}" (Document has ${totalPages} pages).`);
  }

  const pagesMarkdown = [];
  const processedPages = [];

  for (let step = 0; step < targetIndices.length; step++) {
    const pageIndex = targetIndices[step];
    const pageNumber = pageIndex + 1;

    if (typeof options.onProgress === 'function') {
      options.onProgress({
        current: step + 1,
        total: targetIndices.length,
        pageNumber,
        totalPages
      });
    }

    const page = doc.loadPage(pageIndex);
    const bounds = page.getBounds();
    const widthPt = bounds[2] - bounds[0];
    const heightPt = bounds[3] - bounds[1];

    // Extract embedded figures/diagrams on this page
    const pageImages = extractPageImages(doc, page, pageNumber, effectiveAssetsDir, effectiveAssetsPath);

    const structuredText = page.toStructuredText();
    const pageJson = JSON.parse(structuredText.asJSON());

    const result = pageToMarkdown(pageJson, widthPt, heightPt, options, pageImages);

    processedPages.push({
      pageNumber,
      width: widthPt,
      height: heightPt,
      imagesCount: pageImages.length,
      tablesCount: result.tablesCount,
      headingsCount: result.headingsCount,
      markdown: result.markdown
    });

    if (result.markdown) {
      pagesMarkdown.push(result.markdown);
    }
  }

  const fullMarkdown = pagesMarkdown.join('\n\n---\n\n');

  return {
    markdown: fullMarkdown,
    pages: processedPages,
    assetsDir: effectiveAssetsDir,
    totalPages,
    pagesProcessed: targetIndices.length,
    durationMs: Date.now() - startTime
  };
}
