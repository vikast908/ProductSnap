const Anthropic = require('@anthropic-ai/sdk');
const { buildSystemPrompt } = require('./prompt');

/**
 * Anthropic (Claude) chat service.
 */
class AnthropicService {
  constructor(apiKey) {
    this.client = new Anthropic({ apiKey });
    this.provider = 'anthropic';
    this.defaultModel = 'claude-opus-4-8';
  }

  _messages(message, history) {
    return [
      ...history.map(h => ({ role: h.role === 'assistant' ? 'assistant' : 'user', content: h.content })),
      { role: 'user', content: message }
    ];
  }

  async chat(message, context, history = [], model) {
    const useModel = model || this.defaultModel;
    try {
      const completion = await this.client.messages.create({
        model: useModel,
        max_tokens: 2000,
        system: buildSystemPrompt(context),
        messages: this._messages(message, history)
      });

      return {
        content: completion.content?.[0]?.text || '',
        usage: {
          promptTokens: completion.usage?.input_tokens || 0,
          completionTokens: completion.usage?.output_tokens || 0,
          totalTokens: (completion.usage?.input_tokens || 0) + (completion.usage?.output_tokens || 0)
        },
        model: completion.model || useModel,
        provider: this.provider
      };
    } catch (error) {
      console.error('Anthropic chat error:', error.message);
      throw this._normalizeError(error);
    }
  }

  async chatStream(message, context, history = [], model, { onText, signal } = {}) {
    const useModel = model || this.defaultModel;
    let usage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
    let resolvedModel = useModel;
    try {
      const stream = await this.client.messages.create(
        {
          model: useModel,
          max_tokens: 2000,
          system: buildSystemPrompt(context),
          messages: this._messages(message, history),
          stream: true
        },
        signal ? { signal } : undefined
      );

      for await (const event of stream) {
        if (signal?.aborted) { const e = new Error('aborted'); e.code = 'ABORTED'; throw e; }
        if (event.type === 'message_start') {
          const u = event.message?.usage;
          if (u) usage.promptTokens = u.input_tokens || 0;
          if (event.message?.model) resolvedModel = event.message.model;
        } else if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta') {
          if (onText) onText(event.delta.text);
        } else if (event.type === 'message_delta' && event.usage) {
          usage.completionTokens = event.usage.output_tokens || usage.completionTokens;
        }
      }
      if (signal?.aborted) { const e = new Error('aborted'); e.code = 'ABORTED'; throw e; }
      usage.totalTokens = usage.promptTokens + usage.completionTokens;
      return { usage, model: resolvedModel, provider: this.provider };
    } catch (error) {
      if (error?.code === 'ABORTED' || error?.name === 'AbortError' || signal?.aborted) {
        const abErr = new Error('aborted');
        abErr.code = 'ABORTED';
        throw abErr;
      }
      console.error('Anthropic stream error:', error.message);
      throw this._normalizeError(error);
    }
  }

  _normalizeError(error) {
    const status = error?.status || error?.response?.status;
    const e = new Error(error?.message || 'Anthropic API error');
    e.code = 'AI_API_ERROR';
    if (status) e.status = status;
    return e;
  }

  async testConnection() {
    try {
      // Cheapest current model for a 1-token probe.
      await this.client.messages.create({
        model: 'claude-haiku-4-5',
        max_tokens: 1,
        messages: [{ role: 'user', content: 'hi' }]
      });
      return true;
    } catch (error) {
      return false;
    }
  }
}

module.exports = AnthropicService;
