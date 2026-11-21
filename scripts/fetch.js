#!/usr/bin/env node

// Reads the comments listed in data/sources.json into the database (data/comments.jsonl).
// Usage:
//   node scripts/fetch.js --plan          lists the posts in the window and their comment counts, with what a
//                                         full read would cost; reads no comments (listing itself costs a little)
//   node scripts/fetch.js                 reads them all
//   options: --platform=<name>  --max-pages=<n> (per post, default 30)  --no-replies (YouTube)
// TikTok entries with "route": "mcp" are read by the agent through the TikTok Social connector; this
// script only lists them. Prints counts and costs, never comment text or names.
const { getDataDir, loadEnvFile } = require('./lib/env-file');
const { addRecords } = require('./lib/db');
const { loadSources } = require('./lib/sources');
const { newCost } = require('./platforms/common');

const READERS = {
  'youtube:official': require('./platforms/youtube'),
  'instagram:official': require('./platforms/meta'),
  'facebook:official': require('./platforms/meta'),
  'x:official': require('./platforms/x'),
  'instagram:scrapecreators': require('./platforms/scrapecreators'),
  'tiktok:scrapecreators': require('./platforms/scrapecreators'),
  'facebook:scrapecreators': require('./platforms/scrapecreators'),
  'reddit:scrapecreators': require('./platforms/scrapecreators')
};
const NEEDS = {
  youtube: ['YOUTUBE_API_KEY'], x: ['X_BEARER_TOKEN'], scrapecreators: ['SCRAPECREATORS_API_KEY'],
  instagram: ['META_PAGE_TOKEN'], facebook: ['META_PAGE_TOKEN', 'META_PAGE_ID']
};
// Rough comments per ScrapeCreators page, for the --plan estimate.
const PER_PAGE = { instagram: 12, tiktok: 18, facebook: 10, reddit: 15 };

function arg(name, fallback) {
  const found = process.argv.find(item => item.startsWith(`--${name}=`));
  return found ? found.slice(name.length + 3) : fallback;
}

function estimate(entry, posts) {
  const counted = posts.filter(post => typeof post.comments === 'number');
  const comments = counted.reduce((sum, post) => sum + post.comments, 0);
  if (entry.route === 'scrapecreators') {
    if (counted.length < posts.length) return `not known before reading a post link: 1 ScrapeCreators credit for about every ${PER_PAGE[entry.platform]} comments`;
    return `about ${counted.reduce((sum, post) => sum + Math.ceil(post.comments / PER_PAGE[entry.platform]), 0)} ScrapeCreators credits`;
  }
  if (entry.platform === 'x') return `at most about US$${(comments * 0.015).toFixed(2)} of X credit (${comments} replies at $0.005, plus $0.010 for each different replier)`;
  if (entry.platform === 'youtube') return `about ${counted.reduce((sum, post) => sum + Math.ceil(post.comments / 100), 0) + 1} YouTube quota units (free)`;
  return 'free';
}

async function main() {
  const dataDir = getDataDir();
  loadEnvFile(dataDir);
  const plan = process.argv.includes('--plan');
  const only = arg('platform');
  const { since, entries, problems } = loadSources(dataDir);
  problems.forEach(problem => console.log(`Skipped: ${problem}`));
  const ctx = { since, env: process.env, plan, maxPages: Number(arg('max-pages', 30)), noReplies: process.argv.includes('--no-replies'), cost: newCost(), notes: [] };
  console.log(`${plan ? 'Plan' : 'Reading'}: posts published since ${since.slice(0, 10)}.`);
  const all = [];
  for (const entry of entries.filter(e => !only || e.platform === only)) {
    const label = `${entry.platform} ${entry.kind === 'post' ? entry.url : entry.account} (${entry.own ? 'own' : 'other'}, ${entry.route})`;
    if (entry.route === 'mcp') {
      console.log(`${label}: read by the agent through the TikTok Social connector, then imported with import.js --tiktok-mcp.`);
      continue;
    }
    const missing = (NEEDS[entry.route === 'scrapecreators' ? 'scrapecreators' : entry.platform] || []).filter(name => !process.env[name]);
    if (missing.length) { console.log(`${label}: skipped, not saved yet: ${missing.join(', ')}`); continue; }
    try {
      const { posts, records } = await READERS[`${entry.platform}:${entry.route}`].read(entry, ctx);
      const withComments = posts.filter(post => post.comments !== 0).length;
      if (plan) console.log(`${label}: ${posts.length} posts, ${withComments} with comments; comments: ${posts.map(p => p.comments ?? '?').join(', ') || 'none'}; full read: ${estimate(entry, posts)}.`);
      else console.log(`${label}: ${posts.length} posts, ${records.length} comments read.`);
      all.push(...records);
    } catch (error) {
      console.log(`${label}: stopped: ${error.message}`);
    }
  }
  if (!plan) {
    const result = addRecords(all, dataDir);
    console.log(`Database: ${result.added} new, ${result.updated} updated, ${result.total} comments in all.`);
  }
  ctx.notes.forEach(note => console.log(`Note: ${note}`));
  const c = ctx.cost;
  const costs = [];
  if (c.scrapecreatorsCharged || c.scrapecreatorsLeft !== null) costs.push(`ScrapeCreators ${c.scrapecreatorsCharged} credits used${c.scrapecreatorsLeft !== null ? `, ${c.scrapecreatorsLeft} left` : ''}`);
  if (c.youtubeUnits) costs.push(`YouTube ${c.youtubeUnits} quota units`);
  if (c.xPosts || c.xUsers) costs.push(`X about US$${(c.xPosts * 0.005 + c.xUsers * 0.01).toFixed(2)} (${c.xPosts} posts, ${c.xUsers} users)`);
  console.log(`Cost of this run: ${costs.join('; ') || 'nothing'}.`);
}

main();
