const crypto = require('crypto');

// SECURITY: Require ENCRYPTION_KEY to be set - never use defaults
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY;
if (!ENCRYPTION_KEY || ENCRYPTION_KEY.length < 32) {
  console.error('FATAL: ENCRYPTION_KEY environment variable must be set and be at least 32 characters');
  process.exit(1);
}

// Derive a proper 256-bit key from the environment variable
const KEY = crypto.scryptSync(ENCRYPTION_KEY, 'ProductSnap-Salt-v1', 32);

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;

/**
 * Encrypt a string using AES-256-GCM with random IV
 * @param {string} text - The text to encrypt
 * @returns {string} - The encrypted text (base64: iv:authTag:ciphertext)
 */
function encrypt(text) {
  if (!text) return null;

  try {
    // Generate random IV for each encryption
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, KEY, iv);

    let encrypted = cipher.update(text, 'utf8', 'base64');
    encrypted += cipher.final('base64');

    // Get authentication tag
    const authTag = cipher.getAuthTag();

    // Return iv:authTag:ciphertext format
    return `${iv.toString('base64')}:${authTag.toString('base64')}:${encrypted}`;
  } catch (error) {
    console.error('Encryption error:', error.message);
    return null;
  }
}

/**
 * Decrypt an AES-256-GCM encrypted string
 * @param {string} encryptedText - The encrypted text (format: iv:authTag:ciphertext)
 * @returns {string} - The decrypted text
 */
function decrypt(encryptedText) {
  if (!encryptedText) return null;

  try {
    // Handle legacy CryptoJS format (no colons = old format)
    if (!encryptedText.includes(':')) {
      return decryptLegacy(encryptedText);
    }

    const parts = encryptedText.split(':');
    if (parts.length !== 3) {
      console.error('Invalid encrypted text format');
      return null;
    }

    const [ivBase64, authTagBase64, ciphertext] = parts;
    const iv = Buffer.from(ivBase64, 'base64');
    const authTag = Buffer.from(authTagBase64, 'base64');

    const decipher = crypto.createDecipheriv(ALGORITHM, KEY, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(ciphertext, 'base64', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  } catch (error) {
    console.error('Decryption error:', error.message);
    return null;
  }
}

/**
 * Decrypt legacy CryptoJS encrypted values (for migration)
 * @param {string} encryptedText - Legacy CryptoJS encrypted text
 * @returns {string|null} - Decrypted text or null
 */
function decryptLegacy(encryptedText) {
  try {
    // Try to use CryptoJS for legacy decryption
    const CryptoJS = require('crypto-js');
    const legacyKey = process.env.ENCRYPTION_KEY || '';
    const bytes = CryptoJS.AES.decrypt(encryptedText, legacyKey);
    const result = bytes.toString(CryptoJS.enc.Utf8);
    return result || null;
  } catch (error) {
    console.error('Legacy decryption failed:', error.message);
    return null;
  }
}

/**
 * Encrypt API keys object
 * @param {Object} apiKeys - Object containing API keys
 * @returns {Object} - Object with encrypted API keys
 */
function encryptApiKeys(apiKeys) {
  const encrypted = {};
  for (const [provider, key] of Object.entries(apiKeys)) {
    encrypted[provider] = key ? encrypt(key) : null;
  }
  return encrypted;
}

/**
 * Decrypt API keys object
 * @param {Object} encryptedApiKeys - Object containing encrypted API keys
 * @returns {Object} - Object with decrypted API keys
 */
function decryptApiKeys(encryptedApiKeys) {
  const decrypted = {};
  for (const [provider, encryptedKey] of Object.entries(encryptedApiKeys || {})) {
    decrypted[provider] = encryptedKey ? decrypt(encryptedKey) : null;
  }
  return decrypted;
}

module.exports = {
  encrypt,
  decrypt,
  encryptApiKeys,
  decryptApiKeys
};
