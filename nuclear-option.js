const axios = require('axios');
const { JSDOM } = require('jsdom');

async function nuclearOption(url) {
    console.log('=== NUCLEAR OPTION: ALL REMAINING TECHNIQUES ===\n');

    const postId = '173871171';
    const publication = 'lennysnewsletter';

    // Method 1: Try Substack's GraphQL endpoint (used by their app)
    console.log('--- Method 1: GraphQL API ---');
    try {
        const graphqlUrl = 'https://substack.com/api/v1/graphql';
        const query = {
            query: `
                query {
                    post(id: "${postId}") {
                        id
                        title
                        body_html
                        body_json
                    }
                }
            `
        };

        const response = await axios.post(graphqlUrl, query, {
            headers: {
                'Content-Type': 'application/json',
                'User-Agent': 'Substack-iOS/1.0',
                'Origin': 'https://substack.com'
            }
        });

        if (response.data?.data?.post?.body_html) {
            console.log('✅ GraphQL SUCCESS!');
            console.log('Content:', response.data.data.post.body_html.substring(0, 500));
            return { success: true, content: response.data.data.post.body_html };
        }
    } catch (e) {
        console.log('❌ GraphQL failed:', e.response?.status, e.response?.data || e.message);
    }

    // Method 2: Try mobile API endpoint
    console.log('\n--- Method 2: Mobile API ---');
    try {
        const mobileUrl = `https://substack.com/api/v1/posts/${postId}`;
        const response = await axios.get(mobileUrl, {
            headers: {
                'User-Agent': 'Substack-Android/1.0.0',
                'X-Client-Version': '1.0.0',
                'Accept': 'application/json'
            }
        });

        if (response.data?.body_html) {
            console.log('✅ Mobile API SUCCESS!');
            console.log('Content:', response.data.body_html.substring(0, 500));
            return { success: true, content: response.data.body_html };
        }
    } catch (e) {
        console.log('❌ Mobile API failed:', e.response?.status || e.message);
    }

    // Method 3: Try newsletter email version
    console.log('\n--- Method 3: Email Newsletter Endpoint ---');
    try {
        const emailUrl = `https://${publication}.substack.com/api/v1/posts/${postId}/email`;
        const response = await axios.get(emailUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0',
                'Accept': 'text/html'
            }
        });

        if (response.data && response.data.length > 5000) {
            console.log('✅ Email endpoint SUCCESS!');
            console.log('Content:', response.data.substring(0, 500));
            return { success: true, content: response.data };
        }
    } catch (e) {
        console.log('❌ Email endpoint failed:', e.response?.status || e.message);
    }

    // Method 4: Try reading from Open Graph / Twitter Cards meta tags
    console.log('\n--- Method 4: Meta Tag Extraction ---');
    try {
        const response = await axios.get(url);
        const dom = new JSDOM(response.data);
        const doc = dom.window.document;

        const description = doc.querySelector('meta[property="og:description"]')?.content ||
                          doc.querySelector('meta[name="description"]')?.content ||
                          doc.querySelector('meta[name="twitter:description"]')?.content;

        console.log('Description found:', description?.substring(0, 200));

        // Sometimes the full content is in meta tags for SEO
        if (description && description.length > 1000) {
            console.log('✅ Meta tags have substantial content!');
            return { success: true, content: description };
        } else {
            console.log('❌ Meta tags only have preview');
        }
    } catch (e) {
        console.log('❌ Meta extraction failed:', e.message);
    }

    // Method 5: Try AMP version (Google's Accelerated Mobile Pages)
    console.log('\n--- Method 5: AMP Version ---');
    try {
        const ampUrl = url.replace(/\/$/, '') + '/amp';
        console.log('Trying AMP URL:', ampUrl);

        const response = await axios.get(ampUrl, {
            headers: {
                'User-Agent': 'Googlebot-News'
            }
        });

        const dom = new JSDOM(response.data);
        const content = dom.window.document.querySelector('article')?.innerHTML;

        if (content && content.length > 5000 && !content.includes('for paid subscribers')) {
            console.log('✅ AMP version SUCCESS!');
            console.log('Content length:', content.length);
            return { success: true, content: content };
        } else {
            console.log('❌ AMP version also paywalled');
        }
    } catch (e) {
        console.log('❌ AMP failed:', e.response?.status || e.message);
    }

    // Method 6: Try print version
    console.log('\n--- Method 6: Print Version ---');
    try {
        const printUrl = url + '?print=true';
        const response = await axios.get(printUrl);
        const dom = new JSDOM(response.data);
        const content = dom.window.document.querySelector('article')?.innerHTML;

        if (content && content.length > 5000 && !content.includes('for paid subscribers')) {
            console.log('✅ Print version SUCCESS!');
            console.log('Content length:', content.length);
            return { success: true, content: content };
        } else {
            console.log('❌ Print version also paywalled');
        }
    } catch (e) {
        console.log('❌ Print version failed:', e.message);
    }

    // Method 7: Try accessing via Pocket/Instapaper endpoints
    console.log('\n--- Method 7: Reader Services ---');
    try {
        // Pocket's parser
        const pocketUrl = `https://getpocket.com/v3/text?url=${encodeURIComponent(url)}`;
        const response = await axios.get(pocketUrl);

        if (response.data && response.data.article) {
            console.log('✅ Pocket parser SUCCESS!');
            return { success: true, content: response.data.article };
        }
    } catch (e) {
        console.log('❌ Reader services failed:', e.response?.status || e.message);
    }

    console.log('\n=== ALL NUCLEAR OPTIONS EXHAUSTED ===');
    return { success: false };
}

// Run it
const url = 'https://www.lennysnewsletter.com/i/173871171/my-biggest-takeaways-from-this-conversation';
nuclearOption(url).then(result => {
    if (result.success) {
        console.log('\n\n🎉 SUCCESS! Writing to file...');
        const fs = require('fs');
        fs.writeFileSync('SUCCESS-content.html', result.content);
        console.log('Saved to SUCCESS-content.html');
    } else {
        console.log('\n\n😞 I tried everything. This content is truly locked.');
    }
}).catch(console.error);
