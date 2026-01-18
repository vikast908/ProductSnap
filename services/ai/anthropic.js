const Anthropic = require('@anthropic-ai/sdk');

/**
 * Anthropic (Claude) Chat Service
 */
class AnthropicService {
  constructor(apiKey) {
    this.client = new Anthropic({ apiKey });
  }

  /**
   * Generate a chat completion with context
   * @param {string} message - User message
   * @param {string} context - RAG context from articles/podcasts
   * @param {Array} history - Chat history
   * @param {string} model - Model to use (optional)
   * @returns {Promise<Object>} - Response with content and usage
   */
  async chat(message, context, history = [], model = 'claude-sonnet-4-20250514') {
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

    // Convert history to Anthropic format
    const messages = [
      ...history.map(h => ({
        role: h.role === 'assistant' ? 'assistant' : 'user',
        content: h.content
      })),
      { role: 'user', content: message }
    ];

    try {
      const completion = await this.client.messages.create({
        model: model,
        max_tokens: 2000,
        system: systemPrompt + contextMessage,
        messages
      });

      return {
        content: completion.content[0]?.text || '',
        usage: {
          promptTokens: completion.usage?.input_tokens || 0,
          completionTokens: completion.usage?.output_tokens || 0,
          totalTokens: (completion.usage?.input_tokens || 0) + (completion.usage?.output_tokens || 0)
        },
        model: completion.model,
        provider: 'anthropic'
      };
    } catch (error) {
      console.error('Anthropic chat error:', error);
      throw new Error(`Anthropic API error: ${error.message}`);
    }
  }

  /**
   * Test if the API key is valid
   * @returns {Promise<boolean>}
   */
  async testConnection() {
    try {
      await this.client.messages.create({
        model: 'claude-3-haiku-20240307',
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
