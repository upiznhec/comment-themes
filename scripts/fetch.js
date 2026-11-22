#!/usr/bin/env node

// Reads every comment of the posts in a request (data/runs/<name>/request.json) into the database
// (data/comments.jsonl).
// Usage:
//   node scripts/fetch.js --run <name> --plan   shows, for each post, its comment count where the platform gives
//                                               one, what reading it costs, and which keys or answers are missing;
//                                               reads no comments (a YouTube lookup costs 1 free unit, an X lookup
//                                               US$0.005)
//   node scripts/fetch.js --run <name>          reads them all
//   options: --platform <name>  --post <part of a link>  --max-pages <n> (comment pages per post, default 30)
//            --no-replies (YouTube)
// Own TikTok videos with the route "mcp" are read by the agent through the TikTok Social connector; this
// script only lists them. Prints counts and costs, never comment text or names.
// While reading, it prints a line as each post starts and every 10 pages, so that a long read run in the
// background shows how far it has got (in a test, 156 ScrapeCreators pages took 11 minutes). What each post
// says itself (caption, title or text, where the platform gives it) is kept in data/runs/<name>/posts.json
// for the analysis.
const fs = require('fs');
const path = require('path');
const { getDataDir, loadEnvFile } = require('./lib/env-file');
const { addRecords, withoutText } = require('./lib/db');
const { runDir } = require('./lib/runs');
const { loadRequest } = require('./lib/sources');
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
// Rough comments per ScrapeCreators page, for the estimate.
const PER_PAGE = { instagram: 12, tiktok: 18, facebook: 10, reddit: 15 };

// --name value or --name=value
function arg(name, fallback) {
  const i = process.argv.findIndex(item => item === `--${name}` || item.startsWith(`--${name}=`));
  if (i < 0) return fallback;
  const item = process.argv[i];
  return item.includes('=') ? item.slice(item.indexOf('=') + 1) : process.argv[i + 1];
}

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

// The line for one post after reading it. Comments without any text are not stored, so it says how many.
function readSummary(records, post) {
  const blank = withoutText(records);
  return `${plural(records.length, 'comment')} read${typeof post.comments === 'number' ? ` (the post shows ${post.comments})` : ''}`
    + (blank ? `; ${blank} of them ${blank === 1 ? 'has' : 'have'} no text and ${blank === 1 ? 'is' : 'are'} not stored` : '');
}

// Keeps what each post says in data/runs/<name>/posts.json, by its link as written in the request. A later
// read that could not get the text keeps the text read before.
function savePosts(name, dataDir, posts) {
  if (!posts.length) return;
  const file = path.join(runDir(name, dataDir), 'posts.json');
  let saved = [];
  try { saved = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (error) { saved = []; }
  const byUrl = new Map((Array.isArray(saved) ? saved : []).map(post => [post.url, post]));
  for (const post of posts) {
    const old = byUrl.get(post.url) || {};
    byUrl.set(post.url, {
      platform: post.platform, url: post.url, time: post.time || old.time || null,
      comments_shown: typeof post.comments === 'number' ? post.comments : old.comments_shown ?? null,
      title: post.title ?? old.title ?? null, text: post.text ?? old.text ?? null
    });
  }
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  fs.writeFileSync(file, JSON.stringify([...byUrl.values()], null, 2) + '\n', { mode: 0o600 });
}

// What reading one post's comments costs, from its comment count and the page limit.
function estimate(entry, post, maxPages) {
  const n = post.comments;
  if (entry.route === 'scrapecreators') {
    // Reddit's post text comes with its comments; the others cost 1 more credit for it.
    const own = entry.platform === 'reddit' ? 0 : 1;
    return `about 1 ScrapeCreators credit for every ${PER_PAGE[entry.platform]} comments${own ? ', plus 1 for the post\'s own text' : ''}, at most ${plural(maxPages + own, 'credit')} for this post (the count is known only after reading)`;
  }
  if (entry.platform === 'x') {
    // X's count is of direct replies only; the conversation search also returns replies to replies.
    const cap = maxPages * 100;
    if (n > cap) return `at most about US$${(cap * 0.015).toFixed(2)} of X credit: X shows ${n} direct replies, more than the ${cap} replies read at most, so the ${cap} most relevant are read ($0.005 each, plus $0.010 for each different replier)`;
    return `about US$${(n * 0.015).toFixed(2)} of X credit for the ${n} ${n === 1 ? 'reply' : 'replies'} X shows ($0.005 each, plus $0.010 for each different replier); X counts only direct replies, and replies to replies are read too at the same price, so it can cost more`;
  }
  if (entry.platform === 'youtube') {
    const units = Math.min(Math.ceil(n / 100), maxPages) + 1;
    const partial = n > maxPages * 100 ? `; with more than ${maxPages * 100} comments it may be read only in part (up to ${maxPages * 100} comment threads, top comments first)` : '';
    const quota = units > 9000 ? '; more than one day\'s 10,000 free units: the read stops when they run out, and running it again the next day continues, keeping what was read' : '';
    return `about ${plural(units, 'YouTube quota unit')} or more for long reply threads (free)${partial}${quota}`;
  }
  return 'free';
}

async function main() {
  const name = arg('run');
  if (!name) { console.log('Usage: node scripts/fetch.js --run <name> [--plan] (the run folder holds the request, see AGENTS.md)'); process.exit(2); }
  const dataDir = getDataDir();
  loadEnvFile(dataDir);
  const plan = process.argv.includes('--plan');
  const onlyPlatform = arg('platform');
  const onlyPost = String(arg('post', '')).toLowerCase();
  let request;
  try { request = loadRequest(name, dataDir); } catch (error) { console.log(error.message); process.exit(1); }
  request.problems.forEach(problem => console.log(`Not read yet: ${problem}`));
  const chosen = request.entries.filter(e => (!onlyPlatform || e.platform === onlyPlatform) && (!onlyPost || e.url.toLowerCase().includes(onlyPost)));
  const ctx = { env: process.env, plan, maxPages: Number(arg('max-pages', 30)), noReplies: process.argv.includes('--no-replies'), cost: newCost(), notes: [] };
  ctx.progress = (entry, pages, count) => {
    if (pages % 10 === 0) console.log(`  ${entry.platform} ${entry.url}: ${plural(pages, 'page')} read, ${plural(count, 'comment')} so far`);
  };
  console.log(`${plan ? 'Plan' : 'Reading'} for ${name}: ${plural(chosen.length, 'post')}; every comment of each is read.`);
  const all = [];
  const readPosts = [];
  for (const entry of chosen) {
    const label = `${entry.platform} (${entry.own === true ? 'own' : entry.own === false ? 'not own' : 'owner not said'}, ${entry.route}) ${entry.url}`;
    if (entry.route === 'mcp') {
      console.log(`${label}: read by the agent through the TikTok Social connector, then imported with import.js --tiktok-mcp <file> --post <this link>.`);
      continue;
    }
    const missing = (NEEDS[entry.route === 'scrapecreators' ? 'scrapecreators' : entry.platform] || []).filter(key => !process.env[key]);
    if (missing.length) { console.log(`${label}: not read, key not saved yet: ${missing.join(', ')}`); continue; }
    try {
      if (!plan) console.log(`${label}: reading`);
      const { posts: [post], records, skipped } = await READERS[`${entry.platform}:${entry.route}`].read(entry, ctx);
      if (skipped) console.log(`${label}: skipped, ${skipped}.`);
      else if (plan) console.log(`${label}: ${post.comments ?? 'unknown number of'} comments; reading them: ${post.comments === 0 ? 'nothing to read' : estimate(entry, post, ctx.maxPages)}.`);
      else console.log(`${label}: ${readSummary(records, post)}.`);
      if (!plan && post) readPosts.push(post);
      all.push(...records);
    } catch (error) {
      console.log(`${label}: stopped: ${error.message}`);
    }
  }
  if (!plan) {
    const result = addRecords(all, dataDir);
    console.log(`Database: ${result.added} new, ${result.updated} updated, ${result.total} comments in all.`);
    savePosts(name, dataDir, readPosts);
  }
  ctx.notes.forEach(note => console.log(`Note: ${note}`));
  const c = ctx.cost;
  const costs = [];
  if (c.scrapecreatorsCharged || c.scrapecreatorsLeft !== null) costs.push(`ScrapeCreators ${plural(c.scrapecreatorsCharged, 'credit')} used${c.scrapecreatorsLeft !== null ? `, ${c.scrapecreatorsLeft} left` : ''}`);
  if (c.youtubeUnits) costs.push(`YouTube ${c.youtubeUnits} quota units (free)`);
  if (c.xPosts || c.xUsers) costs.push(`X about US$${(c.xPosts * 0.005 + c.xUsers * 0.01).toFixed(3)} (${c.xPosts} posts, ${c.xUsers} users)`);
  console.log(`Cost of this run: ${costs.join('; ') || 'nothing'}.`);
}

if (require.main === module) main();

module.exports = { estimate, readSummary, savePosts };
