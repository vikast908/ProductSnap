/**
 * RAG (Retrieval-Augmented Generation) Search Service
 *
 * Searches articles and podcast transcripts to find relevant context
 * for AI chat responses.
 */

/**
 * Escape special regex characters to prevent ReDoS attacks
 * @param {string} str - String to escape
 * @returns {string} - Escaped string safe for use in RegExp
 */
function escapeRegExp(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Simple text similarity score based on keyword matching
 * @param {string} text - Text to search in
 * @param {Array<string>} keywords - Keywords to search for
 * @returns {number} - Relevance score
 */
function calculateRelevance(text, keywords) {
  if (!text) return 0;
  const textLower = text.toLowerCase();
  let score = 0;

  for (const keyword of keywords) {
    // SECURITY: Limit keyword length to prevent DoS
    if (keyword.length > 100) continue;

    const keywordLower = keyword.toLowerCase();
    // SECURITY: Use string methods instead of regex to prevent ReDoS
    // Count occurrences using split (safe, no regex)
    const occurrences = textLower.split(keywordLower).length - 1;
    if (occurrences > 0) {
      score += occurrences;
      // Bonus for exact phrase match
      score += 2;
    }
  }

  return score;
}

/**
 * Extract keywords from a query
 * @param {string} query - User query
 * @returns {Array<string>} - Keywords
 */
function extractKeywords(query) {
  // Remove common stop words
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

  // Split query into words and filter
  const words = query
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter(word => word.length > 2 && !stopWords.has(word));

  // Also extract phrases (2-3 consecutive words)
  const phrases = [];
  const allWords = query.toLowerCase().replace(/[^\w\s]/g, ' ').split(/\s+/).filter(w => w.length > 0);

  for (let i = 0; i < allWords.length - 1; i++) {
    phrases.push(`${allWords[i]} ${allWords[i + 1]}`);
    if (i < allWords.length - 2) {
      phrases.push(`${allWords[i]} ${allWords[i + 1]} ${allWords[i + 2]}`);
    }
  }

  return [...new Set([...words, ...phrases])];
}

/**
 * Get snippet around keyword match
 * @param {string} content - Full content
 * @param {Array<string>} keywords - Keywords to find
 * @param {number} snippetLength - Length of snippet
 * @returns {string} - Relevant snippet
 */
function getRelevantSnippet(content, keywords, snippetLength = 500) {
  if (!content) return '';

  const contentLower = content.toLowerCase();
  let bestIndex = 0;
  let bestScore = 0;

  // Find the position with highest keyword density
  for (let i = 0; i < content.length - snippetLength; i += 100) {
    const slice = contentLower.slice(i, i + snippetLength);
    let score = 0;
    for (const keyword of keywords) {
      if (slice.includes(keyword.toLowerCase())) {
        score++;
      }
    }
    if (score > bestScore) {
      bestScore = score;
      bestIndex = i;
    }
  }

  // Extract snippet
  let start = Math.max(0, bestIndex);
  let end = Math.min(content.length, start + snippetLength);

  // Adjust to word boundaries
  while (start > 0 && content[start - 1] !== ' ') start--;
  while (end < content.length && content[end] !== ' ') end++;

  let snippet = content.slice(start, end).trim();

  if (start > 0) snippet = '...' + snippet;
  if (end < content.length) snippet = snippet + '...';

  return snippet;
}

/**
 * Search articles and podcasts for relevant content
 * Uses tiered snippet strategy to optimize token usage:
 * - Tier 1 (top 10): Full 800-char snippets for best relevance
 * - Tier 2 (next 15): Medium 400-char snippets for good coverage
 * - Tier 3 (remaining 25): Brief 150-char snippets for breadth
 *
 * @param {string} query - User query
 * @param {Object} db - LowDB instance
 * @param {Object} cache - Cache object containing transcripts
 * @param {Object} options - Search options
 * @returns {Object} - Search results with formatted context
 */
function searchContent(query, db, cache, options = {}) {
  const {
    maxResults = 50, // Search across ALL content, return top 50 most relevant
    includeArticles = true,
    includePodcasts = true,
    // Tiered snippet lengths for token optimization
    tier1Count = 10,  // Top results get full context
    tier1Length = 800,
    tier2Count = 15,  // Medium relevance get moderate context
    tier2Length = 400,
    tier3Length = 150  // Lower relevance get brief context
  } = options;

  const keywords = extractKeywords(query);
  const results = [];

  // Search articles
  if (includeArticles) {
    const articles = db.get('articles').value() || [];

    for (const article of articles) {
      const titleScore = calculateRelevance(article.title, keywords) * 3; // Weight title higher
      const descScore = calculateRelevance(article.description, keywords) * 2;
      const contentScore = calculateRelevance(article.content, keywords);

      const totalScore = titleScore + descScore + contentScore;

      if (totalScore > 0) {
        results.push({
          type: 'article',
          id: article.id,
          title: article.title,
          source: article.feedName,
          url: article.link,
          pubDate: article.pubDate,
          score: totalScore,
          content: article.content || article.description || '' // Store full content for tiered extraction
        });
      }
    }
  }

  // Search podcast transcripts
  if (includePodcasts && cache.transcripts) {
    for (const transcript of cache.transcripts) {
      const titleScore = calculateRelevance(transcript.title, keywords) * 3;
      const guestScore = calculateRelevance(transcript.guest, keywords) * 4; // Weight guest name highly
      const contentScore = calculateRelevance(transcript.content, keywords);

      const totalScore = titleScore + guestScore + contentScore;

      if (totalScore > 0) {
        results.push({
          type: 'podcast',
          id: transcript.id,
          title: transcript.title,
          guest: transcript.guest,
          source: "Lenny's Podcast",
          score: totalScore,
          content: transcript.content || '' // Store full content for tiered extraction
        });
      }
    }
  }

  // Sort by relevance score
  results.sort((a, b) => b.score - a.score);

  // Take top results and apply tiered snippets
  const topResults = results.slice(0, maxResults).map((result, index) => {
    let snippetLength;
    let tier;

    if (index < tier1Count) {
      snippetLength = tier1Length;
      tier = 1;
    } else if (index < tier1Count + tier2Count) {
      snippetLength = tier2Length;
      tier = 2;
    } else {
      snippetLength = tier3Length;
      tier = 3;
    }

    return {
      ...result,
      snippet: getRelevantSnippet(result.content, keywords, snippetLength),
      tier,
      content: undefined // Remove full content from result to save memory
    };
  });

  // Format context for AI with tiered approach
  const contextParts = topResults.map((result, index) => {
    const tierLabel = result.tier === 1 ? '' : result.tier === 2 ? ' (summary)' : ' (brief)';

    if (result.type === 'article') {
      return `[Source ${index + 1}: Article - "${result.title}" from ${result.source}${tierLabel}]
${result.snippet}`;
    } else {
      return `[Source ${index + 1}: Lenny's Podcast with ${result.guest}${tierLabel}]
${result.snippet}`;
    }
  });

  // Calculate approximate token savings
  const fullTokens = maxResults * tier1Length / 4; // Rough estimate: 4 chars per token
  const tieredTokens = (tier1Count * tier1Length + tier2Count * tier2Length + (maxResults - tier1Count - tier2Count) * tier3Length) / 4;
  const tokenSavings = Math.round((1 - tieredTokens / fullTokens) * 100);

  return {
    results: topResults,
    context: contextParts.join('\n\n'),
    keywords,
    totalFound: results.length,
    tokenOptimization: {
      tier1Sources: tier1Count,
      tier2Sources: tier2Count,
      tier3Sources: maxResults - tier1Count - tier2Count,
      estimatedTokenSavings: `${tokenSavings}%`
    }
  };
}

/**
 * Format sources for citation
 * @param {Array} results - Search results
 * @returns {Array} - Formatted source citations
 */
function formatSources(results) {
  return results.map((result, index) => ({
    index: index + 1,
    type: result.type,
    title: result.title,
    source: result.source,
    url: result.url || null,
    guest: result.guest || null
  }));
}

module.exports = {
  searchContent,
  extractKeywords,
  calculateRelevance,
  getRelevantSnippet,
  formatSources
};
