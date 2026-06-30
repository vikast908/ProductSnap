const { GoogleGenerativeAI } = require('@google/generative-ai');
const { buildSystemPrompt } = require('./prompt');

/**
 * Google Gemini chat service.
 */
class GoogleAIService {
  constructor(apiKey) {
    this.client = new GoogleGenerativeAI(apiKey);
    this.provider = 'google';
    this.defaultModel = 'gemini-1.5-pro';
  }

  _buildPrompt(message, context, history) {
    const system = buildSystemPrompt(context);
    const convo = history.length
      ? `\n\nPrevious conversation:\n${history.map(h => `${h.role === 'user' ? 'User' : 'Assistant'}: ${h.content}`).join('\n')}`
      : '';
    return `${system}${convo}\n\nUser: ${message}\n\nAssistant:`;
  }

  async chat(message, context, history = [], modelName) {
    const useModel = modelName || this.defaultModel;
    try {
      const model = this.client.getGenerativeModel({ model: useModel });
      const result = await model.generateContent(this._buildPrompt(message, context, history));
      const text = result.response.text();
      return {
        content: text,
        usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
        model: useModel,
        provider: this.provider
      };
    } catch (error) {
      console.error('Google AI chat error:', error.message);
      throw this._normalizeError(error);
    }
  }

  async chatStream(message, context, history = [], modelName, { onText, signal } = {}) {
    const useModel = modelName || this.defaultModel;
    try {
      const model = this.client.getGenerativeModel({ model: useModel });
      const result = await model.generateContentStream(this._buildPrompt(message, context, history));
      for await (const chunk of result.stream) {
        if (signal?.aborted) {
          const abErr = new Error('aborted');
          abErr.code = 'ABORTED';
          throw abErr;
        }
        const t = typeof chunk.text === 'function' ? chunk.text() : '';
        if (t && onText) onText(t);
      }
      if (signal?.aborted) { const e = new Error('aborted'); e.code = 'ABORTED'; throw e; }
      return { usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 }, model: useModel, provider: this.provider };
    } catch (error) {
      if (error?.code === 'ABORTED' || signal?.aborted) {
        const abErr = new Error('aborted');
        abErr.code = 'ABORTED';
        throw abErr;
      }
      console.error('Google AI stream error:', error.message);
      throw this._normalizeError(error);
    }
  }

  _normalizeError(error) {
    const e = new Error(error?.message || 'Google AI API error');
    e.code = 'AI_API_ERROR';
    if (error?.status) e.status = error.status;
    return e;
  }

  async testConnection() {
    try {
      const model = this.client.getGenerativeModel({ model: this.defaultModel });
      await model.generateContent('hi');
      return true;
    } catch (error) {
      return false;
    }
  }
}

module.exports = GoogleAIService;
