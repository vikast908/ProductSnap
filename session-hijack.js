const puppeteer = require('puppeteer');
const fs = require('fs');

async function sessionHijack() {
    console.log('=== SESSION HIJACKING ATTEMPT ===\n');

    const browser = await puppeteer.launch({
        headless: false,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-web-security',
            '--disable-features=IsolateOrigins,site-per-process'
        ]
    });

    const page = await browser.newPage();

    // Method 1: Inject fake subscription cookies
    console.log('--- Method 1: Injecting Fake Subscription Cookies ---');

    await page.goto('https://www.lennysnewsletter.com', { waitUntil: 'networkidle2' });

    // Set cookies that might trick Substack
    const fakeCookies = [
        {
            name: 'substack.sid',
            value: 'fake-session-' + Math.random().toString(36),
            domain: '.substack.com',
            path: '/',
            httpOnly: true,
            secure: true
        },
        {
            name: 'connect.sid',
            value: 's%3A' + Math.random().toString(36).substring(2),
            domain: '.substack.com',
            path: '/',
            httpOnly: true,
            secure: true
        },
        {
            name: 'substack_subscription',
            value: JSON.stringify({ active: true, paid: true, status: 'active' }),
            domain: '.lennysnewsletter.com',
            path: '/'
        }
    ];

    for (const cookie of fakeCookies) {
        try {
            await page.setCookie(cookie);
            console.log('✓ Set cookie:', cookie.name);
        } catch (e) {
            console.log('✗ Failed to set:', cookie.name);
        }
    }

    // Method 2: Modify localStorage/sessionStorage
    console.log('\n--- Method 2: Injecting Fake Subscription State ---');

    await page.evaluate(() => {
        // Fake subscription data
        const fakeSubscription = {
            id: 'fake-sub-' + Date.now(),
            publication_id: 'lennysnewsletter',
            user_id: 'fake-user',
            stripe_customer_id: 'cus_fake',
            stripe_subscription_id: 'sub_fake',
            status: 'active',
            plan_id: 'paid',
            active: true,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
        };

        // Set in localStorage
        localStorage.setItem('substack.subscription', JSON.stringify(fakeSubscription));
        localStorage.setItem('substack.user', JSON.stringify({
            id: 'fake-user',
            email: 'fake@example.com',
            is_subscriber: true,
            subscription: fakeSubscription
        }));

        // Set in sessionStorage
        sessionStorage.setItem('subscription_active', 'true');
        sessionStorage.setItem('is_paid_subscriber', 'true');

        console.log('Injected fake subscription data');
    });

    // Method 3: Intercept and modify network requests
    console.log('\n--- Method 3: Intercepting API Calls ---');

    await page.setRequestInterception(true);

    page.on('request', request => {
        const url = request.url();

        // Intercept subscription check requests
        if (url.includes('/api/v1/subscription') ||
            url.includes('/api/v1/user/subscription') ||
            url.includes('check_subscription')) {

            console.log('Intercepting subscription check:', url);

            // Return fake subscription data
            request.respond({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({
                    active: true,
                    status: 'active',
                    plan: 'paid',
                    is_subscriber: true,
                    has_access: true
                })
            });
        } else {
            request.continue();
        }
    });

    page.on('response', async response => {
        const url = response.url();

        // Log subscription-related responses
        if (url.includes('subscription') || url.includes('paywall')) {
            console.log('Response from:', url.substring(0, 80));
            try {
                const data = await response.json();
                console.log('Data:', JSON.stringify(data).substring(0, 200));
            } catch (e) {
                // Not JSON
            }
        }
    });

    // Method 4: Inject code to override paywall functions
    console.log('\n--- Method 4: Overriding Paywall Functions ---');

    await page.evaluateOnNewDocument(() => {
        // Override fetch to fake subscription responses
        const originalFetch = window.fetch;
        window.fetch = function(...args) {
            const url = args[0];

            if (typeof url === 'string' &&
                (url.includes('subscription') || url.includes('paywall'))) {

                console.log('Faking fetch for:', url);

                return Promise.resolve(new Response(JSON.stringify({
                    active: true,
                    status: 'active',
                    is_subscriber: true,
                    has_access: true
                }), {
                    status: 200,
                    headers: { 'Content-Type': 'application/json' }
                }));
            }

            return originalFetch.apply(this, args);
        };

        // Override XMLHttpRequest
        const originalOpen = XMLHttpRequest.prototype.open;
        XMLHttpRequest.prototype.open = function(method, url, ...rest) {
            this._url = url;
            return originalOpen.call(this, method, url, ...rest);
        };

        const originalSend = XMLHttpRequest.prototype.send;
        XMLHttpRequest.prototype.send = function(...args) {
            if (this._url && (this._url.includes('subscription') || this._url.includes('paywall'))) {
                console.log('Intercepting XHR:', this._url);

                setTimeout(() => {
                    Object.defineProperty(this, 'responseText', {
                        writable: true,
                        value: JSON.stringify({ active: true, is_subscriber: true })
                    });
                    Object.defineProperty(this, 'status', { writable: true, value: 200 });
                    this.dispatchEvent(new Event('load'));
                }, 0);

                return;
            }
            return originalSend.apply(this, args);
        };
    });

    // Now navigate to the target article
    console.log('\n--- Navigating to target article ---');
    const targetUrl = 'https://www.lennysnewsletter.com/p/why-ai-evals-are-the-hottest-new-skill';

    try {
        await page.goto(targetUrl, {
            waitUntil: 'networkidle2',
            timeout: 60000
        });

        console.log('Page loaded!');
        await page.waitForTimeout(5000);

        // Check if we can see the content
        const content = await page.evaluate(() => {
            const article = document.querySelector('article');
            if (!article) return null;

            const text = article.textContent;
            const hasTakeaways = text.toLowerCase().includes('biggest takeaways');
            const hasPaywall = text.toLowerCase().includes('for paid subscribers');

            return {
                found: hasTakeaways,
                hasPaywall: hasPaywall,
                length: text.length,
                preview: text.substring(0, 500)
            };
        });

        console.log('\n=== RESULT ===');
        if (content) {
            console.log('Content length:', content.length);
            console.log('Has "biggest takeaways":', content.found);
            console.log('Has paywall:', content.hasPaywall);
            console.log('\nPreview:', content.preview);

            if (content.found && !content.hasPaywall) {
                console.log('\n🎉 SUCCESS! We bypassed the paywall!');

                const fullContent = await page.evaluate(() => {
                    return document.querySelector('article')?.innerHTML;
                });

                fs.writeFileSync('BYPASSED-content.html', fullContent);
                console.log('Saved to BYPASSED-content.html');
            } else {
                console.log('\n❌ Paywall still active');
            }
        }

        console.log('\nBrowser staying open for 60 seconds to inspect...');
        await page.waitForTimeout(60000);

    } catch (error) {
        console.error('Navigation error:', error.message);
    }

    await browser.close();
}

sessionHijack().catch(console.error);
