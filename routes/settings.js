const express = require('express');
const rateLimit = require('express-rate-limit');
const { authenticateToken } = require('../middleware/auth');
const { encryptApiKeys, decryptApiKeys } = require('../services/encryption');
const { PROVIDER_IDS, API_KEY_PATTERNS, createAIService } = require('../services/ai');

const router = express.Router();

// SECURITY: strict rate limiter for key verification (prevents brute force / abuse)
const apiKeyVerifyLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  message: { error: 'Too many API key verification attempts. Please wait a minute.' }
});

const MAX_API_KEY_LENGTH = 512;
const MAX_BASE_URL_LENGTH = 512;
const VALID_THEMES = ['light', 'dark', 'system', 'newspaper', 'kindle', 'got', 'lotr', 'hp', 'amazon', 'sahara', 'avatar'];

// Last-4 preview of a stored (encrypted) key, never the full key.
function keyPreview(encryptedKey, provider) {
  if (!encryptedKey) return null;
  try {
    const key = decryptApiKeys({ [provider]: encryptedKey })[provider];
    if (key && key.length >= 4) return '...' + key.slice(-4);
    return '...****';
  } catch (e) {
    return '...****';
  }
}

function buildKeyStatus(apiKeys = {}) {
  const hasApiKeys = {};
  const keyPreviews = {};
  for (const id of PROVIDER_IDS) {
    hasApiKeys[id] = !!apiKeys[id];
    keyPreviews[id] = keyPreview(apiKeys[id], id);
  }
  return { hasApiKeys, keyPreviews };
}

function isValidBaseUrl(url) {
  if (typeof url !== 'string' || url.length > MAX_BASE_URL_LENGTH) return false;
  try {
    const u = new URL(url);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

function createSettingsRoutes(db) {

  // Get user settings (no full keys exposed)
  router.get('/', authenticateToken, (req, res) => {
    try {
      const user = db.get('users').find({ id: req.user.id }).value();
      if (!user) return res.status(404).json({ error: 'User not found' });

      const { hasApiKeys, keyPreviews } = buildKeyStatus(user.settings?.apiKeys);
      res.json({
        preferences: user.settings?.preferences || { defaultAIProvider: 'openai', theme: 'system' },
        hasApiKeys,
        keyPreviews
      });
    } catch (error) {
      console.error('Get settings error:', error);
      res.status(500).json({ error: 'Failed to get settings' });
    }
  });

  // Update user preferences
  router.put('/', authenticateToken, (req, res) => {
    try {
      const { preferences } = req.body;
      if (!preferences || typeof preferences !== 'object') {
        return res.status(400).json({ error: 'Preferences required' });
      }

      const user = db.get('users').find({ id: req.user.id }).value();
      if (!user) return res.status(404).json({ error: 'User not found' });

      if (preferences.defaultAIProvider && !PROVIDER_IDS.includes(preferences.defaultAIProvider)) {
        return res.status(400).json({ error: 'Invalid AI provider' });
      }
      if (preferences.theme && !VALID_THEMES.includes(preferences.theme)) {
        return res.status(400).json({ error: 'Invalid theme' });
      }
      if (preferences.customBaseUrl !== undefined && preferences.customBaseUrl !== '' &&
          !isValidBaseUrl(preferences.customBaseUrl)) {
        return res.status(400).json({ error: 'Invalid Base URL (must be http(s))' });
      }
      // Model preference keys must be short strings.
      for (const id of PROVIDER_IDS) {
        const k = `${id}Model`;
        if (preferences[k] !== undefined && (typeof preferences[k] !== 'string' || preferences[k].length > 200)) {
          return res.status(400).json({ error: `Invalid model for ${id}` });
        }
      }

      const updatedSettings = {
        ...user.settings,
        preferences: { ...user.settings?.preferences, ...preferences }
      };
      db.get('users').find({ id: req.user.id }).assign({ settings: updatedSettings }).write();

      res.json({ success: true, preferences: updatedSettings.preferences });
    } catch (error) {
      console.error('Update settings error:', error);
      res.status(500).json({ error: 'Failed to update settings' });
    }
  });

  // Save API keys (encrypted at rest)
  router.put('/api-keys', authenticateToken, (req, res) => {
    try {
      const { apiKeys } = req.body;
      if (!apiKeys || typeof apiKeys !== 'object') {
        return res.status(400).json({ error: 'API keys object required' });
      }

      const user = db.get('users').find({ id: req.user.id }).value();
      if (!user) return res.status(404).json({ error: 'User not found' });

      for (const provider of Object.keys(apiKeys)) {
        if (!PROVIDER_IDS.includes(provider)) {
          return res.status(400).json({ error: `Invalid provider: ${provider}` });
        }
      }

      for (const [provider, key] of Object.entries(apiKeys)) {
        if (key === null || key === '' || key === undefined) continue;
        if (typeof key !== 'string') {
          return res.status(400).json({ error: `Invalid API key type for ${provider}` });
        }
        if (key.length > MAX_API_KEY_LENGTH) {
          return res.status(400).json({ error: `API key for ${provider} is too long` });
        }
        const pattern = API_KEY_PATTERNS[provider];
        if (pattern && !pattern.test(key)) {
          return res.status(400).json({ error: `Invalid API key format for ${provider}` });
        }
      }

      const mergedKeys = { ...(user.settings?.apiKeys || {}) };
      for (const [provider, key] of Object.entries(apiKeys)) {
        if (key === null || key === '') {
          mergedKeys[provider] = null;
        } else if (key && typeof key === 'string') {
          mergedKeys[provider] = encryptApiKeys({ [provider]: key })[provider];
        }
      }

      const updatedSettings = { ...user.settings, apiKeys: mergedKeys };
      db.get('users').find({ id: req.user.id }).assign({ settings: updatedSettings }).write();

      res.json({ success: true, ...buildKeyStatus(mergedKeys) });
    } catch (error) {
      console.error('Save API keys error:', error);
      res.status(500).json({ error: 'Failed to save API keys' });
    }
  });

  // Delete a specific API key
  router.delete('/api-keys/:provider', authenticateToken, (req, res) => {
    try {
      const { provider } = req.params;
      if (!PROVIDER_IDS.includes(provider)) {
        return res.status(400).json({ error: 'Invalid provider' });
      }
      const user = db.get('users').find({ id: req.user.id }).value();
      if (!user) return res.status(404).json({ error: 'User not found' });

      const updatedApiKeys = { ...user.settings?.apiKeys, [provider]: null };
      const updatedSettings = { ...user.settings, apiKeys: updatedApiKeys };
      db.get('users').find({ id: req.user.id }).assign({ settings: updatedSettings }).write();

      res.json({ success: true, message: `${provider} API key removed` });
    } catch (error) {
      console.error('Delete API key error:', error);
      res.status(500).json({ error: 'Failed to delete API key' });
    }
  });

  // Verify an API key actually works (live test call)
  router.post('/api-keys/verify/:provider', authenticateToken, apiKeyVerifyLimiter, async (req, res) => {
    try {
      const { provider } = req.params;
      const { apiKey, baseUrl } = req.body;

      if (!PROVIDER_IDS.includes(provider)) {
        return res.status(400).json({ error: 'Invalid provider' });
      }
      if (!apiKey || typeof apiKey !== 'string' || apiKey.length > MAX_API_KEY_LENGTH) {
        return res.status(400).json({ error: 'Invalid API key format' });
      }
      const pattern = API_KEY_PATTERNS[provider];
      if (pattern && !pattern.test(apiKey)) {
        return res.status(400).json({ error: 'Invalid API key format' });
      }
      if (provider === 'custom') {
        if (!isValidBaseUrl(baseUrl)) {
          return res.json({ valid: false, error: 'A valid Base URL is required for custom endpoints.' });
        }
      }

      let valid = false;
      try {
        const service = createAIService(provider, apiKey, { baseURL: baseUrl });
        valid = await service.testConnection();
      } catch (e) {
        valid = false;
      }

      res.json({ valid, error: valid ? null : 'Verification failed — the key (or endpoint) was rejected.' });
    } catch (error) {
      console.error('Verify API key error:', error);
      res.status(500).json({ error: 'Failed to verify API key' });
    }
  });

  return router;
}

module.exports = createSettingsRoutes;
