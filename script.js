async function loadArticle() {
    const urlInput = document.getElementById('urlInput');
    const reader = document.getElementById('reader');
    const loadBtn = document.getElementById('loadBtn');
    const url = urlInput.value.trim();

    // Validate URL
    if (!url) {
        showError('Please enter a URL', 'validation');
        return;
    }

    try {
        new URL(url);
    } catch (e) {
        showError('Please enter a valid URL (e.g., https://example.com/article)', 'validation');
        return;
    }

    // Show loading state
    loadBtn.disabled = true;
    loadBtn.textContent = 'Loading...';
    reader.innerHTML = '<div class="loading">Fetching article...</div>';

    try {
        const forceAdvanced = document.getElementById('forceAdvanced').checked;
        let data;

        // If advanced mode is forced, skip basic fetch
        if (forceAdvanced) {
            reader.innerHTML = '<div class="loading">Using advanced mode (paywall bypass)...</div>';
            data = await tryAdvancedFetch(url);
        } else {
            // Try basic fetch first (faster)
            data = await tryBasicFetch(url);

            // If basic fetch failed or detected paywall, try advanced method
            if ((!data.success || data.hasPaywall) && !data.advancedAttempted) {
                reader.innerHTML = '<div class="loading">Trying advanced method to bypass restrictions...</div>';
                const advancedData = await tryAdvancedFetch(url);

                if (advancedData.success) {
                    data = advancedData;
                }
            }
        }

        if (!data.success) {
            handleFetchError(data);
            return;
        }

        // Check for paywall in final result
        if (data.hasPaywall && data.method !== 'puppeteer') {
            showWarning('This article may be behind a paywall. Trying advanced method...');
            const advancedData = await tryAdvancedFetch(url);
            if (advancedData.success) {
                data = advancedData;
            }
        }

        // Show warning if content is truncated
        if (data.warning || data.isTruncated) {
            showWarning(data.warning || 'This article may be truncated due to a server-side paywall. Only publicly available content is shown.');
        }

        // Display title and byline if available
        if (data.title) {
            const titleHtml = `
                <div style="margin-bottom: 20px;">
                    <h1 style="font-size: 32px; margin-bottom: 10px;">${data.title}</h1>
                    ${data.byline ? `<p style="color: #666; font-style: italic;">${data.byline}</p>` : ''}
                </div>
            `;
            reader.innerHTML = titleHtml;
        }

        const html = data.content;

        // If we got readable content from Readability, display directly
        if (data.readableContent) {
            displayCleanArticle(html, data.url || url, data.method);
        } else {
            // Parse and extract with custom logic
            displayArticle(html, data.url || url, data.method);
        }

    } catch (error) {
        // Handle network errors (server not running, etc.)
        if (error.message.includes('Failed to fetch') || error.message.includes('NetworkError')) {
            showError(
                'Cannot connect to the server. Make sure you have run <code>npm install</code> and <code>npm start</code>',
                'server'
            );
        } else {
            showError(`Unexpected error: ${error.message}`, 'unknown');
        }
    } finally {
        loadBtn.disabled = false;
        loadBtn.textContent = 'Load Article';
    }
}

async function tryBasicFetch(url) {
    const proxyUrl = `http://localhost:3000/fetch-article?url=${encodeURIComponent(url)}`;
    const response = await fetch(proxyUrl);
    const data = await response.json();
    data.advancedAttempted = false;
    return data;
}

async function tryAdvancedFetch(url) {
    const proxyUrl = `http://localhost:3000/fetch-article-advanced?url=${encodeURIComponent(url)}`;
    const response = await fetch(proxyUrl);
    const data = await response.json();
    data.advancedAttempted = true;
    return data;
}

function displayCleanArticle(html, url, method) {
    const reader = document.getElementById('reader');

    // If method was puppeteer, show badge
    if (method === 'puppeteer') {
        const badge = document.createElement('div');
        badge.className = 'method-badge';
        badge.innerHTML = '✓ Advanced extraction used (paywall bypass attempted)';
        reader.insertBefore(badge, reader.firstChild);
    }

    // Append the clean content
    const contentDiv = document.createElement('div');
    contentDiv.className = 'article-content';
    contentDiv.innerHTML = html;
    reader.appendChild(contentDiv);

    // Make all links open in new tab
    reader.querySelectorAll('a').forEach(link => {
        link.setAttribute('target', '_blank');
        link.setAttribute('rel', 'noopener noreferrer');
    });

    // Lazy load images
    reader.querySelectorAll('img').forEach(img => {
        img.setAttribute('loading', 'lazy');
    });
}

function handleFetchError(data) {
    const reader = document.getElementById('reader');
    const errorType = data.errorType || 'unknown';
    const statusCode = data.statusCode;

    let errorHTML = '<div class="error"><h3>Unable to Load Article</h3>';

    switch (errorType) {
        case 'dns':
            errorHTML += `
                <p><strong>Website not found</strong></p>
                <p>Please check:</p>
                <ul>
                    <li>Is the URL spelled correctly?</li>
                    <li>Does the website exist?</li>
                    <li>Is your internet connection working?</li>
                </ul>
            `;
            break;

        case 'timeout':
            errorHTML += `
                <p><strong>Request timed out</strong></p>
                <p>The website took too long to respond. Try:</p>
                <ul>
                    <li>Refreshing the page</li>
                    <li>Checking if the website is down</li>
                    <li>Trying again in a few minutes</li>
                </ul>
            `;
            break;

        case 'connection':
            errorHTML += `
                <p><strong>Connection refused</strong></p>
                <p>The website refused the connection. This might be due to:</p>
                <ul>
                    <li>Website maintenance</li>
                    <li>Firewall or security restrictions</li>
                    <li>The website blocking automated access</li>
                </ul>
            `;
            break;

        default:
            if (statusCode === 403) {
                errorHTML += `
                    <p><strong>Access Forbidden (403)</strong></p>
                    <p>The website is blocking automated access. Try:</p>
                    <ul>
                        <li>Opening the URL directly in your browser</li>
                        <li>Checking if the article requires login</li>
                        <li>This site may use anti-bot protection</li>
                    </ul>
                `;
            } else if (statusCode === 404) {
                errorHTML += `
                    <p><strong>Article Not Found (404)</strong></p>
                    <p>The article doesn't exist at this URL. Check:</p>
                    <ul>
                        <li>The URL is correct and complete</li>
                        <li>The article hasn't been moved or deleted</li>
                    </ul>
                `;
            } else if (statusCode === 429) {
                errorHTML += `
                    <p><strong>Too Many Requests (429)</strong></p>
                    <p>You've made too many requests to this website. Please:</p>
                    <ul>
                        <li>Wait a few minutes before trying again</li>
                        <li>The website has rate limiting in place</li>
                    </ul>
                `;
            } else {
                errorHTML += `
                    <p><strong>${data.error}</strong></p>
                    <p>Details: ${data.details || 'Unknown error'}</p>
                `;
            }
    }

    errorHTML += '</div>';
    reader.innerHTML = errorHTML;
}

function showError(message, type) {
    const reader = document.getElementById('reader');
    reader.innerHTML = `
        <div class="error">
            <h3>Error</h3>
            <p>${message}</p>
        </div>
    `;
}

function showWarning(message) {
    const reader = document.getElementById('reader');
    const warning = document.createElement('div');
    warning.className = 'warning';
    warning.innerHTML = `<p><strong>⚠️ Warning:</strong> ${message}</p>`;
    reader.insertBefore(warning, reader.firstChild);
}

function displayArticle(html, url) {
    const reader = document.getElementById('reader');
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');

    // Platform-specific selectors for better content extraction
    const platformSelectors = {
        // Medium
        'medium.com': ['article', 'section[data-field="body"]', '.postArticle-content'],
        // Substack
        'substack.com': ['.post-content', '.body', 'article', '.available-content'],
        // Common blog platforms
        'wordpress': ['.entry-content', '.post-content', '.article-content'],
        // News sites
        'news': ['article', '.article-body', '.story-body', '[itemprop="articleBody"]'],
        // Generic
        'generic': ['article', '[role="main"]', 'main', '.content', '#content']
    };

    // Detect platform
    let selectors = platformSelectors.generic;
    if (url.includes('medium.com')) {
        selectors = platformSelectors['medium.com'];
    } else if (url.includes('substack.com')) {
        selectors = platformSelectors['substack.com'];
    } else {
        // Try all selectors for unknown platforms
        selectors = [
            ...platformSelectors.news,
            ...platformSelectors.wordpress,
            ...platformSelectors.generic
        ];
    }

    // Try to extract the main content
    let content = null;
    for (const selector of selectors) {
        content = doc.querySelector(selector);
        if (content && content.textContent.trim().length > 200) {
            // Only accept if content is substantial
            break;
        }
        content = null;
    }

    // Fallback: find the element with most text content
    if (!content) {
        const candidates = doc.querySelectorAll('div, section, article');
        let maxLength = 0;

        candidates.forEach(el => {
            const textLength = el.textContent.trim().length;
            if (textLength > maxLength && textLength > 200) {
                maxLength = textLength;
                content = el;
            }
        });
    }

    // Last resort fallback to body
    if (!content) {
        content = doc.body;
    }

    // Clone content to avoid modifying original
    content = content.cloneNode(true);

    // Clean up unwanted elements
    const unwantedSelectors = [
        'script', 'style', 'nav', 'header', 'footer', 'aside',
        '.ad', '.ads', '.advertisement', '.social-share',
        '.comments', '.related-posts', '.sidebar',
        '[class*="subscribe"]', '[class*="newsletter"]',
        '[class*="popup"]', '[class*="modal"]',
        'iframe[src*="facebook"]', 'iframe[src*="twitter"]',
        '.paywall', '.premium-notice'
    ];

    unwantedSelectors.forEach(selector => {
        content.querySelectorAll(selector).forEach(el => el.remove());
    });

    // Clean up empty elements
    content.querySelectorAll('div, span, p').forEach(el => {
        if (!el.textContent.trim() && !el.querySelector('img, video, iframe')) {
            el.remove();
        }
    });

    // Fix relative URLs in images
    content.querySelectorAll('img[src]').forEach(img => {
        try {
            const absoluteUrl = new URL(img.getAttribute('src'), url);
            img.setAttribute('src', absoluteUrl.href);
        } catch (e) {
            // Invalid URL, remove the image
            img.remove();
        }
    });

    // Fix relative URLs in links
    content.querySelectorAll('a[href]').forEach(link => {
        try {
            const absoluteUrl = new URL(link.getAttribute('href'), url);
            link.setAttribute('href', absoluteUrl.href);
        } catch (e) {
            // Keep original if conversion fails
        }
    });

    // Check if content is too short (might indicate failed extraction)
    const textContent = content.textContent.trim();
    if (textContent.length < 200) {
        reader.innerHTML = `
            <div class="error">
                <h3>Content Extraction Failed</h3>
                <p>Unable to extract meaningful content from this page. This might be because:</p>
                <ul>
                    <li>The article requires JavaScript to load</li>
                    <li>The content is behind a paywall</li>
                    <li>The page structure is not recognized</li>
                </ul>
                <p>Try opening the article directly: <a href="${url}" target="_blank" rel="noopener">${url}</a></p>
            </div>
        `;
        return;
    }

    // Display the content
    reader.innerHTML = `<div class="article-content">${content.innerHTML}</div>`;

    // Make all links open in new tab
    reader.querySelectorAll('a').forEach(link => {
        link.setAttribute('target', '_blank');
        link.setAttribute('rel', 'noopener noreferrer');
    });

    // Lazy load images for better performance
    reader.querySelectorAll('img').forEach(img => {
        img.setAttribute('loading', 'lazy');
    });
}

// Allow loading article with Enter key
document.getElementById('urlInput').addEventListener('keypress', function(e) {
    if (e.key === 'Enter') {
        loadArticle();
    }
});
