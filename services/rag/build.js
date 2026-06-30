/**
 * Build (or rebuild) the semantic vector index from a list of source documents.
 * Reusable by the offline script and any in-process reindex trigger.
 */
const { chunkText } = require('./chunk');

/**
 * @param {Object} args
 * @param {Array<{pid,pt,title,guest,source,url,content}>} args.sources
 * @param {Object} args.embedder    - embeddings module (embedPassages, DEFAULT_MODEL)
 * @param {Object} args.indexStore  - VectorIndex instance
 * @param {Function} [args.onProgress] - (done,total)=>void
 */
async function buildIndex({ sources, embedder, indexStore, onProgress, chunkOpts = {} }) {
  const chunks = [];   // [{ pid, pt, s, l }]
  const parents = {};  // { pid: { title, guest, source, url } }
  const texts = [];    // chunk text to embed (not stored — offsets only)

  for (const src of sources) {
    parents[src.pid] = { title: src.title, guest: src.guest || null, source: src.source, url: src.url || null };
    const cs = chunkText(src.content || '', chunkOpts);
    for (const c of cs) {
      chunks.push({ pid: src.pid, pt: src.pt, s: c.start, l: c.len });
      texts.push(c.text);
    }
  }

  if (texts.length === 0) {
    indexStore.build({ model: embedder.DEFAULT_MODEL, dim: embedder.getDim() || 0, chunks: [], parents: {}, vectors: new Float32Array(0) });
    indexStore.persist();
    return { chunks: 0, parents: 0, dim: 0 };
  }

  const vectors = await embedder.embedPassages(texts, { onProgress });
  const dim = vectors[0]?.length || embedder.getDim();
  indexStore.build({ model: embedder.DEFAULT_MODEL, dim, chunks, parents, vectors });
  indexStore.persist();
  return { chunks: chunks.length, parents: Object.keys(parents).length, dim };
}

module.exports = { buildIndex };
