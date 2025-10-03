const puppeteer = require('puppeteer');

async function customBrowserBypass(url) {
    console.log('=== CUSTOM BROWSER WITH AGGRESSIVE PAYWALL REMOVAL ===\n');

    const browser = await puppeteer.launch({
        headless: false, // Show browser so we can see what's happening
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-web-security', // Disable CORS
            '--disable-features=IsolateOrigins,site-per-process',
            '--disable-blink-features=AutomationControlled',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--disable-gpu'
        ],
        ignoreHTTPSErrors: true,
        devtools: false
    });

    const page = await browser.newPage();

    // Set aggressive user agent
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

    // Set extra headers to appear like a real browser
    await page.setExtraHTTPHeaders({
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Referer': 'https://www.google.com/',
        'DNT': '1'
    });

    // Intercept and modify requests
    await page.setRequestInterception(true);

    page.on('request', (request) => {
        const url = request.url();

        // Block analytics and tracking
        const blockedDomains = [
            'google-analytics.com',
            'googletagmanager.com',
            'facebook.com/tr',
            'twitter.com/i',
            'doubleclick.net',
            'cdn.segment.com',
            'analytics.substack.com'
        ];

        if (blockedDomains.some(domain => url.includes(domain))) {
            request.abort();
            return;
        }

        // Modify headers for all requests
        const headers = Object.assign({}, request.headers(), {
            'Referer': 'https://www.google.com/',
            'Origin': undefined
        });

        request.continue({ headers });
    });

    // Inject JavaScript BEFORE page loads
    await page.evaluateOnNewDocument(() => {
        // Override detection methods
        Object.defineProperty(navigator, 'webdriver', { get: () => false });
        Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
        Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] });

        // Mock subscription status
        window.localStorage.setItem('substack.subscription', JSON.stringify({
            active: true,
            status: 'active',
            paid: true
        }));

        // Prevent paywall scripts from running
        const originalCreateElement = document.createElement;
        document.createElement = function(tagName) {
            const element = originalCreateElement.call(document, tagName);

            if (tagName.toLowerCase() === 'script') {
                const originalSetAttribute = element.setAttribute;
                element.setAttribute = function(name, value) {
                    // Block paywall-related scripts
                    if (name === 'src' && (
                        value.includes('paywall') ||
                        value.includes('subscription') ||
                        value.includes('metering')
                    )) {
                        console.log('Blocked script:', value);
                        return;
                    }
                    return originalSetAttribute.call(element, name, value);
                };
            }

            return element;
        };

        // Continuously remove paywall elements
        const observer = new MutationObserver(() => {
            // Remove paywall boxes
            document.querySelectorAll('*').forEach(el => {
                const text = el.textContent?.toLowerCase() || '';
                if (el.children.length === 0 && text.length < 500) {
                    if (text.includes('paid subscriber') ||
                        text.includes('upgrade to paid') ||
                        text.includes('subscribe to continue')) {
                        el.remove();
                    }
                }
            });

            // Reveal hidden content
            document.querySelectorAll('[style*="display: none"], [style*="display:none"]').forEach(el => {
                if (!el.closest('script') && !el.closest('style')) {
                    el.style.display = 'block';
                }
            });

            // Remove blur
            document.querySelectorAll('[style*="blur"]').forEach(el => {
                el.style.filter = 'none';
            });

            // Enable scrolling
            document.body.style.overflow = 'auto';
            document.documentElement.style.overflow = 'auto';
        });

        // Start observing as soon as possible
        if (document.body) {
            observer.observe(document.body, { childList: true, subtree: true, attributes: true });
        } else {
            document.addEventListener('DOMContentLoaded', () => {
                observer.observe(document.body, { childList: true, subtree: true, attributes: true });
            });
        }
    });

    console.log('Navigating to:', url);

    try {
        await page.goto(url, {
            waitUntil: 'networkidle2',
            timeout: 60000
        });

        console.log('Page loaded, waiting for content...');
        await page.waitForTimeout(5000);

        // Aggressive paywall removal after load
        await page.evaluate(() => {
            // Find and remove paywall boxes by color
            document.querySelectorAll('div').forEach(el => {
                const style = window.getComputedStyle(el);
                const bgColor = style.backgroundColor;
                const text = el.textContent?.toLowerCase() || '';

                // Remove colored boxes with paywall text
                if (bgColor && bgColor !== 'rgba(0, 0, 0, 0)' && bgColor !== 'transparent') {
                    if (text.includes('paid subscriber') ||
                        text.includes('upgrade') ||
                        text.includes('subscribe')) {
                        el.remove();
                    }
                }
            });

            // Remove all paywalls by class/id
            const selectors = [
                '[class*="paywall"]', '[id*="paywall"]',
                '[class*="subscription"]', '[id*="subscription"]',
                '[class*="upgrade"]', '[data-component*="paywall"]'
            ];

            selectors.forEach(selector => {
                document.querySelectorAll(selector).forEach(el => el.remove());
            });
        });

        console.log('Extracting content...');

        const content = await page.evaluate(() => {
            const article = document.querySelector('article');
            if (article) {
                return {
                    html: article.innerHTML,
                    text: article.textContent,
                    length: article.textContent.length
                };
            }
            return null;
        });

        if (content) {
            console.log('\n✅ Content extracted!');
            console.log('Content length:', content.length, 'characters');
            console.log('Text preview:', content.text.substring(0, 500));

            // Save to file
            const fs = require('fs');
            fs.writeFileSync('extracted-content.html', content.html);
            console.log('\n📄 Saved to extracted-content.html');
        } else {
            console.log('❌ No article content found');
        }

        console.log('\nBrowser will stay open for 30 seconds for you to inspect...');
        await page.waitForTimeout(30000);

    } catch (error) {
        console.error('Error:', error.message);
    } finally {
        await browser.close();
    }
}

// Run it
const url = 'https://www.lennysnewsletter.com/i/173871171/my-biggest-takeaways-from-this-conversation';
customBrowserBypass(url).catch(console.error);
