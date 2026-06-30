/**
 * Incremental semantic-index maintenance.
 *
 * Diffs the live article set against what's already embedded and only does the
 * delta — embed new articles, drop removed ones — so the daily job is cheap
 * (no full re-embed). Podcasts are static and left alone.
 */
const { chunkText } = require('./chunk');
const embeddings = require('./embeddings');
const { getIndex } = require('./index-store');

function nodeMajor() {
  return parseInt(process.versions.node.split('.')[0], 10);
}

/**
 * Local embeddings need onnxruntime-node, which has prebuilt binaries for ~Node
 * 18–22. Guard so enabling SEMANTIC_SEARCH on a too-new Node can't hard-crash
 * the server when the native model loads.
 */
function semanticReady(embedder) {
  const e = embedder || embeddings;
  if (!e.isEnabled || !e.isEnabled()) return { ok: false, reason: 'SEMANTIC_SEARCH disabled' };
  // Node guard applies only to the default native embedder (onnxruntime-node).
  if (e === embeddings && nodeMajor() > 22) {
    return { ok: false, reason: `Node ${process.versions.node} unsupported for local embeddings (use 18–22)` };
  }
  return { ok: true };
}

async function syncIndex(db, { onLog, embedder, indexStore } = {}) {
  const embed = embedder || embeddings;
  const ready = semanticReady(embed);
  if (!ready.ok) return { skipped: ready.reason };

  const idx = indexStore || getIndex();
  idx.load();
  if (!idx.isReady()) return { skipped: 'no index built yet (run scripts/build-rag-index.js)' };

  const liveArticles = db.get('articles').value() || [];
  const liveIds = new Set(liveArticles.map(a => a.id));
  const indexedIds = idx.parentIdsByType('article');

  const toRemove = [...indexedIds].filter(id => !liveIds.has(id));
  // Cap additions per run so a cold start (or an environment with regenerated
  // article IDs, e.g. an ephemeral Railway DB) can't trigger a single huge
  // embedding storm. Remaining articles are picked up on the next daily run.
  const MAX_ADD = Math.max(1, parseInt(process.env.REINDEX_MAX_ARTICLES || '500', 10));
  const pendingAdd = liveArticles.filter(a => !indexedIds.has(a.id));
  const toAdd = pendingAdd.length > MAX_ADD ? pendingAdd.slice(0, MAX_ADD) : pendingAdd;
  const deferredAdd = pendingAdd.length - toAdd.length;

  let removedChunks = 0;
  if (toRemove.length) removedChunks = idx.removeParents(toRemove);

  let addedChunks = 0;
  if (toAdd.length) {
    const entries = [];
    const texts = [];
    const parents = {};
    for (const a of toAdd) {
      parents[a.id] = { title: a.title, guest: null, source: a.feedName, url: a.link };
      for (const c of chunkText(a.content || a.description || '')) {
        entries.push({ pid: a.id, pt: 'article', s: c.start, l: c.len });
        texts.push(c.text);
      }
    }
    if (texts.length) {
      const vectors = await embed.embedPassages(texts);
      idx.appendBatch(entries, vectors, parents);
      addedChunks = texts.length;
    }
  }

  if (removedChunks || addedChunks) idx.persist();
  const deferNote = deferredAdd > 0 ? `, ${deferredAdd} deferred to next run` : '';
  const summary = `+${toAdd.length} articles (${addedChunks} chunks), -${toRemove.length} articles (${removedChunks} chunks)${deferNote}`;
  if (onLog) onLog(summary);
  return { addedArticles: toAdd.length, addedChunks, removedParents: toRemove.length, removedChunks, deferredAdd };
}

module.exports = { syncIndex, semanticReady };
