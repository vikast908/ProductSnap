const express = require('express');
const cors = require('cors');
const axios = require('axios');
const path = require('path');
const { Readability } = require('@mozilla/readability');
const { JSDOM } = require('jsdom');
const puppeteer = require('puppeteer');

const app = express();
const PORT = 3000;

// Enable CORS for all routes
app.use(cors());
app.use(express.json());

// Serve static files
app.use(express.static(__dirname));

// Cache for browser instance
let browserInstance = null;

async function getBrowser() {
    if (!browserInstance) {
        browserInstance = await puppeteer.launch({
            headless: 'new',
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-accelerated-2d-canvas',
                '--disable-gpu'
            ]
        });
    }
    return browserInstance;
}

// Proxy endpoint to fetch articles
app.get('/fetch-article', async (req, res) => {
    const { url } = req.query;

    if (!url) {
        return res.status(400).json({
            success: false,
            error: 'URL parameter is required'
        });
    }

    // Validate URL
    try {
        new URL(url);
    } catch (e) {
        return res.status(400).json({
            success: false,
            error: 'Invalid URL format'
        });
    }

    try {
        const response = await axios.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.9',
                'Accept-Encoding': 'gzip, deflate, br',
                'DNT': '1',
                'Connection': 'keep-alive',
                'Upgrade-Insecure-Requests': '1'
            },
            timeout: 30000,
            maxRedirects: 5,
            validateStatus: function (status) {
                return status >= 200 && status < 500; // Accept both success and client errors
            }
        });

        // Handle different status codes
        if (response.status === 403) {
            return res.json({
                success: false,
                error: 'Access forbidden - website blocking automated access',
                statusCode: 403
            });
        }

        if (response.status === 404) {
            return res.json({
                success: false,
                error: 'Article not found (404)',
                statusCode: 404
            });
        }

        if (response.status === 429) {
            return res.json({
                success: false,
                error: 'Rate limited - too many requests to this website',
                statusCode: 429
            });
        }

        if (response.status >= 400) {
            return res.json({
                success: false,
                error: `HTTP Error ${response.status}`,
                statusCode: response.status
            });
        }

        // Check if response is HTML
        const contentType = response.headers['content-type'] || '';
        if (!contentType.includes('text/html') && !contentType.includes('application/xhtml')) {
            return res.json({
                success: false,
                error: 'URL does not point to an HTML page',
                contentType: contentType
            });
        }

        const html = response.data;
        const finalUrl = response.request.res.responseUrl || url;

        // Use Mozilla Readability to extract clean article content
        const dom = new JSDOM(html, { url: finalUrl });
        const reader = new Readability(dom.window.document);
        const article = reader.parse();

        // Check for paywall indicators
        const paywallIndicators = [
            'paywall', 'subscriber-only', 'members-only', 'premium-content',
            'subscription required', 'subscribe to read', 'register to continue',
            'sign in to read', 'become a member'
        ];

        const hasPaywall = paywallIndicators.some(indicator =>
            html.toLowerCase().includes(indicator)
        );

        // If Readability successfully parsed the article
        if (article && article.content) {
            res.json({
                success: true,
                content: article.content,
                title: article.title,
                byline: article.byline,
                excerpt: article.excerpt,
                readableContent: true,
                hasPaywall: hasPaywall,
                url: finalUrl
            });
        } else {
            // Fallback to raw HTML if Readability fails
            res.json({
                success: true,
                content: html,
                readableContent: false,
                hasPaywall: hasPaywall,
                url: finalUrl
            });
        }

    } catch (error) {
        // Handle different types of errors
        let errorMessage = 'Failed to fetch article';
        let errorType = 'unknown';

        if (error.code === 'ENOTFOUND') {
            errorMessage = 'Website not found - check the URL';
            errorType = 'dns';
        } else if (error.code === 'ETIMEDOUT' || error.code === 'ECONNABORTED') {
            errorMessage = 'Request timed out - website took too long to respond';
            errorType = 'timeout';
        } else if (error.code === 'ECONNREFUSED') {
            errorMessage = 'Connection refused by the website';
            errorType = 'connection';
        } else if (error.code === 'ERR_BAD_REQUEST') {
            errorMessage = 'Bad request - invalid URL or parameters';
            errorType = 'bad_request';
        } else if (error.response) {
            errorMessage = `HTTP Error ${error.response.status}: ${error.response.statusText}`;
            errorType = 'http';
        } else if (error.message) {
            errorMessage = error.message;
        }

        res.json({
            success: false,
            error: errorMessage,
            errorType: errorType,
            details: error.code || error.message
        });
    }
});

// Advanced fetch with Puppeteer for JavaScript-heavy sites and paywalls
app.get('/fetch-article-advanced', async (req, res) => {
    const { url } = req.query;

    if (!url) {
        return res.status(400).json({
            success: false,
            error: 'URL parameter is required'
        });
    }

    // Validate URL
    try {
        new URL(url);
    } catch (e) {
        return res.status(400).json({
            success: false,
            error: 'Invalid URL format'
        });
    }

    let page = null;

    try {
        const browser = await getBrowser();
        page = await browser.newPage();

        // Set user agent
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

        // Block ads and trackers for faster loading
        await page.setRequestInterception(true);
        page.on('request', (request) => {
            const resourceType = request.resourceType();
            const blockedTypes = ['stylesheet', 'font', 'media'];
            const blockedDomains = ['doubleclick.net', 'google-analytics.com', 'googletagmanager.com'];

            if (blockedTypes.includes(resourceType) ||
                blockedDomains.some(domain => request.url().includes(domain))) {
                request.abort();
            } else {
                request.continue();
            }
        });

        // Navigate to the page
        await page.goto(url, {
            waitUntil: 'networkidle2',
            timeout: 30000
        });

        // Wait for content to load
        await page.waitForTimeout(2000);

        // Try to bypass common paywall techniques
        await page.evaluate(() => {
            // Remove paywall overlays
            const overlaySelectors = [
                '[class*="paywall"]', '[id*="paywall"]',
                '[class*="overlay"]', '[id*="overlay"]',
                '[class*="modal"]', '[id*="modal"]',
                '[class*="subscription"]', '[id*="subscription"]'
            ];

            overlaySelectors.forEach(selector => {
                document.querySelectorAll(selector).forEach(el => {
                    if (el.textContent.toLowerCase().includes('subscribe') ||
                        el.textContent.toLowerCase().includes('sign in') ||
                        el.textContent.toLowerCase().includes('member')) {
                        el.remove();
                    }
                });
            });

            // Re-enable scrolling if disabled
            document.body.style.overflow = 'auto';
            document.documentElement.style.overflow = 'auto';

            // Remove blur effects
            document.querySelectorAll('[style*="blur"]').forEach(el => {
                el.style.filter = 'none';
            });
        });

        // Get the page content
        const html = await page.content();
        const finalUrl = page.url();

        // Use Readability for clean extraction
        const dom = new JSDOM(html, { url: finalUrl });
        const reader = new Readability(dom.window.document);
        const article = reader.parse();

        // Check for paywall
        const paywallIndicators = [
            'paywall', 'subscriber-only', 'members-only', 'premium-content',
            'subscription required', 'subscribe to read', 'register to continue',
            'sign in to read', 'become a member'
        ];

        const hasPaywall = paywallIndicators.some(indicator =>
            html.toLowerCase().includes(indicator)
        );

        await page.close();

        if (article && article.content) {
            res.json({
                success: true,
                content: article.content,
                title: article.title,
                byline: article.byline,
                excerpt: article.excerpt,
                readableContent: true,
                hasPaywall: hasPaywall,
                method: 'puppeteer',
                url: finalUrl
            });
        } else {
            res.json({
                success: true,
                content: html,
                readableContent: false,
                hasPaywall: hasPaywall,
                method: 'puppeteer',
                url: finalUrl
            });
        }

    } catch (error) {
        if (page) await page.close();

        let errorMessage = 'Failed to fetch article with advanced method';
        let errorType = 'unknown';

        if (error.message.includes('Navigation timeout')) {
            errorMessage = 'Page took too long to load';
            errorType = 'timeout';
        } else if (error.message.includes('net::ERR')) {
            errorMessage = 'Network error occurred';
            errorType = 'network';
        } else {
            errorMessage = error.message;
        }

        res.json({
            success: false,
            error: errorMessage,
            errorType: errorType,
            details: error.message
        });
    }
});

// Cleanup browser on exit
process.on('SIGINT', async () => {
    if (browserInstance) {
        await browserInstance.close();
    }
    process.exit();
});

app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
    console.log(`Open http://localhost:${PORT} in your browser`);
});
