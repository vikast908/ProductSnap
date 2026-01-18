const express = require('express');
const rateLimit = require('express-rate-limit');
const { authenticateToken } = require('../middleware/auth');
const { encryptApiKeys, decryptApiKeys } = require('../services/encryption');

const router = express.Router();

// SECURITY: Strict rate limiter for API key verification (prevents brute force)
const apiKeyVerifyLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 5, // Only 5 verifications per minute per IP
  message: { error: 'Too many API key verification attempts. Please wait a minute.' }
});

// SECURITY: Constants for validation
const MAX_API_KEY_LENGTH = 256;
const API_KEY_PATTERNS = {
  openai: /^sk-[A-Za-z0-9_-]+$/,
  anthropic: /^sk-ant-[A-Za-z0-9_-]+$/,
  google: /^[A-Za-z0-9_-]+$/
};

/**
 * Create settings routes
 * @param {Object} db - LowDB instance
 * @returns {Router} - Express router
 */
function createSettingsRoutes(db) {

  // Get user settings
  router.get('/', authenticateToken, (req, res) => {
    try {
      const user = db.get('users').find({ id: req.user.id }).value();

      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      // Helper to get last 4 chars of decrypted key for preview
      const getKeyPreview = (encryptedKey, provider) => {
        if (!encryptedKey) return null;
        try {
          const decrypted = decryptApiKeys({ [provider]: encryptedKey });
          const key = decrypted[provider];
          if (key && key.length >= 4) {
            return '...' + key.slice(-4);
          }
          return '...****';
        } catch (e) {
          return '...****';
        }
      };

      // Return settings without exposing full API keys, but show last 4 chars
      const settings = {
        preferences: user.settings?.preferences || {
          defaultAIProvider: 'openai',
          theme: 'dark'
        },
        hasApiKeys: {
          openai: !!user.settings?.apiKeys?.openai,
          anthropic: !!user.settings?.apiKeys?.anthropic,
          google: !!user.settings?.apiKeys?.google
        },
        keyPreviews: {
          openai: getKeyPreview(user.settings?.apiKeys?.openai, 'openai'),
          anthropic: getKeyPreview(user.settings?.apiKeys?.anthropic, 'anthropic'),
          google: getKeyPreview(user.settings?.apiKeys?.google, 'google')
        }
      };

      res.json(settings);
    } catch (error) {
      console.error('Get settings error:', error);
      res.status(500).json({ error: 'Failed to get settings' });
    }
  });

  // Update user preferences
  router.put('/', authenticateToken, (req, res) => {
    try {
      const { preferences } = req.body;

      if (!preferences) {
        return res.status(400).json({ error: 'Preferences required' });
      }

      const user = db.get('users').find({ id: req.user.id }).value();

      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      // Validate preferences
      const validProviders = ['openai', 'anthropic', 'google'];
      const validThemes = ['light', 'dark', 'system', 'newspaper', 'kindle', 'got', 'lotr', 'hp', 'amazon', 'sahara', 'avatar'];

      if (preferences.defaultAIProvider && !validProviders.includes(preferences.defaultAIProvider)) {
        return res.status(400).json({ error: 'Invalid AI provider' });
      }

      if (preferences.theme && !validThemes.includes(preferences.theme)) {
        return res.status(400).json({ error: 'Invalid theme' });
      }

      // Update preferences
      const updatedSettings = {
        ...user.settings,
        preferences: {
          ...user.settings?.preferences,
          ...preferences
        }
      };

      db.get('users')
        .find({ id: req.user.id })
        .assign({ settings: updatedSettings })
        .write();

      res.json({
        success: true,
        preferences: updatedSettings.preferences
      });
    } catch (error) {
      console.error('Update settings error:', error);
      res.status(500).json({ error: 'Failed to update settings' });
    }
  });

  // Save API keys (encrypted)
  router.put('/api-keys', authenticateToken, (req, res) => {
    try {
      const { apiKeys } = req.body;

      if (!apiKeys || typeof apiKeys !== 'object') {
        return res.status(400).json({ error: 'API keys object required' });
      }

      const user = db.get('users').find({ id: req.user.id }).value();

      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      // Validate API key structure
      const validProviders = ['openai', 'anthropic', 'google'];
      for (const provider of Object.keys(apiKeys)) {
        if (!validProviders.includes(provider)) {
          return res.status(400).json({ error: `Invalid provider: ${provider}` });
        }
      }

      // SECURITY: Validate API key values
      for (const [provider, key] of Object.entries(apiKeys)) {
        if (key === null || key === '' || key === undefined) continue; // Allow removal

        if (typeof key !== 'string') {
          return res.status(400).json({ error: `Invalid API key type for ${provider}` });
        }

        // Length check
        if (key.length > MAX_API_KEY_LENGTH) {
          return res.status(400).json({ error: `API key for ${provider} is too long` });
        }

        // Format check (basic pattern matching)
        const pattern = API_KEY_PATTERNS[provider];
        if (pattern && !pattern.test(key)) {
          return res.status(400).json({ error: `Invalid API key format for ${provider}` });
        }
      }

      // Get existing encrypted keys
      const existingKeys = user.settings?.apiKeys || {};

      // Merge with new keys (only update provided ones)
      const mergedKeys = { ...existingKeys };
      for (const [provider, key] of Object.entries(apiKeys)) {
        if (key === null || key === '') {
          // Remove key
          mergedKeys[provider] = null;
        } else if (key && typeof key === 'string') {
          // Encrypt and save new key
          mergedKeys[provider] = encryptApiKeys({ [provider]: key })[provider];
        }
        // If key is undefined, keep existing
      }

      // Update user settings
      const updatedSettings = {
        ...user.settings,
        apiKeys: mergedKeys
      };

      db.get('users')
        .find({ id: req.user.id })
        .assign({ settings: updatedSettings })
        .write();

      // Helper to get last 4 chars of decrypted key for preview
      const getKeyPreview = (encryptedKey, provider) => {
        if (!encryptedKey) return null;
        try {
          const decrypted = decryptApiKeys({ [provider]: encryptedKey });
          const key = decrypted[provider];
          if (key && key.length >= 4) {
            return '...' + key.slice(-4);
          }
          return '...****';
        } catch (e) {
          return '...****';
        }
      };

      res.json({
        success: true,
        hasApiKeys: {
          openai: !!mergedKeys.openai,
          anthropic: !!mergedKeys.anthropic,
          google: !!mergedKeys.google
        },
        keyPreviews: {
          openai: getKeyPreview(mergedKeys.openai, 'openai'),
          anthropic: getKeyPreview(mergedKeys.anthropic, 'anthropic'),
          google: getKeyPreview(mergedKeys.google, 'google')
        }
      });
    } catch (error) {
      console.error('Save API keys error:', error);
      res.status(500).json({ error: 'Failed to save API keys' });
    }
  });

  // Delete specific API key
  router.delete('/api-keys/:provider', authenticateToken, (req, res) => {
    try {
      const { provider } = req.params;

      const validProviders = ['openai', 'anthropic', 'google'];
      if (!validProviders.includes(provider)) {
        return res.status(400).json({ error: 'Invalid provider' });
      }

      const user = db.get('users').find({ id: req.user.id }).value();

      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      // Remove the key
      const updatedApiKeys = {
        ...user.settings?.apiKeys,
        [provider]: null
      };

      const updatedSettings = {
        ...user.settings,
        apiKeys: updatedApiKeys
      };

      db.get('users')
        .find({ id: req.user.id })
        .assign({ settings: updatedSettings })
        .write();

      res.json({
        success: true,
        message: `${provider} API key removed`
      });
    } catch (error) {
      console.error('Delete API key error:', error);
      res.status(500).json({ error: 'Failed to delete API key' });
    }
  });

  // Verify an API key works (test it)
  // SECURITY: Apply strict rate limiting to prevent abuse
  router.post('/api-keys/verify/:provider', authenticateToken, apiKeyVerifyLimiter, async (req, res) => {
    try {
      const { provider } = req.params;
      const { apiKey } = req.body;

      if (!apiKey) {
        return res.status(400).json({ error: 'API key required' });
      }

      const validProviders = ['openai', 'anthropic', 'google'];
      if (!validProviders.includes(provider)) {
        return res.status(400).json({ error: 'Invalid provider' });
      }

      // SECURITY: Validate API key format before making external calls
      if (typeof apiKey !== 'string' || apiKey.length > MAX_API_KEY_LENGTH) {
        return res.status(400).json({ error: 'Invalid API key format' });
      }

      const pattern = API_KEY_PATTERNS[provider];
      if (pattern && !pattern.test(apiKey)) {
        return res.status(400).json({ error: 'Invalid API key format' });
      }

      // Test the API key by making a simple request
      let isValid = false;
      let errorMessage = null;

      try {
        if (provider === 'openai') {
          const OpenAI = require('openai');
          const client = new OpenAI({ apiKey });
          await client.models.list();
          isValid = true;
        } else if (provider === 'anthropic') {
          const Anthropic = require('@anthropic-ai/sdk');
          const client = new Anthropic({ apiKey });
          // Anthropic doesn't have a simple list endpoint, so we do a minimal completion
          await client.messages.create({
            model: 'claude-3-haiku-20240307',
            max_tokens: 1,
            messages: [{ role: 'user', content: 'hi' }]
          });
          isValid = true;
        } else if (provider === 'google') {
          const { GoogleGenerativeAI } = require('@google/generative-ai');
          const client = new GoogleGenerativeAI(apiKey);
          const model = client.getGenerativeModel({ model: 'gemini-pro' });
          await model.generateContent('hi');
          isValid = true;
        }
      } catch (error) {
        // SECURITY: Don't expose detailed error messages
        errorMessage = 'API key verification failed';
      }

      res.json({
        valid: isValid,
        error: errorMessage
      });
    } catch (error) {
      console.error('Verify API key error:', error);
      res.status(500).json({ error: 'Failed to verify API key' });
    }
  });

  return router;
}

module.exports = createSettingsRoutes;
