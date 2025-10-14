const express = require('express');
const cors = require('cors');
const RSSParser = require('rss-parser');
const low = require('lowdb');
const FileSync = require('lowdb/adapters/FileSync');
const cron = require('node-cron');
const path = require('path');
const axios = require('axios');
const { JSDOM } = require('jsdom');
const { Readability } = require('@mozilla/readability');

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

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'client', 'dist')));

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
  }
];

// Initialize database
function initDatabase() {
  db.defaults({
    feeds: [],
    articles: [],
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

    db.get('feeds')
      .find({ id: feed.id })
      .assign({
        lastFetched: new Date().toISOString(),
        fetchCount: (feed.fetchCount || 0) + 1,
        errorCount: 0
      })
      .write();

    return {
      feed: feed,
      items: rssFeed.items || []
    };
  } catch (err) {
    console.error(`Error fetching ${feed.name}:`, err.message);

    db.get('feeds')
      .find({ id: feed.id })
      .assign({
        lastFetched: new Date().toISOString(),
        errorCount: (feed.errorCount || 0) + 1
      })
      .write();

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
      }).write();

      savedCount++;
    } catch (err) {
      console.error(`Error saving article: ${err.message}`);
    }
  }

  return savedCount;
}

// Fetch all active feeds
async function fetchAllFeeds() {
  console.log('\n=== Starting RSS Feed Fetch ===');
  const startTime = Date.now();

  const feeds = db.get('feeds').filter({ active: true }).value();
  console.log(`Found ${feeds.length} active feeds`);

  let totalArticles = 0;
  let successCount = 0;
  let errorCount = 0;

  for (const feed of feeds) {
    const result = await fetchFeed(feed);

    if (result && result.items.length > 0) {
      const saved = saveArticles(feed.id, result.items, feed.category, feed.name);
      totalArticles += saved;
      successCount++;
      console.log(`  ✓ ${feed.name}: ${saved} new articles`);
    } else if (result) {
      successCount++;
      console.log(`  ○ ${feed.name}: No new articles`);
    } else {
      errorCount++;
      console.log(`  ✗ ${feed.name}: Failed`);
    }

    // Small delay between requests
    await new Promise(resolve => setTimeout(resolve, 300));
  }

  db.set('metadata.lastUpdate', new Date().toISOString()).write();

  const duration = ((Date.now() - startTime) / 1000).toFixed(2);
  console.log(`\n=== Fetch Complete ===`);
  console.log(`Duration: ${duration}s`);
  console.log(`Success: ${successCount}, Errors: ${errorCount}`);
  console.log(`Total new articles: ${totalArticles}`);

  return { totalArticles, successCount, errorCount };
}

// API Routes

app.get('/api/articles', (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const category = req.query.category;
    const search = req.query.search?.toLowerCase();
    const offset = (page - 1) * limit;

    let articles = db.get('articles').value();

    if (category) {
      articles = articles.filter(a => a.category === category);
    }

    if (search) {
      articles = articles.filter(a =>
        a.title.toLowerCase().includes(search) ||
        a.description.toLowerCase().includes(search) ||
        (a.content && a.content.toLowerCase().includes(search))
      );
    }

    articles.sort((a, b) => new Date(b.pubDate) - new Date(a.pubDate));

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
    const articles = db.get('articles').value();
    const categoryMap = {};

    articles.forEach(article => {
      categoryMap[article.category] = (categoryMap[article.category] || 0) + 1;
    });

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

app.get('/api/feeds', (req, res) => {
  try {
    const feeds = db.get('feeds').value();
    const articles = db.get('articles').value();

    const feedsWithCounts = feeds.map(feed => ({
      ...feed,
      articleCount: articles.filter(a => a.feedId === feed.id).length
    })).sort((a, b) => a.name.localeCompare(b.name));

    res.json(feedsWithCounts);
  } catch (err) {
    console.error('Error fetching feeds:', err);
    res.status(500).json({ error: 'Failed to fetch feeds' });
  }
});

app.get('/api/stats', (req, res) => {
  try {
    const articles = db.get('articles').value();
    const feeds = db.get('feeds').value();
    const metadata = db.get('metadata').value();

    const dates = articles.map(a => new Date(a.pubDate)).filter(d => !isNaN(d));

    const stats = {
      totalArticles: articles.length,
      totalFeeds: feeds.length,
      activeFeeds: feeds.filter(f => f.active).length,
      categories: new Set(articles.map(a => a.category)).size,
      latestArticle: dates.length > 0 ? new Date(Math.max(...dates)).toISOString() : null,
      oldestArticle: dates.length > 0 ? new Date(Math.min(...dates)).toISOString() : null,
      lastUpdate: metadata?.lastUpdate || null
    };

    res.json(stats);
  } catch (err) {
    console.error('Error fetching stats:', err);
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

app.post('/api/refresh', async (req, res) => {
  try {
    console.log('Manual refresh triggered');
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
  console.log('Initializing Everything Product - Democratizing Product Knowledge\n');

  initDatabase();
  initializeFeeds();

  console.log('\nPerforming initial feed fetch...');
  await fetchAllFeeds();

  // Schedule automatic updates every 2 hours for comprehensive coverage
  cron.schedule('0 */2 * * *', async () => {
    console.log('\n[CRON] Scheduled feed update starting...');
    await fetchAllFeeds();
  });

  console.log('\n✓ Cron job scheduled: Feed updates every 2 hours');
}

// Start server
const PORT = process.env.PORT || 3000;

app.listen(PORT, async () => {
  console.log(`\n${'='.repeat(70)}`);
  console.log('Everything Product - Content Aggregator');
  console.log('Democratizing Product Management Knowledge');
  console.log(`${'='.repeat(70)}\n`);
  console.log(`Server: http://localhost:${PORT}`);
  console.log(`\nAPI Endpoints:`);
  console.log(`  GET  /api/articles       - Get all articles`);
  console.log(`  GET  /api/articles/:id   - Get single article`);
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
