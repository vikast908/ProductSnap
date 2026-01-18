const { GoogleGenerativeAI } = require('@google/generative-ai');

/**
 * Google Gemini Chat Service
 */
class GoogleAIService {
  constructor(apiKey) {
    this.client = new GoogleGenerativeAI(apiKey);
    this.defaultModel = 'gemini-1.5-pro';
  }

  /**
   * Generate a chat completion with context
   * @param {string} message - User message
   * @param {string} context - RAG context from articles/podcasts
   * @param {Array} history - Chat history
   * @param {string} modelName - Model to use (optional)
   * @returns {Promise<Object>} - Response with content and usage
   */
  async chat(message, context, history = [], modelName = 'gemini-1.5-pro') {
    const model = this.client.getGenerativeModel({ model: modelName });
    const systemPrompt = `You are a helpful assistant for "ProductSnap" - a content aggregator focused on product management, design, and tech leadership.

You have access to articles and podcast transcripts from top product management sources. When answering questions, use the provided context to give accurate, source-backed responses.

## Response Guidelines

### Content
- Always cite sources when using information from the provided context (e.g., "According to [Source 1]...")
- If the context doesn't contain relevant information, say so and provide general knowledge
- Be concise but thorough
- When referencing podcasts, mention the guest name and that it's from Lenny's Podcast

### Formatting (Use Rich Markdown)
- Use **bold** for key terms and important concepts
- Use \`inline code\` for technical terms, commands, or metrics
- Use bullet points or numbered lists for multiple items
- Use > blockquotes for direct quotes from sources
- Use ### headings to organize longer responses
- Use tables when comparing multiple items or options
- Use code blocks with language tags for any code examples:
  \`\`\`javascript
  // code here
  \`\`\`
- Keep paragraphs short (2-3 sentences max) for readability

### Structure
- Start with a brief direct answer (1-2 sentences)
- Follow with supporting details and examples from sources
- End with a summary or actionable takeaways when appropriate`;

    const contextMessage = context
      ? `\n\nRelevant context from articles and podcasts:\n${context}`
      : '';

    // Build conversation for Gemini
    const fullPrompt = `${systemPrompt}${contextMessage}

Previous conversation:
${history.map(h => `${h.role === 'user' ? 'User' : 'Assistant'}: ${h.content}`).join('\n')}

User: ${message}

Please respond:`;

    try {
      const result = await model.generateContent(fullPrompt);
      const response = result.response;
      const text = response.text();

      return {
        content: text,
        usage: {
          promptTokens: 0, // Gemini doesn't return token counts the same way
          completionTokens: 0,
          totalTokens: 0
        },
        model: modelName,
        provider: 'google'
      };
    } catch (error) {
      console.error('Google AI chat error:', error);
      throw new Error(`Google AI API error: ${error.message}`);
    }
  }

  /**
   * Test if the API key is valid
   * @returns {Promise<boolean>}
   */
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
