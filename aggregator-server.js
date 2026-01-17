// Load environment variables first
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const RSSParser = require('rss-parser');
const low = require('lowdb');
const FileSync = require('lowdb/adapters/FileSync');
const cron = require('node-cron');
const path = require('path');
const fs = require('fs');
const axios = require('axios');
const { JSDOM } = require('jsdom');
const { Readability } = require('@mozilla/readability');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const session = require('express-session');
const passport = require('passport');

// Import routes
const createAuthRoutes = require('./routes/auth');
const createSettingsRoutes = require('./routes/settings');
const createChatRoutes = require('./routes/chat');
const createAdminRoutes = require('./routes/admin');

// Import middleware
const { authenticateToken } = require('./middleware/auth');
const { requireAdmin } = require('./middleware/rbac');

const app = express();
const parser = new RSSParser({
  timeout: 15000,
  maxRedirects: 5,
  headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    'Accept': 'application/rss+xml, application/xml, text/xml, */*'
  },
  customFields: {
    item: ['media:content', 'media:thumbnail', 'enclosure']
  }
});

// Database setup
const dbPath = path.join(__dirname, 'content-aggregator.json');
const adapter = new FileSync(dbPath);
const db = low(adapter);

// Podcast transcripts directory
const PODCAST_DIR = path.join(__dirname, "Lenny's Podcast Transcripts Archive [public]");

// Category hierarchy for sidebar grouping
const CATEGORY_HIERARCHY = {
  'Design & UX': {
    description: 'Product Design, UX Research & Accessibility',
    children: ['Product Design', 'UX Research', 'Product Accessibility'],
    icon: 'palette'
  },
  'Product Analytics': {
    description: 'Analytics, Data & Experimentation',
    children: ['Product Analytics', 'Product Experimentation'],
    icon: 'chart'
  },
  'Product Strategy': {
    description: 'Strategy, Positioning & Leadership',
    children: ['Product Strategy', 'Product Positioning', 'Product Leadership'],
    icon: 'strategy'
  },
  'Growth & Marketing': {
    description: 'Product Growth & Marketing',
    children: ['Product Growth', 'Product Marketing', 'Product-Led Growth'],
    icon: 'growth'
  },
  'Engineering & DevOps': {
    description: 'Product Engineering & Developer Tools',
    children: ['Product Engineering', 'Developer Tools', 'DevOps Product', 'API Product'],
    icon: 'code'
  },
  'Product Launch': {
    description: 'Launches, Discovery & Innovation',
    children: ['Product Launch', 'Product Discovery', 'Product Innovation'],
    icon: 'rocket'
  },
  'Operations & Success': {
    description: 'Product Ops, Customer Success & Support',
    children: ['Product Operations', 'Customer Success', 'Customer Support', 'Product Collaboration'],
    icon: 'settings'
  }
};

// In-memory cache for better performance
const cache = {
  articles: null,
  categories: null,
  feeds: null,
  transcripts: null,
  stats: null,
  lastUpdate: null,
  TTL: 60000 // 1 minute cache TTL
};

// Helper function to invalidate cache
function invalidateCache() {
  cache.articles = null;
  cache.categories = null;
  cache.feeds = null;
  cache.stats = null;
  cache.lastUpdate = Date.now();
}

// Helper function for concurrent processing with limit (reduced for OneDrive compatibility)
async function processWithConcurrency(items, processor, concurrencyLimit = 3) {
  const results = [];
  const executing = new Set();

  for (const item of items) {
    const promise = processor(item).then(result => {
      executing.delete(promise);
      return result;
    });
    executing.add(promise);
    results.push(promise);

    if (executing.size >= concurrencyLimit) {
      await Promise.race(executing);
    }
  }

  return Promise.all(results);
}

// Safe database write with retry logic for OneDrive file locking
function safeDbWrite(operation, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      operation.write();
      return true;
    } catch (err) {
      if (attempt === maxRetries) {
        console.error(`Database write failed after ${maxRetries} attempts:`, err.message);
        return false;
      }
      // Wait before retry (exponential backoff)
      const delay = attempt * 200;
      const start = Date.now();
      while (Date.now() - start < delay) {
        // Busy wait (sync)
      }
    }
  }
  return false;
}

// Rate limiters
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20, // Limit each IP to 20 requests per windowMs for auth endpoints
  message: { error: 'Too many authentication attempts, please try again later' }
});

const chatLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 30, // Limit each IP to 30 requests per minute for chat
  message: { error: 'Too many chat requests, please slow down' }
});

const generalLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 100, // Limit each IP to 100 requests per minute
  message: { error: 'Too many requests, please slow down' }
});

// Security middleware
app.use(helmet({
  contentSecurityPolicy: false, // Disable for development, enable in production
  crossOriginEmbedderPolicy: false
}));

// Middleware
app.use(cors({
  origin: process.env.NODE_ENV === 'production'
    ? process.env.FRONTEND_URL
    : ['http://localhost:5173', 'http://localhost:3000'],
  credentials: true
}));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'client', 'dist')));

// Session middleware for Passport
app.use(session({
  secret: process.env.SESSION_SECRET || 'your-session-secret',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
  }
}));

// Initialize Passport
app.use(passport.initialize());
app.use(passport.session());

// Comprehensive Product Management RSS Feeds
const PM_FEEDS = [
  // ===== CORE PM PUBLICATIONS & COMMUNITIES =====
  {
    name: 'Mind the Product',
    url: 'https://www.mindtheproduct.com/feed/',
    category: 'Product Management',
    description: 'Leading PM community'
  },
  {
    name: 'Product Coalition',
    url: 'https://productcoalition.com/feed',
    category: 'Product Management',
    description: 'PM insights on Medium'
  },
  {
    name: 'Product School Blog',
    url: 'https://productschool.com/blog/feed/',
    category: 'Product Management',
    description: 'PM education platform'
  },
  {
    name: 'Silicon Valley Product Group',
    url: 'https://www.svpg.com/feed/',
    category: 'Product Management',
    description: 'Marty Cagan\'s SVPG'
  },
  {
    name: 'Product Talk',
    url: 'https://www.producttalk.org/feed/',
    category: 'Product Management',
    description: 'Teresa Torres on product discovery'
  },
  {
    name: 'Roman Pichler Blog',
    url: 'https://www.romanpichler.com/feed/',
    category: 'Product Management',
    description: 'Product ownership & agile'
  },
  {
    name: 'Lenny\'s Newsletter',
    url: 'https://www.lennysnewsletter.com/feed',
    category: 'Product Management',
    description: 'Lenny Rachitsky\'s PM insights'
  },
  {
    name: 'The Product Manager',
    url: 'https://medium.com/feed/the-product-manager',
    category: 'Product Management',
    description: 'PM publication on Medium'
  },
  {
    name: 'Department of Product',
    url: 'https://www.departmentofproduct.com/blog?format=rss',
    category: 'Product Management',
    description: 'PM training and insights'
  },
  {
    name: 'Product Management Insider',
    url: 'https://medium.com/feed/pminsider',
    category: 'Product Management',
    description: 'PM best practices'
  },

  // ===== PM THOUGHT LEADERS & PERSONAL BLOGS =====
  {
    name: 'Ken Norton (Google PM)',
    url: 'https://www.bringthedonuts.com/essays/rss/',
    category: 'Product Management',
    description: 'Former Google GV Partner'
  },
  {
    name: 'Melissa Perri',
    url: 'https://melissaperri.com/feed',
    category: 'Product Management',
    description: 'Product Institute founder'
  },
  {
    name: 'John Cutler',
    url: 'https://cutlefish.substack.com/feed',
    category: 'Product Management',
    description: 'Product evangelist insights'
  },
  {
    name: 'Gibson Biddle',
    url: 'https://gibsonbiddle.medium.com/feed',
    category: 'Product Strategy',
    description: 'Former Netflix VP Product'
  },
  {
    name: 'Julie Zhuo',
    url: 'https://medium.com/feed/@joulee',
    category: 'Product Leadership',
    description: 'Former Facebook VP Design'
  },
  {
    name: 'Des Traynor (Intercom)',
    url: 'https://destraynor.medium.com/feed',
    category: 'Product Management',
    description: 'Intercom co-founder'
  },
  {
    name: 'Jason Cohen',
    url: 'https://longform.asmartbear.com/feed/',
    category: 'Product Strategy',
    description: 'WP Engine founder'
  },
  {
    name: 'April Dunford',
    url: 'https://aprildunford.com/feed/',
    category: 'Product Positioning',
    description: 'Positioning expert'
  },

  // ===== TECH COMPANY PM BLOGS =====
  {
    name: 'Intercom Blog',
    url: 'https://www.intercom.com/blog/feed/',
    category: 'Product Management',
    description: 'Customer communication platform'
  },
  {
    name: 'Spotify Engineering',
    url: 'https://engineering.atspotify.com/feed/',
    category: 'Product Engineering',
    description: 'Spotify tech & product'
  },
  {
    name: 'Netflix Tech Blog',
    url: 'https://netflixtechblog.com/feed',
    category: 'Product Engineering',
    description: 'Netflix innovation'
  },
  {
    name: 'Slack Engineering',
    url: 'https://slack.engineering/feed/',
    category: 'Product Engineering',
    description: 'Slack product & tech'
  },
  {
    name: 'Airbnb Design',
    url: 'https://airbnb.design/feed/',
    category: 'Product Design',
    description: 'Airbnb design thinking'
  },
  {
    name: 'Dropbox Design',
    url: 'https://dropbox.design/feed',
    category: 'Product Design',
    description: 'Dropbox design insights'
  },
  {
    name: 'Asana Blog',
    url: 'https://blog.asana.com/feed/',
    category: 'Product Management',
    description: 'Work management insights'
  },
  {
    name: 'Atlassian Blog',
    url: 'https://www.atlassian.com/blog/feed',
    category: 'Product Management',
    description: 'Team collaboration tools'
  },
  {
    name: 'Notion Blog',
    url: 'https://www.notion.so/blog/feed',
    category: 'Product Management',
    description: 'Workspace innovation'
  },
  {
    name: 'Figma Blog',
    url: 'https://www.figma.com/blog/feed/',
    category: 'Product Design',
    description: 'Design tool insights'
  },
  {
    name: 'Linear Blog',
    url: 'https://linear.app/blog/feed',
    category: 'Product Management',
    description: 'Issue tracking for builders'
  },
  {
    name: 'Miro Blog',
    url: 'https://miro.com/blog/feed/',
    category: 'Product Collaboration',
    description: 'Visual collaboration'
  },

  // ===== DESIGN & UX =====
  {
    name: 'UX Collective',
    url: 'https://uxdesign.cc/feed',
    category: 'Product Design',
    description: 'UX design community'
  },
  {
    name: 'Nielsen Norman Group',
    url: 'https://www.nngroup.com/feed/rss/',
    category: 'UX Research',
    description: 'UX research leaders'
  },
  {
    name: 'Smashing Magazine',
    url: 'https://www.smashingmagazine.com/feed/',
    category: 'Product Design',
    description: 'Web design & development'
  },
  {
    name: 'UX Matters',
    url: 'http://www.uxmatters.com/index.xml',
    category: 'UX Research',
    description: 'UX insights & research'
  },
  {
    name: 'A List Apart',
    url: 'https://alistapart.com/main/feed/',
    category: 'Product Design',
    description: 'Web standards & design'
  },
  {
    name: 'Boxes and Arrows',
    url: 'http://boxesandarrows.com/feed/',
    category: 'Product Design',
    description: 'Design & IA community'
  },

  // ===== PRODUCT ANALYTICS & DATA =====
  {
    name: 'Amplitude Blog',
    url: 'https://amplitude.com/blog/feed',
    category: 'Product Analytics',
    description: 'Product analytics platform'
  },
  {
    name: 'Mixpanel Blog',
    url: 'https://mixpanel.com/blog/feed/',
    category: 'Product Analytics',
    description: 'User analytics insights'
  },
  {
    name: 'Segment Blog',
    url: 'https://segment.com/blog/feed/',
    category: 'Product Analytics',
    description: 'Customer data platform'
  },
  {
    name: 'Heap Blog',
    url: 'https://heap.io/blog/feed',
    category: 'Product Analytics',
    description: 'Digital analytics'
  },
  {
    name: 'PostHog Blog',
    url: 'https://posthog.com/blog/rss.xml',
    category: 'Product Analytics',
    description: 'Open-source product analytics'
  },

  // ===== GROWTH & MARKETING =====
  {
    name: 'Reforge Blog',
    url: 'https://www.reforge.com/blog/feed',
    category: 'Product Growth',
    description: 'Growth insights'
  },
  {
    name: 'Growth Hackers',
    url: 'https://growthhackers.com/feed',
    category: 'Product Growth',
    description: 'Growth community'
  },
  {
    name: 'Andrew Chen',
    url: 'https://andrewchen.com/feed/',
    category: 'Product Growth',
    description: 'a16z growth insights'
  },
  {
    name: 'Brian Balfour',
    url: 'https://brianbalfour.com/feed',
    category: 'Product Growth',
    description: 'Reforge founder'
  },
  {
    name: 'Elena Verna',
    url: 'https://elenaverna.substack.com/feed',
    category: 'Product Growth',
    description: 'Growth advisor'
  },

  // ===== BUSINESS STRATEGY & TECH =====
  {
    name: 'Stratechery',
    url: 'https://stratechery.com/feed/',
    category: 'Product Strategy',
    description: 'Ben Thompson\'s analysis'
  },
  {
    name: 'First Round Review',
    url: 'https://review.firstround.com/feed',
    category: 'Product Management',
    description: 'Startup insights'
  },
  {
    name: 'a16z',
    url: 'https://a16z.com/feed/',
    category: 'Product Strategy',
    description: 'Andreessen Horowitz'
  },
  {
    name: 'Y Combinator',
    url: 'https://www.ycombinator.com/blog/feed',
    category: 'Product Strategy',
    description: 'Startup accelerator insights'
  },
  {
    name: 'NFX',
    url: 'https://www.nfx.com/feed',
    category: 'Product Strategy',
    description: 'Network effects VC'
  },
  {
    name: 'Bessemer Cloud',
    url: 'https://www.bvp.com/atlas/feed',
    category: 'Product Strategy',
    description: 'Cloud insights'
  },

  // ===== AGGREGATORS & NEWS =====
  {
    name: 'Product Hunt Blog',
    url: 'https://blog.producthunt.com/feed',
    category: 'Product Discovery',
    description: 'New product launches'
  },
  {
    name: 'HackerNoon Product Management',
    url: 'https://hackernoon.com/tagged/product-management/feed',
    category: 'Product Management',
    description: 'Tech stories'
  },
  {
    name: 'HackerNoon Product Design',
    url: 'https://hackernoon.com/tagged/product-design/feed',
    category: 'Product Design',
    description: 'Design stories'
  },
  {
    name: 'Dev.to Product',
    url: 'https://dev.to/feed/tag/product',
    category: 'Product Management',
    description: 'Developer community'
  },
  {
    name: 'Product Manager HQ',
    url: 'https://www.productmanagerhq.com/feed/',
    category: 'Product Management',
    description: 'PM resources'
  },

  // ===== MEDIUM PUBLICATIONS =====
  {
    name: 'Towards Data Science',
    url: 'https://towardsdatascience.com/feed',
    category: 'Product Analytics',
    description: 'Data science insights'
  },
  {
    name: 'Better Programming',
    url: 'https://betterprogramming.pub/feed',
    category: 'Product Engineering',
    description: 'Engineering best practices'
  },
  {
    name: 'The Startup',
    url: 'https://medium.com/feed/swlh',
    category: 'Product Management',
    description: 'Startup insights'
  },
  {
    name: 'Product Management Insider',
    url: 'https://medium.com/feed/product-management-insider',
    category: 'Product Management',
    description: 'PM best practices'
  },
  {
    name: 'UX Planet',
    url: 'https://uxplanet.org/feed',
    category: 'Product Design',
    description: 'UX design community'
  },
  {
    name: 'Bootcamp',
    url: 'https://bootcamp.uxdesign.cc/feed',
    category: 'Product Design',
    description: 'Design bootcamp'
  },
  {
    name: 'Muzli Design',
    url: 'https://medium.muz.li/feed',
    category: 'Product Design',
    description: 'Design inspiration'
  },

  // ===== INTERNATIONAL & DIVERSE VOICES =====
  {
    name: 'Product Management Festival',
    url: 'https://productmanagementfestival.com/blog/feed/',
    category: 'Product Management',
    description: 'Global PM events'
  },
  {
    name: 'ProductPlan Blog',
    url: 'https://www.productplan.com/blog/feed/',
    category: 'Product Management',
    description: 'Roadmap software insights'
  },
  {
    name: 'Aha! Blog',
    url: 'https://www.aha.io/blog/feed',
    category: 'Product Management',
    description: 'Roadmap & strategy'
  },
  {
    name: 'Pendo Blog',
    url: 'https://www.pendo.io/blog/feed/',
    category: 'Product Management',
    description: 'Product experience platform'
  },
  {
    name: 'UserTesting Blog',
    url: 'https://www.usertesting.com/blog/feed',
    category: 'UX Research',
    description: 'User research insights'
  },
  {
    name: 'Hotjar Blog',
    url: 'https://www.hotjar.com/blog/feed/',
    category: 'UX Research',
    description: 'User behavior insights'
  },
  {
    name: 'Optimizely Blog',
    url: 'https://www.optimizely.com/insights/blog/feed/',
    category: 'Product Experimentation',
    description: 'Experimentation platform'
  },
  {
    name: 'LaunchDarkly Blog',
    url: 'https://launchdarkly.com/blog/feed/',
    category: 'Product Engineering',
    description: 'Feature management'
  },

  // ===== ACCESSIBILITY & INCLUSIVE DESIGN =====
  {
    name: 'The A11Y Project',
    url: 'https://www.a11yproject.com/feed/feed.xml',
    category: 'Product Accessibility',
    description: 'Accessibility resources'
  },
  {
    name: 'WebAIM',
    url: 'https://webaim.org/blog/feed',
    category: 'Product Accessibility',
    description: 'Web accessibility'
  },

  // ===== AI & EMERGING TECH IN PRODUCT =====
  {
    name: 'OpenAI Blog',
    url: 'https://openai.com/blog/rss/',
    category: 'Product Innovation',
    description: 'AI product insights'
  },
  {
    name: 'Google AI Blog',
    url: 'http://ai.googleblog.com/feeds/posts/default',
    category: 'Product Innovation',
    description: 'Google AI research'
  },
  {
    name: 'Microsoft Research',
    url: 'https://www.microsoft.com/en-us/research/feed/',
    category: 'Product Innovation',
    description: 'Microsoft research'
  },

  // ===== PRODUCT OPS & ENABLEMENT =====
  {
    name: 'Product-Led Alliance',
    url: 'https://www.productledalliance.com/blog-feed.xml',
    category: 'Product Operations',
    description: 'Product-led growth'
  },
  {
    name: 'ProductOps',
    url: 'https://www.productops.com/blog-feed.xml',
    category: 'Product Operations',
    description: 'Product operations'
  },

  // ===== MORE PM THOUGHT LEADERS =====
  {
    name: 'Shreyas Doshi',
    url: 'https://twitter.com/shreyas/feed',
    category: 'Product Leadership',
    description: 'Product leadership insights'
  },
  {
    name: 'Nir Eyal',
    url: 'https://www.nirandfar.com/feed/',
    category: 'Product Strategy',
    description: 'Behavioral design, author of Hooked'
  },
  {
    name: 'Dan Olsen',
    url: 'https://www.product-frameworks.com/feed',
    category: 'Product Management',
    description: 'Lean Product Playbook author'
  },
  {
    name: 'Jeff Gothelf',
    url: 'https://jeffgothelf.com/blog/feed/',
    category: 'Product Design',
    description: 'Lean UX co-author'
  },
  {
    name: 'Josh Elman',
    url: 'https://joshelman.substack.com/feed',
    category: 'Product Management',
    description: 'ex-Twitter, LinkedIn PM'
  },
  {
    name: 'Claire Suellentrop',
    url: 'https://www.clairevo.com/feed',
    category: 'Product Management',
    description: 'User onboarding expert'
  },
  {
    name: 'Sarah Tavel',
    url: 'https://sarahtavel.medium.com/feed',
    category: 'Product Strategy',
    description: 'Benchmark Capital partner'
  },
  {
    name: 'C Todd Lombardo',
    url: 'https://ctoddinlombardo.medium.com/feed',
    category: 'Product Management',
    description: 'Product Roadmaps Relaunched author'
  },
  {
    name: 'Jackie Bavaro',
    url: 'https://jackiebavaro.substack.com/feed',
    category: 'Product Management',
    description: 'Asana PM, interviewing expert'
  },
  {
    name: 'Leah Tharin',
    url: 'https://leahtharin.com/feed/',
    category: 'Product Management',
    description: 'Product leadership coach'
  },
  {
    name: 'Itamar Gilad',
    url: 'https://itamargilad.com/feed/',
    category: 'Product Management',
    description: 'Evidence-guided product management'
  },
  {
    name: 'Hope Gurion',
    url: 'https://www.hopegurion.com/feed',
    category: 'Product Operations',
    description: 'Product Ops pioneer'
  },

  // ===== INTERNATIONAL PM VOICES =====
  {
    name: 'Product Management IRL',
    url: 'https://productmanagementirl.com/feed/',
    category: 'Product Management',
    description: 'Real-world PM stories'
  },
  {
    name: 'Product Coalition Europe',
    url: 'https://productcoalition.com/tagged/europe/feed',
    category: 'Product Management',
    description: 'European PM perspectives'
  },
  {
    name: 'ProductTank',
    url: 'https://www.mindtheproduct.com/producttank/feed/',
    category: 'Product Management',
    description: 'Global PM meetup network'
  },

  // ===== B2B & ENTERPRISE PRODUCT =====
  {
    name: 'Product-Led Institute',
    url: 'https://www.productled.com/blog/feed',
    category: 'Product-Led Growth',
    description: 'PLG strategies'
  },
  {
    name: 'OpenView Partners',
    url: 'https://openviewpartners.com/blog/feed/',
    category: 'Product Strategy',
    description: 'B2B SaaS insights'
  },
  {
    name: 'SaaS Capital',
    url: 'https://www.saas-capital.com/blog-feed/',
    category: 'Product Strategy',
    description: 'SaaS metrics & strategy'
  },
  {
    name: 'ChartMogul Blog',
    url: 'https://chartmogul.com/blog/feed/',
    category: 'Product Analytics',
    description: 'SaaS analytics & metrics'
  },
  {
    name: 'ProfitWell Blog',
    url: 'https://www.profitwell.com/recur/feed',
    category: 'Product Strategy',
    description: 'Subscription metrics'
  },

  // ===== MOBILE & APP PRODUCT =====
  {
    name: 'App Annie Insights',
    url: 'https://www.data.ai/en/insights/feed/',
    category: 'Mobile Product',
    description: 'Mobile app intelligence'
  },
  {
    name: 'Mobile Growth Stack',
    url: 'https://www.mobilegrowthstack.com/feed/',
    category: 'Mobile Product',
    description: 'Mobile app growth'
  },
  {
    name: 'Appcues Blog',
    url: 'https://www.appcues.com/blog/feed',
    category: 'Product Management',
    description: 'User onboarding & adoption'
  },

  // ===== PLATFORM & API PRODUCT =====
  {
    name: 'Postman Blog',
    url: 'https://blog.postman.com/feed/',
    category: 'API Product',
    description: 'API development platform'
  },
  {
    name: 'Stripe Blog',
    url: 'https://stripe.com/blog/feed.rss',
    category: 'API Product',
    description: 'Payment platform insights'
  },
  {
    name: 'Twilio Blog',
    url: 'https://www.twilio.com/blog/feed',
    category: 'API Product',
    description: 'Communications platform'
  },

  // ===== SECURITY & PRIVACY IN PRODUCT =====
  {
    name: 'OWASP',
    url: 'https://owasp.org/www-community/feed.xml',
    category: 'Product Security',
    description: 'Web application security'
  },
  {
    name: 'IAPP Privacy Blog',
    url: 'https://iapp.org/news/feed/',
    category: 'Product Privacy',
    description: 'Privacy professionals'
  },

  // ===== DEVELOPER EXPERIENCE =====
  {
    name: 'Martin Fowler',
    url: 'https://martinfowler.com/feed.atom',
    category: 'Product Engineering',
    description: 'Software architecture'
  },
  {
    name: 'GitHub Blog',
    url: 'https://github.blog/feed/',
    category: 'Developer Tools',
    description: 'Developer platform insights'
  },
  {
    name: 'Stack Overflow Blog',
    url: 'https://stackoverflow.blog/feed/',
    category: 'Developer Community',
    description: 'Developer community insights'
  },
  {
    name: 'HashiCorp Blog',
    url: 'https://www.hashicorp.com/blog/feed.xml',
    category: 'DevOps Product',
    description: 'Infrastructure automation'
  },

  // ===== PRODUCT COMMUNITIES & AGGREGATORS =====
  {
    name: 'Product Hunt Daily',
    url: 'https://www.producthunt.com/feed',
    category: 'Product Discovery',
    description: 'Daily product launches'
  },
  {
    name: 'Indie Hackers',
    url: 'https://www.indiehackers.com/feed',
    category: 'Product Management',
    description: 'Indie product builders'
  },
  {
    name: 'Hacker News',
    url: 'https://hnrss.org/frontpage',
    category: 'Tech News',
    description: 'Tech community news'
  },
  {
    name: 'The Verge',
    url: 'https://www.theverge.com/rss/index.xml',
    category: 'Tech News',
    description: 'Technology news'
  },
  {
    name: 'TechCrunch Product',
    url: 'https://techcrunch.com/tag/product-management/feed/',
    category: 'Product News',
    description: 'Product management news'
  },
  {
    name: 'Wired Product',
    url: 'https://www.wired.com/feed/tag/product-design/latest/rss',
    category: 'Product Design',
    description: 'Product design coverage'
  },

  // ===== BEHAVIORAL SCIENCE & PSYCHOLOGY =====
  {
    name: 'BehavioralEconomics.com',
    url: 'https://www.behavioraleconomics.com/feed/',
    category: 'Behavioral Product',
    description: 'Behavioral economics'
  },
  {
    name: 'Choice Hacking',
    url: 'https://www.choice-hacking.com/feed',
    category: 'Behavioral Product',
    description: 'Behavioral science for products'
  },

  // ===== PRODUCT MARKETING =====
  {
    name: 'Product Marketing Alliance',
    url: 'https://www.productmarketingalliance.com/blog-feed.xml',
    category: 'Product Marketing',
    description: 'Product marketing insights'
  },
  {
    name: 'Drift Blog',
    url: 'https://www.drift.com/blog/feed/',
    category: 'Product Marketing',
    description: 'Conversational marketing'
  },
  {
    name: 'Wynter Blog',
    url: 'https://wynter.com/blog/feed/',
    category: 'Product Marketing',
    description: 'B2B messaging research'
  },

  // ===== CUSTOMER SUCCESS & SUPPORT =====
  {
    name: 'Gainsight Blog',
    url: 'https://www.gainsight.com/blog/feed/',
    category: 'Customer Success',
    description: 'Customer success platform'
  },
  {
    name: 'ChurnZero Blog',
    url: 'https://churnzero.net/blog/feed/',
    category: 'Customer Success',
    description: 'Customer retention'
  },
  {
    name: 'Zendesk Blog',
    url: 'https://www.zendesk.com/blog/feed/',
    category: 'Customer Support',
    description: 'Customer service insights'
  },
  {
    name: 'Intercom Support',
    url: 'https://www.intercom.com/blog/category/customer-support/feed/',
    category: 'Customer Support',
    description: 'Customer support best practices'
  },

  // ===== PRODUCT LAUNCH & DISCOVERY =====
  {
    name: 'BetaList',
    url: 'https://betalist.com/feed',
    category: 'Product Launch',
    description: 'Discover and get early access to tomorrow\'s startups'
  },
  {
    name: 'Launching Next',
    url: 'https://www.launchingnext.com/rss/',
    category: 'Product Launch',
    description: 'New startup launches and products'
  },
  {
    name: 'SaaS Hub',
    url: 'https://www.saashub.com/feed',
    category: 'Product Launch',
    description: 'SaaS software alternatives and reviews'
  },
  {
    name: 'AlternativeTo',
    url: 'https://alternativeto.net/news/feed/',
    category: 'Product Discovery',
    description: 'Software alternatives and recommendations'
  },
  {
    name: 'Startup Stash',
    url: 'https://startupstash.com/feed/',
    category: 'Product Launch',
    description: 'Curated startup resources and tools'
  },
  {
    name: 'KillerStartups',
    url: 'https://www.killerstartups.com/feed/',
    category: 'Product Launch',
    description: 'Startup reviews and launches'
  },
  {
    name: 'F6S Startups',
    url: 'https://www.f6s.com/feed',
    category: 'Product Launch',
    description: 'Startup community and funding'
  },
  {
    name: 'Crunchbase News',
    url: 'https://news.crunchbase.com/feed/',
    category: 'Product Launch',
    description: 'Startup and funding news'
  },
  {
    name: 'TechCrunch Startups',
    url: 'https://techcrunch.com/category/startups/feed/',
    category: 'Product Launch',
    description: 'Startup news and launches'
  },
  {
    name: 'VentureBeat',
    url: 'https://venturebeat.com/feed/',
    category: 'Product Launch',
    description: 'Tech and startup news'
  },
  {
    name: 'Fast Company',
    url: 'https://www.fastcompany.com/rss',
    category: 'Product Innovation',
    description: 'Business innovation and creativity'
  },
  {
    name: 'Mashable Tech',
    url: 'https://mashable.com/feeds/rss/tech',
    category: 'Product Launch',
    description: 'Tech product news and launches'
  },
  {
    name: 'The Next Web',
    url: 'https://thenextweb.com/feed/',
    category: 'Product Launch',
    description: 'Tech news and product launches'
  },
  {
    name: 'Gizmodo',
    url: 'https://gizmodo.com/rss',
    category: 'Product Launch',
    description: 'Tech and gadget news'
  },
  {
    name: 'Engadget',
    url: 'https://www.engadget.com/rss.xml',
    category: 'Product Launch',
    description: 'Tech product reviews and news'
  },
  {
    name: 'CNET News',
    url: 'https://www.cnet.com/rss/news/',
    category: 'Product Launch',
    description: 'Tech news and product reviews'
  },
  {
    name: 'Ars Technica',
    url: 'https://feeds.arstechnica.com/arstechnica/technology-lab',
    category: 'Product Launch',
    description: 'Tech news and analysis'
  },
  {
    name: 'Product School Launches',
    url: 'https://productschool.com/blog/category/product-launches/feed/',
    category: 'Product Launch',
    description: 'Product launch case studies'
  },
  {
    name: 'SaaStr',
    url: 'https://www.saastr.com/feed/',
    category: 'Product Launch',
    description: 'SaaS startup insights and strategies'
  },
  {
    name: 'CB Insights',
    url: 'https://www.cbinsights.com/research/feed/',
    category: 'Product Launch',
    description: 'Tech market intelligence and trends'
  },
  {
    name: 'AngelList Blog',
    url: 'https://www.angellist.com/blog/feed.xml',
    category: 'Product Launch',
    description: 'Startup ecosystem insights'
  },
  {
    name: 'Seedtable',
    url: 'https://www.seedtable.com/feed',
    category: 'Product Launch',
    description: 'European startup launches'
  },
  {
    name: 'EU-Startups',
    url: 'https://www.eu-startups.com/feed/',
    category: 'Product Launch',
    description: 'European startup news'
  },
  {
    name: 'Silicon Canals',
    url: 'https://siliconcanals.com/feed/',
    category: 'Product Launch',
    description: 'European tech startup news'
  },
  {
    name: 'Tech.eu',
    url: 'https://tech.eu/feed/',
    category: 'Product Launch',
    description: 'European tech news'
  },
  {
    name: 'TechInAsia',
    url: 'https://www.techinasia.com/feed',
    category: 'Product Launch',
    description: 'Asian tech startup news'
  },
  {
    name: 'e27',
    url: 'https://e27.co/feed/',
    category: 'Product Launch',
    description: 'Southeast Asian startup news'
  },
  {
    name: 'YourStory',
    url: 'https://yourstory.com/feed',
    category: 'Product Launch',
    description: 'Indian startup news'
  },
  {
    name: 'Inc42',
    url: 'https://inc42.com/feed/',
    category: 'Product Launch',
    description: 'Indian startup ecosystem'
  },
  {
    name: 'GeekWire',
    url: 'https://www.geekwire.com/feed/',
    category: 'Product Launch',
    description: 'Pacific Northwest tech news'
  },
  {
    name: 'Built In',
    url: 'https://builtin.com/feed',
    category: 'Product Launch',
    description: 'Tech hub startup news'
  },
  {
    name: 'The Information',
    url: 'https://www.theinformation.com/feed',
    category: 'Product Launch',
    description: 'In-depth tech business news'
  },
  {
    name: 'Protocol',
    url: 'https://www.protocol.com/feeds/feed.rss',
    category: 'Product Launch',
    description: 'Tech industry news'
  },
  {
    name: 'Recode',
    url: 'https://www.vox.com/recode/rss/index.xml',
    category: 'Product Launch',
    description: 'Tech and media news'
  },
  {
    name: 'Benedict Evans',
    url: 'https://www.ben-evans.com/benedictevans?format=rss',
    category: 'Product Strategy',
    description: 'Tech and mobile analysis'
  },
  {
    name: 'Both Sides of the Table',
    url: 'https://bothsidesofthetable.com/feed',
    category: 'Product Launch',
    description: 'VC perspective on startups'
  },
  {
    name: 'Fred Wilson AVC',
    url: 'https://avc.com/feed/',
    category: 'Product Launch',
    description: 'VC insights on startups'
  },
  {
    name: 'Tomasz Tunguz',
    url: 'https://tomtunguz.com/feed/',
    category: 'Product Launch',
    description: 'SaaS and startup data analysis'
  },
  {
    name: 'Version One VC',
    url: 'https://versionone.vc/feed/',
    category: 'Product Launch',
    description: 'Early-stage startup insights'
  },
  {
    name: 'Greylock Partners',
    url: 'https://greylock.com/feed/',
    category: 'Product Launch',
    description: 'VC perspectives on tech'
  },
  {
    name: 'Sequoia Capital',
    url: 'https://www.sequoiacap.com/feed/',
    category: 'Product Launch',
    description: 'Startup building insights'
  }
];

// Initialize database
function initDatabase() {
  db.defaults({
    feeds: [],
    articles: [],
    users: [],
    metadata: {
      created: new Date().toISOString(),
      lastUpdate: new Date().toISOString()
    }
  }).write();
}

// Initialize feeds in database
function initializeFeeds() {
  let addedCount = 0;

  for (const feed of PM_FEEDS) {
    const exists = db.get('feeds').find({ url: feed.url }).value();

    if (!exists) {
      db.get('feeds').push({
        id: Date.now() + Math.random(),
        name: feed.name,
        url: feed.url,
        category: feed.category,
        description: feed.description,
        active: true,
        lastFetched: null,
        fetchCount: 0,
        errorCount: 0,
        createdAt: new Date().toISOString()
      }).write();
      addedCount++;
    }
  }

  const totalFeeds = db.get('feeds').size().value();
  console.log(`✓ Initialized ${addedCount} new feeds (${totalFeeds} total)`);
}

// Fetch and parse RSS feed
async function fetchFeed(feed) {
  try {
    console.log(`Fetching: ${feed.name}...`);
    const rssFeed = await parser.parseURL(feed.url);

    safeDbWrite(
      db.get('feeds')
        .find({ id: feed.id })
        .assign({
          lastFetched: new Date().toISOString(),
          fetchCount: (feed.fetchCount || 0) + 1,
          errorCount: 0
        })
    );

    return {
      feed: feed,
      items: rssFeed.items || []
    };
  } catch (err) {
    console.error(`Error fetching ${feed.name}:`, err.message);

    safeDbWrite(
      db.get('feeds')
        .find({ id: feed.id })
        .assign({
          lastFetched: new Date().toISOString(),
          errorCount: (feed.errorCount || 0) + 1
        })
    );

    return null;
  }
}

// Save articles to database
function saveArticles(feedId, items, category, feedName) {
  let savedCount = 0;

  for (const item of items) {
    try {
      const exists = db.get('articles').find({ link: item.link }).value();
      if (exists) continue;

      const pubDate = item.pubDate || item.isoDate || new Date().toISOString();
      const content = item.content || item['content:encoded'] || item.contentSnippet || item.description || '';
      const imageUrl = item.enclosure?.url || item['media:thumbnail']?.$ ?.url || item['media:content']?.$ ?.url || null;

      const writeSuccess = safeDbWrite(
        db.get('articles').push({
          id: Date.now() + Math.random(),
          feedId: feedId,
          feedName: feedName,
          title: item.title || 'Untitled',
          link: item.link || '',
          description: item.contentSnippet || item.description || '',
          content: content,
          author: item.creator || item.author || item['dc:creator'] || null,
          category: category,
          pubDate: pubDate,
          fetchedAt: new Date().toISOString(),
          imageUrl: imageUrl
        })
      );

      if (writeSuccess) savedCount++;
    } catch (err) {
      console.error(`Error saving article: ${err.message}`);
    }
  }

  return savedCount;
}

// Fetch all active feeds with parallel processing for better performance
async function fetchAllFeeds() {
  console.log('\n=== Starting RSS Feed Fetch (Parallel Mode) ===');
  const startTime = Date.now();

  const feeds = db.get('feeds').filter({ active: true }).value();
  console.log(`Found ${feeds.length} active feeds`);

  let totalArticles = 0;
  let successCount = 0;
  let errorCount = 0;

  // Process feeds in parallel with reduced concurrency for OneDrive compatibility
  const results = await processWithConcurrency(feeds, async (feed) => {
    const result = await fetchFeed(feed);

    if (result && result.items.length > 0) {
      const saved = saveArticles(feed.id, result.items, feed.category, feed.name);
      return { feed, saved, success: true };
    } else if (result) {
      return { feed, saved: 0, success: true };
    } else {
      return { feed, saved: 0, success: false };
    }
  }, 3);

  // Process results
  for (const result of results) {
    if (result.success) {
      successCount++;
      totalArticles += result.saved;
      if (result.saved > 0) {
        console.log(`  ✓ ${result.feed.name}: ${result.saved} new articles`);
      }
    } else {
      errorCount++;
      console.log(`  ✗ ${result.feed.name}: Failed`);
    }
  }

  db.set('metadata.lastUpdate', new Date().toISOString()).write();
  invalidateCache(); // Clear cache after update

  const duration = ((Date.now() - startTime) / 1000).toFixed(2);
  console.log(`\n=== Fetch Complete ===`);
  console.log(`Duration: ${duration}s (parallel processing)`);
  console.log(`Success: ${successCount}, Errors: ${errorCount}`);
  console.log(`Total new articles: ${totalArticles}`);

  return { totalArticles, successCount, errorCount };
}

// Load and parse Lenny's Podcast transcripts
async function loadPodcastTranscripts() {
  console.log('\n=== Loading Lenny\'s Podcast Transcripts ===');

  if (!fs.existsSync(PODCAST_DIR)) {
    console.log('Podcast directory not found');
    return [];
  }

  const files = fs.readdirSync(PODCAST_DIR).filter(f => f.endsWith('.txt'));
  console.log(`Found ${files.length} transcript files`);

  const transcripts = [];

  for (const file of files) {
    try {
      const filePath = path.join(PODCAST_DIR, file);
      const content = fs.readFileSync(filePath, 'utf-8');
      const guestName = file.replace('.txt', '');

      // Parse transcript to extract metadata
      const lines = content.split('\n');
      const firstSpeaker = lines[0]?.match(/^([^(]+)\s*\(/)?.[1]?.trim() || guestName;

      // Get first ~500 chars as description
      const description = content.slice(0, 500).replace(/\n/g, ' ').trim() + '...';

      // Estimate duration based on content length (rough estimate: 150 words/min)
      const wordCount = content.split(/\s+/).length;
      const estimatedMinutes = Math.round(wordCount / 150);

      transcripts.push({
        id: `podcast-${Buffer.from(guestName).toString('base64').slice(0, 12)}`,
        type: 'podcast',
        title: `Lenny's Podcast: ${guestName}`,
        guest: guestName,
        host: 'Lenny Rachitsky',
        description: description,
        content: content,
        wordCount: wordCount,
        estimatedDuration: `${estimatedMinutes} min`,
        category: "Lenny's Podcast",
        feedName: "Lenny's Podcast",
        fileName: file,
        pubDate: null, // We don't have exact dates
        fetchedAt: new Date().toISOString()
      });
    } catch (err) {
      console.error(`Error loading transcript ${file}:`, err.message);
    }
  }

  cache.transcripts = transcripts;
  console.log(`✓ Loaded ${transcripts.length} podcast transcripts`);
  return transcripts;
}

// Search transcripts
function searchTranscripts(query, limit = 20) {
  if (!cache.transcripts) return [];

  const queryLower = query.toLowerCase();

  return cache.transcripts
    .filter(t =>
      t.guest.toLowerCase().includes(queryLower) ||
      t.title.toLowerCase().includes(queryLower) ||
      t.content.toLowerCase().includes(queryLower)
    )
    .slice(0, limit)
    .map(t => ({
      ...t,
      content: undefined, // Don't send full content in search results
      snippet: getSnippet(t.content, query)
    }));
}

// Get context snippet around search term
function getSnippet(content, query, contextLength = 200) {
  const queryLower = query.toLowerCase();
  const contentLower = content.toLowerCase();
  const index = contentLower.indexOf(queryLower);

  if (index === -1) {
    return content.slice(0, contextLength) + '...';
  }

  const start = Math.max(0, index - contextLength / 2);
  const end = Math.min(content.length, index + query.length + contextLength / 2);

  let snippet = content.slice(start, end);
  if (start > 0) snippet = '...' + snippet;
  if (end < content.length) snippet = snippet + '...';

  return snippet;
}

// API Routes

// Mount auth routes (with rate limiting)
app.use('/api/auth', authLimiter, createAuthRoutes(db));

// Mount settings routes
app.use('/api/settings', createSettingsRoutes(db));

// Mount chat routes (with rate limiting)
app.use('/api/chat', chatLimiter, createChatRoutes(db, cache));

// Mount admin routes
app.use('/api/admin', createAdminRoutes(db));

// Get articles with caching and improved filtering
app.get('/api/articles', (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const category = req.query.category;
    const search = req.query.search?.toLowerCase();
    const contentType = req.query.type; // 'article', 'podcast', or 'all'
    const includePodcasts = req.query.includePodcasts === 'true';
    const offset = (page - 1) * limit;

    // Use cached articles if available
    let articles = cache.articles || db.get('articles').value();
    if (!cache.articles) {
      cache.articles = articles;
    }

    // Include podcast transcripts if requested
    if (includePodcasts && cache.transcripts) {
      const podcastItems = cache.transcripts.map(t => ({
        ...t,
        content: undefined // Don't include full transcript in list
      }));
      articles = [...articles, ...podcastItems];
    }

    // Filter by content type
    if (contentType === 'podcast') {
      articles = articles.filter(a => a.type === 'podcast');
    } else if (contentType === 'article') {
      articles = articles.filter(a => a.type !== 'podcast');
    }

    if (category) {
      articles = articles.filter(a => a.category === category);
    }

    if (search) {
      articles = articles.filter(a =>
        a.title?.toLowerCase().includes(search) ||
        a.description?.toLowerCase().includes(search) ||
        a.guest?.toLowerCase().includes(search) ||
        (a.content && a.content.toLowerCase().includes(search))
      );
    }

    // Sort: articles by pubDate, podcasts by guest name (since no dates)
    articles.sort((a, b) => {
      if (a.pubDate && b.pubDate) {
        return new Date(b.pubDate) - new Date(a.pubDate);
      }
      if (a.pubDate) return -1;
      if (b.pubDate) return 1;
      return (a.guest || a.title).localeCompare(b.guest || b.title);
    });

    const total = articles.length;
    const paginatedArticles = articles.slice(offset, offset + limit);

    res.json({
      articles: paginatedArticles,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (err) {
    console.error('Error fetching articles:', err);
    res.status(500).json({ error: 'Failed to fetch articles' });
  }
});

// Get all podcast transcripts
app.get('/api/podcasts', (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const search = req.query.search?.toLowerCase();
    const offset = (page - 1) * limit;

    let transcripts = cache.transcripts || [];

    if (search) {
      transcripts = searchTranscripts(search, 1000);
    } else {
      // Return without full content for listing
      transcripts = transcripts.map(t => ({
        ...t,
        content: undefined
      }));
    }

    // Sort alphabetically by guest name
    transcripts.sort((a, b) => a.guest.localeCompare(b.guest));

    const total = transcripts.length;
    const paginatedTranscripts = transcripts.slice(offset, offset + limit);

    res.json({
      podcasts: paginatedTranscripts,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (err) {
    console.error('Error fetching podcasts:', err);
    res.status(500).json({ error: 'Failed to fetch podcasts' });
  }
});

// Get single podcast transcript with full content
app.get('/api/podcasts/:id', (req, res) => {
  try {
    const id = req.params.id;
    const transcript = cache.transcripts?.find(t => t.id === id);

    if (!transcript) {
      return res.status(404).json({ error: 'Podcast transcript not found' });
    }

    res.json(transcript);
  } catch (err) {
    console.error('Error fetching podcast:', err);
    res.status(500).json({ error: 'Failed to fetch podcast' });
  }
});

// Search across articles and podcasts
app.get('/api/search', (req, res) => {
  try {
    const query = req.query.q?.toLowerCase();
    const limit = parseInt(req.query.limit) || 20;

    if (!query) {
      return res.status(400).json({ error: 'Search query required' });
    }

    // Search articles
    const articles = (cache.articles || db.get('articles').value())
      .filter(a =>
        a.title?.toLowerCase().includes(query) ||
        a.description?.toLowerCase().includes(query)
      )
      .slice(0, limit)
      .map(a => ({ ...a, resultType: 'article' }));

    // Search transcripts
    const podcasts = searchTranscripts(query, limit)
      .map(p => ({ ...p, resultType: 'podcast' }));

    // Combine and sort by relevance (title match first)
    const results = [...articles, ...podcasts].sort((a, b) => {
      const aTitle = (a.title || '').toLowerCase().includes(query);
      const bTitle = (b.title || '').toLowerCase().includes(query);
      if (aTitle && !bTitle) return -1;
      if (!aTitle && bTitle) return 1;
      return 0;
    }).slice(0, limit);

    res.json({
      results,
      total: results.length,
      query
    });
  } catch (err) {
    console.error('Error searching:', err);
    res.status(500).json({ error: 'Search failed' });
  }
});

app.get('/api/articles/:id', (req, res) => {
  try {
    const articleId = parseFloat(req.params.id);
    const article = db.get('articles').find({ id: articleId }).value();

    if (!article) {
      return res.status(404).json({ error: 'Article not found' });
    }

    res.json(article);
  } catch (err) {
    console.error('Error fetching article:', err);
    res.status(500).json({ error: 'Failed to fetch article' });
  }
});

app.get('/api/categories', (req, res) => {
  try {
    const articles = cache.articles || db.get('articles').value();
    const transcripts = cache.transcripts || [];
    const categoryMap = {};

    articles.forEach(article => {
      categoryMap[article.category] = (categoryMap[article.category] || 0) + 1;
    });

    // Add Lenny's Podcast as a category
    if (transcripts.length > 0) {
      categoryMap["Lenny's Podcast"] = transcripts.length;
    }

    const categories = Object.entries(categoryMap).map(([category, count]) => ({
      category,
      count
    })).sort((a, b) => b.count - a.count);

    res.json(categories);
  } catch (err) {
    console.error('Error fetching categories:', err);
    res.status(500).json({ error: 'Failed to fetch categories' });
  }
});

// Get category groups with hierarchy for sidebar
app.get('/api/category-groups', (req, res) => {
  try {
    const articles = cache.articles || db.get('articles').value();
    const transcripts = cache.transcripts || [];

    // Build category counts
    const categoryMap = {};
    articles.forEach(article => {
      categoryMap[article.category] = (categoryMap[article.category] || 0) + 1;
    });

    // Add Lenny's Podcast
    if (transcripts.length > 0) {
      categoryMap["Lenny's Podcast"] = transcripts.length;
    }

    // Build grouped response
    const groups = [];
    const assignedCategories = new Set();

    // Process each hierarchy group
    for (const [groupName, groupConfig] of Object.entries(CATEGORY_HIERARCHY)) {
      const children = [];
      let groupTotal = 0;

      for (const childCategory of groupConfig.children) {
        const count = categoryMap[childCategory] || 0;
        if (count > 0) {
          children.push({
            category: childCategory,
            count: count
          });
          groupTotal += count;
          assignedCategories.add(childCategory);
        }
      }

      // Only include groups that have at least one category with articles
      if (children.length > 0) {
        groups.push({
          name: groupName,
          description: groupConfig.description,
          icon: groupConfig.icon,
          totalCount: groupTotal,
          children: children.sort((a, b) => b.count - a.count)
        });
      }
    }

    // Add ungrouped categories (Product Management, Tech News, etc.)
    const ungroupedCategories = [];
    for (const [category, count] of Object.entries(categoryMap)) {
      if (!assignedCategories.has(category)) {
        ungroupedCategories.push({ category, count });
      }
    }

    // Sort groups by total count
    groups.sort((a, b) => b.totalCount - a.totalCount);

    res.json({
      groups,
      ungrouped: ungroupedCategories.sort((a, b) => b.count - a.count)
    });
  } catch (err) {
    console.error('Error fetching category groups:', err);
    res.status(500).json({ error: 'Failed to fetch category groups' });
  }
});

app.get('/api/feeds', (req, res) => {
  try {
    const feeds = cache.feeds || db.get('feeds').value();
    const articles = cache.articles || db.get('articles').value();
    const transcripts = cache.transcripts || [];

    const feedsWithCounts = feeds.map(feed => ({
      ...feed,
      articleCount: articles.filter(a => a.feedId === feed.id).length
    }));

    // Add Lenny's Podcast as a feed/provider
    if (transcripts.length > 0) {
      feedsWithCounts.push({
        id: 'lennys-podcast',
        name: "Lenny's Podcast",
        url: 'https://www.lennyspodcast.com/',
        category: "Lenny's Podcast",
        description: "Lenny Rachitsky's podcast featuring interviews with world-class product leaders",
        active: true,
        articleCount: transcripts.length
      });
    }

    // Sort alphabetically
    feedsWithCounts.sort((a, b) => a.name.localeCompare(b.name));

    res.json(feedsWithCounts);
  } catch (err) {
    console.error('Error fetching feeds:', err);
    res.status(500).json({ error: 'Failed to fetch feeds' });
  }
});

app.get('/api/stats', (req, res) => {
  try {
    const articles = cache.articles || db.get('articles').value();
    const feeds = cache.feeds || db.get('feeds').value();
    const metadata = db.get('metadata').value();
    const transcripts = cache.transcripts || [];

    const dates = articles.map(a => new Date(a.pubDate)).filter(d => !isNaN(d));

    const stats = {
      totalArticles: articles.length,
      totalFeeds: feeds.length,
      activeFeeds: feeds.filter(f => f.active).length,
      categories: new Set(articles.map(a => a.category)).size,
      latestArticle: dates.length > 0 ? new Date(Math.max(...dates)).toISOString() : null,
      oldestArticle: dates.length > 0 ? new Date(Math.min(...dates)).toISOString() : null,
      lastUpdate: metadata?.lastUpdate || null,
      // Podcast stats
      totalPodcasts: transcripts.length,
      totalPodcastWords: transcripts.reduce((sum, t) => sum + (t.wordCount || 0), 0),
      podcastGuests: transcripts.map(t => t.guest)
    };

    res.json(stats);
  } catch (err) {
    console.error('Error fetching stats:', err);
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

app.post('/api/refresh', authenticateToken, requireAdmin, async (req, res) => {
  try {
    console.log(`Manual refresh triggered by admin: ${req.user.email}`);
    const result = await fetchAllFeeds();
    res.json({ success: true, result });
  } catch (err) {
    console.error('Error during manual refresh:', err);
    res.status(500).json({ error: 'Failed to refresh feeds' });
  }
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Extract full article content using Readability
app.get('/api/extract', async (req, res) => {
  try {
    const url = req.query.url;

    if (!url) {
      return res.status(400).json({ error: 'URL parameter is required' });
    }

    console.log(`Extracting content from: ${url}`);

    // Fetch the article HTML
    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      },
      timeout: 10000
    });

    // Parse with JSDOM
    const dom = new JSDOM(response.data, { url });
    const reader = new Readability(dom.window.document);
    const article = reader.parse();

    if (!article) {
      return res.status(500).json({ error: 'Failed to extract article content' });
    }

    res.json({
      title: article.title,
      content: article.content,
      textContent: article.textContent,
      excerpt: article.excerpt,
      byline: article.byline,
      length: article.length,
      siteName: article.siteName
    });
  } catch (err) {
    console.error('Error extracting article:', err.message);
    res.status(500).json({ error: 'Failed to extract article content', message: err.message });
  }
});

// Catch-all route to serve React app for client-side routing (must be AFTER all API routes)
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'client', 'dist', 'index.html'));
});

// Initialize server
async function initialize() {
  console.log('Initializing ProductSnap - Your AI-Powered PM Knowledge Hub\n');

  initDatabase();
  initializeFeeds();

  // Load Lenny's Podcast transcripts
  await loadPodcastTranscripts();

  console.log('\nPerforming initial feed fetch...');
  await fetchAllFeeds();

  // Schedule automatic updates every 2 hours for comprehensive coverage
  cron.schedule('0 */2 * * *', async () => {
    console.log('\n[CRON] Scheduled feed update starting...');
    await fetchAllFeeds();
  });

  console.log('\n✓ Cron job scheduled: Feed updates every 2 hours');
  console.log(`✓ ${cache.transcripts?.length || 0} Lenny's Podcast transcripts loaded`);
}

// Start server
const PORT = process.env.PORT || 3000;

app.listen(PORT, async () => {
  console.log(`\n${'='.repeat(70)}`);
  console.log('ProductSnap - Content Aggregator');
  console.log('AI-Powered Product Management Knowledge Hub');
  console.log(`${'='.repeat(70)}\n`);
  console.log(`Server: http://localhost:${PORT}`);
  console.log(`\nAPI Endpoints:`);
  console.log(`  GET  /api/articles       - Get all articles`);
  console.log(`  GET  /api/articles/:id   - Get single article`);
  console.log(`  GET  /api/podcasts       - Get Lenny's Podcast transcripts`);
  console.log(`  GET  /api/podcasts/:id   - Get single transcript`);
  console.log(`  GET  /api/search         - Search articles & podcasts`);
  console.log(`  GET  /api/categories     - Get categories`);
  console.log(`  GET  /api/feeds          - Get all feeds`);
  console.log(`  GET  /api/stats          - Get statistics`);
  console.log(`  POST /api/refresh        - Manual refresh`);
  console.log(`\n${'='.repeat(70)}\n`);

  await initialize();
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\nShutting down gracefully...');
  process.exit(0);
});
