# Article Reader

A powerful web application for reading articles from Medium, Substack, and other newsletters with **advanced paywall bypass capabilities**.

## Features

✅ **Dual-Mode Fetching**
   - Fast basic fetch for open articles
   - Advanced Puppeteer-based fetch for paywalled content

✅ **Paywall Bypass** - Multiple techniques to access restricted content:
   - Removes paywall overlays and modals
   - Re-enables scrolling
   - Removes blur effects
   - Bypasses soft paywalls

✅ **Mozilla Readability Integration** - Uses Firefox's reader mode algorithm for clean extraction

✅ **Smart Content Extraction** - Platform-specific optimizations for:
   - Medium articles
   - Substack newsletters
   - WordPress blogs
   - News websites

✅ **Comprehensive Error Handling** - Detailed messages for all common issues

✅ **Clean Reading Experience** - Removes ads, popups, tracking scripts, and distractions

✅ **Mobile Responsive** - Works great on all devices

## Installation

1. Install dependencies:
```bash
npm install
```

2. Start the server:
```bash
npm start
```

3. Open your browser to:
```
http://localhost:3000
```

## How It Works

### Dual-Mode Architecture

1. **Basic Mode (Default)**
   - Fast HTTP fetch using Axios
   - Mozilla Readability for content extraction
   - Good for most open articles
   - ~1-2 seconds load time

2. **Advanced Mode (Automatic Fallback)**
   - Headless Chrome via Puppeteer
   - JavaScript execution for dynamic content
   - Paywall bypass techniques:
     - Removes overlay elements
     - Re-enables scrolling
     - Removes blur filters
     - Blocks tracking scripts
   - ~5-10 seconds load time

The app automatically tries the advanced mode when:
- Basic fetch fails
- Paywall is detected
- User manually requests it

### Paywall Bypass Techniques

- **Overlay Removal**: Removes subscription prompts and modal dialogs
- **Scroll Re-enablement**: Fixes pages that disable scrolling
- **Blur Filter Removal**: Makes hidden content visible
- **Ad Blocker**: Blocks tracking and analytics
- **JavaScript Execution**: Renders dynamic content
- **Reader Mode**: Extracts clean article text using Mozilla's algorithm

### Error Handling

The app handles all common restrictions:
- ✅ **403 Forbidden** - Automatically tries Puppeteer
- ✅ **404 Not Found** - Clear error message
- ✅ **429 Rate Limited** - Retry guidance
- ✅ **Timeouts** - 30s timeout with fallback
- ✅ **DNS Errors** - URL validation
- ✅ **Soft Paywalls** - Bypass via Puppeteer
- ✅ **Hard Paywalls** - Attempts bypass, warns if unsuccessful
- ✅ **JavaScript-heavy sites** - Full rendering with Puppeteer

### Supported Platforms

- **Medium** - Full article extraction
- **Substack** - Newsletter content
- **WordPress** - Most WordPress blogs
- **News Sites** - General news websites
- **Generic** - Any HTML article page

## Technical Details

### Stack
- **Frontend**: Vanilla JavaScript, HTML5, CSS3
- **Backend**: Node.js with Express
- **HTTP Client**: Axios for basic fetching
- **Browser Automation**: Puppeteer (headless Chrome)
- **Content Extraction**: Mozilla Readability + JSDOM
- **Timeout**: 30 seconds per request
- **Redirects**: Follows up to 5 redirects

### API Endpoints
- `GET /fetch-article?url=<URL>` - Basic fetch (fast)
- `GET /fetch-article-advanced?url=<URL>` - Puppeteer fetch (paywall bypass)

### Dependencies
```json
{
  "express": "HTTP server",
  "axios": "HTTP client",
  "puppeteer": "Headless browser",
  "@mozilla/readability": "Content extraction",
  "jsdom": "DOM parsing",
  "cors": "Cross-origin support"
}
```

## Limitations

Some websites may still block access due to:
- **Hard Paywalls**: Require valid subscriptions (NYT, WSJ with metered paywall)
- **Advanced Bot Detection**: Cloudflare Turnstile, reCAPTCHA
- **IP-based Rate Limiting**: Too many requests from same IP
- **Login-Required Content**: Account-only articles
- **Geographic Restrictions**: Region-locked content

For these cases, the app will attempt bypass and provide helpful error messages.

## Project Structure

```
DemoRead/
├── index.html      # Main webpage
├── style.css       # Styling
├── script.js       # Frontend logic
├── server.js       # Proxy server
├── package.json    # Dependencies
└── README.md       # Documentation
```

## License

MIT
