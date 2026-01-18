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
 * Calculate a normalized relevance score (0-100)
 * Takes into account keyword density and match quality
 */
function normalizeScore(score, textLength, keywordCount) {
  if (!score || !textLength || !keywordCount) return 0;
  // Factor in text length and keyword count for fair comparison
  const density = score / (textLength / 1000); // Score per 1000 chars
  const normalized = Math.min(100, Math.round(density * (keywordCount / 3) * 10));
  return normalized;
}

/**
 * Check if query is asking about a specific topic/person
 * Returns weighted keywords for better matching
 */
function analyzeQueryIntent(query) {
  const queryLower = query.toLowerCase();

  // Detect question types
  const isWhoQuestion = /\bwho\b/i.test(query);
  const isHowQuestion = /\bhow\b/i.test(query);
  const isWhatQuestion = /\bwhat\b/i.test(query);
  const isExplainQuestion = /\b(explain|describe|tell me about)\b/i.test(query);

  // Extract quoted terms (highest priority)
  const quotedTerms = query.match(/"([^"]+)"/g)?.map(t => t.replace(/"/g, '')) || [];

  // Extract proper nouns / names (capitalized words not at sentence start)
  const words = query.split(/\s+/);
  const properNouns = words.slice(1).filter(w => /^[A-Z][a-z]/.test(w));

  return {
    isWhoQuestion,
    isHowQuestion,
    isWhatQuestion,
    isExplainQuestion,
    quotedTerms,
    properNouns,
    hasSpecificTarget: quotedTerms.length > 0 || properNouns.length > 0
  };
}

/**
 * Search articles and podcasts for relevant content
 * Uses tiered snippet strategy to optimize token usage:
 * - Tier 1 (top 10): Full 800-char snippets for best relevance
 * - Tier 2 (next 15): Medium 400-char snippets for good coverage
 * - Tier 3 (remaining): Brief 150-char snippets for breadth
 *
 * Improved relevance filtering:
 * - Minimum score threshold to exclude low-relevance results
 * - Normalized scoring for fair comparison across different content lengths
 * - Query intent analysis for better matching
 *
 * @param {string} query - User query
 * @param {Object} db - LowDB instance
 * @param {Object} cache - Cache object containing transcripts
 * @param {Object} options - Search options
 * @returns {Object} - Search results with formatted context
 */
function searchContent(query, db, cache, options = {}) {
  const {
    maxResults = 50,
    includeArticles = true,
    includePodcasts = true,
    userFiles = [],        // User's uploaded files for personalized search
    tier1Count = 10,
    tier1Length = 800,
    tier2Count = 15,
    tier2Length = 400,
    tier3Length = 150,
    minRelevanceScore = 3, // Minimum score threshold to include
    minNormalizedScore = 5  // Minimum normalized score (0-100)
  } = options;

  const keywords = extractKeywords(query);
  const queryIntent = analyzeQueryIntent(query);
  const results = [];

  // Boost keywords based on query intent
  const boostedKeywords = [...keywords];
  queryIntent.quotedTerms.forEach(term => {
    boostedKeywords.unshift(term); // Add quoted terms with highest priority
  });
  queryIntent.properNouns.forEach(noun => {
    boostedKeywords.unshift(noun.toLowerCase());
  });

  // Search articles
  if (includeArticles) {
    const articles = db.get('articles').value() || [];

    for (const article of articles) {
      const titleScore = calculateRelevance(article.title, boostedKeywords) * 4; // Title is very important
      const descScore = calculateRelevance(article.description, boostedKeywords) * 2;
      const contentScore = calculateRelevance(article.content, boostedKeywords);

      // Extra boost for quoted term matches in title
      let exactMatchBonus = 0;
      if (queryIntent.quotedTerms.some(term =>
        article.title?.toLowerCase().includes(term.toLowerCase())
      )) {
        exactMatchBonus = 20;
      }

      // Boost for proper noun (name) matches
      if (queryIntent.properNouns.some(noun =>
        article.title?.toLowerCase().includes(noun.toLowerCase()) ||
        article.content?.toLowerCase().includes(noun.toLowerCase())
      )) {
        exactMatchBonus += 10;
      }

      const totalScore = titleScore + descScore + contentScore + exactMatchBonus;
      const textLength = (article.title?.length || 0) + (article.description?.length || 0) + (article.content?.length || 0);
      const normalizedScore = normalizeScore(totalScore, textLength, keywords.length);

      // Only include if meets both thresholds
      if (totalScore >= minRelevanceScore && normalizedScore >= minNormalizedScore) {
        results.push({
          type: 'article',
          id: article.id,
          title: article.title,
          source: article.feedName,
          url: article.link,
          pubDate: article.pubDate,
          score: totalScore,
          normalizedScore,
          relevance: normalizedScore >= 50 ? 'high' : normalizedScore >= 20 ? 'medium' : 'low',
          content: article.content || article.description || ''
        });
      }
    }
  }

  // Search podcast transcripts
  if (includePodcasts && cache.transcripts) {
    for (const transcript of cache.transcripts) {
      const titleScore = calculateRelevance(transcript.title, boostedKeywords) * 3;
      const guestScore = calculateRelevance(transcript.guest, boostedKeywords) * 5; // Guest name very important
      const contentScore = calculateRelevance(transcript.content, boostedKeywords);

      // Extra boost for guest name matches (especially for "who" questions)
      let exactMatchBonus = 0;
      if (queryIntent.isWhoQuestion || queryIntent.properNouns.length > 0) {
        if (queryIntent.properNouns.some(noun =>
          transcript.guest?.toLowerCase().includes(noun.toLowerCase())
        ) || queryIntent.quotedTerms.some(term =>
          transcript.guest?.toLowerCase().includes(term.toLowerCase())
        )) {
          exactMatchBonus = 30;
        }
      }

      const totalScore = titleScore + guestScore + contentScore + exactMatchBonus;
      const textLength = (transcript.title?.length || 0) + (transcript.guest?.length || 0) + (transcript.content?.length || 0);
      const normalizedScore = normalizeScore(totalScore, textLength, keywords.length);

      if (totalScore >= minRelevanceScore && normalizedScore >= minNormalizedScore) {
        results.push({
          type: 'podcast',
          id: transcript.id,
          title: transcript.title,
          guest: transcript.guest,
          source: "Lenny's Podcast",
          score: totalScore,
          normalizedScore,
          relevance: normalizedScore >= 50 ? 'high' : normalizedScore >= 20 ? 'medium' : 'low',
          content: transcript.content || ''
        });
      }
    }
  }

  // Search user's uploaded files (prioritize with higher boost since they're personal)
  if (userFiles && userFiles.length > 0) {
    for (const file of userFiles) {
      const titleScore = calculateRelevance(file.originalName, boostedKeywords) * 5; // Filename important
      const contentScore = calculateRelevance(file.content, boostedKeywords);

      // Extra boost for user files to prioritize personal content
      const personalBoost = 15;

      const totalScore = titleScore + contentScore + personalBoost;
      const textLength = (file.originalName?.length || 0) + (file.content?.length || 0);
      const normalizedScore = normalizeScore(totalScore, textLength, keywords.length);

      if (totalScore >= minRelevanceScore) {
        results.push({
          type: 'userFile',
          id: file.id,
          title: file.originalName,
          source: 'My Files',
          score: totalScore,
          normalizedScore,
          relevance: normalizedScore >= 50 ? 'high' : normalizedScore >= 20 ? 'medium' : 'low',
          content: file.content || '',
          uploadedAt: file.uploadedAt
        });
      }
    }
  }

  // Sort by relevance score
  results.sort((a, b) => b.score - a.score);

  // Determine how many results to actually use based on quality
  // If we have lots of high-relevance results, use fewer total
  // If results are mostly low-relevance, be more selective
  const highRelevanceCount = results.filter(r => r.relevance === 'high').length;
  const mediumRelevanceCount = results.filter(r => r.relevance === 'medium').length;

  // Dynamic result count based on quality
  let effectiveMaxResults = maxResults;
  if (highRelevanceCount >= 15) {
    // Lots of high-quality matches, focus on those
    effectiveMaxResults = Math.min(30, maxResults);
  } else if (highRelevanceCount + mediumRelevanceCount < 10) {
    // Few good matches, be more selective
    effectiveMaxResults = Math.min(15, maxResults);
  }

  // Take top results and apply tiered snippets
  const topResults = results.slice(0, effectiveMaxResults).map((result, index) => {
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
      snippet: getRelevantSnippet(result.content, boostedKeywords, snippetLength),
      tier,
      content: undefined
    };
  });

  // Only include high and medium relevance sources for user display
  // Low relevance sources are used for AI context but not shown prominently
  const displayResults = topResults.filter(r => r.relevance !== 'low' || r.tier === 1);

  // Format context for AI with tiered approach
  const contextParts = topResults.map((result, index) => {
    const tierLabel = result.tier === 1 ? '' : result.tier === 2 ? ' (summary)' : ' (brief)';

    if (result.type === 'article') {
      return `[Source ${index + 1}: Article - "${result.title}" from ${result.source}${tierLabel}]
${result.snippet}`;
    } else if (result.type === 'userFile') {
      return `[Source ${index + 1}: User's File - "${result.title}"${tierLabel}]
${result.snippet}`;
    } else {
      return `[Source ${index + 1}: Lenny's Podcast with ${result.guest}${tierLabel}]
${result.snippet}`;
    }
  });

  // Calculate approximate token savings
  const fullTokens = effectiveMaxResults * tier1Length / 4;
  const tieredTokens = (Math.min(tier1Count, effectiveMaxResults) * tier1Length +
    Math.min(tier2Count, Math.max(0, effectiveMaxResults - tier1Count)) * tier2Length +
    Math.max(0, effectiveMaxResults - tier1Count - tier2Count) * tier3Length) / 4;
  const tokenSavings = Math.round((1 - tieredTokens / fullTokens) * 100);

  return {
    results: displayResults, // Only show relevant sources to user
    allResults: topResults,  // All results for AI context
    context: contextParts.join('\n\n'),
    keywords: boostedKeywords.slice(0, 10), // Top keywords used
    totalFound: results.length,
    relevanceBreakdown: {
      high: highRelevanceCount,
      medium: mediumRelevanceCount,
      low: results.length - highRelevanceCount - mediumRelevanceCount
    },
    tokenOptimization: {
      tier1Sources: Math.min(tier1Count, topResults.length),
      tier2Sources: Math.min(tier2Count, Math.max(0, topResults.length - tier1Count)),
      tier3Sources: Math.max(0, topResults.length - tier1Count - tier2Count),
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
    guest: result.guest || null,
    relevance: result.relevance || 'medium',
    normalizedScore: result.normalizedScore || 0,
    tier: result.tier || 3
  }));
}

module.exports = {
  searchContent,
  extractKeywords,
  calculateRelevance,
  getRelevantSnippet,
  formatSources,
  normalizeScore,
  analyzeQueryIntent
};
