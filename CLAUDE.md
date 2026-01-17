# ProductSnap - Claude Context File

This file provides context for Claude AI when working on the ProductSnap codebase.

## Project Overview

**ProductSnap** is an AI-powered Product Management knowledge hub that aggregates content from 167+ RSS feeds, includes 298 Lenny's Podcast transcripts, and provides RAG-based AI chat functionality.

## Tech Stack

### Backend
- **Runtime**: Node.js v18+
- **Framework**: Express.js
- **Database**: LowDB (JSON file: `content-aggregator.json`)
- **Authentication**: Passport.js with Google OAuth 2.0
- **Session**: JWT (JSON Web Tokens)
- **Encryption**: crypto-js (AES-256 for API keys)
- **RSS Parsing**: rss-parser
- **AI SDKs**: OpenAI, @anthropic-ai/sdk, @google/generative-ai

### Frontend
- **Framework**: React 19 with Vite
- **Routing**: React Router v6
- **Styling**: Tailwind CSS
- **Components**: Radix UI primitives
- **Icons**: Lucide React
- **Markdown**: react-markdown with remark-gfm

## Key Files

### Backend Entry Point
- `aggregator-server.js` - Main Express server, RSS aggregation, all API routes

### Middleware
- `middleware/auth.js` - JWT verification
- `middleware/rbac.js` - Role-based access control (admin/user)

### Routes
- `routes/auth.js` - Google OAuth flow
- `routes/settings.js` - User preferences and API keys
- `routes/chat.js` - AI chat with RAG
- `routes/admin.js` - User management (admin only)

### Services
- `services/encryption.js` - AES-256 encrypt/decrypt for API keys
- `services/ai/index.js` - AI service factory
- `services/ai/openai.js` - OpenAI GPT integration
- `services/ai/anthropic.js` - Anthropic Claude integration
- `services/ai/google.js` - Google Gemini integration
- `services/rag/search.js` - Content search for RAG context

### Frontend Entry
- `client/src/main.jsx` - React app entry
- `client/src/App.jsx` - Main component with routing

### Key Components
- `client/src/context/AuthContext.jsx` - Auth state management
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
        openai: string (encrypted),
        anthropic: string (encrypted),
        google: string (encrypted)
      },
      preferences: {
        defaultAIProvider: string,
        openaiModel: string,
        anthropicModel: string,
        googleModel: string,
        theme: string
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

Required in `.env`:
```
GOOGLE_CLIENT_ID=xxx
GOOGLE_CLIENT_SECRET=xxx
GOOGLE_CALLBACK_URL=http://localhost:3000/api/auth/google/callback
JWT_SECRET=32_char_secret
ENCRYPTION_KEY=32_char_key
ADMIN_EMAIL=admin@email.com
SESSION_SECRET=session_secret
PORT=3000
NODE_ENV=development
```

## API Routes

### Public
- `GET /api/articles` - Paginated articles
- `GET /api/podcasts` - Podcast transcripts
- `GET /api/search` - Search content
- `GET /api/categories` - Category list
- `GET /api/feeds` - Feed list
- `GET /api/stats` - Statistics

### Authenticated (JWT Required)
- `GET /api/auth/me` - Current user
- `POST /api/auth/logout` - Logout
- `GET/PUT /api/settings` - User settings
- `PUT /api/settings/api-keys` - Save API keys
- `POST /api/chat` - AI chat with RAG
- `GET /api/chat/providers` - Available AI providers

### Admin Only
- `GET /api/admin/users` - List users
- `PUT /api/admin/users/:id/role` - Change role
- `POST /api/refresh` - Manual feed refresh

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

### Adding a New Theme
1. Add theme class in `client/src/index.css`
2. Add option in `client/src/App.jsx` theme selector

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
- JWT tokens expire in 7 days
- API keys are encrypted before storage

## Testing

Currently no automated tests. Test manually:
1. `npm start` - Start server
2. Visit http://localhost:3000
3. Login with Google
4. Test chat, settings, admin panel

## Deployment Notes

1. Build frontend: `npm run build:client`
2. Set `NODE_ENV=production`
3. Ensure `.env` has production values
4. Database file needs write permissions
5. Google OAuth callback URL must match production domain
