# Setup Guide

## Quick Start

```bash
# Install dependencies (this may take a few minutes due to Puppeteer downloading Chrome)
npm install

# Start the server
npm start

# Open in your browser
http://localhost:3000
```

## First Run

When you run `npm install`, Puppeteer will automatically download a compatible version of Chromium (~300MB). This is normal and only happens once.

## Testing the Paywall Bypass

### Test with these URLs:

1. **Medium articles** (soft paywall)
   - Try any Medium article behind the member paywall
   - The app will automatically use advanced mode

2. **Substack newsletters**
   - Most Substack posts work great
   - Subscriber-only content may have limited preview

3. **News sites**
   - Works with most news websites
   - Some may require the advanced mode

## Troubleshooting

### Puppeteer Installation Issues

If Puppeteer fails to install:

```bash
# Skip Chromium download initially
PUPPETEER_SKIP_DOWNLOAD=1 npm install

# Then install Puppeteer separately
npx puppeteer browsers install chrome
```

### Port Already in Use

If port 3000 is taken:

```javascript
// Edit server.js line 10
const PORT = 3000; // Change to 3001, 8080, etc.
```

### Windows Firewall

Allow Node.js through Windows Firewall when prompted.

### Puppeteer on Windows

Puppeteer works best with:
- Windows 10/11
- Visual Studio Build Tools (for native modules)

If you encounter issues, install build tools:
```bash
npm install --global windows-build-tools
```

## Performance Tips

1. **Keep browser instance running** - The server caches a single Puppeteer instance for speed

2. **First advanced fetch is slower** - Chrome needs to start up (~5-10 seconds)

3. **Subsequent fetches are faster** - Browser is already running (~2-3 seconds)

4. **Basic mode is fastest** - Use for non-paywalled content (~1-2 seconds)

## Security Note

This tool is for **personal reading only**. Bypassing paywalls may violate terms of service. Use responsibly and consider supporting content creators with subscriptions.
