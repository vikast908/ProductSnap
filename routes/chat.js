const express = require('express');
const { authenticateToken } = require('../middleware/auth');
const { decryptApiKeys } = require('../services/encryption');
const { createAIService, getAvailableProviders } = require('../services/ai');
const { searchContent, formatSources } = require('../services/rag/search');

const router = express.Router();

/**
 * Create chat routes
 * @param {Object} db - LowDB instance
 * @param {Object} cache - Cache object containing transcripts
 * @returns {Router} - Express router
 */
function createChatRoutes(db, cache) {

  // Get available AI providers
  router.get('/providers', authenticateToken, (req, res) => {
    try {
      const providers = getAvailableProviders();
      const user = db.get('users').find({ id: req.user.id }).value();

      // Mark which providers the user has keys for
      const providersWithStatus = providers.map(p => ({
        ...p,
        hasApiKey: !!user?.settings?.apiKeys?.[p.id]
      }));

      res.json(providersWithStatus);
    } catch (error) {
      console.error('Get providers error:', error);
      res.status(500).json({ error: 'Failed to get providers' });
    }
  });

  // Chat endpoint with RAG
  router.post('/', authenticateToken, async (req, res) => {
    try {
      const { message, provider, history = [] } = req.body;

      if (!message || typeof message !== 'string') {
        return res.status(400).json({ error: 'Message is required' });
      }

      // SECURITY: Validate message length to prevent DoS
      const MAX_MESSAGE_LENGTH = 10000;
      if (message.length > MAX_MESSAGE_LENGTH) {
        return res.status(400).json({ error: `Message too long. Maximum ${MAX_MESSAGE_LENGTH} characters allowed.` });
      }

      // SECURITY: Validate history array
      const MAX_HISTORY_LENGTH = 50;
      const MAX_HISTORY_MESSAGE_LENGTH = 10000;
      if (!Array.isArray(history)) {
        return res.status(400).json({ error: 'History must be an array' });
      }
      if (history.length > MAX_HISTORY_LENGTH) {
        return res.status(400).json({ error: `History too long. Maximum ${MAX_HISTORY_LENGTH} messages allowed.` });
      }
      for (const h of history) {
        if (!h || typeof h.role !== 'string' || typeof h.content !== 'string') {
          return res.status(400).json({ error: 'Invalid history format' });
        }
        if (!['user', 'assistant'].includes(h.role)) {
          return res.status(400).json({ error: 'Invalid history role' });
        }
        if (h.content.length > MAX_HISTORY_MESSAGE_LENGTH) {
          return res.status(400).json({ error: 'History message too long' });
        }
      }

      // SECURITY: Validate provider if specified
      const validProviders = ['openai', 'anthropic', 'google'];
      if (provider && !validProviders.includes(provider)) {
        return res.status(400).json({ error: 'Invalid provider' });
      }

      // Get user and their API keys
      const user = db.get('users').find({ id: req.user.id }).value();

      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      // Determine which provider to use
      const selectedProvider = provider || user.settings?.preferences?.defaultAIProvider || 'openai';

      // Get the API key for the selected provider
      const encryptedKey = user.settings?.apiKeys?.[selectedProvider];

      if (!encryptedKey) {
        return res.status(400).json({
          error: `No API key configured for ${selectedProvider}`,
          code: 'NO_API_KEY',
          provider: selectedProvider
        });
      }

      // Decrypt the API key
      const decryptedKeys = decryptApiKeys({ [selectedProvider]: encryptedKey });
      const apiKey = decryptedKeys[selectedProvider];

      if (!apiKey) {
        return res.status(400).json({
          error: 'Failed to decrypt API key',
          code: 'DECRYPTION_ERROR'
        });
      }

      // Get user's uploaded files for personalized RAG
      const userFiles = db.get('userFiles').filter({ userId: req.user.id }).value() || [];

      // Search for relevant content (RAG) - searches ALL articles, podcasts, and user files
      const searchResults = searchContent(message, db, cache, {
        maxResults: 50,
        includeArticles: true,
        includePodcasts: true,
        userFiles: userFiles // Include user's personal files in search
      });

      console.log(`RAG search found ${searchResults.totalFound} relevant items (including ${userFiles.length} user files) for query: "${message.slice(0, 50)}..."`);

      // Get the selected model from user preferences
      const modelKey = `${selectedProvider}Model`;
      const selectedModel = user.settings?.preferences?.[modelKey];

      // Create AI service and generate response
      const aiService = createAIService(selectedProvider, apiKey);

      const response = await aiService.chat(
        message,
        searchResults.context,
        history,
        selectedModel
      );

      console.log(`Using ${selectedProvider} with model: ${selectedModel || 'default'}`);

      // Format sources for the response
      const sources = formatSources(searchResults.results);

      res.json({
        content: response.content,
        sources,
        provider: response.provider,
        model: response.model,
        usage: response.usage,
        searchInfo: {
          totalFound: searchResults.totalFound,
          keywords: searchResults.keywords.slice(0, 10) // Limit keywords in response
        }
      });

    } catch (error) {
      console.error('Chat error:', error);

      // Handle specific API errors
      if (error.message.includes('API')) {
        return res.status(502).json({
          error: error.message,
          code: 'AI_API_ERROR'
        });
      }

      res.status(500).json({ error: 'Failed to process chat message' });
    }
  });

  // Search content without AI (just RAG search)
  router.post('/search', authenticateToken, (req, res) => {
    try {
      const { query, maxResults = 10 } = req.body;

      if (!query || typeof query !== 'string') {
        return res.status(400).json({ error: 'Query is required' });
      }

      // SECURITY: Validate query length
      const MAX_QUERY_LENGTH = 1000;
      if (query.length > MAX_QUERY_LENGTH) {
        return res.status(400).json({ error: `Query too long. Maximum ${MAX_QUERY_LENGTH} characters allowed.` });
      }

      // SECURITY: Validate maxResults
      const MAX_RESULTS_LIMIT = 50;
      const sanitizedMaxResults = Math.min(Math.max(1, parseInt(maxResults) || 10), MAX_RESULTS_LIMIT);

      const searchResults = searchContent(query, db, cache, {
        maxResults: sanitizedMaxResults,
        includeArticles: true,
        includePodcasts: true
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

module.exports = createChatRoutes;
