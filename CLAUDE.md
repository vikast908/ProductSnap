# ProductSnap - Claude Context File

This file provides context for Claude AI when working on the ProductSnap codebase.

## Project Overview

**ProductSnap** is an AI-powered Product Management knowledge hub that aggregates content from RSS feeds (~5,000 articles), includes 323 Lenny's Podcast transcripts, and provides **hybrid RAG** (lexical + local semantic embeddings) AI chat across multiple AI providers, with streaming responses and inline source citations.

## Tech Stack

### Backend
- **Runtime**: Node.js 20–22 (Node 18 is EOL — removed from Nixpkgs, so Railway/nixpacks pins `nodejs_20`; embeddings need ≤22)
- **Framework**: Express.js
- **Database**: LowDB (JSON file: `content-aggregator.json`)
- **Authentication**: Passport.js with Google OAuth 2.0
- **Session**: JWT in httpOnly cookies (XSS-safe)
- **Encryption**: Node.js crypto (AES-256-GCM for API keys)
- **RSS Parsing**: rss-parser
- **AI SDKs**: OpenAI (also powers OpenRouter + any OpenAI-compatible "custom" endpoint), @anthropic-ai/sdk, @google/generative-ai
- **Embeddings**: `@huggingface/transformers` (Transformers.js) — local `Xenova/bge-small-en-v1.5`, no API key. Requires Node 18–22 (onnxruntime-node prebuilds).

### Frontend
- **Framework**: React 19 with Vite
- **Routing**: React Router v6
- **Styling**: Tailwind CSS (Apple-inspired design)
- **Components**: Radix UI primitives
- **Icons**: Lucide React
- **Markdown**: react-markdown with remark-gfm
- **Syntax Highlighting**: rehype-highlight with highlight.js

## Security Features

### Authentication & Session
- JWT tokens stored in httpOnly cookies (not localStorage)
- SameSite cookie attribute for CSRF protection
- 24-hour token expiry
- Secure flag in production

### Encryption
- AES-256-GCM authenticated encryption for API keys
- Random IV for each encryption operation
- Authentication tag for integrity verification
- Legacy CryptoJS decryption support for migration

### Input Validation
- Message length limits (10,000 chars)
- History array validation (50 messages max)
- Query length limits (1,000 chars)
- Provider whitelist validation

### Protection Measures
- SSRF protection on URL extraction (blocks internal IPs, metadata endpoints)
- ReDoS protection (string methods instead of user-controlled regex)
- Rate limiting on sensitive endpoints (API key verification)
- Required environment variables validation at startup

## Key Files

### Backend Entry Point
- `aggregator-server.js` - Main Express server, RSS aggregation, all API routes

### Middleware
- `middleware/auth.js` - JWT verification from httpOnly cookie
- `middleware/rbac.js` - Role-based access control (admin/user)

### Routes
- `routes/auth.js` - Google OAuth flow, sets httpOnly cookie
- `routes/settings.js` - User preferences and API keys (with rate limiting)
- `routes/chat.js` - Streaming AI chat (SSE) with hybrid RAG, query rewriting, and source citations
- `routes/admin.js` - User management (admin only)

### Services
- `services/encryption.js` - AES-256-GCM encrypt/decrypt for API keys
- `services/ai/index.js` - **Provider registry** (single source of truth) + AI service factory + key-format patterns
- `services/ai/prompt.js` - Shared system prompt, formatting rules, and the inline `[n]` citation contract used by all providers
- `services/ai/openai.js` - OpenAI-compatible client (OpenAI, **OpenRouter**, and **custom** base-URL endpoints); streaming + non-streaming
- `services/ai/anthropic.js` - Anthropic Claude integration (streaming + non-streaming)
- `services/ai/google.js` - Google Gemini integration (streaming + non-streaming)
- `services/rag/search.js` - `searchContent` (lexical only) + `searchHybrid` (lexical + semantic, fused via Reciprocal Rank Fusion); shared tiered-snippet context assembler
- `services/rag/embeddings.js` - Local Transformers.js embeddings (lazy-loaded; gated by `SEMANTIC_SEARCH`)
- `services/rag/chunk.js` - Offset-based overlapping chunker (~1600 chars, 15% overlap)
- `services/rag/index-store.js` - Off-heap vector index (`rag-index/`): brute-force cosine, append/remove, persist
- `services/rag/build.js` - Build/rebuild the whole index from sources
- `services/rag/reindex.js` - Incremental index sync (article delta) for the daily cron; Node-version guard
- `services/rag/podcast-id.js` - Stable collision-free transcript IDs (SHA-1 prefix of the guest name)
- `services/maintenance/link-check.js` - Daily dead-link sweep (2-strike removal of articles)

### Frontend Entry
- `client/src/main.jsx` - React app entry
- `client/src/App.jsx` - Main component with routing (Apple-inspired design)

### Key Components
- `client/src/context/AuthContext.jsx` - Auth state management (httpOnly cookie auth)
- `client/src/components/auth/` - Login, UserMenu
- `client/src/components/chat/` - ChatBox (SSE streaming, staged progress, provider switch, stop/retry), ChatMessage (markdown + citations), ChatPage
- `client/src/components/settings/SettingsPage.jsx` - Per-provider API keys, model selection, custom Base URL, theme
- `client/src/components/admin/` - AdminPanel, UserManager
- `client/src/components/ui/` - Radix UI components (button, card, dialog, etc.) including `async-button.jsx` and `toast.jsx`

## Database Schema

The LowDB database (`content-aggregator.json`) contains:

```javascript
{
  feeds: [{
    id: number,
    name: string,
    url: string,
    category: string,
    description: string,
    active: boolean,
    lastFetched: string,
    fetchCount: number,
    errorCount: number,
    createdAt: string
  }],

  articles: [{
    id: number,
    feedId: number,
    feedName: string,
    title: string,
    link: string,
    description: string,
    content: string,
    author: string,
    category: string,
    pubDate: string,
    fetchedAt: string,
    imageUrl: string
  }],

  users: [{
    id: string (uuid),
    googleId: string,
    email: string,
    name: string,
    picture: string,
    role: "admin" | "user",
    settings: {
      apiKeys: {                              // each encrypted with AES-256-GCM
        openai: string,
        anthropic: string,
        google: string,
        openrouter: string,
        custom: string                        // OpenAI-compatible endpoints
      },
      preferences: {
        defaultAIProvider: string,            // openai | anthropic | google | openrouter | custom
        openaiModel: string,
        anthropicModel: string,
        googleModel: string,
        openrouterModel: string,
        customModel: string,
        customBaseUrl: string,                // required when provider === "custom"
        theme: "light" | "dark" | "system"
      }
    },
    createdAt: string,
    lastLogin: string
  }],

  metadata: {
    created: string,
    lastUpdate: string
  }
}
```

## Environment Variables

Required in `.env` (all secrets must be 32+ characters):
```
GOOGLE_CLIENT_ID=xxx
GOOGLE_CLIENT_SECRET=xxx
GOOGLE_CALLBACK_URL=http://localhost:3000/api/auth/google/callback
JWT_SECRET=your_32_char_or_longer_secret_key
ENCRYPTION_KEY=your_32_char_or_longer_encryption_key
ADMIN_EMAIL=admin@email.com
SESSION_SECRET=your_session_secret_key
PORT=3000
NODE_ENV=development
FRONTEND_URL=https://yourdomain.com  # Production only
```

Optional (semantic search / embeddings):
```
SEMANTIC_SEARCH=true        # gate hybrid (semantic) retrieval at runtime; off = lexical only
EMBED_MODEL=Xenova/bge-small-en-v1.5   # embedding model (default)
EMBED_DTYPE=q8              # quantization (q8 keeps the model ~70-90MB)
RAG_INDEX_DIR=./rag-index   # where the vector index is read/written (default)
```
Note: building/using the index requires Node 18–22 (onnxruntime-node prebuilds). On newer Node, the daily index sync is skipped automatically and chat falls back to lexical search.

## API Routes

### Public
- `GET /api/articles` - Paginated articles
- `GET /api/articles/:id` - Single article
- `GET /api/podcasts` - Podcast transcripts
- `GET /api/podcasts/:id` - Single transcript
- `GET /api/search` - Search content
- `GET /api/categories` - Category list
- `GET /api/feeds` - Feed list
- `GET /api/stats` - Statistics

### Authenticated (JWT in httpOnly cookie)
- `GET /api/auth/me` - Current user
- `POST /api/auth/logout` - Logout (clears cookie)
- `GET/PUT /api/settings` - User settings
- `PUT /api/settings/api-keys` - Save API keys (rate limited)
- `POST /api/chat` - **Streaming** AI chat with hybrid RAG (Server-Sent Events; stages: rewriting → searching → reading → writing, plus `sources`, `delta`, `done`, `error`)
- `POST /api/chat/search` - Lexical RAG search without AI
- `GET /api/chat/providers` - Available AI providers (+ whether the user has a key configured for each)

### Admin Only
- `GET /api/admin/users` - List users
- `PUT /api/admin/users/:id/role` - Change role
- `POST /api/refresh` - Manual feed refresh

## RAG (Retrieval-Augmented Generation)

Hybrid retrieval over ~5,000 articles and 323 podcast transcripts, returning the top ~50 sources.

**Two retrieval modes** (`services/rag/search.js`):
- `searchContent` — lexical only (keyword/phrase scoring). Backward-compatible; used by `/api/chat/search`.
- `searchHybrid` — lexical + semantic, fused with **Reciprocal Rank Fusion** (k=60). Used by `/api/chat`. Falls back to lexical when `SEMANTIC_SEARCH` is off or the vector index isn't built.

**Lexical arm**: keyword extraction with stop-word removal, phrase matching (2–3 words), word-boundary regex, weighted scoring (title/guest/description boosts), and query-intent detection (who/how/what, quoted terms, proper nouns).

**Semantic arm**: optional LLM **query rewriting** (up to 3 variants) → local embeddings → brute-force cosine over the off-heap vector index → best chunk per parent.

**Vector index** (`rag-index/`, off-heap so DB boot stays lean; gitignored — rebuild with `npm run rag:build`):
- `index.json` (model/dim/count), `chunks.json` (offset-only: `{pid,pt,s,l}`), `parents.json` (metadata), `vectors.f32` (contiguous L2-normalized Float32 → cosine = dot product).
- Snippets are sliced from parent content at query time using stored offsets (keeps the index small).
- Daily cron incrementally syncs **article** deltas (`services/rag/reindex.js`); podcasts are static.

**Tiered snippet strategy** for token optimization (~47% savings), shared by both modes:
- Tier 1 (top 10): 800-char snippets
- Tier 2 (next 15): 400-char snippets
- Tier 3 (last 25): 150-char snippets

**Citations**: sources are numbered `[Source n]` in the context; the system prompt (`services/ai/prompt.js`) instructs the model to cite inline as `[n]`, and the frontend renders those as links to the matching source.

## Chat Features

- **Streaming (SSE)**: tokens stream in; staged progress UI (refining → searching → reading → writing) with matched keywords and semantic/keyword indicator
- **Source citations**: numbered sources surfaced before the answer; inline `[n]` markers link to them
- **Multi-provider**: pick provider per message; "Ready"/"No Key" badges; routes to Settings when a key is missing
- **Cancellation & retry**: Stop aborts the in-flight LLM call (client-disconnect aware on the server); Retry/Resume/Regenerate re-run a turn
- **Syntax Highlighting**: Code blocks with GitHub Dark theme (rehype-highlight)
- **Copy Button**: One-click copy for code snippets with language labels
- **Rich Markdown**: Tables, blockquotes, lists, headings
- **AI Formatting Guidelines**: System prompts instruct AI to use rich formatting

## UI Design

Apple-inspired design with:
- Light and dark themes only (system-aware)
- Glass morphism header with backdrop blur
- Clean, minimal aesthetic
- Smooth animations
- Responsive design (mobile, tablet, desktop)

## Common Tasks

### Adding a New RSS Feed
Edit `PM_FEEDS` array in `aggregator-server.js`:
```javascript
{
  name: 'Feed Name',
  url: 'https://example.com/rss',
  category: 'Category',
  description: 'Description'
}
```

### Adding a New AI Model or Provider
Edit the `PROVIDERS` registry in `services/ai/index.js` (single source of truth) — add the model to a provider's `models` array, or add a new provider entry (with `keyPlaceholder`, `keyHint`, `defaultModel`, and an `API_KEY_PATTERNS` entry). The factory, settings validation, `/api/chat/providers`, and the frontend (ChatBox + SettingsPage) all read from it, so no client list needs hardcoding. OpenAI-compatible providers can reuse `OpenAIService` via `baseURL`.

### Building / refreshing the semantic index
- `npm run rag:build` — rebuild the full vector index from `content-aggregator.json` + the transcript archive into `rag-index/` (CPU-bound; minutes for the full corpus; needs Node 18–22).
- `npm run rag:import` — import new Lenny's Podcast transcripts from the upstream repo and incrementally append them to the index (`--dry` to preview).
- The daily 4 AM cron keeps article deltas in sync automatically.

### Changing Themes
Only light and dark themes are supported. Theme preference stored in user settings.

## Known Issues

### OneDrive File Locking
The app runs in a OneDrive folder which can cause file locking issues. Mitigations:
- `safeDbWrite()` function with retry logic
- Reduced concurrency (3 parallel fetches instead of 10)

### Some RSS Feeds Fail
Many feeds return 404 or have SSL issues. The app handles these gracefully and continues with working feeds. The daily dead-link sweep (`services/maintenance/link-check.js`) removes articles whose links 404 on two consecutive runs.

### Embeddings require Node 18–22
`onnxruntime-node` (under Transformers.js) only ships prebuilt binaries for ~Node 18–22. On newer Node, `reindex.semanticReady()` skips the index sync and chat degrades to lexical search rather than crashing.

## Coding Conventions

- Use async/await for asynchronous operations
- Use `safeDbWrite()` for all database writes
- Frontend components use Radix UI primitives from `@/components/ui/`
- API responses include error handling with appropriate status codes
- JWT tokens expire in 24 hours (stored in httpOnly cookie)
- API keys are encrypted with AES-256-GCM before storage
- All user input must be validated for length and format
- No hardcoded secrets - all secrets from environment variables

## Testing

Currently no automated tests. Test manually:
1. `npm start` - Start server
2. Visit http://localhost:3000
3. Login with Google
4. Test chat: verify streaming, sources appear, inline `[n]` citations, and stop/retry work. With `SEMANTIC_SEARCH=true` (Node 18–22) confirm the stage shows "semantic + keyword".
5. Test settings (each provider + custom Base URL), admin panel

## Deployment Notes

1. Build frontend: `npm run build:client`
2. Set `NODE_ENV=production`
3. Ensure `.env` has production values (32+ char secrets)
4. Set `FRONTEND_URL` for CORS
5. Database file needs write permissions
6. Google OAuth callback URL must match production domain
7. **Semantic search (optional)**: run on Node 18–22, set `SEMANTIC_SEARCH=true`, and provide a `rag-index/` — either build it on the box (`npm run rag:build`) or commit a prebuilt index (uncomment `rag-index/` in `.gitignore`). Without it, chat runs lexical-only.
