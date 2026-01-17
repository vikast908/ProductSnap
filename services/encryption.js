const CryptoJS = require('crypto-js');

const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'default-32-char-encryption-key!!';

/**
 * Encrypt a string using AES-256
 * @param {string} text - The text to encrypt
 * @returns {string} - The encrypted text
 */
function encrypt(text) {
  if (!text) return null;
  return CryptoJS.AES.encrypt(text, ENCRYPTION_KEY).toString();
}

/**
 * Decrypt an AES-256 encrypted string
 * @param {string} encryptedText - The encrypted text
 * @returns {string} - The decrypted text
 */
function decrypt(encryptedText) {
  if (!encryptedText) return null;
  try {
    const bytes = CryptoJS.AES.decrypt(encryptedText, ENCRYPTION_KEY);
    return bytes.toString(CryptoJS.enc.Utf8);
  } catch (error) {
    console.error('Decryption error:', error.message);
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
