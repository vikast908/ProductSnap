const puppeteer = require('puppeteer');
const fs = require('fs');

async function testMediumReal() {
    console.log('=== TESTING REAL MEDIUM ARTICLE ===\n');

    const browser = await puppeteer.launch({
        headless: false,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const page = await browser.newPage();

    const url = 'https://medium.com/xross-functional/why-we-dont-interview-product-managers-anymore-ba1dd0031c0b';

    console.log('Navigating to Medium article...');

    await page.goto(url, {
        waitUntil: 'networkidle2',
        timeout: 60000
    });

    console.log('Waiting for content...');
    await page.waitForTimeout(5000);

    // First, let's see what we actually have
    const pageInfo = await page.evaluate(() => {
        return {
            title: document.title,
            articleExists: !!document.querySelector('article'),
            bodyLength: document.body.textContent.length,
            hasPaywall: document.body.textContent.toLowerCase().includes('member-only') ||
                       document.body.textContent.toLowerCase().includes('member preview'),
            preview: document.body.textContent.substring(0, 500)
        };
    });

    console.log('\n=== PAGE INFO ===');
    console.log('Title:', pageInfo.title);
    console.log('Article element exists:', pageInfo.articleExists);
    console.log('Content length:', pageInfo.bodyLength);
    console.log('Has paywall:', pageInfo.hasPaywall);
    console.log('\nPreview:', pageInfo.preview);

    // Now try to bypass Medium paywall
    console.log('\n=== ATTEMPTING MEDIUM BYPASS ===');

    await page.evaluate(() => {
        // Remove Medium's paywall overlay
        document.querySelectorAll('[data-testid*="paywall"]').forEach(el => el.remove());
        document.querySelectorAll('[class*="paywall"]').forEach(el => el.remove());

        // Remove the membership notice
        document.querySelectorAll('*').forEach(el => {
            const text = el.textContent?.toLowerCase() || '';
            if (text.includes('member-only story') && el.textContent.length < 200) {
                el.remove();
            }
        });

        // Reveal hidden content
        document.querySelectorAll('[style*="display: none"]').forEach(el => {
            if (el.closest('article')) {
                el.style.display = 'block';
            }
        });

        // Remove blur
        document.querySelectorAll('*').forEach(el => {
            const style = window.getComputedStyle(el);
            if (style.filter && style.filter.includes('blur')) {
                el.style.filter = 'none';
            }
        });

        // Enable scrolling
        document.body.style.overflow = 'auto';
    });

    await page.waitForTimeout(2000);

    // Extract content
    const content = await page.evaluate(() => {
        const article = document.querySelector('article');
        if (!article) return null;

        return {
            html: article.innerHTML,
            text: article.textContent,
            length: article.textContent.length,
            paragraphs: article.querySelectorAll('p').length
        };
    });

    console.log('\n=== EXTRACTED CONTENT ===');
    if (content) {
        console.log('Text length:', content.length, 'characters');
        console.log('Paragraphs:', content.paragraphs);
        console.log('\nFirst 1000 chars:');
        console.log(content.text.substring(0, 1000));

        fs.writeFileSync('medium-extracted.html', content.html);
        fs.writeFileSync('medium-extracted.txt', content.text);
        console.log('\n✅ Saved to medium-extracted.html and medium-extracted.txt');
    } else {
        console.log('❌ No article content found');
    }

    console.log('\nBrowser staying open for 60 seconds - check if you can read the full article!');
    await page.waitForTimeout(60000);

    await browser.close();
}

testMediumReal().catch(console.error);
