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
const multer = require('multer');
const pdfParse = require('pdf-parse');
const { JSDOM } = require('jsdom');
const { Readability } = require('@mozilla/readability');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const session = require('express-session');
const passport = require('passport');
const cookieParser = require('cookie-parser');

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

// Database setup with corruption recovery
const dbPath = path.join(__dirname, 'content-aggregator.json');

// Check if database file exists and is valid JSON before loading
function initializeDatabaseFile() {
  const defaultDb = JSON.stringify({
    feeds: [],
    articles: [],
    users: [],
    metadata: {
      created: new Date().toISOString(),
      lastUpdate: new Date().toISOString()
    }
  }, null, 2);

  if (!fs.existsSync(dbPath)) {
    console.log('Database file not found, creating new one...');
    fs.writeFileSync(dbPath, defaultDb);
    return;
  }

  // Check if file is valid JSON
  try {
    const content = fs.readFileSync(dbPath, 'utf-8');
    if (!content || content.trim() === '') {
      console.log('Database file is empty, initializing with defaults...');
      fs.writeFileSync(dbPath, defaultDb);
      return;
    }
    JSON.parse(content); // Validate JSON
  } catch (e) {
    console.error('Database file is corrupted, creating backup and reinitializing...');
    // Backup corrupted file
    const backupPath = dbPath + '.corrupted.' + Date.now();
    try {
      fs.copyFileSync(dbPath, backupPath);
      console.log(`Corrupted file backed up to: ${backupPath}`);
    } catch (backupErr) {
      console.log('Could not backup corrupted file');
    }
    fs.writeFileSync(dbPath, defaultDb);
  }
}

initializeDatabaseFile();
const adapter = new FileSync(dbPath);
const db = low(adapter);

// Podcast transcripts directory
const PODCAST_DIR = path.join(__dirname, "Lenny's Podcast Transcripts Archive [public]");

// User uploads directory
const UPLOADS_DIR = path.join(__dirname, 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const userDir = path.join(UPLOADS_DIR, req.user.id);
    if (!fs.existsSync(userDir)) {
      fs.mkdirSync(userDir, { recursive: true });
    }
    cb(null, userDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + '-' + file.originalname);
  }
});

const fileFilter = (req, file, cb) => {
  const allowedTypes = [
    'text/plain',
    'application/pdf',
    'text/markdown',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ];
  const allowedExtensions = ['.txt', '.pdf', '.md', '.docx'];
  const ext = path.extname(file.originalname).toLowerCase();

  if (allowedTypes.includes(file.mimetype) || allowedExtensions.includes(ext)) {
    cb(null, true);
  } else {
    cb(new Error('Invalid file type. Allowed: TXT, PDF, MD, DOCX'), false);
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB max
    files: 5 // Max 5 files at once
  }
});

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

// SECURITY: Validate required environment variables
const requiredEnvVars = ['JWT_SECRET', 'ENCRYPTION_KEY', 'SESSION_SECRET', 'GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET'];
const missingEnvVars = requiredEnvVars.filter(v => !process.env[v]);
if (missingEnvVars.length > 0) {
  console.error(`FATAL: Missing required environment variables: ${missingEnvVars.join(', ')}`);
  process.exit(1);
}

// SECURITY: Validate CORS origin in production
const isProduction = process.env.NODE_ENV === 'production';
if (isProduction && !process.env.FRONTEND_URL) {
  console.error('FATAL: FRONTEND_URL must be set in production');
  process.exit(1);
}

// Middleware
app.use(cors({
  origin: isProduction
    ? process.env.FRONTEND_URL
    : ['http://localhost:5173', 'http://localhost:3000'],
  credentials: true
}));
app.use(express.json({ limit: '1mb' })); // Limit request body size
app.use(cookieParser()); // Required for httpOnly cookie auth
app.use(express.static(path.join(__dirname, 'client', 'dist')));

// Session middleware for Passport
app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: isProduction,
    httpOnly: true,
    sameSite: isProduction ? 'strict' : 'lax',
    maxAge: 4 * 60 * 60 * 1000 // 4 hours (reduced from 7 days)
  }
}));

// Initialize Passport
app.use(passport.initialize());
app.use(passport.session());

// Comprehensive Product Management RSS Feeds
const PM_FEEDS = [
  // ===== CORE PM PUBLICATIONS & COMMUNITIES =====
  {
    name: 'Product Coalition',
    url: 'https://productcoalition.com/feed',
    category: 'Product Management',
    description: 'PM insights on Medium'
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

  // ===== PM THOUGHT LEADERS & PERSONAL BLOGS =====
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
    name: 'Slack Engineering',
    url: 'https://slack.engineering/feed/',
    category: 'Product Engineering',
    description: 'Slack product & tech'
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

  // ===== GROWTH & MARKETING =====
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
    name: 'Y Combinator',
    url: 'https://www.ycombinator.com/blog/feed',
    category: 'Product Strategy',
    description: 'Startup accelerator insights'
  },

  // ===== AGGREGATORS & NEWS =====
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
    name: 'UX Planet',
    url: 'https://uxplanet.org/feed',
    category: 'Product Design',
    description: 'UX design community'
  },
  {
    name: 'Muzli Design',
    url: 'https://medium.muz.li/feed',
    category: 'Product Design',
    description: 'Design inspiration'
  },

  // ===== INTERNATIONAL & DIVERSE VOICES =====
  {
    name: 'Aha! Blog',
    url: 'https://www.aha.io/blog/feed',
    category: 'Product Management',
    description: 'Roadmap & strategy'
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
    name: 'Microsoft Research',
    url: 'https://www.microsoft.com/en-us/research/feed/',
    category: 'Product Innovation',
    description: 'Microsoft research'
  },

  // ===== PRODUCT OPS & ENABLEMENT =====

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

  // ===== INTERNATIONAL PM VOICES =====
  {
    name: 'Product Management IRL',
    url: 'https://productmanagementirl.com/feed/',
    category: 'Product Management',
    description: 'Real-world PM stories'
  },

  // ===== B2B & ENTERPRISE PRODUCT =====
  {
    name: 'OpenView Partners',
    url: 'https://openviewpartners.com/blog/feed/',
    category: 'Product Strategy',
    description: 'B2B SaaS insights'
  },
  {
    name: 'ChartMogul Blog',
    url: 'https://chartmogul.com/blog/feed/',
    category: 'Product Analytics',
    description: 'SaaS analytics & metrics'
  },

  // ===== MOBILE & APP PRODUCT =====
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
    name: 'Drift Blog',
    url: 'https://www.drift.com/blog/feed/',
    category: 'Product Marketing',
    description: 'Conversational marketing'
  },

  // ===== CUSTOMER SUCCESS & SUPPORT =====
  {
    name: 'ChurnZero Blog',
    url: 'https://churnzero.net/blog/feed/',
    category: 'Customer Success',
    description: 'Customer retention'
  },
  {
    name: 'Intercom Support',
    url: 'https://www.intercom.com/blog/category/customer-support/feed/',
    category: 'Customer Support',
    description: 'Customer support best practices'
  },

  // ===== PRODUCT LAUNCH & DISCOVERY =====
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
    name: 'The Information',
    url: 'https://www.theinformation.com/feed',
    category: 'Product Launch',
    description: 'In-depth tech business news'
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
    userFiles: [],           // { id, userId, filename, originalName, mimeType, size, content, uploadedAt }
    bookmarks: [],           // { id, userId, articleId, podcastId, createdAt, notes }
    readHistory: [],         // { id, userId, articleId, podcastId, readAt, readDuration }
    articleSummaries: [],    // { id, articleId, summary, generatedAt, model }
    analytics: {
      articleViews: [],      // { articleId, userId, timestamp }
      searchQueries: [],     // { query, userId, timestamp, resultsCount }
      chatQueries: [],       // { userId, query, timestamp, sourcesUsed }
      dailyStats: []         // { date, newArticles, activeUsers, searches, chats }
    },
    emailDigest: {
      subscribers: [],       // { userId, email, frequency, lastSent, preferences }
      sentDigests: []        // { id, userId, sentAt, articlesIncluded }
    },
    metadata: {
      created: new Date().toISOString(),
      lastUpdate: new Date().toISOString()
    }
  }).write();

  // Ensure new structures exist for existing databases
  if (!db.has('analytics').value()) {
    db.set('analytics', {
      articleViews: [],
      searchQueries: [],
      chatQueries: [],
      dailyStats: []
    }).write();
  }
  if (!db.has('bookmarks').value()) {
    db.set('bookmarks', []).write();
  }
  if (!db.has('readHistory').value()) {
    db.set('readHistory', []).write();
  }
  if (!db.has('articleSummaries').value()) {
    db.set('articleSummaries', []).write();
  }
  if (!db.has('emailDigest').value()) {
    db.set('emailDigest', { subscribers: [], sentDigests: [] }).write();
  }
  if (!db.has('userFiles').value()) {
    db.set('userFiles', []).write();
  }
}

// Initialize feeds in database with smart tracking fields
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
        consecutiveErrors: 0,      // Track consecutive failures
        lastArticleDate: null,     // Track when feed last had new content
        avgPostsPerWeek: 0,        // Average posting frequency
        healthScore: 100,          // Feed health (0-100)
        createdAt: new Date().toISOString()
      }).write();
      addedCount++;
    } else {
      // Migrate existing feeds to have new fields
      const feed = db.get('feeds').find({ url: exists.url });
      if (!exists.healthScore) {
        feed.assign({
          consecutiveErrors: exists.consecutiveErrors || 0,
          lastArticleDate: exists.lastArticleDate || null,
          avgPostsPerWeek: exists.avgPostsPerWeek || 0,
          healthScore: exists.healthScore || 100
        }).write();
      }
    }
  }

  const totalFeeds = db.get('feeds').size().value();
  console.log(`✓ Initialized ${addedCount} new feeds (${totalFeeds} total)`);
}

// Calculate feed health score based on activity and errors
function calculateFeedHealth(feed) {
  let score = 100;

  // Penalize for consecutive errors (max -50 points)
  score -= Math.min((feed.consecutiveErrors || 0) * 10, 50);

  // Penalize for inactivity (no articles in 30+ days)
  if (feed.lastArticleDate) {
    const daysSinceLastArticle = (Date.now() - new Date(feed.lastArticleDate).getTime()) / (1000 * 60 * 60 * 24);
    if (daysSinceLastArticle > 30) {
      score -= Math.min(Math.floor(daysSinceLastArticle / 7), 30); // Max -30 points
    }
  }

  // Bonus for high posting frequency
  if (feed.avgPostsPerWeek > 5) score = Math.min(score + 10, 100);

  return Math.max(0, Math.min(100, score));
}

// Smart feed refresh - prioritize active, healthy feeds
async function smartFeedRefresh() {
  console.log('\n=== Smart Feed Refresh (Priority-Based) ===');
  const startTime = Date.now();

  const feeds = db.get('feeds').filter({ active: true }).value();

  // Sort feeds by priority: health score * posting frequency
  const prioritizedFeeds = feeds
    .map(f => ({
      ...f,
      priority: (f.healthScore || 100) * (1 + (f.avgPostsPerWeek || 0) / 10)
    }))
    .sort((a, b) => b.priority - a.priority);

  console.log(`Processing ${prioritizedFeeds.length} feeds by priority...`);

  let totalArticles = 0;
  let successCount = 0;
  let errorCount = 0;

  // Process in batches with concurrency
  const results = await processWithConcurrency(prioritizedFeeds, async (feed) => {
    const result = await fetchFeed(feed);

    if (result && result.items.length > 0) {
      const saved = saveArticles(feed.id, result.items, feed.category, feed.name);

      // Update feed activity metrics
      const latestItemDate = result.items[0]?.pubDate || result.items[0]?.isoDate;
      const articlesThisWeek = result.items.filter(item => {
        const date = new Date(item.pubDate || item.isoDate);
        return (Date.now() - date.getTime()) < 7 * 24 * 60 * 60 * 1000;
      }).length;

      safeDbWrite(
        db.get('feeds').find({ id: feed.id }).assign({
          consecutiveErrors: 0,
          lastArticleDate: latestItemDate || feed.lastArticleDate,
          avgPostsPerWeek: Math.round((feed.avgPostsPerWeek || 0) * 0.7 + articlesThisWeek * 0.3),
          healthScore: calculateFeedHealth({ ...feed, consecutiveErrors: 0 })
        })
      );

      return { feed, saved, success: true };
    } else if (result) {
      return { feed, saved: 0, success: true };
    } else {
      // Update error tracking
      const newConsecutiveErrors = (feed.consecutiveErrors || 0) + 1;
      safeDbWrite(
        db.get('feeds').find({ id: feed.id }).assign({
          consecutiveErrors: newConsecutiveErrors,
          healthScore: calculateFeedHealth({ ...feed, consecutiveErrors: newConsecutiveErrors })
        })
      );
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
    }
  }

  // Update daily stats
  updateDailyStats(totalArticles);

  db.set('metadata.lastUpdate', new Date().toISOString()).write();
  invalidateCache();

  const duration = ((Date.now() - startTime) / 1000).toFixed(2);
  console.log(`\n=== Smart Refresh Complete ===`);
  console.log(`Duration: ${duration}s | Success: ${successCount} | Errors: ${errorCount} | New articles: ${totalArticles}`);

  return { totalArticles, successCount, errorCount };
}

// Update daily statistics
function updateDailyStats(newArticles = 0) {
  const today = new Date().toISOString().split('T')[0];
  const analytics = db.get('analytics').value();

  let todayStats = analytics.dailyStats.find(s => s.date === today);

  if (!todayStats) {
    todayStats = {
      date: today,
      newArticles: 0,
      activeUsers: 0,
      searches: 0,
      chats: 0,
      articleViews: 0
    };
    analytics.dailyStats.push(todayStats);
  }

  todayStats.newArticles += newArticles;

  // Count unique active users today
  const todayViews = analytics.articleViews.filter(v => v.timestamp?.startsWith(today));
  const todaySearches = analytics.searchQueries.filter(q => q.timestamp?.startsWith(today));
  const todayChats = analytics.chatQueries?.filter(c => c.timestamp?.startsWith(today)) || [];

  const uniqueUsers = new Set([
    ...todayViews.map(v => v.userId),
    ...todaySearches.map(s => s.userId),
    ...todayChats.map(c => c.userId)
  ].filter(Boolean));

  todayStats.activeUsers = uniqueUsers.size;
  todayStats.searches = todaySearches.length;
  todayStats.chats = todayChats.length;
  todayStats.articleViews = todayViews.length;

  safeDbWrite(db.set('analytics.dailyStats', analytics.dailyStats));
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
    const result = await smartFeedRefresh(); // Use smart refresh
    res.json({ success: true, result });
  } catch (err) {
    console.error('Error during manual refresh:', err);
    res.status(500).json({ error: 'Failed to refresh feeds' });
  }
});

// ==================== BOOKMARKS API ====================

// Get user's bookmarks
app.get('/api/bookmarks', authenticateToken, (req, res) => {
  try {
    const userId = req.user.id;
    const bookmarks = db.get('bookmarks')
      .filter({ userId })
      .orderBy(['createdAt'], ['desc'])
      .value();

    // Enrich bookmarks with article/podcast data
    const enrichedBookmarks = bookmarks.map(bookmark => {
      if (bookmark.articleId) {
        const article = db.get('articles').find({ id: bookmark.articleId }).value();
        return { ...bookmark, item: article, type: 'article' };
      } else if (bookmark.podcastId) {
        const podcast = cache.transcripts?.find(t => t.id === bookmark.podcastId);
        return { ...bookmark, item: podcast ? { ...podcast, content: undefined } : null, type: 'podcast' };
      }
      return bookmark;
    }).filter(b => b.item); // Filter out bookmarks with deleted items

    res.json({ bookmarks: enrichedBookmarks, total: enrichedBookmarks.length });
  } catch (err) {
    console.error('Error fetching bookmarks:', err);
    res.status(500).json({ error: 'Failed to fetch bookmarks' });
  }
});

// Add bookmark
app.post('/api/bookmarks', authenticateToken, (req, res) => {
  try {
    const userId = req.user.id;
    const { articleId, podcastId, notes } = req.body;

    if (!articleId && !podcastId) {
      return res.status(400).json({ error: 'articleId or podcastId is required' });
    }

    // Check if already bookmarked
    const existing = db.get('bookmarks').find(b =>
      b.userId === userId &&
      ((articleId && b.articleId === articleId) || (podcastId && b.podcastId === podcastId))
    ).value();

    if (existing) {
      return res.status(400).json({ error: 'Item already bookmarked' });
    }

    const bookmark = {
      id: `bm-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      userId,
      articleId: articleId || null,
      podcastId: podcastId || null,
      notes: notes || '',
      createdAt: new Date().toISOString()
    };

    safeDbWrite(db.get('bookmarks').push(bookmark));

    res.json({ success: true, bookmark });
  } catch (err) {
    console.error('Error adding bookmark:', err);
    res.status(500).json({ error: 'Failed to add bookmark' });
  }
});

// Remove bookmark
app.delete('/api/bookmarks/:id', authenticateToken, (req, res) => {
  try {
    const userId = req.user.id;
    const bookmarkId = req.params.id;

    const bookmark = db.get('bookmarks').find({ id: bookmarkId, userId }).value();

    if (!bookmark) {
      return res.status(404).json({ error: 'Bookmark not found' });
    }

    safeDbWrite(db.get('bookmarks').remove({ id: bookmarkId }));

    res.json({ success: true });
  } catch (err) {
    console.error('Error removing bookmark:', err);
    res.status(500).json({ error: 'Failed to remove bookmark' });
  }
});

// Update bookmark notes
app.patch('/api/bookmarks/:id', authenticateToken, (req, res) => {
  try {
    const userId = req.user.id;
    const bookmarkId = req.params.id;
    const { notes } = req.body;

    const bookmark = db.get('bookmarks').find({ id: bookmarkId, userId });

    if (!bookmark.value()) {
      return res.status(404).json({ error: 'Bookmark not found' });
    }

    safeDbWrite(bookmark.assign({ notes, updatedAt: new Date().toISOString() }));

    res.json({ success: true, bookmark: bookmark.value() });
  } catch (err) {
    console.error('Error updating bookmark:', err);
    res.status(500).json({ error: 'Failed to update bookmark' });
  }
});

// ==================== READ HISTORY API ====================

// Get user's read history
app.get('/api/history', authenticateToken, (req, res) => {
  try {
    const userId = req.user.id;
    const limit = parseInt(req.query.limit) || 50;
    const offset = parseInt(req.query.offset) || 0;

    const history = db.get('readHistory')
      .filter({ userId })
      .orderBy(['readAt'], ['desc'])
      .slice(offset, offset + limit)
      .value();

    // Enrich with article/podcast data
    const enrichedHistory = history.map(entry => {
      if (entry.articleId) {
        const article = db.get('articles').find({ id: entry.articleId }).value();
        return { ...entry, item: article, type: 'article' };
      } else if (entry.podcastId) {
        const podcast = cache.transcripts?.find(t => t.id === entry.podcastId);
        return { ...entry, item: podcast ? { ...podcast, content: undefined } : null, type: 'podcast' };
      }
      return entry;
    }).filter(h => h.item);

    const total = db.get('readHistory').filter({ userId }).size().value();

    res.json({ history: enrichedHistory, total, limit, offset });
  } catch (err) {
    console.error('Error fetching read history:', err);
    res.status(500).json({ error: 'Failed to fetch read history' });
  }
});

// Mark as read (track reading)
app.post('/api/history', authenticateToken, (req, res) => {
  try {
    const userId = req.user.id;
    const { articleId, podcastId, readDuration } = req.body;

    if (!articleId && !podcastId) {
      return res.status(400).json({ error: 'articleId or podcastId is required' });
    }

    // Update or create read history entry
    const existing = db.get('readHistory').find(h =>
      h.userId === userId &&
      ((articleId && h.articleId === articleId) || (podcastId && h.podcastId === podcastId))
    );

    if (existing.value()) {
      // Update existing entry
      safeDbWrite(existing.assign({
        readAt: new Date().toISOString(),
        readCount: (existing.value().readCount || 1) + 1,
        totalReadDuration: (existing.value().totalReadDuration || 0) + (readDuration || 0)
      }));
    } else {
      // Create new entry
      const entry = {
        id: `rh-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        userId,
        articleId: articleId || null,
        podcastId: podcastId || null,
        readAt: new Date().toISOString(),
        readCount: 1,
        readDuration: readDuration || 0,
        totalReadDuration: readDuration || 0
      };
      safeDbWrite(db.get('readHistory').push(entry));
    }

    // Also track in analytics
    safeDbWrite(
      db.get('analytics.articleViews').push({
        articleId: articleId || podcastId,
        userId,
        timestamp: new Date().toISOString(),
        type: articleId ? 'article' : 'podcast'
      })
    );

    res.json({ success: true });
  } catch (err) {
    console.error('Error tracking read:', err);
    res.status(500).json({ error: 'Failed to track read' });
  }
});

// Check if item is read
app.get('/api/history/check', authenticateToken, (req, res) => {
  try {
    const userId = req.user.id;
    const { articleId, podcastId } = req.query;

    const isRead = db.get('readHistory').find(h =>
      h.userId === userId &&
      ((articleId && h.articleId === parseFloat(articleId)) || (podcastId && h.podcastId === podcastId))
    ).value();

    res.json({ isRead: !!isRead, entry: isRead || null });
  } catch (err) {
    console.error('Error checking read status:', err);
    res.status(500).json({ error: 'Failed to check read status' });
  }
});

// ==================== ANALYTICS API ====================

// Get analytics dashboard data
app.get('/api/analytics', authenticateToken, (req, res) => {
  try {
    const userId = req.user.id;
    const days = parseInt(req.query.days) || 30;
    const isAdmin = req.user.role === 'admin';

    const analytics = db.get('analytics').value();
    const cutoffDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

    // Personal stats
    const userViews = analytics.articleViews.filter(v =>
      v.userId === userId && v.timestamp > cutoffDate
    );
    const userSearches = analytics.searchQueries.filter(q =>
      q.userId === userId && q.timestamp > cutoffDate
    );
    const userChats = (analytics.chatQueries || []).filter(c =>
      c.userId === userId && c.timestamp > cutoffDate
    );

    const userBookmarks = db.get('bookmarks').filter({ userId }).size().value();
    const userReadHistory = db.get('readHistory').filter({ userId }).size().value();

    // Category breakdown for user
    const categoryViews = {};
    userViews.forEach(v => {
      if (v.articleId) {
        const article = db.get('articles').find({ id: v.articleId }).value();
        if (article) {
          categoryViews[article.category] = (categoryViews[article.category] || 0) + 1;
        }
      }
    });

    const response = {
      personal: {
        articlesRead: userViews.filter(v => v.type === 'article').length,
        podcastsRead: userViews.filter(v => v.type === 'podcast').length,
        totalSearches: userSearches.length,
        totalChats: userChats.length,
        bookmarksCount: userBookmarks,
        readHistoryCount: userReadHistory,
        topCategories: Object.entries(categoryViews)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 5)
          .map(([category, count]) => ({ category, count })),
        recentSearches: userSearches.slice(-10).reverse().map(s => s.query)
      },
      period: { days, from: cutoffDate, to: new Date().toISOString() }
    };

    // Admin-only aggregate stats
    if (isAdmin) {
      const dailyStats = analytics.dailyStats
        .filter(s => s.date > cutoffDate.split('T')[0])
        .sort((a, b) => a.date.localeCompare(b.date));

      // Feed health overview
      const feeds = db.get('feeds').value();
      const healthyFeeds = feeds.filter(f => (f.healthScore || 100) >= 70).length;
      const unhealthyFeeds = feeds.filter(f => (f.healthScore || 100) < 30).length;

      response.admin = {
        dailyStats,
        feedHealth: {
          total: feeds.length,
          healthy: healthyFeeds,
          warning: feeds.length - healthyFeeds - unhealthyFeeds,
          unhealthy: unhealthyFeeds,
          avgHealthScore: Math.round(feeds.reduce((sum, f) => sum + (f.healthScore || 100), 0) / feeds.length)
        },
        totalUsers: db.get('users').size().value(),
        totalArticles: db.get('articles').size().value(),
        totalPodcasts: cache.transcripts?.length || 0
      };
    }

    res.json(response);
  } catch (err) {
    console.error('Error fetching analytics:', err);
    res.status(500).json({ error: 'Failed to fetch analytics' });
  }
});

// Track search (for analytics)
app.post('/api/analytics/search', authenticateToken, (req, res) => {
  try {
    const userId = req.user.id;
    const { query, resultsCount } = req.body;

    safeDbWrite(
      db.get('analytics.searchQueries').push({
        query,
        userId,
        timestamp: new Date().toISOString(),
        resultsCount: resultsCount || 0
      })
    );

    res.json({ success: true });
  } catch (err) {
    console.error('Error tracking search:', err);
    res.status(500).json({ error: 'Failed to track search' });
  }
});

// ==================== ARTICLE SUMMARY API ====================

// Get or generate article summary
app.post('/api/summarize', authenticateToken, async (req, res) => {
  try {
    const { articleId, podcastId, forceRegenerate } = req.body;
    const userId = req.user.id;

    if (!articleId && !podcastId) {
      return res.status(400).json({ error: 'articleId or podcastId is required' });
    }

    const itemId = articleId || podcastId;
    const itemType = articleId ? 'article' : 'podcast';

    // Check for existing summary
    if (!forceRegenerate) {
      const existing = db.get('articleSummaries').find({ itemId, itemType }).value();
      if (existing) {
        return res.json({ summary: existing.summary, cached: true, generatedAt: existing.generatedAt });
      }
    }

    // Get the content to summarize
    let content, title;
    if (articleId) {
      const article = db.get('articles').find({ id: parseFloat(articleId) }).value();
      if (!article) {
        return res.status(404).json({ error: 'Article not found' });
      }
      content = article.content || article.description;
      title = article.title;
    } else {
      const podcast = cache.transcripts?.find(t => t.id === podcastId);
      if (!podcast) {
        return res.status(404).json({ error: 'Podcast not found' });
      }
      content = podcast.content?.slice(0, 15000); // Limit podcast content
      title = podcast.title;
    }

    if (!content || content.length < 100) {
      return res.status(400).json({ error: 'Not enough content to summarize' });
    }

    // Get user's AI settings
    const user = db.get('users').find({ id: userId }).value();
    const aiProvider = user?.settings?.preferences?.defaultAIProvider || 'openai';

    // Generate summary using AI
    const summaryPrompt = `Please provide a concise summary (3-5 bullet points) of the following ${itemType}. Focus on key insights, actionable takeaways, and main topics covered.

Title: ${title}

Content:
${content.slice(0, 8000)}

Provide the summary in markdown format with bullet points.`;

    // Use the chat service to generate summary
    const { createAIService } = require('./services/ai');
    const aiService = createAIService(aiProvider, user?.settings?.apiKeys, user?.settings?.preferences);

    if (!aiService) {
      return res.status(400).json({ error: 'No AI provider configured. Please add an API key in settings.' });
    }

    const summary = await aiService.chat([
      { role: 'system', content: 'You are a helpful assistant that creates concise, insightful summaries of product management content.' },
      { role: 'user', content: summaryPrompt }
    ]);

    // Store the summary
    const summaryRecord = {
      id: `sum-${Date.now()}`,
      itemId,
      itemType,
      title,
      summary,
      generatedAt: new Date().toISOString(),
      generatedBy: userId,
      model: aiProvider
    };

    // Remove old summary if exists
    safeDbWrite(db.get('articleSummaries').remove({ itemId, itemType }));
    safeDbWrite(db.get('articleSummaries').push(summaryRecord));

    res.json({ summary, cached: false, generatedAt: summaryRecord.generatedAt });
  } catch (err) {
    console.error('Error generating summary:', err);
    res.status(500).json({ error: 'Failed to generate summary' });
  }
});

// ==================== EXPORT API ====================

// Export bookmarks to various formats
app.get('/api/export/bookmarks', authenticateToken, (req, res) => {
  try {
    const userId = req.user.id;
    const format = req.query.format || 'json'; // json, markdown, notion, obsidian

    const bookmarks = db.get('bookmarks')
      .filter({ userId })
      .orderBy(['createdAt'], ['desc'])
      .value();

    // Enrich bookmarks
    const enrichedBookmarks = bookmarks.map(bookmark => {
      if (bookmark.articleId) {
        const article = db.get('articles').find({ id: bookmark.articleId }).value();
        return { ...bookmark, item: article, type: 'article' };
      } else if (bookmark.podcastId) {
        const podcast = cache.transcripts?.find(t => t.id === bookmark.podcastId);
        return { ...bookmark, item: podcast, type: 'podcast' };
      }
      return bookmark;
    }).filter(b => b.item);

    if (format === 'json') {
      res.setHeader('Content-Disposition', 'attachment; filename=productsnap-bookmarks.json');
      res.json(enrichedBookmarks);
      return;
    }

    if (format === 'markdown' || format === 'obsidian') {
      let markdown = `# ProductSnap Bookmarks\n\nExported on ${new Date().toLocaleDateString()}\n\n`;

      // Group by category
      const byCategory = {};
      enrichedBookmarks.forEach(b => {
        const cat = b.item.category || 'Uncategorized';
        if (!byCategory[cat]) byCategory[cat] = [];
        byCategory[cat].push(b);
      });

      for (const [category, items] of Object.entries(byCategory)) {
        markdown += `## ${category}\n\n`;
        for (const bookmark of items) {
          const item = bookmark.item;
          markdown += `### ${item.title}\n`;
          markdown += `- **Source**: ${item.feedName || 'Unknown'}\n`;
          markdown += `- **Link**: ${item.link || 'N/A'}\n`;
          markdown += `- **Date**: ${item.pubDate ? new Date(item.pubDate).toLocaleDateString() : 'N/A'}\n`;
          if (bookmark.notes) {
            markdown += `- **Notes**: ${bookmark.notes}\n`;
          }
          markdown += `\n${item.description || ''}\n\n---\n\n`;
        }
      }

      res.setHeader('Content-Type', 'text/markdown');
      res.setHeader('Content-Disposition', 'attachment; filename=productsnap-bookmarks.md');
      res.send(markdown);
      return;
    }

    if (format === 'notion') {
      // Notion-compatible CSV format
      let csv = 'Title,Category,Source,Link,Date,Notes,Description\n';

      enrichedBookmarks.forEach(b => {
        const item = b.item;
        const row = [
          `"${(item.title || '').replace(/"/g, '""')}"`,
          `"${item.category || ''}"`,
          `"${item.feedName || ''}"`,
          `"${item.link || ''}"`,
          `"${item.pubDate ? new Date(item.pubDate).toISOString() : ''}"`,
          `"${(b.notes || '').replace(/"/g, '""')}"`,
          `"${(item.description || '').slice(0, 500).replace(/"/g, '""')}"`
        ];
        csv += row.join(',') + '\n';
      });

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename=productsnap-bookmarks-notion.csv');
      res.send(csv);
      return;
    }

    res.status(400).json({ error: 'Invalid format. Use: json, markdown, obsidian, or notion' });
  } catch (err) {
    console.error('Error exporting bookmarks:', err);
    res.status(500).json({ error: 'Failed to export bookmarks' });
  }
});

// Export read history
app.get('/api/export/history', authenticateToken, (req, res) => {
  try {
    const userId = req.user.id;
    const format = req.query.format || 'json';

    const history = db.get('readHistory')
      .filter({ userId })
      .orderBy(['readAt'], ['desc'])
      .value();

    // Enrich history
    const enrichedHistory = history.map(entry => {
      if (entry.articleId) {
        const article = db.get('articles').find({ id: entry.articleId }).value();
        return { ...entry, item: article, type: 'article' };
      } else if (entry.podcastId) {
        const podcast = cache.transcripts?.find(t => t.id === entry.podcastId);
        return { ...entry, item: podcast, type: 'podcast' };
      }
      return entry;
    }).filter(h => h.item);

    if (format === 'json') {
      res.setHeader('Content-Disposition', 'attachment; filename=productsnap-history.json');
      res.json(enrichedHistory);
      return;
    }

    if (format === 'markdown') {
      let markdown = `# ProductSnap Reading History\n\nExported on ${new Date().toLocaleDateString()}\n\n`;
      markdown += `Total items read: ${enrichedHistory.length}\n\n---\n\n`;

      for (const entry of enrichedHistory) {
        const item = entry.item;
        markdown += `## ${item.title}\n`;
        markdown += `- **Read on**: ${new Date(entry.readAt).toLocaleDateString()}\n`;
        markdown += `- **Type**: ${entry.type}\n`;
        markdown += `- **Category**: ${item.category || 'N/A'}\n`;
        markdown += `- **Link**: ${item.link || 'N/A'}\n\n`;
      }

      res.setHeader('Content-Type', 'text/markdown');
      res.setHeader('Content-Disposition', 'attachment; filename=productsnap-history.md');
      res.send(markdown);
      return;
    }

    res.status(400).json({ error: 'Invalid format. Use: json or markdown' });
  } catch (err) {
    console.error('Error exporting history:', err);
    res.status(500).json({ error: 'Failed to export history' });
  }
});

// ==================== EMAIL DIGEST API ====================

// Subscribe to email digest
app.post('/api/digest/subscribe', authenticateToken, (req, res) => {
  try {
    const userId = req.user.id;
    const { email, frequency, preferences } = req.body;
    // frequency: 'daily' | 'weekly'
    // preferences: { categories: [], maxArticles: number }

    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    const existingSub = db.get('emailDigest.subscribers').find({ userId }).value();

    if (existingSub) {
      // Update existing subscription
      safeDbWrite(
        db.get('emailDigest.subscribers')
          .find({ userId })
          .assign({
            email,
            frequency: frequency || 'daily',
            preferences: preferences || {},
            updatedAt: new Date().toISOString()
          })
      );
    } else {
      // Create new subscription
      safeDbWrite(
        db.get('emailDigest.subscribers').push({
          id: `digest-${Date.now()}`,
          userId,
          email,
          frequency: frequency || 'daily',
          preferences: preferences || {},
          lastSent: null,
          createdAt: new Date().toISOString()
        })
      );
    }

    res.json({ success: true, message: 'Subscribed to email digest' });
  } catch (err) {
    console.error('Error subscribing to digest:', err);
    res.status(500).json({ error: 'Failed to subscribe' });
  }
});

// Unsubscribe from email digest
app.delete('/api/digest/subscribe', authenticateToken, (req, res) => {
  try {
    const userId = req.user.id;

    safeDbWrite(db.get('emailDigest.subscribers').remove({ userId }));

    res.json({ success: true, message: 'Unsubscribed from email digest' });
  } catch (err) {
    console.error('Error unsubscribing:', err);
    res.status(500).json({ error: 'Failed to unsubscribe' });
  }
});

// Get digest subscription status
app.get('/api/digest/status', authenticateToken, (req, res) => {
  try {
    const userId = req.user.id;
    const subscription = db.get('emailDigest.subscribers').find({ userId }).value();

    res.json({
      subscribed: !!subscription,
      subscription: subscription || null
    });
  } catch (err) {
    console.error('Error fetching digest status:', err);
    res.status(500).json({ error: 'Failed to fetch status' });
  }
});

// Preview digest content (what would be sent)
app.get('/api/digest/preview', authenticateToken, (req, res) => {
  try {
    const userId = req.user.id;
    const subscription = db.get('emailDigest.subscribers').find({ userId }).value();

    // Get articles from last 24 hours (daily) or 7 days (weekly)
    const hoursBack = subscription?.frequency === 'weekly' ? 168 : 24;
    const cutoff = new Date(Date.now() - hoursBack * 60 * 60 * 1000).toISOString();

    let articles = db.get('articles')
      .filter(a => a.fetchedAt > cutoff)
      .orderBy(['pubDate'], ['desc'])
      .take(subscription?.preferences?.maxArticles || 10)
      .value();

    // Filter by preferred categories if set
    if (subscription?.preferences?.categories?.length > 0) {
      articles = articles.filter(a =>
        subscription.preferences.categories.includes(a.category)
      );
    }

    res.json({
      previewFor: subscription?.frequency || 'daily',
      articlesCount: articles.length,
      articles: articles.map(a => ({
        title: a.title,
        category: a.category,
        feedName: a.feedName,
        pubDate: a.pubDate,
        link: a.link,
        description: a.description?.slice(0, 200)
      }))
    });
  } catch (err) {
    console.error('Error generating preview:', err);
    res.status(500).json({ error: 'Failed to generate preview' });
  }
});

// ==================== FEED HEALTH API ====================

// Get feed health status (admin only)
app.get('/api/feeds/health', authenticateToken, requireAdmin, (req, res) => {
  try {
    const feeds = db.get('feeds').value();

    const feedHealth = feeds.map(feed => ({
      id: feed.id,
      name: feed.name,
      category: feed.category,
      healthScore: feed.healthScore || 100,
      consecutiveErrors: feed.consecutiveErrors || 0,
      lastFetched: feed.lastFetched,
      lastArticleDate: feed.lastArticleDate,
      avgPostsPerWeek: feed.avgPostsPerWeek || 0,
      status: (feed.healthScore || 100) >= 70 ? 'healthy' :
              (feed.healthScore || 100) >= 30 ? 'warning' : 'unhealthy'
    })).sort((a, b) => a.healthScore - b.healthScore); // Show unhealthy first

    res.json({
      feeds: feedHealth,
      summary: {
        total: feeds.length,
        healthy: feedHealth.filter(f => f.status === 'healthy').length,
        warning: feedHealth.filter(f => f.status === 'warning').length,
        unhealthy: feedHealth.filter(f => f.status === 'unhealthy').length
      }
    });
  } catch (err) {
    console.error('Error fetching feed health:', err);
    res.status(500).json({ error: 'Failed to fetch feed health' });
  }
});

// ==================== USER FILES API ====================

// Parse file content based on type
async function parseFileContent(filePath, mimeType, originalName) {
  const ext = path.extname(originalName).toLowerCase();

  try {
    if (ext === '.txt' || ext === '.md' || mimeType === 'text/plain' || mimeType === 'text/markdown') {
      return fs.readFileSync(filePath, 'utf-8');
    }

    if (ext === '.pdf' || mimeType === 'application/pdf') {
      const dataBuffer = fs.readFileSync(filePath);
      const pdfData = await pdfParse(dataBuffer);
      return pdfData.text;
    }

    // For DOCX, we'll extract text using a simple approach
    if (ext === '.docx') {
      // Basic DOCX text extraction (docx files are zip archives)
      const AdmZip = require('adm-zip');
      const zip = new AdmZip(filePath);
      const docXml = zip.readAsText('word/document.xml');
      // Remove XML tags to get plain text
      return docXml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    }

    return '';
  } catch (err) {
    console.error('Error parsing file:', err);
    return '';
  }
}

// Upload files
app.post('/api/files/upload', authenticateToken, upload.array('files', 5), async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: 'No files uploaded' });
    }

    const userId = req.user.id;
    const uploadedFiles = [];

    for (const file of req.files) {
      // Parse file content
      const content = await parseFileContent(file.path, file.mimetype, file.originalname);

      if (!content || content.length < 10) {
        // Delete file if we couldn't parse it
        fs.unlinkSync(file.path);
        continue;
      }

      const fileRecord = {
        id: `file-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        userId,
        filename: file.filename,
        originalName: file.originalname,
        mimeType: file.mimetype,
        size: file.size,
        content: content, // Store extracted text content
        wordCount: content.split(/\s+/).length,
        uploadedAt: new Date().toISOString()
      };

      safeDbWrite(db.get('userFiles').push(fileRecord));
      uploadedFiles.push({
        ...fileRecord,
        content: undefined // Don't send content back in response
      });
    }

    res.json({
      success: true,
      files: uploadedFiles,
      count: uploadedFiles.length
    });
  } catch (err) {
    console.error('Error uploading files:', err);
    res.status(500).json({ error: 'Failed to upload files' });
  }
});

// Get user's files
app.get('/api/files', authenticateToken, (req, res) => {
  try {
    const userId = req.user.id;
    const files = db.get('userFiles')
      .filter({ userId })
      .orderBy(['uploadedAt'], ['desc'])
      .value()
      .map(f => ({
        ...f,
        content: undefined // Don't send content in list
      }));

    res.json({ files, total: files.length });
  } catch (err) {
    console.error('Error fetching files:', err);
    res.status(500).json({ error: 'Failed to fetch files' });
  }
});

// Get single file with content
app.get('/api/files/:id', authenticateToken, (req, res) => {
  try {
    const userId = req.user.id;
    const fileId = req.params.id;

    const file = db.get('userFiles').find({ id: fileId, userId }).value();

    if (!file) {
      return res.status(404).json({ error: 'File not found' });
    }

    res.json(file);
  } catch (err) {
    console.error('Error fetching file:', err);
    res.status(500).json({ error: 'Failed to fetch file' });
  }
});

// Delete file
app.delete('/api/files/:id', authenticateToken, (req, res) => {
  try {
    const userId = req.user.id;
    const fileId = req.params.id;

    const file = db.get('userFiles').find({ id: fileId, userId }).value();

    if (!file) {
      return res.status(404).json({ error: 'File not found' });
    }

    // Delete physical file
    const filePath = path.join(UPLOADS_DIR, userId, file.filename);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    // Delete from database
    safeDbWrite(db.get('userFiles').remove({ id: fileId }));

    res.json({ success: true });
  } catch (err) {
    console.error('Error deleting file:', err);
    res.status(500).json({ error: 'Failed to delete file' });
  }
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// SECURITY: Validate URL to prevent SSRF attacks
function isValidExternalUrl(urlString) {
  try {
    const url = new URL(urlString);

    // Only allow http and https
    if (!['http:', 'https:'].includes(url.protocol)) {
      return false;
    }

    // Block internal/private IP ranges
    const hostname = url.hostname.toLowerCase();

    // Block localhost variants
    if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1') {
      return false;
    }

    // Block private IP ranges (10.x.x.x, 172.16-31.x.x, 192.168.x.x)
    const ipv4Regex = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
    const ipMatch = hostname.match(ipv4Regex);
    if (ipMatch) {
      const [, a, b] = ipMatch.map(Number);
      if (a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || a === 127) {
        return false;
      }
      // Block 0.0.0.0 and 169.254.x.x (link-local)
      if (a === 0 || a === 169) {
        return false;
      }
    }

    // Block internal service names
    const blockedHostnames = ['metadata', 'metadata.google', 'metadata.google.internal', '169.254.169.254'];
    if (blockedHostnames.some(blocked => hostname.includes(blocked))) {
      return false;
    }

    return true;
  } catch {
    return false;
  }
}

// Extract full article content using Readability
// Site-specific extraction issues
const PROBLEMATIC_SITES = {
  'medium.com': {
    reason: 'paywall',
    message: 'Medium articles often require a subscription or have limited free views.',
    canUseAlternative: true
  },
  'uxplanet.org': {
    reason: 'paywall',
    message: 'UX Planet (Medium) articles may require a subscription.',
    canUseAlternative: true
  },
  'towardsdatascience.com': {
    reason: 'paywall',
    message: 'Towards Data Science (Medium) articles may require a subscription.',
    canUseAlternative: true
  },
  'levelup.gitconnected.com': {
    reason: 'paywall',
    message: 'Level Up Coding (Medium) articles may require a subscription.',
    canUseAlternative: true
  },
  'betterprogramming.pub': {
    reason: 'paywall',
    message: 'Better Programming (Medium) articles may require a subscription.',
    canUseAlternative: true
  },
  'techinasia.com': {
    reason: 'paywall',
    message: 'Tech in Asia articles are behind a paywall.',
    canUseAlternative: true
  },
  'bloomberg.com': {
    reason: 'paywall',
    message: 'Bloomberg articles require a subscription.',
    canUseAlternative: true
  },
  'wsj.com': {
    reason: 'paywall',
    message: 'Wall Street Journal articles require a subscription.',
    canUseAlternative: true
  },
  'nytimes.com': {
    reason: 'paywall',
    message: 'New York Times articles require a subscription.',
    canUseAlternative: true
  },
  'ft.com': {
    reason: 'paywall',
    message: 'Financial Times articles require a subscription.',
    canUseAlternative: true
  },
  'hbr.org': {
    reason: 'paywall',
    message: 'Harvard Business Review articles may require a subscription.',
    canUseAlternative: true
  },
  'linkedin.com': {
    reason: 'auth_required',
    message: 'LinkedIn content requires login to view.',
    canUseAlternative: false
  },
  'twitter.com': {
    reason: 'javascript_required',
    message: 'Twitter/X content requires JavaScript to render.',
    canUseAlternative: false
  },
  'x.com': {
    reason: 'javascript_required',
    message: 'Twitter/X content requires JavaScript to render.',
    canUseAlternative: false
  },
  'instagram.com': {
    reason: 'auth_required',
    message: 'Instagram content requires login to view.',
    canUseAlternative: false
  },
  'facebook.com': {
    reason: 'auth_required',
    message: 'Facebook content requires login to view.',
    canUseAlternative: false
  }
};

function getProblematicSiteInfo(url) {
  try {
    const hostname = new URL(url).hostname.toLowerCase();
    // Check exact match first, then try without www.
    for (const [site, info] of Object.entries(PROBLEMATIC_SITES)) {
      if (hostname === site || hostname === `www.${site}` || hostname.endsWith(`.${site}`)) {
        return { site, ...info };
      }
    }
    // Check if it's a Medium subdomain
    if (hostname.endsWith('.medium.com')) {
      return {
        site: hostname,
        reason: 'paywall',
        message: 'This Medium publication may require a subscription.',
        canUseAlternative: true
      };
    }
    return null;
  } catch {
    return null;
  }
}

app.get('/api/extract', async (req, res) => {
  try {
    const url = req.query.url;

    if (!url) {
      return res.status(400).json({ error: 'URL parameter is required', errorCode: 'MISSING_URL' });
    }

    // SECURITY: Validate URL to prevent SSRF
    if (!isValidExternalUrl(url)) {
      return res.status(400).json({ error: 'Invalid or blocked URL. Only public HTTP/HTTPS URLs are allowed.', errorCode: 'INVALID_URL' });
    }

    // Check for known problematic sites
    const siteInfo = getProblematicSiteInfo(url);

    // Fetch the article HTML
    let response;
    try {
      response = await axios.get(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.5',
          'Cache-Control': 'no-cache'
        },
        timeout: 15000,
        maxRedirects: 5,
        validateStatus: (status) => status >= 200 && status < 400
      });
    } catch (fetchErr) {
      console.error('Error fetching article:', fetchErr.message);

      // Provide specific error messages based on the error type
      if (fetchErr.code === 'ECONNABORTED' || fetchErr.message.includes('timeout')) {
        return res.status(504).json({
          error: 'The website took too long to respond. It may be temporarily unavailable.',
          errorCode: 'TIMEOUT',
          canUseAlternative: true,
          siteInfo
        });
      }

      if (fetchErr.response) {
        const status = fetchErr.response.status;
        if (status === 403) {
          return res.status(403).json({
            error: siteInfo?.message || 'This website blocks automated access. The content may require a subscription or login.',
            errorCode: 'ACCESS_DENIED',
            canUseAlternative: true,
            siteInfo
          });
        }
        if (status === 404) {
          return res.status(404).json({
            error: 'The article was not found. It may have been removed or the URL is incorrect.',
            errorCode: 'NOT_FOUND',
            canUseAlternative: false
          });
        }
        if (status === 429) {
          return res.status(429).json({
            error: 'Too many requests to this website. Please try again later.',
            errorCode: 'RATE_LIMITED',
            canUseAlternative: true,
            siteInfo
          });
        }
        if (status >= 500) {
          return res.status(502).json({
            error: 'The website is experiencing issues. Please try again later.',
            errorCode: 'SITE_ERROR',
            canUseAlternative: true,
            siteInfo
          });
        }
      }

      return res.status(500).json({
        error: siteInfo?.message || 'Unable to connect to the website. It may be temporarily unavailable.',
        errorCode: 'FETCH_FAILED',
        canUseAlternative: true,
        siteInfo
      });
    }

    // SECURITY: Validate redirect URL if there was a redirect
    if (response.request?.res?.responseUrl) {
      if (!isValidExternalUrl(response.request.res.responseUrl)) {
        return res.status(400).json({ error: 'Redirect to blocked URL detected', errorCode: 'BLOCKED_REDIRECT' });
      }
    }

    // Parse with JSDOM
    const dom = new JSDOM(response.data, { url });
    const reader = new Readability(dom.window.document);
    const article = reader.parse();

    if (!article) {
      // Readability couldn't parse the content
      return res.status(422).json({
        error: siteInfo?.message || 'Could not extract article content. The page may require JavaScript, have a paywall, or use an unsupported format.',
        errorCode: 'PARSE_FAILED',
        canUseAlternative: siteInfo?.canUseAlternative ?? true,
        siteInfo
      });
    }

    // Check if we got very little content (likely a paywall or login page)
    if (article.textContent && article.textContent.trim().length < 200) {
      return res.status(422).json({
        error: siteInfo?.message || 'The extracted content is too short. The article may be behind a paywall or require login.',
        errorCode: 'INSUFFICIENT_CONTENT',
        canUseAlternative: true,
        siteInfo
      });
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
    res.status(500).json({
      error: 'An unexpected error occurred while extracting the article.',
      errorCode: 'UNKNOWN_ERROR',
      canUseAlternative: true
    });
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

  console.log('\nPerforming initial smart feed fetch...');
  await smartFeedRefresh();

  // Schedule smart feed updates every 2 hours
  cron.schedule('0 */2 * * *', async () => {
    console.log('\n[CRON] Scheduled smart feed update starting...');
    await smartFeedRefresh();
  });

  // Schedule daily digest preparation at 6 AM
  cron.schedule('0 6 * * *', async () => {
    console.log('\n[CRON] Preparing daily email digests...');
    await prepareDailyDigests();
  });

  // Schedule weekly digest on Mondays at 8 AM
  cron.schedule('0 8 * * 1', async () => {
    console.log('\n[CRON] Preparing weekly email digests...');
    await prepareWeeklyDigests();
  });

  console.log('\n✓ Cron jobs scheduled:');
  console.log('  - Smart feed updates every 2 hours');
  console.log('  - Daily digest at 6 AM');
  console.log('  - Weekly digest on Mondays at 8 AM');
  console.log(`✓ ${cache.transcripts?.length || 0} Lenny's Podcast transcripts loaded`);
}

// Prepare daily digests (placeholder - actual sending requires email service)
async function prepareDailyDigests() {
  const subscribers = db.get('emailDigest.subscribers')
    .filter({ frequency: 'daily' })
    .value();

  console.log(`Preparing digests for ${subscribers.length} daily subscribers`);

  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const newArticles = db.get('articles')
    .filter(a => a.fetchedAt > cutoff)
    .orderBy(['pubDate'], ['desc'])
    .value();

  for (const sub of subscribers) {
    let articles = newArticles;

    // Filter by preferences
    if (sub.preferences?.categories?.length > 0) {
      articles = articles.filter(a => sub.preferences.categories.includes(a.category));
    }

    articles = articles.slice(0, sub.preferences?.maxArticles || 10);

    // Log digest preparation (actual email sending requires nodemailer or similar)
    console.log(`  - ${sub.email}: ${articles.length} articles ready`);

    // Update last sent timestamp
    safeDbWrite(
      db.get('emailDigest.subscribers')
        .find({ id: sub.id })
        .assign({ lastSent: new Date().toISOString() })
    );

    // Record sent digest
    safeDbWrite(
      db.get('emailDigest.sentDigests').push({
        id: `sent-${Date.now()}`,
        userId: sub.userId,
        sentAt: new Date().toISOString(),
        articlesIncluded: articles.map(a => a.id)
      })
    );
  }
}

// Prepare weekly digests
async function prepareWeeklyDigests() {
  const subscribers = db.get('emailDigest.subscribers')
    .filter({ frequency: 'weekly' })
    .value();

  console.log(`Preparing digests for ${subscribers.length} weekly subscribers`);

  const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const newArticles = db.get('articles')
    .filter(a => a.fetchedAt > cutoff)
    .orderBy(['pubDate'], ['desc'])
    .value();

  for (const sub of subscribers) {
    let articles = newArticles;

    if (sub.preferences?.categories?.length > 0) {
      articles = articles.filter(a => sub.preferences.categories.includes(a.category));
    }

    articles = articles.slice(0, sub.preferences?.maxArticles || 20);

    console.log(`  - ${sub.email}: ${articles.length} articles ready`);

    safeDbWrite(
      db.get('emailDigest.subscribers')
        .find({ id: sub.id })
        .assign({ lastSent: new Date().toISOString() })
    );

    safeDbWrite(
      db.get('emailDigest.sentDigests').push({
        id: `sent-${Date.now()}`,
        userId: sub.userId,
        sentAt: new Date().toISOString(),
        articlesIncluded: articles.map(a => a.id)
      })
    );
  }
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
