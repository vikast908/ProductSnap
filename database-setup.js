const low = require('lowdb');
const FileSync = require('lowdb/adapters/FileSync');
const path = require('path');

// Create database file path
const dbPath = path.join(__dirname, 'content-aggregator.json');
const adapter = new FileSync(dbPath);
const db = low(adapter);

console.log('Setting up database...');

// Initialize database structure
db.defaults({
  feeds: [],
  articles: [],
  metadata: {
    created: new Date().toISOString(),
    lastUpdate: new Date().toISOString()
  }
}).write();

console.log('✓ Database structure created');
console.log(`✓ Database file: ${dbPath}`);

// Get stats
const feedCount = db.get('feeds').size().value();
const articleCount = db.get('articles').size().value();

console.log(`\nCurrent Stats:`);
console.log(`  Feeds: ${feedCount}`);
console.log(`  Articles: ${articleCount}`);

console.log('\nDatabase setup complete!');
