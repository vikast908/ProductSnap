const OpenAIService = require('./openai');
const AnthropicService = require('./anthropic');
const GoogleAIService = require('./google');

/**
 * Factory function to create AI service based on provider
 * @param {string} provider - 'openai', 'anthropic', or 'google'
 * @param {string} apiKey - API key for the provider
 * @returns {Object} - AI service instance
 */
function createAIService(provider, apiKey) {
  switch (provider) {
    case 'openai':
      return new OpenAIService(apiKey);
    case 'anthropic':
      return new AnthropicService(apiKey);
    case 'google':
      return new GoogleAIService(apiKey);
    default:
      throw new Error(`Unknown AI provider: ${provider}`);
  }
}

/**
 * Get list of available AI providers
 * @returns {Array} - List of provider info
 */
function getAvailableProviders() {
  return [
    {
      id: 'openai',
      name: 'OpenAI',
      models: ['gpt-4-turbo-preview', 'gpt-4', 'gpt-3.5-turbo'],
      description: 'GPT-4 and GPT-3.5 models from OpenAI'
    },
    {
      id: 'anthropic',
      name: 'Anthropic',
      models: ['claude-3-opus', 'claude-3-sonnet', 'claude-3-haiku'],
      description: 'Claude 3 models from Anthropic'
    },
    {
      id: 'google',
      name: 'Google AI',
      models: ['gemini-pro'],
      description: 'Gemini Pro from Google'
    }
  ];
}

module.exports = {
  createAIService,
  getAvailableProviders,
  OpenAIService,
  AnthropicService,
  GoogleAIService
};
