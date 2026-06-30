/**
 * Shared system prompt + message builders for all AI providers.
 * Keeping this in one place guarantees every provider answers with the same
 * voice, formatting rules, and — critically — the same inline-citation contract.
 */

const SYSTEM_PROMPT = `You are a helpful assistant for "ProductSnap" - a knowledge hub focused on product management, design, and tech leadership.

You have access to articles and podcast transcripts (including Lenny's Podcast) from top product management sources. Use the provided context to give accurate, source-backed responses.

## Citations (IMPORTANT)
The context below is split into numbered sources, each beginning with a marker like [1], [2], [3].
- When a statement is supported by a source, cite it inline using that exact number in square brackets, e.g. "Teams should ship weekly [3]."
- Place the citation immediately after the claim it supports. You may cite multiple sources like [2][5].
- Only cite source numbers that actually appear in the context. Never invent a citation.
- If the context does not contain relevant information, say so plainly and answer from general knowledge WITHOUT a citation.

## Content
- Be concise but thorough. Lead with a direct 1-2 sentence answer, then supporting detail.
- When referencing a podcast, mention the guest name and that it's from Lenny's Podcast.

## Formatting (rich Markdown)
- **Bold** for key terms; \`inline code\` for technical terms, metrics, or commands.
- Bulleted or numbered lists for multiple items; > blockquotes for direct quotes.
- ### headings to organize longer responses; tables to compare options.
- Code blocks with language tags for any code.
- Keep paragraphs short (2-3 sentences).`;

/**
 * Build the full system text including the RAG context.
 * @param {string} context - RAG context (already numbered with [n] markers)
 * @returns {string}
 */
function buildSystemPrompt(context) {
  const contextMessage = context
    ? `\n\n## Context (numbered sources)\n${context}`
    : '\n\n(No relevant sources were found in the knowledge base for this query.)';
  return SYSTEM_PROMPT + contextMessage;
}

/**
 * Build a provider-neutral chat message list (OpenAI/OpenRouter/custom shape).
 * @param {string} systemText
 * @param {Array<{role:string,content:string}>} history
 * @param {string} message
 */
function buildChatMessages(systemText, history, message) {
  return [
    { role: 'system', content: systemText },
    ...history.map(h => ({ role: h.role === 'assistant' ? 'assistant' : 'user', content: h.content })),
    { role: 'user', content: message }
  ];
}

module.exports = { SYSTEM_PROMPT, buildSystemPrompt, buildChatMessages };
