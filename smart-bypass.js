const puppeteer = require('puppeteer');
const fs = require('fs');

async function smartBypass() {
    console.log('=== SMART BYPASS - Preserve Content, Remove Paywalls ===\n');

    const browser = await puppeteer.launch({
        headless: false,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const page = await browser.newPage();

    console.log('Navigating to article...');
    await page.goto('https://www.lennysnewsletter.com/p/why-ai-evals-are-the-hottest-new-skill', {
        waitUntil: 'networkidle2',
        timeout: 60000
    });

    console.log('Waiting for content to load...');
    await page.waitForTimeout(5000);

    console.log('Smartly removing ONLY paywall UI (keeping content)...\n');

    await page.evaluate(() => {
        // CONSERVATIVE REMOVAL - Only remove obvious paywall UI, keep all article content

        // 1. Remove only the subscription CTA boxes (orange/colored boxes with buttons)
        document.querySelectorAll('div, section').forEach(el => {
            const text = el.textContent?.toLowerCase() || '';

            // Only remove if it's a small box with subscription call-to-action
            if (el.children.length < 5 && text.length < 500) {
                const hasSubscribeButton = el.querySelector('button, a[href*="subscribe"]');
                const hasSubscribeText = text.includes('paid subscriber') ||
                                        text.includes('upgrade to paid') ||
                                        text.includes('subscribe now');

                if (hasSubscribeButton && hasSubscribeText) {
                    console.log('Removing subscription CTA box');
                    el.remove();
                }
            }
        });

        // 2. Remove blur effects from content
        document.querySelectorAll('*').forEach(el => {
            const style = window.getComputedStyle(el);
            if (style.filter && style.filter.includes('blur')) {
                el.style.filter = 'none';
                console.log('Removed blur effect');
            }
        });

        // 3. Show any hidden article content (but not hidden UI elements)
        document.querySelectorAll('article [style*="display: none"], article [style*="display:none"]').forEach(el => {
            // Only reveal if it contains substantial text (likely content, not UI)
            if (el.textContent.length > 100) {
                el.style.display = 'block';
                console.log('Revealed hidden content:', el.textContent.substring(0, 50));
            }
        });

        // 4. Remove max-height restrictions on article content
        document.querySelectorAll('article *').forEach(el => {
            const style = window.getComputedStyle(el);
            if (style.maxHeight && style.maxHeight !== 'none') {
                el.style.maxHeight = 'none';
                el.style.overflow = 'visible';
                console.log('Removed height restriction');
            }
        });

        // 5. Remove truncation classes
        document.querySelectorAll('[class*="truncat"]').forEach(el => {
            if (el.closest('article')) {
                Array.from(el.classList).forEach(cls => {
                    if (cls.includes('truncat')) {
                        el.classList.remove(cls);
                        console.log('Removed truncation class');
                    }
                });
            }
        });

        // 6. Enable scrolling
        document.body.style.overflow = 'auto';
        document.documentElement.style.overflow = 'auto';

        // 7. Make everything visible (opacity)
        document.querySelectorAll('article *').forEach(el => {
            if (window.getComputedStyle(el).opacity !== '1') {
                el.style.opacity = '1';
            }
        });
    });

    await page.waitForTimeout(2000);

    console.log('\nExtracting all content...');

    const result = await page.evaluate(() => {
        const article = document.querySelector('article');
        if (!article) return null;

        // Get all text content
        const fullText = article.textContent;

        // Find "My biggest takeaways" section
        const takeawaysIndex = fullText.indexOf('My biggest takeaways from this conversation:');
        let takeawaysContent = '';

        if (takeawaysIndex !== -1) {
            // Get everything after that heading (next 5000 chars)
            takeawaysContent = fullText.substring(takeawaysIndex, takeawaysIndex + 5000);
        }

        // Also get HTML for inspection
        const html = article.innerHTML;

        return {
            found: takeawaysIndex !== -1,
            takeawaysContent: takeawaysContent,
            fullText: fullText,
            fullHtml: html,
            length: fullText.length
        };
    });

    if (!result) {
        console.log('❌ No article found');
        await browser.close();
        return;
    }

    console.log('\n=== RESULT ===');
    console.log('Total content length:', result.length, 'characters');
    console.log('Found "My biggest takeaways":', result.found);

    if (result.found) {
        console.log('\n📝 BIGGEST TAKEAWAYS SECTION:');
        console.log('═'.repeat(80));
        console.log(result.takeawaysContent);
        console.log('═'.repeat(80));

        // Save files
        fs.writeFileSync('SMART-BYPASS-takeaways.txt', result.takeawaysContent);
        fs.writeFileSync('SMART-BYPASS-full.txt', result.fullText);
        fs.writeFileSync('SMART-BYPASS-full.html', result.fullHtml);

        console.log('\n✅ Saved to:');
        console.log('   - SMART-BYPASS-takeaways.txt (the section you want)');
        console.log('   - SMART-BYPASS-full.txt (complete article text)');
        console.log('   - SMART-BYPASS-full.html (complete article HTML)');
    } else {
        console.log('\n❌ "My biggest takeaways" section not found in content');
        console.log('First 1000 chars:', result.fullText.substring(0, 1000));
    }

    console.log('\n⏳ Browser staying open for 90 seconds - LOOK AT THE PAGE!');
    console.log('   Check if you can see the takeaways section in the browser');
    await page.waitForTimeout(90000);

    await browser.close();
}

smartBypass().catch(console.error);
