const axios = require('axios');
const { JSDOM } = require('jsdom');

async function testMedium() {
    const url = 'https://medium.com/xross-functional/why-we-dont-interview-product-managers-anymore-ba1dd0031c0b';

    console.log('Fetching Medium article...');

    const response = await axios.get(url, {
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
    });

    const html = response.data;
    const dom = new JSDOM(html);
    const doc = dom.window.document;

    console.log('\n=== Testing JSON-LD extraction ===');
    const scripts = Array.from(doc.querySelectorAll('script[type="application/ld+json"]'));
    console.log(`Found ${scripts.length} JSON-LD scripts`);

    for (let i = 0; i < scripts.length; i++) {
        try {
            const data = JSON.parse(scripts[i].textContent);
            console.log(`\nScript ${i + 1} type:`, data['@type']);

            if (data['@type'] === 'Article' || data['@type'] === 'NewsArticle' || data['@type'] === 'SocialMediaPosting') {
                console.log('Title:', data.headline || data.name);
                console.log('Author:', data.author?.name);
                console.log('Has articleBody:', !!data.articleBody);
                console.log('Has hasPart:', !!data.hasPart);
                console.log('isAccessibleForFree:', data.isAccessibleForFree);

                if (data.hasPart) {
                    console.log('hasPart:', JSON.stringify(data.hasPart, null, 2));
                }

                if (data.articleBody) {
                    console.log('Article body length:', data.articleBody.length);
                    console.log('First 200 chars:', data.articleBody.substring(0, 200));
                    console.log('\n✅ SUCCESS! Full article extracted from JSON-LD');
                    return;
                }
            }
        } catch (e) {
            console.log(`Script ${i + 1} parse error:`, e.message);
        }
    }

    console.log('\n❌ FAILED: Could not extract article from JSON-LD');
}

testMedium().catch(console.error);
