# ProductSnap

**AI-Powered Product Management Knowledge Hub**

ProductSnap is a comprehensive content aggregator designed for product managers, providing curated articles from 167+ RSS feeds, 298 Lenny's Podcast transcripts, and an AI-powered chat assistant for instant insights.

![Version](https://img.shields.io/badge/version-3.0.0-blue)
![Node](https://img.shields.io/badge/node-%3E%3D18.0.0-green)
![License](https://img.shields.io/badge/license-MIT-green)

---

## Features

### Content Aggregation
- **167+ RSS Feeds** - Curated from top PM publications, thought leaders, and tech companies
- **298 Lenny's Podcast Transcripts** - Full searchable transcripts from the #1 PM podcast
- **Product Launch Feeds** - BetaList, TechCrunch, VentureBeat, Product Hunt, and 40+ more
- **Auto-refresh** - Feeds update automatically every 2 hours

### AI-Powered Chat (RAG)
- **Multi-provider Support** - OpenAI (GPT-4o, o1), Anthropic (Claude), Google (Gemini)
- **RAG Search** - AI responses backed by relevant articles and podcast transcripts
- **Source Citations** - Every AI response includes clickable source references
- **Model Selection** - Choose your preferred model for each AI provider

### Authentication & Security
- **Google OAuth** - Secure login with Google accounts
- **Role-based Access** - Admin and User roles with different permissions
- **Encrypted API Keys** - AES-256 encryption for stored API keys
- **Rate Limiting** - Protection against abuse on auth and chat endpoints

### User Interface
- **11 Beautiful Themes** - Dark, Light, Newspaper, Kindle, Game of Thrones, LOTR, Harry Potter, Amazon, Sahara, Avatar
- **Advanced Filtering** - Filter by category, source, time period
- **Article Preview** - Hover to preview without leaving the page
- **Transcript Viewer** - Full-text podcast transcripts with search
- **Responsive Design** - Works on desktop, tablet, and mobile

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

# JWT Configuration (32+ characters)
JWT_SECRET=your_32_char_secret_key_here

# Encryption Key for API Keys (exactly 32 characters)
ENCRYPTION_KEY=your_32_char_encryption_key_here

# Admin Configuration
ADMIN_EMAIL=your_admin_email@gmail.com

# Server Configuration
PORT=3000
NODE_ENV=development

# Session Secret
SESSION_SECRET=your_session_secret_key_here
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
- JSON Web Tokens - Session management
- crypto-js - AES-256 encryption
- rss-parser - RSS feed parsing
- OpenAI/Anthropic/Google SDKs - AI providers

**Frontend:**
- React 19 - UI framework
- React Router - Client-side routing
- Tailwind CSS - Styling
- Radix UI - Accessible components
- Lucide React - Icons
- react-markdown - Markdown rendering

### Project Structure

```
productsnap/
├── aggregator-server.js    # Main Express server
├── package.json
├── .env                    # Environment variables
├── content-aggregator.json # Database file
│
├── middleware/
│   ├── auth.js            # JWT authentication
│   └── rbac.js            # Role-based access control
│
├── routes/
│   ├── auth.js            # Google OAuth routes
│   ├── settings.js        # User settings API
│   ├── chat.js            # AI chat endpoint
│   └── admin.js           # Admin management
│
├── services/
│   ├── encryption.js      # API key encryption
│   ├── ai/
│   │   ├── index.js       # AI service factory
│   │   ├── openai.js      # OpenAI integration
│   │   ├── anthropic.js   # Anthropic integration
│   │   └── google.js      # Google AI integration
│   └── rag/
│       └── search.js      # RAG content search
│
├── client/                 # React frontend
│   ├── src/
│   │   ├── App.jsx        # Main app component
│   │   ├── main.jsx       # Entry point
│   │   ├── index.css      # Global styles & themes
│   │   ├── context/
│   │   │   └── AuthContext.jsx
│   │   └── components/
│   │       ├── ui/        # Radix UI components
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
| `/api/chat` | POST | Any | AI chat with RAG |
| `/api/chat/providers` | GET | Any | Get AI providers |
| `/api/admin/users` | GET | Admin | List all users |
| `/api/admin/users/:id/role` | PUT | Admin | Change user role |
| `/api/refresh` | POST | Admin | Manual feed refresh |

---

## Feed Categories

ProductSnap aggregates content from these categories:

| Category | Example Sources | Feed Count |
|----------|-----------------|------------|
| **Product Management** | Mind the Product, SVPG, Product Talk | 30+ |
| **Product Strategy** | Stratechery, First Round Review, a16z | 15+ |
| **Product Design** | UX Collective, Nielsen Norman, Figma | 20+ |
| **Product Analytics** | Amplitude, Mixpanel, PostHog | 10+ |
| **Product Growth** | Reforge, Andrew Chen, Elena Verna | 10+ |
| **Product Launch** | BetaList, TechCrunch, VentureBeat | 40+ |
| **Tech News** | Hacker News, The Verge, Ars Technica | 20+ |
| **PM Thought Leaders** | Lenny's Newsletter, John Cutler | 20+ |

---

## AI Chat Usage

1. **Login** with Google account
2. Go to **Settings** -> **API Keys**
3. Add your API key for OpenAI, Anthropic, or Google AI
4. Select your preferred **model** in Settings -> Preferences
5. Click the **chat icon** in the header
6. Ask questions like:
   - "What does Brian Chesky say about product management?"
   - "Summarize best practices for product launches"
   - "What are the key metrics for product-led growth?"

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

### Database

ProductSnap uses LowDB (JSON file database). The database file is `content-aggregator.json` and contains:

- `feeds` - RSS feed configurations
- `articles` - Fetched articles
- `users` - User accounts and settings
- `metadata` - System information

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
