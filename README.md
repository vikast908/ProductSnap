# Everything Product - PM Content Aggregator

A modern, glass-designed RSS feed aggregator specifically curated for Product Management content. Aggregates articles from 79+ PM sources across 11 categories with a beautiful, responsive interface.

## ✨ Features

### 📰 **Content Aggregation**
- **79+ RSS Feeds** from top PM sources (Mind the Product, Product Coalition, Lenny's Newsletter, etc.)
- **11 Categories**: Product Strategy, AI/ML, Design, Analytics, Leadership, Growth, Career, Engineering, Case Studies, Frameworks, and General
- **Automatic Updates** every 2 hours via cron jobs
- **Full-text extraction** using Mozilla Readability for clean article previews

### 🎨 **Modern Glass Design**
- Glassmorphism/frosted glass aesthetic with RED color palette
- Backdrop blur effects throughout the interface
- Smooth transitions and hover animations
- Fully responsive design for mobile and desktop

### 🔍 **Powerful Filtering**
- **Multi-select Category Filter** - Filter by multiple categories simultaneously
- **Multi-select Time Filter** - Last week, month, 3 months, 6 months, year, or custom date range
- **Multi-select Provider Filter** - Filter by specific content sources
- **Real-time Search** - Debounced search across titles and content
- **Smart Sorting** - Always sorted newest to oldest

### 📱 **User Experience**
- **Two View Modes**: Tiles and List views
- **Instant Preview Pane** - Hover over articles to see content preview
- **Collapsible Sidebar** - Toggle filters to maximize content space
- **Pagination** - Smooth navigation through large article collections
- **Keyboard Shortcuts** - Hover to preview articles instantly

## 🚀 Quick Start

### Installation

1. **Clone the repository**
```bash
git clone <your-repo-url>
cd DemoRead
```

2. **Install dependencies**
```bash
npm install
```

3. **Set up the database**
```bash
npm run setup
```

4. **Start the aggregator** (collects articles)
```bash
npm run aggregator
```

5. **In a separate terminal, start the web server**
```bash
npm start
```

6. **Open in browser**
```
http://localhost:3000
```

## 📦 Tech Stack

### Backend
- **Node.js** with Express
- **RSS Parser** for feed aggregation
- **LowDB** (JSON-based database)
- **Mozilla Readability + JSDOM** for content extraction
- **Node-Cron** for scheduled updates
- **Cheerio** for HTML parsing
- **Puppeteer** for JavaScript-heavy sites

### Frontend
- **Vanilla JavaScript** (ES6+)
- **HTML5** with semantic markup
- **CSS3** with glassmorphism design
- **Custom Properties** for theming
- **Backdrop-filter** for glass effects

## 🗂️ Project Structure

```
DemoRead/
├── aggregator-server.js      # Main backend with RSS aggregation
├── database-setup.js          # Database initialization script
├── package.json              # Dependencies and scripts
├── content-aggregator.json   # LowDB database file
├── public/
│   └── index.html           # Frontend application (all-in-one)
└── node_modules/            # Dependencies
```

## 📊 Data Sources

### Categories & Sources (79+ feeds)

**Product Strategy** (11 feeds)
- Mind the Product, Product Coalition, Lenny's Newsletter, Silicon Valley Product Group, etc.

**AI & ML in Product** (7 feeds)
- Google AI Blog, OpenAI Blog, Towards Data Science, etc.

**Product Design** (8 feeds)
- Nielsen Norman Group, UX Collective, Smashing Magazine, etc.

**Analytics & Data** (6 feeds)
- Amplitude Blog, Mixpanel Blog, Mode Analytics, etc.

**Leadership** (8 feeds)
- First Round Review, a16z, Harvard Business Review, etc.

**Growth & Marketing** (7 feeds)
- Reforge Blog, GrowthHackers, Product-Led Alliance, etc.

**Career & Learning** (6 feeds)
- Product School, ProductPlan, The Product Manager, etc.

**Engineering & Technical** (8 feeds)
- Martin Fowler, GitHub Blog, Stack Overflow Blog, etc.

**Case Studies** (6 feeds)
- Intercom Blog, Atlassian Blog, Stripe Blog, etc.

**Frameworks & Tools** (6 feeds)
- Aha! Blog, ProductPlan Blog, Roadmunk Blog, etc.

**General Product Management** (6 feeds)
- Product Hunt Blog, Product Manager HQ, The Product Folks, etc.

## 🎨 Design System

### Glass Design Tokens
```css
--glass-bg: hsl(0 0% 100% / 0.6);
--glass-border: hsl(0 0% 100% / 0.2);
--glass-sidebar: hsl(0 0% 100% / 0.4);
--shadow-glass: 0 8px 32px 0 hsl(0 85% 60% / 0.1);
--primary: hsl(0 85% 60%);  /* Vibrant Red */
```

### Key Visual Features
- 10-20px backdrop blur for glass effect
- Red gradient accents (0° to 340° hue)
- Smooth cubic-bezier transitions
- Hover states with transform and shadow changes

## 🔧 Configuration

### Update Frequency
Edit the cron schedule in `aggregator-server.js`:
```javascript
cron.schedule('0 */2 * * *', () => {  // Every 2 hours
    fetchAllFeeds();
});
```

### Add New RSS Feeds
Edit the `feeds` array in `aggregator-server.js`:
```javascript
{
    name: 'Source Name',
    url: 'https://example.com/rss',
    category: 'Category Name'
}
```

## 📝 NPM Scripts

```bash
npm start              # Start web server (port 3000)
npm run aggregator     # Run RSS aggregator with scheduled updates
npm run setup         # Initialize database structure
```

## 🌟 Features in Detail

### Smart Preview System
- Instant hover preview next to articles
- Full-text extraction with Readability API
- Code block syntax highlighting
- Automatic content truncation for performance
- Closes immediately when cursor leaves

### Multi-Select Filters
- Hold Ctrl/Cmd to select multiple options
- Combine filters across categories, time, and providers
- Real-time filtering without page reload
- Visual feedback for selected options

### Custom Date Range
- Select from last 3 years of content
- Date pickers with min/max validation
- Apply button for custom range filtering

## 🤝 Contributing

This is a personal project for aggregating Product Management content. Feel free to fork and customize for your own needs!

## 📄 License

MIT

---

**Built for Product Managers who want to stay updated with the latest PM content across the web.**
