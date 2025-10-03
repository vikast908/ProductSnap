const axios = require('axios');
const { JSDOM } = require('jsdom');

async function trySubstackBypass(url) {
    console.log('=== ATTEMPTING ALL SUBSTACK BYPASS METHODS ===\n');

    // Extract post ID from URL
    const postIdMatch = url.match(/\/i\/(\d+)\//);
    const postId = postIdMatch ? postIdMatch[1] : null;
    console.log('Post ID:', postId);

    // Method 1: Try Substack's own API
    if (postId) {
        console.log('\n--- Method 1: Substack API ---');
        try {
            const apiUrl = `https://www.lennysnewsletter.com/api/v1/posts/${postId}`;
            const response = await axios.get(apiUrl, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                }
            });

            if (response.data && response.data.body_html) {
                console.log('✅ SUCCESS via Substack API!');
                console.log('Content length:', response.data.body_html.length);
                console.log('First 300 chars:', response.data.body_html.substring(0, 300));
                return { method: 'api', content: response.data.body_html, success: true };
            }
        } catch (e) {
            console.log('❌ API failed:', e.response?.status || e.message);
        }
    }

    // Method 2: Try RSS feed
    console.log('\n--- Method 2: RSS Feed ---');
    try {
        const rssUrl = 'https://www.lennysnewsletter.com/feed';
        const response = await axios.get(rssUrl);
        const dom = new JSDOM(response.data, { contentType: 'text/xml' });
        const items = dom.window.document.querySelectorAll('item');

        for (const item of items) {
            const link = item.querySelector('link')?.textContent;
            if (link && link.includes(postId)) {
                const content = item.querySelector('content\\:encoded, description')?.textContent;
                if (content && content.length > 1000) {
                    console.log('✅ Found in RSS feed!');
                    console.log('Content length:', content.length);
                    return { method: 'rss', content: content, success: true };
                }
            }
        }
        console.log('❌ Post not found in RSS or truncated');
    } catch (e) {
        console.log('❌ RSS failed:', e.message);
    }

    // Method 3: Try Google Cache
    console.log('\n--- Method 3: Google Cache ---');
    try {
        const cacheUrl = `https://webcache.googleusercontent.com/search?q=cache:${encodeURIComponent(url)}`;
        console.log('Cache URL:', cacheUrl);
        const response = await axios.get(cacheUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            },
            maxRedirects: 5
        });

        const dom = new JSDOM(response.data);
        const content = dom.window.document.querySelector('article')?.innerHTML;

        if (content && content.length > 5000) {
            console.log('✅ Found in Google Cache!');
            console.log('Content length:', content.length);
            return { method: 'cache', content: content, success: true };
        } else {
            console.log('❌ Cache exists but content truncated');
        }
    } catch (e) {
        console.log('❌ Google Cache failed:', e.response?.status || e.message);
    }

    // Method 4: Try Archive.org
    console.log('\n--- Method 4: Archive.org Wayback Machine ---');
    try {
        const archiveUrl = `https://archive.org/wayback/available?url=${encodeURIComponent(url)}`;
        const archiveCheck = await axios.get(archiveUrl);

        if (archiveCheck.data.archived_snapshots.closest) {
            const snapshot = archiveCheck.data.archived_snapshots.closest.url;
            console.log('Found snapshot:', snapshot);

            const response = await axios.get(snapshot);
            const dom = new JSDOM(response.data);
            const content = dom.window.document.querySelector('article')?.innerHTML;

            if (content && content.length > 5000) {
                console.log('✅ Found in Archive.org!');
                console.log('Content length:', content.length);
                return { method: 'archive', content: content, success: true };
            }
        } else {
            console.log('❌ No archive snapshot found');
        }
    } catch (e) {
        console.log('❌ Archive.org failed:', e.message);
    }

    // Method 5: Try direct page with different headers
    console.log('\n--- Method 5: Header Spoofing ---');
    try {
        const headers = [
            { name: 'Googlebot', 'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)' },
            { name: 'Facebook', 'User-Agent': 'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)' },
            { name: 'Twitter', 'User-Agent': 'Twitterbot/1.0' }
        ];

        for (const header of headers) {
            try {
                const response = await axios.get(url, { headers: { 'User-Agent': header['User-Agent'] } });
                const dom = new JSDOM(response.data);
                const content = dom.window.document.querySelector('article')?.innerHTML;

                if (content && content.length > 5000 && !content.toLowerCase().includes('for paid subscribers')) {
                    console.log(`✅ ${header.name} user agent worked!`);
                    console.log('Content length:', content.length);
                    return { method: 'spoofing', content: content, success: true };
                }
            } catch (e) {
                // Continue to next
            }
        }
        console.log('❌ Header spoofing failed');
    } catch (e) {
        console.log('❌ Spoofing error:', e.message);
    }

    console.log('\n=== ALL METHODS FAILED ===');
    console.log('This content is server-side truncated and cannot be accessed without a subscription.');
    return { success: false, message: 'All bypass methods exhausted' };
}

// Test it
const url = 'https://www.lennysnewsletter.com/i/173871171/my-biggest-takeaways-from-this-conversation';
trySubstackBypass(url).then(result => {
    if (result.success) {
        console.log('\n\n=== FINAL RESULT ===');
        console.log('Method:', result.method);
        console.log('Content preview:', result.content.substring(0, 500));
    }
}).catch(console.error);
