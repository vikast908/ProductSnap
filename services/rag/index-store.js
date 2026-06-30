/**
 * Off-heap vector index for semantic search.
 *
 * Stored OUTSIDE content-aggregator.json (so DB boot stays lean):
 *   rag-index/index.json    { model, dim, count, builtAt }
 *   rag-index/chunks.json   [{ pid, pt, s, l }]   (parentId, parentType, start, len)
 *   rag-index/parents.json  { [pid]: { title, guest, source, url } }
 *   rag-index/vectors.f32   contiguous Float32, count * dim (L2-normalized → cosine = dot)
 *
 * Brute-force cosine is plenty fast at this corpus size (~25k chunks): a query
 * scans count*dim multiply-adds in tens of ms, so no ANN index is needed.
 */
const fs = require('fs');
const path = require('path');

const DEFAULT_DIR = process.env.RAG_INDEX_DIR || path.join(__dirname, '..', '..', 'rag-index');

function safeWriteFile(filePath, data) {
  const tmp = `${filePath}.tmp`;
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      fs.writeFileSync(tmp, data);
      fs.renameSync(tmp, filePath); // atomic-ish; tolerant of OneDrive locks via retry
      return true;
    } catch (e) {
      if (attempt === 3) throw e;
    }
  }
  return false;
}

class VectorIndex {
  constructor(dir = DEFAULT_DIR) {
    this.dir = dir;
    this.dim = null;
    this.model = null;
    this.chunks = [];      // [{ pid, pt, s, l }]
    this.parents = {};     // { pid: { title, guest, source, url } }
    this.vectors = null;   // Float32Array(count * dim)
    this.loaded = false;
  }

  get count() { return this.chunks.length; }
  isReady() { return this.loaded && this.count > 0 && this.vectors && this.dim; }

  load() {
    if (this.loaded) return this.isReady();
    try {
      const idx = JSON.parse(fs.readFileSync(path.join(this.dir, 'index.json'), 'utf-8'));
      this.dim = idx.dim;
      this.model = idx.model;
      this.chunks = JSON.parse(fs.readFileSync(path.join(this.dir, 'chunks.json'), 'utf-8'));
      this.parents = JSON.parse(fs.readFileSync(path.join(this.dir, 'parents.json'), 'utf-8'));
      const buf = fs.readFileSync(path.join(this.dir, 'vectors.f32'));
      this.vectors = new Float32Array(buf.buffer, buf.byteOffset, Math.floor(buf.length / 4));
      this.loaded = true;
    } catch (e) {
      this.loaded = true; // mark attempted; isReady() stays false
      this.vectors = null;
      this.chunks = [];
    }
    return this.isReady();
  }

  persist() {
    if (!fs.existsSync(this.dir)) fs.mkdirSync(this.dir, { recursive: true });
    safeWriteFile(path.join(this.dir, 'index.json'),
      JSON.stringify({ model: this.model, dim: this.dim, count: this.count, builtAt: new Date().toISOString() }));
    safeWriteFile(path.join(this.dir, 'chunks.json'), JSON.stringify(this.chunks));
    safeWriteFile(path.join(this.dir, 'parents.json'), JSON.stringify(this.parents));
    safeWriteFile(path.join(this.dir, 'vectors.f32'), Buffer.from(this.vectors.buffer, this.vectors.byteOffset, this.vectors.byteLength));
  }

  /** Replace the whole index (used by the offline builder). */
  build({ model, dim, chunks, parents, vectors }) {
    this.model = model;
    this.dim = dim;
    this.chunks = chunks;
    this.parents = parents;
    this.vectors = vectors instanceof Float32Array ? vectors : Float32Array.from(flatten(vectors));
    this.loaded = true;
  }

  /** Append new chunks (incremental indexing of fresh articles). */
  appendBatch(entries, vectorRows, parentInfo) {
    if (!entries.length) return;
    if (!this.dim) this.dim = vectorRows[0].length;
    const addFlat = Float32Array.from(flatten(vectorRows));
    const merged = new Float32Array((this.vectors?.length || 0) + addFlat.length);
    if (this.vectors) merged.set(this.vectors, 0);
    merged.set(addFlat, this.vectors?.length || 0);
    this.vectors = merged;
    this.chunks.push(...entries);
    Object.assign(this.parents, parentInfo || {});
    this.loaded = true;
  }

  /**
   * Top-k chunk hits across one or more query vectors (max-sim over queries).
   * @returns {Array<{ci:number, pid, pt, s, l, score:number}>}
   */
  search(queryVecs, topK = 200) {
    if (!this.isReady()) return [];
    const dim = this.dim;
    const n = this.count;
    const scores = new Float32Array(n);
    for (const q of queryVecs) {
      for (let i = 0; i < n; i++) {
        let dot = 0;
        const base = i * dim;
        for (let d = 0; d < dim; d++) dot += this.vectors[base + d] * q[d];
        if (dot > scores[i]) scores[i] = dot;
      }
    }
    // Partial top-k
    const idxs = Array.from({ length: n }, (_, i) => i);
    idxs.sort((a, b) => scores[b] - scores[a]);
    const top = idxs.slice(0, topK);
    return top.map(i => ({ ci: i, ...this.chunks[i], score: scores[i] }));
  }

  /** Set of parent ids of a given type currently in the index (for diffing). */
  parentIdsByType(pt) {
    const s = new Set();
    for (const c of this.chunks) if (c.pt === pt) s.add(c.pid);
    return s;
  }

  /** Remove all chunks/vectors belonging to the given parent ids. Returns count removed. */
  removeParents(pids) {
    if (!this.isReady() || !pids || !pids.length) return 0;
    const set = new Set(pids);
    const dim = this.dim;
    const keptChunks = [];
    const keptVecRanges = [];
    for (let i = 0; i < this.chunks.length; i++) {
      if (set.has(this.chunks[i].pid)) continue;
      keptChunks.push(this.chunks[i]);
      keptVecRanges.push(i);
    }
    const merged = new Float32Array(keptChunks.length * dim);
    for (let j = 0; j < keptVecRanges.length; j++) {
      const src = keptVecRanges[j] * dim;
      merged.set(this.vectors.subarray(src, src + dim), j * dim);
    }
    const removed = this.chunks.length - keptChunks.length;
    this.chunks = keptChunks;
    this.vectors = merged;
    for (const pid of pids) delete this.parents[pid];
    return removed;
  }

  /** Aggregate chunk hits to the best chunk per parent. */
  searchParents(queryVecs, { chunkTopK = 300, parentTopK = 60 } = {}) {
    const hits = this.search(queryVecs, chunkTopK);
    const byParent = new Map();
    for (const h of hits) {
      const prev = byParent.get(h.pid);
      if (!prev || h.score > prev.score) {
        byParent.set(h.pid, { pid: h.pid, pt: h.pt, score: h.score, best: { s: h.s, l: h.l } });
      }
    }
    return Array.from(byParent.values()).sort((a, b) => b.score - a.score).slice(0, parentTopK);
  }
}

function flatten(rows) {
  const out = [];
  for (const r of rows) for (let i = 0; i < r.length; i++) out.push(r[i]);
  return out;
}

let singleton = null;
function getIndex(dir) {
  if (!singleton) singleton = new VectorIndex(dir);
  return singleton;
}

module.exports = { VectorIndex, getIndex, DEFAULT_DIR };
