/**
 * @file src/utils/image-extractor.js
 * @description Native WebAssembly image extractor for embedded PDF figures and diagrams.
 * Extracts high-resolution figures from PDF XObjects, saving them to the companion assets folder
 * or encoding as Data URIs.
 * Part of paper-drift - https://github.com/Sooriya04/Paper-Drift
 */

import fs from 'fs';
import path from 'path';

/**
 * Extracts embedded raster images (figures, diagrams, photos) from a PDF page's XObjects.
 *
 * @param {Object} doc - MuPDF document instance
 * @param {Object} page - MuPDF page instance
 * @param {number} pageNumber - 1-indexed page number
 * @param {string|null} [assetsDir=null] - Filesystem destination directory for image files
 * @param {string|null} [assetsPath=null] - Relative path prefix for markdown / html links
 * @returns {Array<{ name: string, filename: string, src: string, width: number, height: number, diskPath: string|null }>}
 */
export function extractPageImages(doc, page, pageNumber, assetsDir = null, assetsPath = null) {
  const images = [];
  try {
    const pageObj = page.getObject();
    if (!pageObj || pageObj.isNull()) return images;

    const resources = pageObj.getInheritable('Resources');
    if (!resources || resources.isNull()) return images;

    const xobject = resources.get('XObject');
    if (!xobject || xobject.isNull() || !xobject.isDictionary()) return images;

    let imgIndex = 1;
    xobject.forEach((val, key) => {
      try {
        const subtype = val.get('Subtype');
        if (subtype && subtype.asName() === 'Image') {
          const image = doc.loadImage(val);
          const pixmap = image.toPixmap();
          const w = pixmap.getWidth();
          const h = pixmap.getHeight();

          // Filter out tiny icons, spacers, tracking pixels, or single-color lines (< 40x40)
          if (w >= 40 && h >= 40) {
            const pngBuffer = Buffer.from(pixmap.asPNG());
            const filename = `figure-p${pageNumber}-${imgIndex}.png`;
            let diskPath = null;
            let srcUrl = null;

            if (assetsDir) {
              fs.mkdirSync(assetsDir, { recursive: true });
              diskPath = path.join(assetsDir, filename);
              fs.writeFileSync(diskPath, pngBuffer);
              const relPrefix = assetsPath !== undefined && assetsPath !== null
                ? assetsPath.replace(/\/$/, '')
                : `./${path.basename(assetsDir)}`;
              srcUrl = `${relPrefix}/${filename}`;
            } else {
              srcUrl = `data:image/png;base64,${pngBuffer.toString('base64')}`;
            }

            images.push({
              name: String(key),
              filename,
              width: w,
              height: h,
              src: srcUrl,
              diskPath
            });
            imgIndex++;
          }
        }
      } catch (e) {
        // Continue if an individual XObject fails
      }
    });
  } catch (err) {
    // Graceful fallback
  }

  return images;
}
