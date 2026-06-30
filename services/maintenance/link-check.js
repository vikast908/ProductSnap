/**
 * Dead-link maintenance.
 *
 * "Old/outdated" here means an article whose link no longer works (404/410 or
 * the domain is gone) — NOT old-by-date. To avoid deleting good articles that
 * are merely down for a moment or block bots (403), removal uses TWO strikes:
 * an article is only deleted after two consecutive runs classify it 'dead'.
 *
 *   alive     -> linkFailures reset to 0
 *   dead      -> linkFailures++  (delete when >= 2)
 *   uncertain -> left untouched (403/429/5xx/timeout — could be transient or bot-block)
 */
const axios = require('axios');

const STRIKES_TO_DELETE = 2;
const UA = 'Mozilla/5.0 (compatible; ProductSnap-LinkCheck/1.0)';

/** Classify a URL as 'alive' | 'dead' | 'uncertain'. Conservative on purpose. */
async function checkLink(url, timeout = 8000) {
  const opts = { timeout, maxRedirects: 5, validateStatus: () => true, headers: { 'User-Agent': UA } };
  try {
    let res;
    try {
      res = await axios.head(url, opts);
    } catch (e) {
      res = null; // some servers reject HEAD outright
    }
    // Retry with GET when HEAD is unsupported/blocked or failed.
    if (!res || [403, 405, 501].includes(res.status)) {
      res = await axios.get(url, { ...opts, responseType: 'text', maxContentLength: 200000 });
    }
    const s = res.status;
    if (s >= 200 && s < 400) return 'alive';
    if (s === 404 || s === 410) return 'dead';        // gone
    return 'uncertain';                                // 403/429/5xx → keep
  } catch (e) {
    const code = e.code || '';
    if (code === 'ENOTFOUND' || code === 'EAI_AGAIN') return 'dead'; // domain no longer resolves
    return 'uncertain'; // ECONNREFUSED / timeouts / TLS → could be transient, keep
  }
}

async function mapWithConcurrency(items, limit, worker) {
  let i = 0;
  const runners = new Array(Math.min(limit, items.length)).fill(0).map(async () => {
    while (i < items.length) {
      const idx = i++;
      await worker(items[idx], idx);
    }
  });
  await Promise.all(runners);
}

/**
 * Sweep all articles, updating linkFailures and removing twice-confirmed-dead ones.
 * @param {Object} db - LowDB instance
 * @param {Function} safeDbWrite - the project's retry-aware writer
 * @param {Object} [opts] - { concurrency, timeout, onProgress }
 * @returns {Promise<{checked,alive,dead,uncertain,removed:string[]}>}
 */
async function sweepDeadLinks(db, safeDbWrite, opts = {}) {
  const { concurrency = 8, timeout = 8000, onProgress } = opts;
  const articles = db.get('articles').value() || [];
  const stats = { checked: 0, alive: 0, dead: 0, uncertain: 0, removed: [] };
  const toDelete = new Set();
  const patches = []; // { id, linkFailures }

  await mapWithConcurrency(articles, concurrency, async (a) => {
    stats.checked++;
    if (onProgress && stats.checked % 100 === 0) onProgress(stats.checked, articles.length);
    if (!a.link) return;
    const status = await checkLink(a.link, timeout);
    if (status === 'alive') {
      stats.alive++;
      if (a.linkFailures) patches.push({ id: a.id, linkFailures: 0 });
    } else if (status === 'dead') {
      stats.dead++;
      const failures = (a.linkFailures || 0) + 1;
      if (failures >= STRIKES_TO_DELETE) {
        toDelete.add(a.id);
        stats.removed.push(a.id);
      } else {
        patches.push({ id: a.id, linkFailures: failures });
      }
    } else {
      stats.uncertain++;
    }
  });

  // Apply strike increments/resets (in-memory), then a single guarded write.
  for (const p of patches) {
    const art = db.get('articles').find({ id: p.id });
    if (art.value()) art.assign({ linkFailures: p.linkFailures }).value();
  }
  if (toDelete.size > 0) {
    db.get('articles').remove(a => toDelete.has(a.id)).value();
  }
  if (patches.length || toDelete.size) {
    // Mutations are already applied in-memory; .write() flushes the whole db (retry-aware).
    await safeDbWrite(db.get('articles'));
  }
  return stats;
}

module.exports = { checkLink, sweepDeadLinks, STRIKES_TO_DELETE };
