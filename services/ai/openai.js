const OpenAI = require('openai');
const { buildSystemPrompt, buildChatMessages } = require('./prompt');

/**
 * OpenAI-compatible chat service.
 *
 * Used for OpenAI itself and for any OpenAI-compatible endpoint
 * (OpenRouter, a local model server, a proxy, etc.) by passing `baseURL`.
 */
class OpenAIService {
  /**
   * @param {string} apiKey
   * @param {Object} [options]
   * @param {string} [options.provider='openai'] - provider id used in responses
   * @param {string} [options.baseURL] - OpenAI-compatible base URL
   * @param {string} [options.defaultModel='gpt-4o']
   * @param {Object} [options.defaultHeaders]
   */
  constructor(apiKey, options = {}) {
    this.provider = options.provider || 'openai';
    this.defaultModel = options.defaultModel || 'gpt-4o';
    const clientOpts = { apiKey };
    if (options.baseURL) clientOpts.baseURL = options.baseURL;
    if (options.defaultHeaders) clientOpts.defaultHeaders = options.defaultHeaders;
    this.client = new OpenAI(clientOpts);
  }

  _messages(message, context, history) {
    return buildChatMessages(buildSystemPrompt(context), history, message);
  }

  /**
   * Non-streaming completion (used by verify and as a fallback).
   */
  async chat(message, context, history = [], model) {
    const useModel = model || this.defaultModel;
    try {
      const completion = await this.client.chat.completions.create({
        model: useModel,
        messages: this._messages(message, context, history),
        max_tokens: 2000,
        temperature: 0.7
      });

      return {
        content: completion.choices[0]?.message?.content || '',
        usage: {
          promptTokens: completion.usage?.prompt_tokens || 0,
          completionTokens: completion.usage?.completion_tokens || 0,
          totalTokens: completion.usage?.total_tokens || 0
        },
        model: completion.model || useModel,
        provider: this.provider
      };
    } catch (error) {
      console.error(`${this.provider} chat error:`, error.message);
      throw this._normalizeError(error);
    }
  }

  /**
   * Streaming completion. Calls onText(delta) for each token chunk.
   * @returns {Promise<{usage, model, provider}>} final metadata
   */
  async chatStream(message, context, history = [], model, { onText, signal } = {}) {
    const useModel = model || this.defaultModel;
    let usage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
    let resolvedModel = useModel;
    try {
      const stream = await this.client.chat.completions.create(
        {
          model: useModel,
          messages: this._messages(message, context, history),
          max_tokens: 2000,
          temperature: 0.7,
          stream: true,
          stream_options: { include_usage: true }
        },
        signal ? { signal } : undefined
      );

      for await (const chunk of stream) {
        if (signal?.aborted) { const e = new Error('aborted'); e.code = 'ABORTED'; throw e; }
        if (chunk.model) resolvedModel = chunk.model;
        const delta = chunk.choices?.[0]?.delta?.content;
        if (delta && onText) onText(delta);
        if (chunk.usage) {
          usage = {
            promptTokens: chunk.usage.prompt_tokens || 0,
            completionTokens: chunk.usage.completion_tokens || 0,
            totalTokens: chunk.usage.total_tokens || 0
          };
        }
      }

      if (signal?.aborted) { const e = new Error('aborted'); e.code = 'ABORTED'; throw e; }
      return { usage, model: resolvedModel, provider: this.provider };
    } catch (error) {
      if (error?.code === 'ABORTED' || error?.name === 'AbortError' || signal?.aborted) {
        const abErr = new Error('aborted');
        abErr.code = 'ABORTED';
        throw abErr;
      }
      console.error(`${this.provider} stream error:`, error.message);
      throw this._normalizeError(error);
    }
  }

  _normalizeError(error) {
    const status = error?.status || error?.response?.status;
    const e = new Error(error?.message || `${this.provider} API error`);
    e.code = 'AI_API_ERROR';
    if (status) e.status = status;
    return e;
  }

  /**
   * Validate the API key (and base URL for compatible providers).
   */
  async testConnection() {
    try {
      await this.client.models.list();
      return true;
    } catch (error) {
      // Some compatible endpoints don't expose /models — fall back to a tiny call.
      try {
        await this.client.chat.completions.create({
          model: this.defaultModel,
          messages: [{ role: 'user', content: 'hi' }],
          max_tokens: 1
        });
        return true;
      } catch (e2) {
        return false;
      }
    }
  }
}

module.exports = OpenAIService;
