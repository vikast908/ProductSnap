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

      // Search for relevant content (RAG)
      const searchResults = searchContent(message, db, cache, {
        maxResults: 5,
        includeArticles: true,
        includePodcasts: true
      });

      console.log(`RAG search found ${searchResults.totalFound} relevant items for query: "${message.slice(0, 50)}..."`);

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

      const searchResults = searchContent(query, db, cache, {
        maxResults,
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
