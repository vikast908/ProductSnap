<p align="center">
  <img src="client/public/logo512.png" alt="ProductSnap Logo" width="120" />
</p>

# ProductSnap

**AI-Powered Product Management Knowledge Hub**

ProductSnap is a comprehensive content aggregator designed for product managers, providing curated articles from 167+ RSS feeds, 298 Lenny's Podcast transcripts, and an AI-powered chat assistant with full RAG search across all content.

![Version](https://img.shields.io/badge/version-3.1.0-blue)
![Node](https://img.shields.io/badge/node-%3E%3D18.0.0-green)
![License](https://img.shields.io/badge/license-MIT-green)

---

## Features

### Content Aggregation
- **167+ RSS Feeds** - Curated from top PM publications, thought leaders, and tech companies
- **298 Lenny's Podcast Transcripts** - Full searchable transcripts (4.5M+ words) from the #1 PM podcast
- **3,300+ Articles** - Continuously growing knowledge base
- **Auto-refresh** - Feeds update automatically every 2 hours

### AI-Powered Chat (RAG)
- **Full Knowledge Base Search** - AI searches ALL articles and podcasts, returns top 50 most relevant sources
- **Multi-provider Support** - OpenAI (GPT-4o, o1), Anthropic (Claude), Google (Gemini)
- **Token-Optimized Context** - Tiered snippet strategy saves ~47% tokens while keeping all 50 sources
- **Rich Formatting** - Syntax-highlighted code blocks, tables, lists, and blockquotes
- **Source Citations** - Every AI response includes clickable source references
- **Copy Code Button** - One-click copy for code snippets with language labels

### Authentication & Security
- **Google OAuth** - Secure login with Google accounts
- **Role-based Access** - Admin and User roles with different permissions
- **AES-256-GCM Encryption** - Authenticated encryption for stored API keys
- **httpOnly Cookies** - XSS-safe token storage
- **Rate Limiting** - Protection against abuse on all endpoints
- **SSRF Protection** - URL validation on content extraction

### User Interface
- **Apple-Inspired Design** - Clean, minimal aesthetic with smooth animations
- **Light & Dark Themes** - System-aware theme switching
- **Glass Morphism** - Frosted glass header with backdrop blur
- **In-App Reader** - Read articles without leaving the app
- **Transcript Viewer** - Full-text podcast transcripts with search
- **Responsive Design** - Works beautifully on desktop, tablet, and mobile

---

## Quick Start

### Prerequisites
- Node.js >= 18.0.0
- npm >= 9.0.0
- Google Cloud OAuth credentials

### Installation

```bash
# Clone the repository
git clone https://github.com/yourusername/productsnap.git
cd productsnap

# Install all dependencies
npm run setup

# Or manually:
npm install
cd client && npm install && npm run build
cd ..
```

### Configuration

1. **Create `.env` file** in the root directory:

```env
# Google OAuth Configuration
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret
GOOGLE_CALLBACK_URL=http://localhost:3000/api/auth/google/callback

# JWT Configuration (32+ characters required)
JWT_SECRET=your_32_char_secret_key_here

# Encryption Key for API Keys (32+ characters required)
ENCRYPTION_KEY=your_32_char_encryption_key_here

# Admin Configuration
ADMIN_EMAIL=your_admin_email@gmail.com

# Server Configuration
PORT=3000
NODE_ENV=development

# Session Secret (32+ characters required)
SESSION_SECRET=your_session_secret_key_here

# Production only
FRONTEND_URL=https://yourdomain.com
```

2. **Set up Google OAuth:**
   - Go to [Google Cloud Console](https://console.cloud.google.com)
   - Create a new project or select existing
   - Enable Google+ API
   - Go to Credentials -> Create OAuth Client ID
   - Set authorized redirect URI: `http://localhost:3000/api/auth/google/callback`
   - Copy Client ID and Secret to `.env`

### Running the Application

```bash
# Start the server
npm start

# Or for development
npm run dev
```

Visit **http://localhost:3000** in your browser.

---

## Architecture

### Tech Stack

**Backend:**
- Express.js - Web framework
- LowDB - JSON file database
- Passport.js - Google OAuth authentication
- JSON Web Tokens - Session management (httpOnly cookies)
- Node.js crypto - AES-256-GCM encryption
- rss-parser - RSS feed parsing
- OpenAI/Anthropic/Google SDKs - AI providers

**Frontend:**
- React 19 - UI framework
- React Router - Client-side routing
- Tailwind CSS - Styling
- Radix UI - Accessible components
- Lucide React - Icons
- react-markdown - Markdown rendering
- rehype-highlight - Syntax highlighting for code blocks

### Project Structure

```
productsnap/
├── aggregator-server.js    # Main Express server
├── package.json
├── .env                    # Environment variables (not in git)
├── content-aggregator.json # Database file
│
├── middleware/
│   ├── auth.js            # JWT authentication (httpOnly cookie)
│   └── rbac.js            # Role-based access control
│
├── routes/
│   ├── auth.js            # Google OAuth routes
│   ├── settings.js        # User settings API
│   ├── chat.js            # AI chat endpoint with RAG
│   └── admin.js           # Admin management
│
├── services/
│   ├── encryption.js      # AES-256-GCM encryption
│   ├── ai/
│   │   ├── index.js       # AI service factory
│   │   ├── openai.js      # OpenAI integration
│   │   ├── anthropic.js   # Anthropic integration
│   │   └── google.js      # Google AI integration
│   └── rag/
│       └── search.js      # RAG content search (50 sources)
│
├── client/                 # React frontend
│   ├── src/
│   │   ├── App.jsx        # Main app component
│   │   ├── main.jsx       # Entry point
│   │   ├── index.css      # Apple-inspired themes
│   │   ├── context/
│   │   │   └── AuthContext.jsx
│   │   └── components/
│   │       ├── ui/        # ShadCN/Radix UI components
│   │       ├── auth/      # Login, UserMenu
│   │       ├── chat/      # ChatBox, ChatMessage
│   │       ├── settings/  # SettingsPage
│   │       └── admin/     # AdminPanel, UserManager
│   └── dist/              # Built frontend
│
└── Lenny's Podcast Transcripts Archive/
    └── *.txt              # 298 transcript files
```

---

## API Reference

### Public Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/articles` | GET | Get paginated articles |
| `/api/articles/:id` | GET | Get single article |
| `/api/podcasts` | GET | Get podcast transcripts |
| `/api/podcasts/:id` | GET | Get single transcript |
| `/api/search` | GET | Search articles & podcasts |
| `/api/categories` | GET | Get all categories |
| `/api/feeds` | GET | Get feed statistics |
| `/api/stats` | GET | Get overall statistics |

### Protected Endpoints (Require Authentication)

| Endpoint | Method | Role | Description |
|----------|--------|------|-------------|
| `/api/auth/me` | GET | Any | Get current user |
| `/api/auth/logout` | POST | Any | Logout |
| `/api/settings` | GET/PUT | Any | User preferences |
| `/api/settings/api-keys` | PUT | Any | Save API keys |
| `/api/chat` | POST | Any | AI chat with RAG (50 sources) |
| `/api/chat/providers` | GET | Any | Get AI providers |
| `/api/admin/users` | GET | Admin | List all users |
| `/api/admin/users/:id/role` | PUT | Admin | Change user role |
| `/api/refresh` | POST | Admin | Manual feed refresh |

---

## AI Chat - Full Knowledge Base Search

The AI chat searches **ALL** 3,300+ articles and 298 podcast transcripts to find the most relevant content for your question.

### How It Works
1. Your question is analyzed for keywords and phrases
2. Every article and podcast is scored for relevance
3. Top 50 most relevant sources are selected
4. **Tiered snippets** are extracted to optimize token usage:
   - **Tier 1** (Top 10): 800-char snippets for highest relevance
   - **Tier 2** (Next 15): 400-char snippets for good coverage
   - **Tier 3** (Last 25): 150-char snippets for breadth
5. AI generates a response with rich markdown formatting
6. Sources are cited for verification

### Chat Features
- **Syntax Highlighting** - Code blocks with language detection and GitHub Dark theme
- **Copy Button** - One-click copy for code snippets
- **Tables** - Formatted comparison tables
- **Blockquotes** - Styled quotes from sources
- **Lists** - Bullet and numbered lists with proper spacing

### Usage

1. **Login** with Google account
2. Go to **Settings** -> **API Keys**
3. Add your API key for OpenAI, Anthropic, or Google AI
4. Select your preferred **model** in Settings -> Preferences
5. Click the **chat icon** in the header
6. Ask questions like:
   - "What does Brian Chesky say about product management?"
   - "Summarize best practices for product launches"
   - "What are the key metrics for product-led growth?"
   - "Compare what different guests said about hiring PMs"

### Supported Models

**OpenAI:**
- GPT-4o (Latest)
- GPT-4o Mini
- GPT-4 Turbo
- o1, o1-mini, o1-preview

**Anthropic:**
- Claude Sonnet 4
- Claude Opus 4
- Claude 3.5 Sonnet/Haiku
- Claude 3 Opus/Sonnet/Haiku

**Google:**
- Gemini 1.5 Pro
- Gemini 1.5 Flash
- Gemini 2.0 Flash (Experimental)

---

## Security Features

ProductSnap implements comprehensive security measures:

- **No Hardcoded Secrets** - All secrets must be set via environment variables
- **AES-256-GCM Encryption** - API keys encrypted with random IV and authentication tag
- **httpOnly Cookies** - JWT tokens stored in httpOnly cookies (XSS-safe)
- **SameSite Cookies** - CSRF protection via strict same-site policy
- **SSRF Protection** - URL validation blocks internal network access
- **Input Validation** - Length limits and format validation on all inputs
- **Rate Limiting** - Per-endpoint rate limits prevent abuse
- **ReDoS Protection** - Safe string matching instead of user-controlled regex

---

## Development

### Running in Development Mode

```bash
# Start backend
npm run dev

# In another terminal, start frontend with hot reload
cd client
npm run dev
```

### Building for Production

```bash
# Build frontend
npm run build:client

# Start production server
NODE_ENV=production npm start
```

---

## Troubleshooting

### OneDrive File Locking

If you see `UNKNOWN: unknown error, open 'content-aggregator.json'`:
- The app has built-in retry logic for OneDrive sync conflicts
- Concurrency is reduced to 3 parallel feed fetches
- Wait for OneDrive to finish syncing before restarting

### Google OAuth Errors

- Ensure redirect URI matches exactly in Google Cloud Console
- Check that GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are correct
- Verify GOOGLE_CALLBACK_URL matches your server URL

### AI Chat Not Working

- Verify API key is correct in Settings
- Check that you've selected a model for the provider
- Look at server logs for API error messages

---

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

---

## License

This project is licensed under the MIT License.

---

## Acknowledgments

- [Lenny Rachitsky](https://www.lennysnewsletter.com/) for the amazing podcast transcripts
- All the PM thought leaders whose content powers this aggregator
- The open-source community for the amazing tools and libraries

---

**Built with love for the Product Management community**
