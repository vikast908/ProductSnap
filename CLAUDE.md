# ProductSnap - Claude Context File

This file provides context for Claude AI when working on the ProductSnap codebase.

## Project Overview

**ProductSnap** is an AI-powered Product Management knowledge hub that aggregates content from 167+ RSS feeds, includes 298 Lenny's Podcast transcripts, and provides RAG-based AI chat functionality with full knowledge base search across all content.

## Tech Stack

### Backend
- **Runtime**: Node.js v18+
- **Framework**: Express.js
- **Database**: LowDB (JSON file: `content-aggregator.json`)
- **Authentication**: Passport.js with Google OAuth 2.0
- **Session**: JWT in httpOnly cookies (XSS-safe)
- **Encryption**: Node.js crypto (AES-256-GCM for API keys)
- **RSS Parsing**: rss-parser
- **AI SDKs**: OpenAI, @anthropic-ai/sdk, @google/generative-ai

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
- `routes/chat.js` - AI chat with RAG (50 sources)
- `routes/admin.js` - User management (admin only)

### Services
- `services/encryption.js` - AES-256-GCM encrypt/decrypt for API keys
- `services/ai/index.js` - AI service factory
- `services/ai/openai.js` - OpenAI GPT integration
- `services/ai/anthropic.js` - Anthropic Claude integration
- `services/ai/google.js` - Google Gemini integration
- `services/rag/search.js` - Content search for RAG context (50 sources, tiered snippets)

### Frontend Entry
- `client/src/main.jsx` - React app entry
- `client/src/App.jsx` - Main component with routing (Apple-inspired design)

### Key Components
- `client/src/context/AuthContext.jsx` - Auth state management (httpOnly cookie auth)
- `client/src/components/auth/` - Login, UserMenu
- `client/src/components/chat/` - ChatBox, ChatMessage, ChatPage
- `client/src/components/settings/SettingsPage.jsx` - Settings with API keys and model selection
- `client/src/components/admin/` - AdminPanel, UserManager
- `client/src/components/ui/` - Radix UI components (button, card, dialog, etc.)

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
      apiKeys: {
        openai: string (encrypted with AES-256-GCM),
        anthropic: string (encrypted with AES-256-GCM),
        google: string (encrypted with AES-256-GCM)
      },
      preferences: {
        defaultAIProvider: string,
        openaiModel: string,
        anthropicModel: string,
        googleModel: string,
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
- `POST /api/chat` - AI chat with RAG (50 sources)
- `POST /api/chat/search` - RAG search without AI
- `GET /api/chat/providers` - Available AI providers

### Admin Only
- `GET /api/admin/users` - List users
- `PUT /api/admin/users/:id/role` - Change role
- `POST /api/refresh` - Manual feed refresh

## RAG (Retrieval-Augmented Generation)

The AI chat searches ALL articles and podcast transcripts:
- Searches 3,300+ articles and 298 podcast transcripts
- Returns top 50 most relevant sources
- **Tiered snippet strategy** for token optimization (~47% savings):
  - Tier 1 (top 10): 800-char snippets
  - Tier 2 (next 15): 400-char snippets
  - Tier 3 (last 25): 150-char snippets
- Keyword extraction with stop word removal
- Phrase matching (2-3 word combinations)
- Weighted scoring (title 3x, guest 4x, description 2x)

## Chat Features

- **Syntax Highlighting**: Code blocks with GitHub Dark theme (rehype-highlight)
- **Copy Button**: One-click copy for code snippets with language labels
- **Rich Markdown**: Tables, blockquotes, lists, headings
- **Custom Components**: Styled table cells, blockquotes, inline code
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

### Adding a New AI Model
1. Update model list in `client/src/components/settings/SettingsPage.jsx`
2. The backend AI services automatically use the selected model from preferences

### Changing Themes
Only light and dark themes are supported. Theme preference stored in user settings.

## Known Issues

### OneDrive File Locking
The app runs in a OneDrive folder which can cause file locking issues. Mitigations:
- `safeDbWrite()` function with retry logic
- Reduced concurrency (3 parallel fetches instead of 10)

### Some RSS Feeds Fail
Many feeds return 404 or have SSL issues. The app handles these gracefully and continues with working feeds.

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
4. Test chat (verify 50 sources in response)
5. Test settings, admin panel

## Deployment Notes

1. Build frontend: `npm run build:client`
2. Set `NODE_ENV=production`
3. Ensure `.env` has production values (32+ char secrets)
4. Set `FRONTEND_URL` for CORS
5. Database file needs write permissions
6. Google OAuth callback URL must match production domain
