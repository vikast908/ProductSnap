#!/usr/bin/env node
/**
 * Build the semantic RAG index (run once, then on a schedule for freshness).
 *
 *   SEMANTIC_SEARCH=true node scripts/build-rag-index.js
 *
 * Reads articles from content-aggregator.json and transcripts from the archive
 * folder, chunks + embeds them locally (no API key), and writes rag-index/.
 *
 * NOTE: requires Node 18–22 (onnxruntime-node prebuilt support). On CPU this
 * can take several minutes to tens of minutes for the full corpus.
 */
require('dotenv').config();
const path = require('path');
const fs = require('fs');
const low = require('lowdb');
const FileSync = require('lowdb/adapters/FileSync');

const embedder = require('../services/rag/embeddings');
const { getIndex } = require('../services/rag/index-store');
const { buildIndex } = require('../services/rag/build');
const { transcriptId } = require('../services/rag/podcast-id');

const ROOT = path.join(__dirname, '..');
const DB_PATH = path.join(ROOT, 'content-aggregator.json');
const PODCAST_DIR = path.join(ROOT, "Lenny's Podcast Transcripts Archive [public]");

function loadTranscriptSources() {
  if (!fs.existsSync(PODCAST_DIR)) {
    console.warn('Podcast directory not found:', PODCAST_DIR);
    return [];
  }
  return fs.readdirSync(PODCAST_DIR).filter(f => f.endsWith('.txt')).map(file => {
    const guestName = file.replace('.txt', '');
    const content = fs.readFileSync(path.join(PODCAST_DIR, file), 'utf-8');
    return {
      pid: transcriptId(guestName), pt: 'podcast',
      title: `Lenny's Podcast: ${guestName}`, guest: guestName,
      source: "Lenny's Podcast", url: null, content
    };
  });
}

(async () => {
  const start = Date.now();
  const db = low(new FileSync(DB_PATH));
  const articles = db.get('articles').value() || [];
  const articleSources = articles.map(a => ({
    pid: a.id, pt: 'article', title: a.title, guest: null,
    source: a.feedName, url: a.link, content: a.content || a.description || ''
  }));
  const transcriptSources = loadTranscriptSources();
  const sources = [...articleSources, ...transcriptSources];

  console.log(`Building index over ${articleSources.length} articles + ${transcriptSources.length} transcripts…`);
  let lastLog = 0;
  const res = await buildIndex({
    sources, embedder, indexStore: getIndex(),
    onProgress: (done, total) => {
      const now = Date.now();
      if (now - lastLog > 2000 || done === total) {
        console.log(`  embedded ${done}/${total} chunks (${Math.round(done / total * 100)}%)`);
        lastLog = now;
      }
    }
  });
  console.log(`Index built: ${res.chunks} chunks, ${res.parents} parents, dim=${res.dim} in ${Math.round((Date.now() - start) / 1000)}s`);
  console.log(`Wrote ${path.join(ROOT, 'rag-index')}/  (set SEMANTIC_SEARCH=true to enable at runtime)`);
})().catch(e => { console.error('Index build failed:', e); process.exit(1); });
