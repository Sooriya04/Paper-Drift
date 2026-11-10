import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { downloadPaper, TOP_20_PAPERS } from './benchmark-papers.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const BENCHMARKS_DIR = path.resolve(__dirname, '../fixtures/benchmarks');

fs.mkdirSync(BENCHMARKS_DIR, { recursive: true });

// Ensure minimum regression fixtures used by unit tests exist
const requiredPapers = [
  TOP_20_PAPERS[0], // Attention
  TOP_20_PAPERS[1], // ResNet
  TOP_20_PAPERS[2], // LoRA
  TOP_20_PAPERS[4]  // GAN
];

console.log('Checking required test fixtures...');
for (const paper of requiredPapers) {
  const pPath = path.join(BENCHMARKS_DIR, `${paper.slug}.pdf`);
  if (!fs.existsSync(pPath) || fs.statSync(pPath).size < 10000) {
    console.log(`Downloading fixture for ${paper.slug}...`);
    try {
      downloadPaper(paper);
    } catch (err) {
      console.warn(`Could not download ${paper.slug}: ${err.message}`);
    }
  }
}
console.log('Fixture verification complete.');
