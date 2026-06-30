const OpenAIService = require('./openai');
const AnthropicService = require('./anthropic');
const GoogleAIService = require('./google');

/**
 * Provider registry — single source of truth for providers, their selectable
 * models (with details), API-key format hints, and key-validation patterns.
 *
 * Consumed by routes/chat.js (model resolution) and routes/settings.js
 * (key validation, hasApiKeys/keyPreviews) so neither hardcodes a provider list.
 */

const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';

const PROVIDERS = [
  {
    id: 'openai',
    name: 'OpenAI',
    description: 'GPT models from OpenAI.',
    docsUrl: 'https://platform.openai.com/api-keys',
    keyPlaceholder: 'sk-...',
    keyHint: 'Starts with "sk-"',
    defaultModel: 'gpt-4o',
    models: [
      { id: 'gpt-4o', name: 'GPT-4o', context: '128K', description: 'Flagship multimodal model — fast and capable.' },
      { id: 'gpt-4o-mini', name: 'GPT-4o mini', context: '128K', description: 'Small, fast, and affordable.' },
      { id: 'gpt-4.1', name: 'GPT-4.1', context: '1M', description: 'Strong coding and long-context reasoning.' },
      { id: 'gpt-4.1-mini', name: 'GPT-4.1 mini', context: '1M', description: 'Cost-efficient long-context model.' },
      { id: 'o4-mini', name: 'o4-mini', context: '200K', description: 'Fast reasoning model for hard problems.' }
    ]
  },
  {
    id: 'anthropic',
    name: 'Anthropic (Claude)',
    description: 'Claude models from Anthropic.',
    docsUrl: 'https://console.anthropic.com/settings/keys',
    keyPlaceholder: 'sk-ant-...',
    keyHint: 'Starts with "sk-ant-"',
    defaultModel: 'claude-opus-4-8',
    models: [
      { id: 'claude-opus-4-8', name: 'Claude Opus 4.8', context: '1M', description: 'Most capable Opus — best for hard reasoning & agentic work.' },
      { id: 'claude-fable-5', name: 'Claude Fable 5', context: '1M', description: 'Most capable overall (requires 30-day data retention).' },
      { id: 'claude-sonnet-4-6', name: 'Claude Sonnet 4.6', context: '1M', description: 'Best balance of speed and intelligence.' },
      { id: 'claude-haiku-4-5', name: 'Claude Haiku 4.5', context: '200K', description: 'Fastest and most affordable.' }
    ]
  },
  {
    id: 'google',
    name: 'Google (Gemini)',
    description: 'Gemini models from Google AI Studio.',
    docsUrl: 'https://aistudio.google.com/app/apikey',
    keyPlaceholder: 'AIza...',
    keyHint: 'Google AI Studio API key',
    defaultModel: 'gemini-1.5-pro',
    models: [
      { id: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro', context: '2M', description: 'Long-context, highly capable.' },
      { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash', context: '1M', description: 'Fast, multimodal, low cost.' },
      { id: 'gemini-1.5-flash', name: 'Gemini 1.5 Flash', context: '1M', description: 'Fastest, most affordable Gemini.' }
    ]
  },
  {
    id: 'openrouter',
    name: 'OpenRouter',
    description: 'One key, hundreds of models routed through OpenRouter.',
    docsUrl: 'https://openrouter.ai/keys',
    keyPlaceholder: 'sk-or-...',
    keyHint: 'Starts with "sk-or-"',
    defaultModel: 'anthropic/claude-3.5-sonnet',
    allowCustomModel: true,
    models: [
      { id: 'anthropic/claude-3.5-sonnet', name: 'Claude 3.5 Sonnet', context: '200K', description: 'Anthropic Claude via OpenRouter.' },
      { id: 'openai/gpt-4o', name: 'GPT-4o', context: '128K', description: 'OpenAI GPT-4o via OpenRouter.' },
      { id: 'google/gemini-flash-1.5', name: 'Gemini Flash 1.5', context: '1M', description: 'Google Gemini Flash via OpenRouter.' },
      { id: 'meta-llama/llama-3.3-70b-instruct', name: 'Llama 3.3 70B', context: '128K', description: 'Open-weight Meta Llama.' },
      { id: 'deepseek/deepseek-chat', name: 'DeepSeek Chat', context: '64K', description: 'DeepSeek V3 general chat.' }
    ]
  },
  {
    id: 'custom',
    name: 'Custom (OpenAI-compatible)',
    description: 'Any OpenAI-compatible endpoint — local models, proxies, self-hosted servers.',
    docsUrl: 'https://github.com/openai/openai-openapi',
    keyPlaceholder: 'your-api-key (or "none")',
    keyHint: 'Requires a Base URL below',
    defaultModel: '',
    allowCustomModel: true,
    requiresBaseUrl: true,
    models: []
  }
];

const PROVIDER_IDS = PROVIDERS.map(p => p.id);

// SECURITY: format patterns checked before any key is stored or used.
const API_KEY_PATTERNS = {
  openai: /^sk-[A-Za-z0-9_\-]+$/,
  anthropic: /^sk-ant-[A-Za-z0-9_\-]+$/,
  google: /^[A-Za-z0-9_\-]+$/,
  openrouter: /^sk-or-[A-Za-z0-9_\-]+$/,
  // Custom endpoints define their own auth — accept any non-whitespace token.
  custom: /^\S.*$/
};

function getProvider(id) {
  return PROVIDERS.find(p => p.id === id);
}

function getProviderDefaultModel(id) {
  return getProvider(id)?.defaultModel || undefined;
}

/**
 * Factory: build an AI service for a provider.
 * @param {string} provider
 * @param {string} apiKey
 * @param {Object} [opts]
 * @param {string} [opts.baseURL] - required for 'custom'
 * @param {string} [opts.defaultModel]
 */
function createAIService(provider, apiKey, opts = {}) {
  switch (provider) {
    case 'openai':
      return new OpenAIService(apiKey, { provider: 'openai', defaultModel: getProviderDefaultModel('openai') });
    case 'anthropic':
      return new AnthropicService(apiKey);
    case 'google':
      return new GoogleAIService(apiKey);
    case 'openrouter':
      return new OpenAIService(apiKey, {
        provider: 'openrouter',
        baseURL: OPENROUTER_BASE_URL,
        defaultModel: opts.defaultModel || getProviderDefaultModel('openrouter'),
        defaultHeaders: { 'HTTP-Referer': 'https://productsnap.app', 'X-Title': 'ProductSnap' }
      });
    case 'custom': {
      if (!opts.baseURL) throw new Error('Custom provider requires a Base URL');
      return new OpenAIService(apiKey, {
        provider: 'custom',
        baseURL: opts.baseURL,
        defaultModel: opts.defaultModel || 'gpt-4o'
      });
    }
    default:
      throw new Error(`Unknown AI provider: ${provider}`);
  }
}

/**
 * Public provider list (no secrets) for the client to render.
 */
function getAvailableProviders() {
  return PROVIDERS.map(p => ({
    id: p.id,
    name: p.name,
    description: p.description,
    docsUrl: p.docsUrl,
    keyPlaceholder: p.keyPlaceholder,
    keyHint: p.keyHint,
    defaultModel: p.defaultModel,
    allowCustomModel: !!p.allowCustomModel,
    requiresBaseUrl: !!p.requiresBaseUrl,
    models: p.models
  }));
}

module.exports = {
  PROVIDERS,
  PROVIDER_IDS,
  API_KEY_PATTERNS,
  OPENROUTER_BASE_URL,
  createAIService,
  getAvailableProviders,
  getProvider,
  getProviderDefaultModel,
  OpenAIService,
  AnthropicService,
  GoogleAIService
};
