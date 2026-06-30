const express = require('express');
const { authenticateToken } = require('../middleware/auth');
const { decryptApiKeys } = require('../services/encryption');
const {
  createAIService,
  getAvailableProviders,
  getProviderDefaultModel,
  PROVIDER_IDS
} = require('../services/ai');
const { searchContent, searchHybrid, formatSources } = require('../services/rag/search');
const embeddings = require('../services/rag/embeddings');

const router = express.Router();

// Decide whether a query benefits from LLM rewriting (skip short/name-only lookups
// where lexical is already strong).
function shouldRewrite(message) {
  return message.trim().split(/\s+/).length >= 4;
}

// Expand the question into up to 3 varied search queries to raise semantic recall.
async function rewriteQuery(aiService, message, model) {
  try {
    const prompt = `Rewrite this product-management question into up to 3 short, varied search queries (use synonyms and sub-topics) to maximize retrieval recall over a knowledge base. Return ONLY the queries, one per line — no numbering, no commentary.\n\nQuestion: ${message}`;
    const resp = await aiService.chat(prompt, '', [], model);
    const lines = (resp.content || '')
      .split('\n')
      .map(s => s.replace(/^[-*\d.)\s]+/, '').trim())
      .filter(s => s.length > 2 && s.length < 200)
      .slice(0, 3);
    return [...new Set([message, ...lines])].slice(0, 4);
  } catch (e) {
    return [message];
  }
}

const MAX_MESSAGE_LENGTH = 10000;
const MAX_HISTORY_LENGTH = 50;
const MAX_HISTORY_MESSAGE_LENGTH = 10000;

/**
 * Validate the chat request body. Returns an error object {status, body} or null.
 */
function validateChatBody({ message, provider, history }) {
  if (!message || typeof message !== 'string') {
    return { status: 400, body: { error: 'Message is required' } };
  }
  if (message.length > MAX_MESSAGE_LENGTH) {
    return { status: 400, body: { error: `Message too long. Maximum ${MAX_MESSAGE_LENGTH} characters allowed.` } };
  }
  if (!Array.isArray(history)) {
    return { status: 400, body: { error: 'History must be an array' } };
  }
  if (history.length > MAX_HISTORY_LENGTH) {
    return { status: 400, body: { error: `History too long. Maximum ${MAX_HISTORY_LENGTH} messages allowed.` } };
  }
  for (const h of history) {
    if (!h || typeof h.role !== 'string' || typeof h.content !== 'string') {
      return { status: 400, body: { error: 'Invalid history format' } };
    }
    if (!['user', 'assistant'].includes(h.role)) {
      return { status: 400, body: { error: 'Invalid history role' } };
    }
    if (h.content.length > MAX_HISTORY_MESSAGE_LENGTH) {
      return { status: 400, body: { error: 'History message too long' } };
    }
  }
  if (provider && !PROVIDER_IDS.includes(provider)) {
    return { status: 400, body: { error: 'Invalid provider' } };
  }
  return null;
}

function createChatRoutes(db, cache) {

  // Available AI providers + whether the user has a key configured for each
  router.get('/providers', authenticateToken, (req, res) => {
    try {
      const providers = getAvailableProviders();
      const user = db.get('users').find({ id: req.user.id }).value();
      const withStatus = providers.map(p => ({
        ...p,
        hasApiKey: !!user?.settings?.apiKeys?.[p.id]
      }));
      res.json(withStatus);
    } catch (error) {
      console.error('Get providers error:', error);
      res.status(500).json({ error: 'Failed to get providers' });
    }
  });

  // Streaming chat endpoint with RAG (Server-Sent Events)
  router.post('/', authenticateToken, async (req, res) => {
    const { message, provider, history = [] } = req.body;

    // --- Pre-stream validation (plain JSON errors; status codes matter here) ---
    const invalid = validateChatBody({ message, provider, history });
    if (invalid) return res.status(invalid.status).json(invalid.body);

    const user = db.get('users').find({ id: req.user.id }).value();
    if (!user) return res.status(404).json({ error: 'User not found' });

    const selectedProvider = provider || user.settings?.preferences?.defaultAIProvider || 'openai';
    const encryptedKey = user.settings?.apiKeys?.[selectedProvider];
    if (!encryptedKey) {
      return res.status(400).json({
        error: `No API key configured for ${selectedProvider}`,
        code: 'NO_API_KEY',
        provider: selectedProvider
      });
    }

    const apiKey = decryptApiKeys({ [selectedProvider]: encryptedKey })[selectedProvider];
    if (!apiKey) {
      return res.status(400).json({ error: 'Failed to decrypt API key', code: 'DECRYPTION_ERROR' });
    }

    const prefs = user.settings?.preferences || {};
    const customBaseUrl = prefs.customBaseUrl;
    if (selectedProvider === 'custom' && !customBaseUrl) {
      return res.status(400).json({
        error: 'Custom provider requires a Base URL. Add it in Settings.',
        code: 'CUSTOM_NO_BASE_URL',
        provider: selectedProvider
      });
    }

    const selectedModel = prefs[`${selectedProvider}Model`] || getProviderDefaultModel(selectedProvider);

    // --- Commit to SSE from here on ---
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no'
    });
    const send = (event, data) => {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    // Cancellation: abort the in-flight LLM call when the client disconnects/stops.
    // NOTE: use res 'close' (not req 'close') — req 'close' also fires when the
    // body parser finishes reading the request, which would falsely cancel.
    const controller = new AbortController();
    let clientGone = false;
    let finished = false;
    const finish = () => { finished = true; res.end(); };
    res.on('close', () => { if (!finished) { clientGone = true; controller.abort(); } });

    try {
      const aiService = createAIService(selectedProvider, apiKey, {
        baseURL: customBaseUrl,
        defaultModel: selectedModel
      });
      const userFiles = db.get('userFiles').filter({ userId: req.user.id }).value() || [];

      // Stage 0 (optional): query rewriting for semantic recall.
      let queries = [message];
      if (embeddings.isEnabled() && shouldRewrite(message)) {
        send('stage', { stage: 'rewriting' });
        queries = await rewriteQuery(aiService, message, selectedModel);
        if (clientGone) return finish();
      }

      // Stage 1: hybrid retrieval (lexical + semantic; degrades to lexical if off)
      send('stage', { stage: 'searching' });
      const searchResults = await searchHybrid(queries, db, cache, {
        maxResults: 50,
        includeArticles: true,
        includePodcasts: true,
        userFiles,
        getTranscriptContent: cache.getTranscriptContent
      });

      // Sources are numbered from allResults so inline [n] citations line up exactly.
      const sources = formatSources(searchResults.allResults || searchResults.results);

      // Stage 2: reading top sources — surface what was found (was previously discarded)
      send('stage', {
        stage: 'reading',
        totalFound: searchResults.totalFound,
        keywords: (searchResults.keywords || []).slice(0, 10),
        semanticUsed: !!searchResults.semanticUsed
      });
      send('sources', { sources });

      if (clientGone) return finish();

      // Stage 3: generate, streaming tokens as they arrive
      send('stage', { stage: 'writing', provider: selectedProvider, model: selectedModel });

      const meta = await aiService.chatStream(
        message,
        searchResults.context,
        history,
        selectedModel,
        {
          signal: controller.signal,
          onText: (delta) => { if (!clientGone) send('delta', { text: delta }); }
        }
      );

      send('done', {
        provider: meta.provider,
        model: meta.model,
        usage: meta.usage,
        searchInfo: {
          totalFound: searchResults.totalFound,
          keywords: (searchResults.keywords || []).slice(0, 10)
        }
      });
      finish();
    } catch (error) {
      if (error?.code === 'ABORTED' || clientGone) {
        // Client cancelled — nothing to report back.
        return finish();
      }
      console.error('Chat stream error:', error.message);
      const status = error?.status;
      let code = 'AI_API_ERROR';
      if (status === 429) code = 'RATE_LIMITED';
      else if (status === 401) code = 'INVALID_KEY';
      send('error', {
        code,
        status: status || null,
        error: friendlyError(error, selectedProvider)
      });
      finish();
    }
  });

  // RAG search without AI (unchanged contract)
  router.post('/search', authenticateToken, (req, res) => {
    try {
      const { query, maxResults = 10 } = req.body;
      if (!query || typeof query !== 'string') {
        return res.status(400).json({ error: 'Query is required' });
      }
      const MAX_QUERY_LENGTH = 1000;
      if (query.length > MAX_QUERY_LENGTH) {
        return res.status(400).json({ error: `Query too long. Maximum ${MAX_QUERY_LENGTH} characters allowed.` });
      }
      const MAX_RESULTS_LIMIT = 50;
      const sanitizedMaxResults = Math.min(Math.max(1, parseInt(maxResults) || 10), MAX_RESULTS_LIMIT);
      const searchResults = searchContent(query, db, cache, {
        maxResults: sanitizedMaxResults,
        includeArticles: true,
        includePodcasts: true,
        getTranscriptContent: cache.getTranscriptContent
      });
      res.json({
        results: searchResults.results,
        totalFound: searchResults.totalFound,
        keywords: searchResults.keywords
      });
    } catch (error) {
      console.error('Search error:', error);
      res.status(500).json({ error: 'Search failed' });
    }
  });

  return router;
}

/**
 * Convert raw provider errors into plain-language, user-safe messages.
 */
function friendlyError(error, provider) {
  const status = error?.status;
  if (status === 401) return `Your ${provider} API key was rejected (401). Check it in Settings and re-save.`;
  if (status === 429) return `${provider} is rate-limiting requests (429). Wait a moment and retry.`;
  if (status === 402) return `Your ${provider} account is out of credit (402).`;
  if (status >= 500) return `${provider} is having trouble right now (${status}). Try again shortly.`;
  // Default: a trimmed message, never a raw stack/headers dump.
  const msg = (error?.message || 'Failed to get a response').split('\n')[0];
  return msg.length > 200 ? msg.slice(0, 200) + '…' : msg;
}

module.exports = createChatRoutes;
