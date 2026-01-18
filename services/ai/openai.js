const OpenAI = require('openai');

/**
 * OpenAI Chat Service
 */
class OpenAIService {
  constructor(apiKey) {
    this.client = new OpenAI({ apiKey });
  }

  /**
   * Generate a chat completion with context
   * @param {string} message - User message
   * @param {string} context - RAG context from articles/podcasts
   * @param {Array} history - Chat history
   * @param {string} model - Model to use (optional)
   * @returns {Promise<Object>} - Response with content and usage
   */
  async chat(message, context, history = [], model = 'gpt-4o') {
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

    const messages = [
      { role: 'system', content: systemPrompt + contextMessage },
      ...history.map(h => ({
        role: h.role,
        content: h.content
      })),
      { role: 'user', content: message }
    ];

    try {
      const completion = await this.client.chat.completions.create({
        model: model,
        messages,
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
        model: completion.model,
        provider: 'openai'
      };
    } catch (error) {
      console.error('OpenAI chat error:', error);
      throw new Error(`OpenAI API error: ${error.message}`);
    }
  }

  /**
   * Test if the API key is valid
   * @returns {Promise<boolean>}
   */
  async testConnection() {
    try {
      await this.client.models.list();
      return true;
    } catch (error) {
      return false;
    }
  }
}

module.exports = OpenAIService;
