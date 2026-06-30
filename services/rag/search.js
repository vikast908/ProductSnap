/**
 * RAG (Retrieval-Augmented Generation) Search Service
 *
 * Two retrieval modes share one context/citation assembler:
 *   - searchContent : lexical only (backward-compatible; used by /chat/search)
 *   - searchHybrid  : lexical + semantic (local embeddings) fused via Reciprocal
 *                     Rank Fusion. Falls back to lexical when semantic search is
 *                     disabled or the vector index isn't built.
 */

function escapeRegExp(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Strip HTML tags + decode common entities so snippets read as plain text
// (article content is frequently raw HTML).
function stripHtml(s) {
  if (!s) return '';
  return String(s)
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&').replace(/&lt;/gi, '<').replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"').replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function calculateRelevance(text, keywords) {
  if (!text) return 0;
  let score = 0;
  for (const keyword of keywords) {
    if (keyword.length > 100) continue;
    const escaped = escapeRegExp(keyword.toLowerCase());
    const regex = new RegExp(`\\b${escaped}\\b`, 'gi');
    const matches = text.match(regex);
    const occurrences = matches ? matches.length : 0;
    if (occurrences > 0) {
      score += occurrences;
      score += 2; // phrase/exact bonus
    }
  }
  return score;
}

function extractKeywords(query) {
  const stopWords = new Set([
    'a', 'an', 'the', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
    'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
    'should', 'may', 'might', 'must', 'shall', 'can', 'need', 'dare',
    'ought', 'used', 'to', 'of', 'in', 'for', 'on', 'with', 'at', 'by',
    'from', 'as', 'into', 'through', 'during', 'before', 'after', 'above',
    'below', 'between', 'under', 'again', 'further', 'then', 'once', 'here',
    'there', 'when', 'where', 'why', 'how', 'all', 'each', 'few', 'more',
    'most', 'other', 'some', 'such', 'no', 'not', 'only', 'own', 'same',
    'so', 'than', 'too', 'very', 'just', 'and', 'but', 'or', 'if', 'because',
    'until', 'while', 'about', 'what', 'which', 'who', 'whom', 'this', 'that',
    'these', 'those', 'am', 'i', 'me', 'my', 'myself', 'we', 'our', 'ours',
    'you', 'your', 'yours', 'he', 'him', 'his', 'she', 'her', 'hers', 'it',
    'its', 'they', 'them', 'their', 'say', 'says', 'said', 'tell', 'think',
    'know', 'get', 'make'
  ]);

  const words = query.toLowerCase().replace(/[^\w\s]/g, ' ').split(/\s+/)
    .filter(word => word.length > 2 && !stopWords.has(word));

  const phrases = [];
  const significantWords = query.toLowerCase().replace(/[^\w\s]/g, ' ').split(/\s+/)
    .filter(w => w.length > 2 && !stopWords.has(w));
  for (let i = 0; i < significantWords.length - 1; i++) {
    phrases.push(`${significantWords[i]} ${significantWords[i + 1]}`);
    if (i < significantWords.length - 2) {
      phrases.push(`${significantWords[i]} ${significantWords[i + 1]} ${significantWords[i + 2]}`);
    }
  }
  return [...new Set([...words, ...phrases])];
}

function getRelevantSnippet(content, keywords, snippetLength = 500) {
  if (!content) return '';
  const contentLower = content.toLowerCase();
  let bestIndex = 0;
  let bestScore = 0;
  for (let i = 0; i < content.length - snippetLength; i += 100) {
    const slice = contentLower.slice(i, i + snippetLength);
    let score = 0;
    for (const keyword of keywords) {
      if (slice.includes(keyword.toLowerCase())) score++;
    }
    if (score > bestScore) { bestScore = score; bestIndex = i; }
  }
  let start = Math.max(0, bestIndex);
  let end = Math.min(content.length, start + snippetLength);
  while (start > 0 && content[start - 1] !== ' ') start--;
  while (end < content.length && content[end] !== ' ') end++;
  let snippet = stripHtml(content.slice(start, end));
  if (start > 0) snippet = '...' + snippet;
  if (end < content.length) snippet = snippet + '...';
  return snippet;
}

function sliceSnippet(content, s, l, max = 800) {
  if (!content) return '';
  let start = Math.max(0, s | 0);
  let end = Math.min(content.length, start + Math.min(l | 0 || max, max));
  while (start > 0 && content[start - 1] !== ' ') start--;
  while (end < content.length && content[end] !== ' ') end++;
  let snippet = stripHtml(content.slice(start, end));
  if (start > 0) snippet = '...' + snippet;
  if (end < content.length) snippet = snippet + '...';
  return snippet;
}

function normalizeScore(score, textLength, keywordCount) {
  if (!score || !textLength || !keywordCount) return 0;
  const density = score / (textLength / 1000);
  return Math.min(100, Math.round(density * (keywordCount / 3) * 10));
}

function analyzeQueryIntent(query) {
  const isWhoQuestion = /\bwho\b/i.test(query);
  const isHowQuestion = /\bhow\b/i.test(query);
  const isWhatQuestion = /\bwhat\b/i.test(query);
  const isExplainQuestion = /\b(explain|describe|tell me about)\b/i.test(query);
  const quotedTerms = query.match(/"([^"]+)"/g)?.map(t => t.replace(/"/g, '')) || [];
  const words = query.split(/\s+/);
  const properNouns = words.slice(1).filter(w => /^[A-Z][a-z]/.test(w));
  return {
    isWhoQuestion, isHowQuestion, isWhatQuestion, isExplainQuestion,
    quotedTerms, properNouns,
    hasSpecificTarget: quotedTerms.length > 0 || properNouns.length > 0
  };
}

/**
 * Lexical retrieval — produces the full ranked result set (with content) for a query.
 * @returns {{ results: Array, keywords: Array, boostedKeywords: Array, queryIntent: Object }}
 */
function lexicalSearch(query, db, cache, options = {}) {
  const {
    includeArticles = true,
    includePodcasts = true,
    userFiles = [],
    getTranscriptContent = null,
    minRelevanceScore = 5,
    minNormalizedScore = 8
  } = options;

  const keywords = extractKeywords(query);
  const queryIntent = analyzeQueryIntent(query);
  const results = [];

  const boostedKeywords = [...keywords];
  queryIntent.quotedTerms.forEach(term => boostedKeywords.unshift(term));
  queryIntent.properNouns.forEach(noun => boostedKeywords.unshift(noun.toLowerCase()));

  if (includeArticles) {
    const articles = db.get('articles').value() || [];
    for (const article of articles) {
      const titleScore = calculateRelevance(article.title, boostedKeywords) * 4;
      const descScore = calculateRelevance(article.description, boostedKeywords) * 2;
      const contentScore = calculateRelevance(article.content, boostedKeywords);
      let exactMatchBonus = 0;
      if (queryIntent.quotedTerms.some(t => article.title?.toLowerCase().includes(t.toLowerCase()))) exactMatchBonus = 20;
      if (queryIntent.properNouns.some(n => article.title?.toLowerCase().includes(n.toLowerCase()) || article.content?.toLowerCase().includes(n.toLowerCase()))) exactMatchBonus += 10;
      const totalScore = titleScore + descScore + contentScore + exactMatchBonus;
      const textLength = (article.title?.length || 0) + (article.description?.length || 0) + (article.content?.length || 0);
      const normalizedScore = normalizeScore(totalScore, textLength, keywords.length);
      if (totalScore >= minRelevanceScore && normalizedScore >= minNormalizedScore) {
        results.push({
          type: 'article', id: article.id, title: article.title, source: article.feedName,
          url: article.link, pubDate: article.pubDate, score: totalScore, normalizedScore,
          relevance: normalizedScore >= 50 ? 'high' : normalizedScore >= 20 ? 'medium' : 'low',
          content: article.content || article.description || ''
        });
      }
    }
  }

  if (includePodcasts && cache.transcripts) {
    for (const transcript of cache.transcripts) {
      const transcriptContent = getTranscriptContent ? getTranscriptContent(transcript) : (transcript.content || '');
      const titleScore = calculateRelevance(transcript.title, boostedKeywords) * 3;
      const guestScore = calculateRelevance(transcript.guest, boostedKeywords) * 5;
      const contentScore = calculateRelevance(transcriptContent, boostedKeywords);
      let exactMatchBonus = 0;
      if (queryIntent.isWhoQuestion || queryIntent.properNouns.length > 0) {
        if (queryIntent.properNouns.some(n => transcript.guest?.toLowerCase().includes(n.toLowerCase())) ||
            queryIntent.quotedTerms.some(t => transcript.guest?.toLowerCase().includes(t.toLowerCase()))) {
          exactMatchBonus = 30;
        }
      }
      const totalScore = titleScore + guestScore + contentScore + exactMatchBonus;
      const textLength = (transcript.title?.length || 0) + (transcript.guest?.length || 0) + (transcriptContent?.length || 0);
      const normalizedScore = normalizeScore(totalScore, textLength, keywords.length);
      if (totalScore >= minRelevanceScore && normalizedScore >= minNormalizedScore) {
        results.push({
          type: 'podcast', id: transcript.id, title: transcript.title, guest: transcript.guest,
          source: "Lenny's Podcast", score: totalScore, normalizedScore,
          relevance: normalizedScore >= 50 ? 'high' : normalizedScore >= 20 ? 'medium' : 'low',
          content: transcriptContent
        });
      }
    }
  }

  if (userFiles && userFiles.length > 0) {
    for (const file of userFiles) {
      const titleScore = calculateRelevance(file.originalName, boostedKeywords) * 5;
      const contentScore = calculateRelevance(file.content, boostedKeywords);
      const totalScore = titleScore + contentScore + 15;
      const textLength = (file.originalName?.length || 0) + (file.content?.length || 0);
      const normalizedScore = normalizeScore(totalScore, textLength, keywords.length);
      if (totalScore >= minRelevanceScore) {
        results.push({
          type: 'userFile', id: file.id, title: file.originalName, source: 'My Files',
          score: totalScore, normalizedScore,
          relevance: normalizedScore >= 50 ? 'high' : normalizedScore >= 20 ? 'medium' : 'low',
          content: file.content || '', uploadedAt: file.uploadedAt
        });
      }
    }
  }

  results.sort((a, b) => b.score - a.score);
  return { results, keywords, boostedKeywords, queryIntent };
}

/**
 * Tiered-snippet context assembler — shared by lexical and hybrid paths so the
 * numbered [Source n] markers and citation alignment are identical in both.
 */
function assembleContext(results, snippetKeywords, options = {}) {
  const {
    maxResults = 50,
    tier1Count = 10, tier1Length = 800,
    tier2Count = 15, tier2Length = 400,
    tier3Length = 150
  } = options;

  const highRelevanceCount = results.filter(r => r.relevance === 'high').length;
  const mediumRelevanceCount = results.filter(r => r.relevance === 'medium').length;

  let effectiveMaxResults = maxResults;
  if (highRelevanceCount >= 15) effectiveMaxResults = Math.min(30, maxResults);
  else if (highRelevanceCount + mediumRelevanceCount < 10) effectiveMaxResults = Math.min(15, maxResults);

  const topResults = results.slice(0, effectiveMaxResults).map((result, index) => {
    let snippetLength, tier;
    if (index < tier1Count) { snippetLength = tier1Length; tier = 1; }
    else if (index < tier1Count + tier2Count) { snippetLength = tier2Length; tier = 2; }
    else { snippetLength = tier3Length; tier = 3; }
    // Semantic hits arrive with a snippet already set; lexical hits snippet from content.
    const snippet = result.snippet
      ? (result.snippet.length > snippetLength + 6 ? result.snippet.slice(0, snippetLength) + '...' : result.snippet)
      : getRelevantSnippet(result.content, snippetKeywords, snippetLength);
    return { ...result, snippet, tier, content: undefined };
  });

  const displayResults = topResults.filter(r => r.relevance !== 'low' || r.tier === 1);

  const contextParts = topResults.map((result, index) => {
    const tierLabel = result.tier === 1 ? '' : result.tier === 2 ? ' (summary)' : ' (brief)';
    if (result.type === 'article') {
      return `[Source ${index + 1}: Article - "${result.title}" from ${result.source}${tierLabel}]\n${result.snippet}`;
    } else if (result.type === 'userFile') {
      return `[Source ${index + 1}: User's File - "${result.title}"${tierLabel}]\n${result.snippet}`;
    }
    return `[Source ${index + 1}: Lenny's Podcast with ${result.guest}${tierLabel}]\n${result.snippet}`;
  });

  return {
    results: displayResults,
    allResults: topResults,
    context: contextParts.join('\n\n'),
    totalFound: results.length,
    relevanceBreakdown: {
      high: highRelevanceCount,
      medium: mediumRelevanceCount,
      low: results.length - highRelevanceCount - mediumRelevanceCount
    }
  };
}

/**
 * Lexical-only search (backward-compatible public API).
 */
function searchContent(query, db, cache, options = {}) {
  const { results, keywords, boostedKeywords } = lexicalSearch(query, db, cache, options);
  const assembled = assembleContext(results, boostedKeywords, options);
  return { ...assembled, keywords: boostedKeywords.slice(0, 10) };
}

/**
 * Resolve a semantic parent hit into a result object (with snippet from offsets).
 */
function resolveSemanticParent(hit, parentMeta, db, cache, getTranscriptContent) {
  if (hit.pt === 'article') {
    const a = (db.get('articles').find({ id: hit.pid }).value()) || parentMeta || {};
    const content = a.content || a.description || '';
    return {
      type: 'article', id: hit.pid, title: a.title || parentMeta?.title, source: a.feedName || parentMeta?.source,
      url: a.link || parentMeta?.url, snippet: sliceSnippet(content, hit.best.s, hit.best.l)
    };
  }
  if (hit.pt === 'podcast') {
    const t = cache.transcripts?.find(x => x.id === hit.pid);
    const content = t && getTranscriptContent ? getTranscriptContent(t) : '';
    return {
      type: 'podcast', id: hit.pid, title: t?.title || parentMeta?.title, guest: t?.guest || parentMeta?.guest,
      source: "Lenny's Podcast", snippet: sliceSnippet(content, hit.best.s, hit.best.l)
    };
  }
  return null;
}

/**
 * Hybrid retrieval: lexical + semantic, fused with Reciprocal Rank Fusion.
 * @param {string|string[]} queries - one or more (rewritten) search queries
 */
async function searchHybrid(queries, db, cache, options = {}) {
  const queryList = Array.isArray(queries) ? queries.filter(Boolean) : [queries];
  const primary = queryList[0] || '';
  const embedder = options.embedder || require('./embeddings');
  const indexStore = options.indexStore || require('./index-store').getIndex();

  // Lexical arm (always runs; also covers user files).
  const { results: lexResults, boostedKeywords } = lexicalSearch(primary, db, cache, options);

  // Semantic arm (only when enabled + index built).
  let semResults = [];
  let semanticUsed = false;
  const wantSemantic = options.semantic !== false && embedder.isEnabled?.() && indexStore.load?.() ;
  if (wantSemantic && indexStore.isReady()) {
    try {
      const qVecs = [];
      for (const q of queryList.slice(0, 4)) qVecs.push(await embedder.embedQuery(q));
      const parentHits = indexStore.searchParents(qVecs, { chunkTopK: 400, parentTopK: 60 });
      for (const hit of parentHits) {
        const r = resolveSemanticParent(hit, indexStore.parents[hit.pid], db, cache, options.getTranscriptContent);
        if (r) {
          const ns = Math.round(hit.score * 100);
          semResults.push({
            ...r, score: hit.score, normalizedScore: ns,
            relevance: hit.score >= 0.62 ? 'high' : hit.score >= 0.48 ? 'medium' : 'low'
          });
        }
      }
      semanticUsed = semResults.length > 0;
    } catch (e) {
      console.error('Semantic search failed, using lexical only:', e.message);
    }
  }

  if (!semanticUsed) {
    const assembled = assembleContext(lexResults, boostedKeywords, options);
    return { ...assembled, keywords: boostedKeywords.slice(0, 10), semanticUsed: false };
  }

  // Reciprocal Rank Fusion (k=60) over the two ranked lists, keyed by parent.
  const K = 60;
  const keyOf = (r) => `${r.type}:${r.id}`;
  const fused = new Map();
  const consider = (list, weight = 1) => {
    list.forEach((r, rank) => {
      const key = keyOf(r);
      const rrf = weight / (K + rank + 1);
      const existing = fused.get(key);
      if (existing) {
        existing.rrf += rrf;
        // keep a snippet + the stronger relevance label
        if (!existing.snippet && r.snippet) existing.snippet = r.snippet;
        if (relevanceRank(r.relevance) > relevanceRank(existing.relevance)) existing.relevance = r.relevance;
        if (r.content && !existing.content) existing.content = r.content;
      } else {
        fused.set(key, { ...r, rrf });
      }
    });
  };
  consider(lexResults, 1);
  consider(semResults, 1);

  const fusedResults = Array.from(fused.values())
    .sort((a, b) => b.rrf - a.rrf)
    .map(r => ({ ...r, score: r.rrf })); // assembleContext slices in this order

  const assembled = assembleContext(fusedResults, boostedKeywords, options);
  return { ...assembled, keywords: boostedKeywords.slice(0, 10), semanticUsed: true };
}

function relevanceRank(r) { return r === 'high' ? 3 : r === 'medium' ? 2 : 1; }

function formatSources(results) {
  return results.map((result, index) => ({
    index: index + 1,
    id: result.id,
    type: result.type,
    title: result.title,
    source: result.source,
    url: result.url || null,
    guest: result.guest || null,
    relevance: result.relevance || 'medium',
    normalizedScore: result.normalizedScore || 0,
    tier: result.tier || 3,
    // Short evidence snippet so the UI can show *why* a source was cited.
    snippet: result.snippet ? String(result.snippet).slice(0, 280) : ''
  }));
}

module.exports = {
  searchContent,
  searchHybrid,
  lexicalSearch,
  assembleContext,
  extractKeywords,
  calculateRelevance,
  getRelevantSnippet,
  formatSources,
  analyzeQueryIntent
};
