# Paywall Bypass Implementation

## Overview

This application implements multiple strategies to bypass article paywalls and access restricted content.

## Bypass Techniques

### 1. **Overlay Removal**
Removes common paywall UI elements:
- Modal dialogs
- Subscription prompts
- Sign-in overlays
- Member-only banners

```javascript
// Removes elements containing paywall keywords
const overlaySelectors = [
    '[class*="paywall"]', '[id*="paywall"]',
    '[class*="overlay"]', '[class*="modal"]',
    '[class*="subscription"]'
];
```

### 2. **Scroll Re-enablement**
Many paywalls disable scrolling to force sign-ups:
```javascript
document.body.style.overflow = 'auto';
document.documentElement.style.overflow = 'auto';
```

### 3. **Blur Effect Removal**
Removes CSS blur filters that hide content:
```javascript
document.querySelectorAll('[style*="blur"]').forEach(el => {
    el.style.filter = 'none';
});
```

### 4. **JavaScript Execution**
Uses Puppeteer to render JavaScript-heavy pages that hide content behind paywalls.

### 5. **Reader Mode Extraction**
Mozilla Readability extracts clean text even when visual paywall elements are present.

### 6. **Ad & Tracker Blocking**
Blocks analytics and tracking scripts that enable paywall enforcement:
```javascript
const blockedDomains = [
    'doubleclick.net',
    'google-analytics.com',
    'googletagmanager.com'
];
```

## Types of Paywalls

### ✅ **Soft Paywalls (Successfully Bypassed)**

1. **CSS-based Paywalls**
   - Content exists in HTML but is hidden with CSS
   - Example: Medium's member-only blur
   - **Bypass**: Remove CSS classes, inline styles

2. **JavaScript Paywalls**
   - Content loaded but hidden via JavaScript
   - Example: Local news sites
   - **Bypass**: Puppeteer + element removal

3. **Overlay Paywalls**
   - Full content visible but covered by modal
   - Example: Forbes, some blogs
   - **Bypass**: Remove overlay elements, re-enable scroll

4. **Metered Paywalls (Partial)**
   - Limited free articles per month
   - Example: Some Medium articles
   - **Bypass**: Clean cookies, render with Puppeteer

### ⚠️ **Hard Paywalls (Cannot Bypass)**

1. **Server-side Paywalls (Truncation)**
   - Content never sent to browser
   - Example: Substack paid posts, New York Times, Wall Street Journal
   - **Status**: Cannot bypass - only preview/free portion is available
   - **Explanation**: The server literally doesn't send the full article. No amount of JavaScript or DOM manipulation can reveal content that was never transmitted.

2. **Login-required Content**
   - Requires authentication
   - Example: Exclusive subscriber content
   - **Status**: Cannot bypass

3. **Anti-bot Protection**
   - Cloudflare, reCAPTCHA
   - Example: Protected news sites
   - **Status**: May fail or require manual intervention

## Detection Strategy

The app detects paywalls by searching for keywords:
```javascript
const paywallIndicators = [
    'paywall',
    'subscriber-only',
    'members-only',
    'premium-content',
    'subscription required',
    'subscribe to read',
    'register to continue',
    'sign in to read',
    'become a member'
];
```

## Automatic Fallback Flow

```
User enters URL
    ↓
Basic Fetch (Axios)
    ↓
Paywall Detected? → YES → Advanced Fetch (Puppeteer)
    ↓                            ↓
   NO                    Remove overlays
    ↓                    Re-enable scroll
Display Content         Remove blur effects
                              ↓
                        Extract with Readability
                              ↓
                        Display Content
```

## Success Rates (Updated 2025)

- **Medium**: ~10% success - Medium removed `articleBody` from JSON-LD for paywalled articles (as of 2024)
- **Substack**: ~20% success - most use server-side truncation (hard paywall)
- **Local News**: ~85% success on soft paywalls
- **Major Publishers (NYT, WSJ)**: ~10% (only works on soft meter, most content truncated)
- **Forbes/Inc**: ~90% success on overlay-based paywalls

## Important Limitation: Server-Side Truncation

**Many modern paywalls (including Substack) truncate content on the server before sending it to your browser.**

When you see a Substack article that says "Subscribe to continue reading", the full article content **was never sent** to your browser. The server only transmitted the preview portion. This means:

- ❌ No JavaScript bypass will work
- ❌ No DOM manipulation will reveal the content
- ❌ No cookie clearing will help
- ❌ The content literally doesn't exist in the page source

**What works:**
- ✅ You'll get all publicly available content cleaned up
- ✅ Overlays and prompts are removed
- ✅ The app will warn you when truncation is detected

**The only way to access server-truncated content:**
- Pay for a subscription (support the creators!)
- Some newsletters offer free trials
- Check if the author cross-posted to other platforms

## Manual Override

Users can force advanced mode:
```html
<input type="checkbox" id="forceAdvanced">
Force advanced mode (slower, bypasses paywalls)
```

This skips basic fetch and goes directly to Puppeteer with all bypass techniques.

## Ethical Considerations

**This tool is for personal reading only.**

- Bypassing paywalls may violate Terms of Service
- Consider supporting quality journalism with subscriptions
- Use responsibly and respect content creators
- Some paywalls exist to fund journalism

## Legal Disclaimer

This software is provided for educational purposes. Users are responsible for complying with website terms of service and applicable laws. The developers do not endorse or encourage violating any terms of service or copyright laws.
