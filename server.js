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

        // Special handling for Medium in basic mode
        const isMedium = url.includes('medium.com') || url.includes('towardsdatascience.com');
        let article = null;

        if (isMedium) {
            const dom = new JSDOM(html, { url: finalUrl });
            const doc = dom.window.document;

            // Try JSON-LD first
            const scripts = Array.from(doc.querySelectorAll('script[type="application/ld+json"]'));
            for (const script of scripts) {
                try {
                    const data = JSON.parse(script.textContent);
                    const validTypes = ['Article', 'NewsArticle', 'SocialMediaPosting'];
                    if (validTypes.includes(data['@type']) && data.articleBody) {
                        const contentHtml = data.articleBody
                            .split('\n\n')
                            .filter(p => p.trim())
                            .map(p => `<p>${p.trim().replace(/\n/g, '<br>')}</p>`)
                            .join('\n');

                        article = {
                            title: data.headline || data.name,
                            byline: data.author?.name,
                            content: contentHtml,
                            excerpt: data.description
                        };
                        break;
                    }
                } catch (e) {
                    continue;
                }
            }
        }

        // Fallback to Mozilla Readability
        if (!article || !article.content) {
            const dom = new JSDOM(html, { url: finalUrl });
            const reader = new Readability(dom.window.document);
            article = reader.parse();
        }

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

        // Special handling for different platforms
        const isSubstack = url.includes('substack.com');
        const isMedium = url.includes('medium.com') || url.includes('towardsdatascience.com');

        // Navigate to the page
        await page.goto(url, {
            waitUntil: 'networkidle2',
            timeout: 30000
        });

        // Wait for content to load
        await page.waitForTimeout(3000);

        // For Substack, try to expand truncated content
        if (isSubstack) {
            await page.evaluate(() => {
                // Click "Continue reading" or similar buttons
                const buttons = Array.from(document.querySelectorAll('button, a, div[role="button"]'));
                buttons.forEach(btn => {
                    const text = btn.textContent.toLowerCase();
                    if (text.includes('continue reading') ||
                        text.includes('read more') ||
                        text.includes('show more')) {
                        btn.click();
                    }
                });

                // Remove truncation markers
                document.querySelectorAll('[class*="truncat"]').forEach(el => {
                    el.classList.remove(...Array.from(el.classList).filter(c => c.includes('truncat')));
                });

                // Expand collapsed content
                document.querySelectorAll('.collapsed, [class*="collapse"]').forEach(el => {
                    el.style.maxHeight = 'none';
                    el.style.height = 'auto';
                    el.style.display = 'block';
                });
            });

            // Wait a bit more for expanded content
            await page.waitForTimeout(2000);
        }

        // Try to bypass common paywall techniques
        await page.evaluate(() => {
            // Aggressively remove Substack paywall boxes
            const paywallTexts = [
                'this post is for paid subscribers',
                'upgrade to paid',
                'already a paid subscriber',
                'subscribe to continue',
                'for paid subscribers only',
                'upgrade to continue reading'
            ];

            // Remove any element containing paywall text
            document.querySelectorAll('*').forEach(el => {
                const text = el.textContent.toLowerCase();
                if (paywallTexts.some(pw => text.includes(pw))) {
                    // Check if this element is relatively small (likely the paywall box itself)
                    if (el.textContent.length < 500) {
                        el.remove();
                    }
                }
            });

            // Remove paywall overlays by selector
            const overlaySelectors = [
                '[class*="paywall"]', '[id*="paywall"]',
                '[class*="overlay"]', '[id*="overlay"]',
                '[class*="modal"]', '[id*="modal"]',
                '[class*="subscription"]', '[id*="subscription"]',
                '[class*="subscribe-"]', '[class*="upgrade"]',
                '.subscription-widget', '.paywall-cta',
                '[data-testid*="paywall"]', '[data-testid*="subscription"]'
            ];

            overlaySelectors.forEach(selector => {
                document.querySelectorAll(selector).forEach(el => {
                    const text = el.textContent.toLowerCase();
                    if (text.includes('subscribe') ||
                        text.includes('sign in') ||
                        text.includes('member') ||
                        text.includes('upgrade') ||
                        text.includes('paid')) {
                        el.remove();
                    }
                });
            });

            // Specifically target Substack's colored boxes (often orange/red)
            document.querySelectorAll('div').forEach(el => {
                const style = window.getComputedStyle(el);
                const bgColor = style.backgroundColor;
                const text = el.textContent.toLowerCase();

                // If it's a colored box with paywall text
                if (bgColor && bgColor !== 'rgba(0, 0, 0, 0)' && bgColor !== 'transparent') {
                    if (text.includes('paid subscriber') ||
                        text.includes('upgrade') ||
                        text.includes('this post is for')) {
                        el.remove();
                    }
                }
            });

            // Re-enable scrolling if disabled
            document.body.style.overflow = 'auto';
            document.documentElement.style.overflow = 'auto';

            // Remove blur effects and max-height restrictions
            document.querySelectorAll('[style*="blur"]').forEach(el => {
                el.style.filter = 'none';
            });

            document.querySelectorAll('[style*="max-height"]').forEach(el => {
                el.style.maxHeight = 'none';
            });

            // Show hidden content
            document.querySelectorAll('[style*="display: none"], [style*="display:none"]').forEach(el => {
                if (!el.closest('script') && !el.closest('style')) {
                    el.style.display = 'block';
                }
            });
        });

        // Get the page content
        const html = await page.content();
        const finalUrl = page.url();

        // For Medium, try to extract full content from page data
        let article = null;
        if (isMedium) {
            try {
                const mediumData = await page.evaluate(() => {
                    // Method 1: JSON-LD Schema
                    const scripts = Array.from(document.querySelectorAll('script[type="application/ld+json"]'));
                    for (const script of scripts) {
                        try {
                            const data = JSON.parse(script.textContent);
                            const validTypes = ['Article', 'NewsArticle', 'SocialMediaPosting'];
                            if (validTypes.includes(data['@type'])) {
                                if (data.articleBody) {
                                    return {
                                        method: 'jsonld',
                                        title: data.headline || data.name,
                                        author: data.author?.name,
                                        content: data.articleBody,
                                        description: data.description
                                    };
                                }
                            }
                        } catch (e) {
                            continue;
                        }
                    }

                    // Method 2: Extract from Medium's React state
                    const stateScript = document.querySelector('script:not([src]):not([type])');
                    if (stateScript) {
                        const match = stateScript.textContent.match(/window\.__APOLLO_STATE__\s*=\s*({.+?});/s);
                        if (match) {
                            try {
                                const state = JSON.parse(match[1]);
                                // Find the post content in Apollo state
                                for (const key in state) {
                                    if (key.startsWith('Post:') && state[key].content) {
                                        const content = state[key].content;
                                        return {
                                            method: 'apollo',
                                            title: state[key].title,
                                            author: state[key].creator?.name,
                                            content: JSON.stringify(content),
                                            description: state[key].previewContent?.subtitle
                                        };
                                    }
                                }
                            } catch (e) {
                                console.log('Apollo parse error:', e);
                            }
                        }
                    }

                    // Method 3: Direct article extraction
                    const articleElement = document.querySelector('article');
                    if (articleElement) {
                        return {
                            method: 'direct',
                            title: document.querySelector('h1')?.textContent,
                            author: document.querySelector('[rel="author"]')?.textContent,
                            content: articleElement.innerHTML,
                            description: null
                        };
                    }

                    return null;
                });

                if (mediumData && mediumData.content) {
                    let contentHtml = mediumData.content;

                    // If content is plain text, convert to HTML
                    if (mediumData.method === 'jsonld' && !contentHtml.includes('<')) {
                        contentHtml = mediumData.content
                            .split('\n\n')
                            .filter(p => p.trim())
                            .map(p => `<p>${p.trim().replace(/\n/g, '<br>')}</p>`)
                            .join('\n');
                    }

                    article = {
                        title: mediumData.title,
                        byline: mediumData.author,
                        content: contentHtml,
                        excerpt: mediumData.description
                    };

                    console.log(`Medium extraction successful via ${mediumData.method}`);
                }
            } catch (e) {
                console.log('Failed to extract Medium content:', e.message);
            }
        }

        // Fallback to Readability if JSON-LD extraction failed
        if (!article || !article.content) {
            const dom = new JSDOM(html, { url: finalUrl });
            const reader = new Readability(dom.window.document);
            article = reader.parse();
        }

        // Check for paywall and truncation
        const paywallIndicators = [
            'paywall', 'subscriber-only', 'members-only', 'premium-content',
            'subscription required', 'subscribe to read', 'register to continue',
            'sign in to read', 'become a member'
        ];

        const truncationIndicators = [
            'subscribe to continue reading',
            'this post is for paid subscribers',
            'upgrade to continue reading',
            'available to paid subscribers'
        ];

        const hasPaywall = paywallIndicators.some(indicator =>
            html.toLowerCase().includes(indicator)
        );

        const isTruncated = truncationIndicators.some(indicator =>
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
                isTruncated: isTruncated,
                method: 'puppeteer',
                url: finalUrl,
                warning: isTruncated ? 'Content may be incomplete - server-side paywall detected' : null
            });
        } else {
            res.json({
                success: true,
                content: html,
                readableContent: false,
                hasPaywall: hasPaywall,
                isTruncated: isTruncated,
                method: 'puppeteer',
                url: finalUrl,
                warning: isTruncated ? 'Content may be incomplete - server-side paywall detected' : null
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
