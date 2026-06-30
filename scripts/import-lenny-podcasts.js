#!/usr/bin/env node
/**
 * Import new Lenny's Podcast transcripts from the LennysNewsletter starter-dataset
 * repo into the local archive, and incrementally append them to the semantic index.
 *
 *   SEMANTIC_SEARCH=true node scripts/import-lenny-podcasts.js          # import + index
 *   node scripts/import-lenny-podcasts.js --dry                        # list only
 *
 * Requires Node 18–22 for the embedding step. Run AFTER the base index exists.
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const ARCHIVE = path.join(ROOT, "Lenny's Podcast Transcripts Archive [public]");
const RAW = 'https://raw.githubusercontent.com/LennysNewsletter/lennys-newsletterpodcastdata/HEAD/';
const DRY = process.argv.includes('--dry');

const embeddings = require(path.join(ROOT, 'services/rag/embeddings'));
const { getIndex } = require(path.join(ROOT, 'services/rag/index-store'));
const { chunkText } = require(path.join(ROOT, 'services/rag/chunk'));
const { transcriptId } = require(path.join(ROOT, 'services/rag/podcast-id'));

const norm = s => s.toLowerCase().replace(/[^a-z0-9]/g, '');

async function fetchText(url) {
  const r = await fetch(url, { signal: AbortSignal.timeout(20000) });
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  return r.text();
}

function toTranscript(md) {
  return md
    .replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, '') // drop YAML frontmatter
    .replace(/\*\*/g, '')                            // drop bold markers (**Speaker** -> Speaker)
    .trim();
}

// Find a non-colliding archive stem (display name): "Guest", then "Guest 2.0", "Guest 3.0"…
function uniqueStem(guest, used) {
  let stem = guest;
  let n = 2;
  while (fs.existsSync(path.join(ARCHIVE, `${stem}.txt`)) || used.has(stem)) {
    stem = `${guest} ${n}.0`;
    n++;
  }
  used.add(stem);
  return stem;
}

(async () => {
  const index = JSON.parse(await fetchText(RAW + 'index.json'));
  const localStems = fs.readdirSync(ARCHIVE).filter(f => f.endsWith('.txt')).map(f => f.replace('.txt', ''));
  const localNorm = new Set(localStems.map(norm));

  // "New" = repo podcast whose slug isn't already represented locally.
  const newPods = index.podcasts.filter(p => {
    const slug = path.basename(p.filename).replace('.md', '');
    return !localNorm.has(norm(slug));
  });

  console.log(`Repo podcasts: ${index.podcasts.length} | local: ${localStems.length} | new to import: ${newPods.length}\n`);

  const used = new Set();
  const entries = [];
  const texts = [];
  const parents = {};
  const written = [];

  for (const p of newPods) {
    const baseExists = fs.existsSync(path.join(ARCHIVE, `${p.guest}.txt`));
    const stem = uniqueStem(p.guest, used);
    const flag = baseExists ? '  ⚠ repeat-guest (verify not a dup)' : '';
    console.log(`  + ${stem}.txt   [${p.date}] ${p.word_count} words${flag}`);
    written.push(stem);
    if (DRY) continue;

    const md = await fetchText(RAW + p.filename);
    const body = toTranscript(md);
    fs.writeFileSync(path.join(ARCHIVE, `${stem}.txt`), body, 'utf-8');

    const pid = transcriptId(stem);
    parents[pid] = { pt: 'podcast', title: `Lenny's Podcast: ${stem}`, guest: stem, source: "Lenny's Podcast", url: p.post_url || null };
    for (const c of chunkText(body)) { entries.push({ pid, pt: 'podcast', s: c.start, l: c.len }); texts.push(c.text); }
  }

  if (DRY) { console.log('\n(dry run — no files written, no indexing)'); return; }
  if (!entries.length) { console.log('\nNothing new to import.'); return; }

  console.log(`\nWrote ${written.length} transcripts. Embedding ${texts.length} chunks…`);
  let last = 0;
  const vectors = await embeddings.embedPassages(texts, {
    onProgress: (d, t) => { const now = Date.now(); if (now - last > 2000 || d === t) { console.log(`  embedded ${d}/${t}`); last = now; } }
  });

  const idx = getIndex();
  idx.load();
  if (!idx.isReady()) {
    console.error('No base index found — run scripts/build-rag-index.js first, then re-run this import.');
    process.exit(1);
  }
  idx.appendBatch(entries, vectors, parents);
  idx.persist();
  console.log(`\nDone. Index now holds ${idx.count} chunks across ${Object.keys(idx.parents).length} parents.`);
  console.log('Restart the server (Node 18–22, SEMANTIC_SEARCH=true) so the new transcripts load into the live cache.');
})().catch(e => { console.error('Import failed:', e.message || e); process.exit(1); });
