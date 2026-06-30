/**
 * Local text embeddings via Transformers.js (no API key required).
 *
 * Model is lazy-loaded on first use, so the ~70-90MB resident cost is only paid
 * when semantic search is actually exercised. Gate app usage behind
 * SEMANTIC_SEARCH=true; the indexer loads the model directly regardless.
 */

const DEFAULT_MODEL = process.env.EMBED_MODEL || 'Xenova/bge-small-en-v1.5';
// bge-v1.5 retrieval convention: prefix queries (not passages) with an instruction.
const QUERY_PREFIX = 'Represent this sentence for searching relevant passages: ';

let extractorPromise = null;
let DIM = null;

function isEnabled() {
  const v = process.env.SEMANTIC_SEARCH;
  return v === 'true' || v === '1' || v === 'yes';
}

async function getExtractor() {
  if (!extractorPromise) {
    // @huggingface/transformers is ESM-only; load via dynamic import from CommonJS.
    const { pipeline, env } = await import('@huggingface/transformers');
    env.allowLocalModels = false; // pull weights from the HF hub + cache locally
    // q8 quantization keeps the resident model ~70-90MB (set EMBED_DTYPE to override).
    extractorPromise = pipeline('feature-extraction', DEFAULT_MODEL, { dtype: process.env.EMBED_DTYPE || 'q8' });
  }
  return extractorPromise;
}

/** Embed a single string -> normalized Float32 number[] (cosine == dot product). */
async function embedText(text) {
  const extractor = await getExtractor();
  const output = await extractor(text || '', { pooling: 'mean', normalize: true });
  const vec = Array.from(output.data);
  if (DIM === null) DIM = vec.length;
  return vec;
}

/** Embed many passages with bounded concurrency (CPU-friendly). */
async function embedPassages(texts, { concurrency = 1, onProgress } = {}) {
  const out = new Array(texts.length);
  let done = 0;
  // Sequential by default — ONNX CPU inference is already multi-threaded internally.
  for (let i = 0; i < texts.length; i += concurrency) {
    const batch = texts.slice(i, i + concurrency);
    const vecs = await Promise.all(batch.map(t => embedText(t)));
    for (let j = 0; j < vecs.length; j++) out[i + j] = vecs[j];
    done += batch.length;
    if (onProgress) onProgress(done, texts.length);
  }
  return out;
}

async function embedQuery(query) {
  return embedText(QUERY_PREFIX + (query || ''));
}

function getDim() { return DIM; }

module.exports = { isEnabled, getExtractor, embedText, embedPassages, embedQuery, getDim, DEFAULT_MODEL };
