/**
 * @file src/vectors/walker.js
 * @description Low-level WebAssembly MuPDF vector and structured text walker.
 * Extracts physical vector paths, lines, font metrics, and bounding boxes in a single pass.
 * Part of paper-drift - https://github.com/Sooriya04/Paper-Drift
 */

/**
 * Extracts text lines, font metrics, and vector paths from a MuPDF page using structured-text walking.
 *
 * @param {Object} page - MuPDF Page instance
 * @returns {{ lines: Array<Object>, vectors: Array<Object> }}
 */
export function extractPageVectorsAndText(page) {
  const lines = [];
  const vectors = [];
  let currentLine = null;

  if (!page) {
    return { lines, vectors };
  }

  try {
    const st = typeof page.toStructuredText === 'function' ? page.toStructuredText('vectors') : null;
    if (!st || typeof st.walk !== 'function') {
      throw new Error('StructuredText walking not available');
    }

    st.walk({
      beginLine(bbox) {
        const left = Array.isArray(bbox) ? Math.min(bbox[0], bbox[2]) : 0;
        const top = Array.isArray(bbox) ? Math.min(bbox[1], bbox[3]) : 0;
        const right = Array.isArray(bbox) ? Math.max(bbox[0], bbox[2]) : 0;
        const bottom = Array.isArray(bbox) ? Math.max(bbox[1], bbox[3]) : 0;

        currentLine = {
          bbox: [left, top, right, bottom],
          left,
          top,
          right,
          bottom,
          width: right - left,
          height: bottom - top,
          text: '',
          font: null,
          charCount: 0
        };
      },
      onChar(char, origin, font, size) {
        if (currentLine) {
          currentLine.text += char;
          currentLine.charCount++;
          if (!currentLine.font && font) {
            const fontName = typeof font.getName === 'function' ? font.getName() : 'unknown';
            const isBold = typeof font.isBold === 'function' ? Boolean(font.isBold()) : false;
            const isItalic = typeof font.isItalic === 'function' ? Boolean(font.isItalic()) : false;
            const isMono = typeof font.isMono === 'function' ? Boolean(font.isMono()) : false;
            const isSerif = typeof font.isSerif === 'function' ? Boolean(font.isSerif()) : false;
            const fontSize = size || (currentLine.bottom - currentLine.top);

            currentLine.font = {
              name: fontName,
              size: fontSize,
              isBold,
              isItalic,
              isMono,
              isSerif,
              flags: {
                isBold,
                isItalic,
                isMono,
                isSerif
              }
            };
          }
        }
      },
      endLine() {
        if (currentLine && currentLine.text.trim()) {
          if (!currentLine.font) {
            const fontSize = currentLine.bottom - currentLine.top;
            currentLine.font = {
              name: 'unknown',
              size: fontSize,
              isBold: false,
              isItalic: false,
              isMono: false,
              isSerif: false,
              flags: {
                isBold: false,
                isItalic: false,
                isMono: false,
                isSerif: false
              }
            };
          }
          lines.push(currentLine);
        }
        currentLine = null;
      },
      onVector(bbox, flags, color) {
        if (bbox && bbox.length >= 4) {
          const left = Math.min(bbox[0], bbox[2]);
          const top = Math.min(bbox[1], bbox[3]);
          const right = Math.max(bbox[0], bbox[2]);
          const bottom = Math.max(bbox[1], bbox[3]);
          vectors.push({
            bbox: [left, top, right, bottom],
            flags: flags ? { ...flags } : {},
            color: color || null
          });
        }
      }
    });
  } catch (err) {
    // Safe fallback if vector walk fails
    try {
      if (typeof page.toStructuredText === 'function') {
        const st = page.toStructuredText();
        const stJson = JSON.parse(st.asJSON());
        for (const block of stJson.blocks || []) {
          for (const line of block.lines || []) {
            const rawBbox = line.bbox || [line.x || 0, line.y || 0, (line.x || 0) + (line.w || 100), (line.y || 0) + (line.h || 12)];
            const left = Math.min(rawBbox[0], rawBbox[2]);
            const top = Math.min(rawBbox[1], rawBbox[3]);
            const right = Math.max(rawBbox[0], rawBbox[2]);
            const bottom = Math.max(rawBbox[1], rawBbox[3]);
            const text = line.text || (line.spans ? line.spans.map(s => s.text).join('') : '');

            if (!text.trim()) continue;

            const fontName = line.font?.name || line.font?.family || 'unknown';
            const fontSize = line.font?.size || (bottom - top);
            const isBold = Boolean(line.font?.isBold || (line.font?.weight && line.font.weight >= 700));
            const isItalic = Boolean(line.font?.isItalic || line.font?.style === 'italic');
            const isMono = Boolean(line.font?.isMono || line.font?.mono);
            const isSerif = Boolean(line.font?.isSerif || line.font?.serif);

            lines.push({
              bbox: [left, top, right, bottom],
              left,
              top,
              right,
              bottom,
              width: right - left,
              height: bottom - top,
              text,
              font: {
                name: fontName,
                size: fontSize,
                isBold,
                isItalic,
                isMono,
                isSerif,
                flags: {
                  isBold,
                  isItalic,
                  isMono,
                  isSerif
                }
              },
              charCount: text.length
            });
          }
        }
      }
    } catch {
      // Safe fallback error suppressed
    }
  }

  return { lines, vectors };
}
