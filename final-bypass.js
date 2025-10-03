const puppeteer = require('puppeteer');
const fs = require('fs');

async function finalBypass() {
    console.log('=== FINAL AGGRESSIVE BYPASS ===\n');
    console.log('Since content IS on the page, we just need to reveal it!\n');

    const browser = await puppeteer.launch({
        headless: false,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const page = await browser.newPage();

    // Block subscription checks
    await page.setRequestInterception(true);
    page.on('request', req => {
        const url = req.url();
        if (url.includes('subscription') || url.includes('paywall') || url.includes('stripe')) {
            req.abort();
        } else {
            req.continue();
        }
    });

    console.log('Navigating to article...');
    await page.goto('https://www.lennysnewsletter.com/p/why-ai-evals-are-the-hottest-new-skill', {
        waitUntil: 'networkidle2',
        timeout: 60000
    });

    console.log('Waiting for content to load...');
    await page.waitForTimeout(5000);

    console.log('AGGRESSIVELY removing ALL paywall elements...');

    // Run this multiple times to catch dynamically added paywalls
    for (let i = 0; i < 5; i++) {
        await page.evaluate(() => {
            // Remove EVERYTHING that might be a paywall
            const killSelectors = [
                // Paywall divs
                '[class*="paywall"]', '[id*="paywall"]',
                '[class*="subscription"]', '[id*="subscription"]',
                '[class*="upgrade"]', '[id*="upgrade"]',
                // Overlays
                '[class*="overlay"]', '[id*="overlay"]',
                '[class*="modal"]', '[id*="modal"]',
                // Substack specific
                '.paywall-subscribe-cta',
                '.paywall-upsell',
                '[data-component*="paywall"]'
            ];

            killSelectors.forEach(selector => {
                document.querySelectorAll(selector).forEach(el => el.remove());
            });

            // Remove any element containing paywall text
            document.querySelectorAll('*').forEach(el => {
                if (el.children.length === 0) { // Only leaf elements
                    const text = el.textContent?.toLowerCase() || '';
                    if (text.length < 300 && (
                        text.includes('paid subscriber') ||
                        text.includes('upgrade to paid') ||
                        text.includes('subscribe to continue') ||
                        text.includes('this post is for')
                    )) {
                        el.remove();
                    }
                }
            });

            // Find and kill colored paywall boxes
            document.querySelectorAll('div, section').forEach(el => {
                const style = window.getComputedStyle(el);
                const bg = style.backgroundColor;
                const text = el.textContent?.toLowerCase() || '';

                // If it's a colored box with subscription text and relatively short
                if (bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent' &&
                    text.length < 500 && text.includes('subscriber')) {
                    el.remove();
                }
            });

            // Remove all hidden/truncated content markers
            document.querySelectorAll('[class*="truncat"]').forEach(el => {
                el.classList.forEach(cls => {
                    if (cls.includes('truncat')) {
                        el.classList.remove(cls);
                    }
                });
            });

            // Reveal ALL hidden content
            document.querySelectorAll('[style*="display: none"], [style*="display:none"], .hidden').forEach(el => {
                if (!el.closest('script') && !el.closest('style')) {
                    el.style.display = 'block';
                    el.classList.remove('hidden');
                }
            });

            // Remove max-height restrictions
            document.querySelectorAll('[style*="max-height"]').forEach(el => {
                el.style.maxHeight = 'none';
                el.style.height = 'auto';
            });

            // Remove blur/opacity effects
            document.querySelectorAll('*').forEach(el => {
                const style = window.getComputedStyle(el);
                if (style.filter && style.filter.includes('blur')) {
                    el.style.filter = 'none';
                }
                if (style.opacity !== '1') {
                    el.style.opacity = '1';
                }
            });

            // Enable scrolling
            document.body.style.overflow = 'auto';
            document.documentElement.style.overflow = 'auto';
            document.body.style.maxHeight = 'none';

            // Remove pointer-events blocking
            document.querySelectorAll('*').forEach(el => {
                if (window.getComputedStyle(el).pointerEvents === 'none') {
                    el.style.pointerEvents = 'auto';
                }
            });
        });

        await page.waitForTimeout(1000);
    }

    console.log('\nExtracting content...');

    const result = await page.evaluate(() => {
        const article = document.querySelector('article');
        if (!article) return null;

        const fullText = article.textContent;
        const html = article.innerHTML;

        // Find the "biggest takeaways" section
        const takeawaysIndex = fullText.toLowerCase().indexOf('biggest takeaways');
        let takeawaysSection = '';

        if (takeawaysIndex !== -1) {
            takeawaysSection = fullText.substring(takeawaysIndex, takeawaysIndex + 2000);
        }

        return {
            hasTakeaways: takeawaysIndex !== -1,
            hasPaywall: fullText.toLowerCase().includes('for paid subscribers'),
            fullLength: fullText.length,
            takeawaysPreview: takeawaysSection,
            fullHtml: html
        };
    });

    console.log('\n=== RESULT ===');
    console.log('Content length:', result.fullLength, 'characters');
    console.log('Has "biggest takeaways":', result.hasTakeaways);
    console.log('Still has paywall text:', result.hasPaywall);

    if (result.hasTakeaways) {
        console.log('\n"Biggest Takeaways" section:');
        console.log('─'.repeat(80));
        console.log(result.takeawaysPreview);
        console.log('─'.repeat(80));

        // Save full content
        fs.writeFileSync('FINAL-BYPASS-content.html', result.fullHtml);
        fs.writeFileSync('FINAL-BYPASS-text.txt', result.takeawaysPreview);
        console.log('\n✅ Saved to:');
        console.log('   - FINAL-BYPASS-content.html (full HTML)');
        console.log('   - FINAL-BYPASS-text.txt (takeaways section)');
    }

    if (!result.hasPaywall) {
        console.log('\n🎉 SUCCESS! Paywall removed!');
    } else {
        console.log('\n⚠️ Paywall text still detected, but content may be visible');
    }

    console.log('\nBrowser staying open for 60 seconds - CHECK IF YOU CAN SEE THE CONTENT!');
    await page.waitForTimeout(60000);

    await browser.close();
}

finalBypass().catch(console.error);
