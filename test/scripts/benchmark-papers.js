/**
 * @file test/scripts/benchmark-papers.js
 * @description Curated catalogue and automated benchmark runner for the top 20 landmark ArXiv research papers.
 * Enables zero-git-bloat stress testing across multi-column, math-heavy, and tabular PDFs.
 * Part of paper-drift - https://github.com/Sooriya04/Paper-Drift
 */

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import { convertPdfToHtml } from '../../src/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const TOP_20_PAPERS = [
  {
    id: '1706.03762',
    slug: '01-attention-is-all-you-need',
    title: 'Attention Is All You Need (Transformers)',
    authors: 'Vaswani et al. (Google Brain)',
    year: 2017,
    focus: '2-column layout, attention matrices, LaTeX formulas'
  },
  {
    id: '1512.03385',
    slug: '02-resnet-deep-residual-learning',
    title: 'Deep Residual Learning for Image Recognition (ResNet)',
    authors: 'He et al. (Microsoft Research)',
    year: 2015,
    focus: '2-column layout, multi-tier error tables, network plots'
  },
  {
    id: '2106.09685',
    slug: '03-lora-low-rank-adaptation',
    title: 'LoRA: Low-Rank Adaptation of Large Language Models',
    authors: 'Hu et al. (Microsoft)',
    year: 2021,
    focus: 'Matrix decomposition math, equation blocks, algorithms'
  },
  {
    id: '1810.04805',
    slug: '04-bert-pretraining-transformers',
    title: 'BERT: Pre-training of Deep Bidirectional Transformers',
    authors: 'Devlin et al. (Google AI Language)',
    year: 2018,
    focus: 'Dense 2-column text, multi-task NLP benchmark tables'
  },
  {
    id: '1406.2661',
    slug: '05-gan-generative-adversarial-nets',
    title: 'Generative Adversarial Nets',
    authors: 'Goodfellow et al. (Univ. of Montreal)',
    year: 2014,
    focus: 'Min-max game theory, expectations, probability calculus'
  },
  {
    id: '1412.6980',
    slug: '06-adam-stochastic-optimization',
    title: 'Adam: A Method for Stochastic Optimization',
    authors: 'Kingma & Ba',
    year: 2014,
    focus: 'Algorithm pseudocode boxes, first/second moment equations'
  },
  {
    id: '2205.14135',
    slug: '07-flashattention-fast-memory-efficient',
    title: 'FlashAttention: Fast and Memory-Efficient Exact Attention',
    authors: 'Dao et al. (Stanford)',
    year: 2022,
    focus: 'Hardware SRAM/HBM diagrams, matrix tiling, algorithm boxes'
  },
  {
    id: '1712.01815',
    slug: '08-alphazero-general-reinforcement-learning',
    title: 'Mastering Chess and Shogi by Self-Play (AlphaZero)',
    authors: 'Silver et al. (DeepMind)',
    year: 2017,
    focus: 'Dense multi-column typography, game outcome distributions'
  },
  {
    id: '1506.02640',
    slug: '09-yolo-real-time-object-detection',
    title: 'You Only Look Once: Unified, Real-Time Object Detection',
    authors: 'Redmon et al. (Univ. of Washington)',
    year: 2015,
    focus: 'Bounding-box diagrams, detection confidence score formulas'
  },
  {
    id: '2302.13971',
    slug: '10-llama-open-foundation-models',
    title: 'LLaMA: Open and Efficient Foundation Language Models',
    authors: 'Touvron et al. (Meta AI)',
    year: 2023,
    focus: 'Modern large foundation model report, wide comparative tables'
  },
  {
    id: '2006.11239',
    slug: '11-ddpm-denoising-diffusion-probabilistic',
    title: 'Denoising Diffusion Probabilistic Models',
    authors: 'Ho et al. (UC Berkeley)',
    year: 2020,
    focus: 'Complex stochastic differential math, multi-line integrals'
  },
  {
    id: '2001.08361',
    slug: '12-scaling-laws-neural-language-models',
    title: 'Scaling Laws for Neural Language Models',
    authors: 'Kaplan et al. (OpenAI)',
    year: 2020,
    focus: 'Power-law equations, log-log scaling charts, footnotes'
  },
  {
    id: '2201.11903',
    slug: '13-chain-of-thought-prompting',
    title: 'Chain-of-Thought Prompting Elicits Reasoning in LLMs',
    authors: 'Wei et al. (Google Research, Brain Team)',
    year: 2022,
    focus: 'Highlighted conversation callouts, math word problems'
  },
  {
    id: '2305.18290',
    slug: '14-dpo-direct-preference-optimization',
    title: 'Direct Preference Optimization: Your LM is a Reward Model',
    authors: 'Rafailov et al. (Stanford)',
    year: 2023,
    focus: 'Bradley-Terry preference formulas, loss derivation proofs'
  },
  {
    id: '1812.04948',
    slug: '15-stylegan-style-based-generator',
    title: 'A Style-Based Generator Architecture for GANs (StyleGAN)',
    authors: 'Karras et al. (NVIDIA)',
    year: 2018,
    focus: 'Adaptive instance normalization, visual ablation grids'
  },
  {
    id: '2005.14165',
    slug: '16-gpt3-few-shot-learners',
    title: 'Language Models are Few-Shot Learners (GPT-3)',
    authors: 'Brown et al. (OpenAI)',
    year: 2020,
    focus: 'Long-form report (75 pages), wide benchmark appendices'
  },
  {
    id: '2212.08073',
    slug: '17-constitutional-ai-harmlessness',
    title: 'Constitutional AI: Harmlessness from AI Feedback',
    authors: 'Bai et al. (Anthropic)',
    year: 2022,
    focus: 'Critique/revision prompt blocks, safety scoring tables'
  },
  {
    id: '2010.11929',
    slug: '18-vision-transformer-vit',
    title: 'An Image is Worth 16x16 Words: Transformers for Image Recognition',
    authors: 'Dosovitskiy et al. (Google Research)',
    year: 2020,
    focus: 'Patch extraction diagrams, linear projection math'
  },
  {
    id: '2304.02643',
    slug: '19-segment-anything-sam',
    title: 'Segment Anything (SAM)',
    authors: 'Kirillov et al. (Meta AI)',
    year: 2023,
    focus: 'Interactive segmentation architectures, 2-column report'
  },
  {
    id: '2412.19437',
    slug: '20-deepseek-v3-technical-report',
    title: 'DeepSeek-V3 Technical Report',
    authors: 'DeepSeek-AI',
    year: 2024,
    focus: 'Multi-head latent attention (MLA), MoE routing formulas'
  }
];

const BENCHMARKS_DIR = path.resolve(__dirname, '../fixtures/benchmarks');
const RESULTS_DIR = path.resolve(__dirname, '../results');

/**
 * Downloads a paper via curl with proper headers and redirect handling.
 */
export function downloadPaper(paper) {
  fs.mkdirSync(BENCHMARKS_DIR, { recursive: true });
  const destPath = path.join(BENCHMARKS_DIR, `${paper.slug}.pdf`);

  if (fs.existsSync(destPath) && fs.statSync(destPath).size > 10000) {
    return destPath;
  }

  const url = `https://arxiv.org/pdf/${paper.id}.pdf`;
  const cmd = `curl -sL -A "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36" --connect-timeout 15 --max-time 60 "${url}" -o "${destPath}"`;

  execSync(cmd, { stdio: 'pipe' });

  if (!fs.existsSync(destPath) || fs.statSync(destPath).size < 10000) {
    if (fs.existsSync(destPath)) fs.unlinkSync(destPath);
    throw new Error(`Download failed or file empty for ${paper.title}`);
  }

  return destPath;
}

/**
 * Lists all 20 papers in terminal.
 */
export function listPapers() {
  console.log(`\n\x1b[1m\x1b[36mpaper-drift Top 20 Landmark Research Papers Benchmark Suite\x1b[0m\n`);

  TOP_20_PAPERS.forEach((paper, idx) => {
    console.log(`\x1b[1m${String(idx + 1).padStart(2, '0')}. [ArXiv:${paper.id}]\x1b[0m ${paper.title} (${paper.year})`);
    console.log(`    Authors: ${paper.authors}`);
    console.log(`    Layout:  \x1b[33m${paper.focus}\x1b[0m`);
    console.log(`    URL:     https://arxiv.org/pdf/${paper.id}.pdf\n`);
  });
}

/**
 * Downloads papers up to limit.
 */
export function downloadAll({ limit = 20 } = {}) {
  const selected = TOP_20_PAPERS.slice(0, limit);
  console.log(`\n\x1b[1m\x1b[36m📥 Fetching Top ${selected.length} Landmark Research Papers\x1b[0m\n`);

  let successCount = 0;
  for (let i = 0; i < selected.length; i++) {
    const paper = selected[i];
    process.stdout.write(`[${String(i + 1).padStart(2, ' ')}/${selected.length}] ArXiv:${paper.id} ${paper.title.slice(0, 45)}... `);

    try {
      const destPath = downloadPaper(paper);
      const sizeMb = (fs.statSync(destPath).size / 1024 / 1024).toFixed(2);
      console.log(`\x1b[32m✔ OK (${sizeMb} MB)\x1b[0m`);
      successCount++;
    } catch (err) {
      console.log(`\x1b[31m✖ Failed (${err.message})\x1b[0m`);
    }
  }

  console.log(`\n\x1b[32m✔ Downloaded ${successCount}/${selected.length} research papers to test/fixtures/benchmarks/ (gitignored)\x1b[0m\n`);
}

/**
 * Runs conversion benchmark on target papers.
 */
export async function runBenchmark({ limit = 5, pageRange = '1-2', scale = 1.5 } = {}) {
  const selected = TOP_20_PAPERS.slice(0, limit);
  console.log(`\n\x1b[1m\x1b[36m⚡ paper-drift Benchmark Test\x1b[0m`);
  console.log(`Benchmarking ${selected.length} papers (Pages: ${pageRange}, Scale: ${scale}x)\n`);

  fs.mkdirSync(RESULTS_DIR, { recursive: true });

  // Clean stale benchmark outputs from previous runs to prevent overlapping files
  const existingFiles = fs.readdirSync(RESULTS_DIR);
  for (const file of existingFiles) {
    if (file.endsWith('.html') || file.endsWith('.txt') || file.endsWith('.json')) {
      fs.unlinkSync(path.join(RESULTS_DIR, file));
    }
  }

  const summary = [];

  for (let i = 0; i < selected.length; i++) {
    const paper = selected[i];
    process.stdout.write(`[${String(i + 1).padStart(2, ' ')}/${selected.length}] Testing ArXiv:${paper.id} (${paper.title.slice(0, 35)})... `);

    try {
      const pdfPath = downloadPaper(paper);
      const htmlPath = path.join(RESULTS_DIR, `${paper.slug}.html`);
      const txtPath = path.join(RESULTS_DIR, `${paper.slug}.txt`);
      const jsonPath = path.join(RESULTS_DIR, `${paper.slug}.json`);

      const result = await convertPdfToHtml(pdfPath, {
        scale,
        withBg: true,
        pageRange
      });

      fs.writeFileSync(htmlPath, result.html, 'utf-8');
      fs.writeFileSync(txtPath, result.text, 'utf-8');
      fs.writeFileSync(jsonPath, JSON.stringify(result.pages, null, 2), 'utf-8');
      const outSizeKb = (fs.statSync(htmlPath).size / 1024).toFixed(1);

      console.log(`\x1b[32m✔ ${result.pagesProcessed}p in ${result.durationMs}ms (${outSizeKb} KB)\x1b[0m`);

      summary.push({
        '#': i + 1,
        'Paper': paper.title.slice(0, 35),
        'ArXiv ID': paper.id,
        'Pages': result.pagesProcessed,
        'Time (ms)': result.durationMs,
        'Size (KB)': outSizeKb
      });
    } catch (err) {
      console.log(`\x1b[31m✖ ${err.message}\x1b[0m`);
    }
  }

  console.log(`\n\x1b[1m\x1b[32m✔ Benchmark Complete! Outputs saved in test/results/ (not deleted)\x1b[0m`);
  console.table(summary);
}

// CLI argument parsing
const args = process.argv.slice(2);
const command = args[0] || 'run';

if (command === 'list') {
  listPapers();
} else if (command === 'download') {
  const limit = parseInt(args[1], 10) || 20;
  downloadAll({ limit });
} else if (command === 'run') {
  let limit = 5;
  let pageRange = '1-2';
  let scale = 1.5;

  for (let i = 1; i < args.length; i++) {
    if (args[i] === '--limit') limit = parseInt(args[++i], 10) || 5;
    if (args[i] === '--pages') pageRange = args[++i] || '1-2';
    if (args[i] === '--scale') scale = parseFloat(args[++i]) || 1.5;
  }

  runBenchmark({ limit, pageRange, scale }).catch((err) => {
    console.error('Benchmark fatal error:', err);
    process.exit(1);
  });
} else {
  console.log(`Usage: node test/scripts/benchmark-papers.js [list|download|run] [--limit <n>] [--pages <range>] [--scale <num>]`);
}
