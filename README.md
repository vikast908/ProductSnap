# Article Reader

A web application for reading articles with **paywall bypass for supported sites**. Removes ads, popups, and provides a clean reading experience.

**⚠️ Important:** Modern paywalls (Medium, Substack) use server-side truncation and cannot be bypassed. This app works best with overlay-based paywalls.

## What Actually Works (2025 Reality Check)

### ✅ **Fully Supported (90%+ Success)**
- **Forbes, Inc, Bloomberg** - Overlay paywalls are easily bypassed
- **Local news sites** - Most use soft CSS-based paywalls
- **WordPress blogs** - CSS/JavaScript restrictions
- **Academic sites** - Content hidden with simple JavaScript
- **Any site using client-side paywalls**

### ⚠️ **Partially Supported (Preview Only)**
- **Medium** - Only gets free preview (~500 chars). Full content is server-truncated since 2024
- **Substack** - Only gets free preview. Paid content never sent to browser
- **NYT, WSJ** - Metered paywall (you get your free articles, then blocked)

### ❌ **Not Supported (0% Success)**
- **Hard paywalls** - Content never sent without valid subscription
- **Login-required content** - Requires authentication
- **Advanced bot detection** - Cloudflare Turnstile, reCAPTCHA
- **Server-side paywalls** - Content truncated before transmission

## Features

✅ **Dual-Mode Fetching**
   - Fast basic fetch for open articles
   - Advanced Puppeteer-based fetch for JavaScript-heavy sites

✅ **Paywall Bypass** - Works for overlay/CSS-based paywalls:
   - Removes subscription prompts and modals
   - Re-enables scrolling
   - Removes blur effects
   - Blocks tracking scripts

✅ **Mozilla Readability Integration** - Clean article extraction

✅ **Clean Reading Experience** - Removes ads, popups, and distractions

✅ **Mobile Responsive** - Works on all devices

## Installation

1. Install dependencies:
```bash
npm install
```

2. Start the server:
```bash
npm start
```

3. Open in browser:
```
http://localhost:3000
```

## How It Works

### Dual-Mode Architecture

1. **Basic Mode (Default)**
   - Fast HTTP fetch using Axios
   - Mozilla Readability for content extraction
   - ~1-2 seconds load time

2. **Advanced Mode (Automatic Fallback)**
   - Headless Chrome via Puppeteer
   - JavaScript execution for dynamic content
   - Paywall bypass for overlay-based paywalls
   - ~5-10 seconds load time

The app automatically tries advanced mode when it detects client-side paywalls.

## Limitations

**Why Medium/Substack Don't Work:**

Modern paywalls (2024+) use **server-side content truncation**:
1. Your browser requests an article
2. Server checks if you're subscribed (checks cookies/session)
3. If not subscribed, server only sends preview HTML
4. Full article content **never leaves their database**
5. No client-side trick can reveal content that was never transmitted

This is like asking someone to read a page from a book that's locked in a vault - it's physically impossible.

## Technical Stack

- **Frontend**: Vanilla JavaScript, HTML5, CSS3
- **Backend**: Node.js with Express
- **HTTP Client**: Axios for basic fetching
- **Browser Automation**: Puppeteer (headless Chrome)
- **Content Extraction**: Mozilla Readability + JSDOM
- **Timeout**: 30 seconds per request
- **Redirects**: Follows up to 5 redirects

## API Endpoints

- `GET /fetch-article?url=<URL>` - Basic fetch (fast)
- `GET /fetch-article-advanced?url=<URL>` - Puppeteer fetch (paywall bypass)

## Testing Sites

**Try these to see what works:**

✅ **Forbes**: https://www.forbes.com (any article with overlay)
✅ **Inc**: https://www.inc.com (overlay paywalls)
⚠️ **Medium**: https://medium.com (only preview)
⚠️ **Substack**: https://substack.com (only preview)

## Ethical Considerations

**Use Responsibly:**
- This tool is for personal reading only
- Bypassing paywalls may violate Terms of Service
- Consider supporting quality journalism with subscriptions
- Respect content creators

**Legal Disclaimer:** This software is provided for educational purposes. Users are responsible for complying with website terms of service and applicable laws.

## Project Structure

```
DemoRead/
├── index.html          # Main webpage
├── style.css           # Styling
├── script.js           # Frontend logic
├── server.js           # Proxy server with paywall bypass
├── package.json        # Dependencies
├── README.md           # This file
├── SETUP.md            # Installation guide
└── PAYWALL_BYPASS.md   # Technical documentation
```

## License

MIT

---

**Built with frustration after realizing modern paywalls are actually well-designed.**
