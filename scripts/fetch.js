#!/usr/bin/env node

// Reads the comments of a request (data/runs/<name>/request.json) into the database (data/comments.jsonl):
// every comment of each listed post, and of each post its accounts published in the time range.
// Usage:
//   node scripts/fetch.js --run <name> --plan   finds the accounts' posts in the time range and shows, for each
//                                               post, its number of comments where the platform gives one, what
//                                               reading costs, and which keys or answers are missing; reads no
//                                               comments. Finding posts can cost a little (see AGENTS.md).
//   node scripts/fetch.js --run <name>          reads them all (the accounts' posts found by the plan, if it ran
//                                               in the last 24 hours, else it finds them again)
//   options: --platform <name>  --post <part of a link>  --max-pages <n> (comment pages per post, default 30)
//            --no-replies (YouTube)
// Own TikTok videos and accounts with the route "mcp" are read by the agent through the TikTok Social
// connector; this script only lists them. Prints counts and costs, never comment text or names.
const fs = require('fs');
const { getDataDir, loadEnvFile } = require('./lib/env-file');
const { addRecords } = require('./lib/db');
const { foundPath, loadFound, loadRequest } = require('./lib/sources');
const { newCost } = require('./platforms/common');

const youtube = require('./platforms/youtube');
const meta = require('./platforms/meta');
const x = require('./platforms/x');
const sc = require('./platforms/scrapecreators');

const MODULES = {
  'youtube:official': youtube, 'instagram:official': meta, 'facebook:official': meta, 'x:official': x,
  'instagram:scrapecreators': sc, 'tiktok:scrapecreators': sc, 'facebook:scrapecreators': sc, 'reddit:scrapecreators': sc
};
const NEEDS = {
  youtube: ['YOUTUBE_API_KEY'], x: ['X_BEARER_TOKEN'], scrapecreators: ['SCRAPECREATORS_API_KEY'],
  instagram: ['META_PAGE_TOKEN'], facebook: ['META_PAGE_TOKEN', 'META_PAGE_ID']
};
// Rough comments per page, for the estimates.
const PER_PAGE = { instagram: 12, tiktok: 18, facebook: 10, reddit: 15 };
const DAY = 86400000;

// --name value or --name=value
function arg(name, fallback) {
  const i = process.argv.findIndex(item => item === `--${name}` || item.startsWith(`--${name}=`));
  if (i < 0) return fallback;
  const item = process.argv[i];
  return item.includes('=') ? item.slice(item.indexOf('=') + 1) : process.argv[i + 1];
}

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

// What reading the comments of these posts costs, from their comment counts and the page limit.
function estimate(item, posts, maxPages) {
  const counted = posts.filter(p => typeof p.comments === 'number');
  const total = counted.reduce((sum, p) => sum + p.comments, 0);
  if (item.route === 'scrapecreators') {
    const per = PER_PAGE[item.platform];
    if (counted.length < posts.length) {
      const unknown = posts.length - counted.length;
      return `about 1 ScrapeCreators credit for every ${per} comments, at most ${plural(maxPages * unknown, 'credit')} for ${unknown === 1 ? 'this post' : `the ${unknown} posts`} (the count is known only after reading)`;
    }
    const credits = counted.reduce((sum, p) => sum + Math.min(Math.ceil(p.comments / per), maxPages), 0);
    const readable = counted.reduce((sum, p) => sum + Math.min(p.comments, maxPages * per), 0);
    return `about ${plural(credits, 'ScrapeCreators credit')}${readable < total ? ` (the first ${readable} of ${total} comments: at most ${maxPages} pages a post)` : ''}`;
  }
  if (item.platform === 'x') return `at most about US$${(total * 0.015).toFixed(2)} of X credit (${total} replies at $0.005, plus $0.010 for each different replier)`;
  if (item.platform === 'youtube') {
    const units = counted.reduce((sum, p) => sum + Math.min(Math.ceil(p.comments / 100), maxPages), 0);
    const capped = counted.filter(p => p.comments > maxPages * 100).length;
    const quota = units > 9000 ? '; more than one day\'s 10,000 free units: the read stops when they run out, and running it again the next day continues, keeping what was read' : '';
    return `about ${plural(units, 'YouTube quota unit')} or more for long reply threads (free)${capped ? `; ${plural(capped, 'video')} with more than ${maxPages * 100} comments may be read only in part (up to ${maxPages * 100} comment threads each)` : ''}${quota}`;
  }
  return 'free';
}

function ownLabel(item) {
  return item.own === true ? 'own' : item.own === false ? 'not own' : 'owner not said';
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
  const ctx = {
    env: process.env, plan, window: request.window, maxPages: Number(arg('max-pages', 30)), listPages: 20,
    noReplies: process.argv.includes('--no-replies'), cost: newCost(), notes: []
  };
  const posts = request.entries.filter(e => (!onlyPlatform || e.platform === onlyPlatform) && (!onlyPost || e.url.toLowerCase().includes(onlyPost)));
  const accounts = onlyPost ? [] : request.accounts.filter(a => !onlyPlatform || a.platform === onlyPlatform);
  const parts = [posts.length && plural(posts.length, 'post link'), accounts.length && `${plural(accounts.length, 'account')} (posts from ${request.window.label})`].filter(Boolean);
  console.log(`${plan ? 'Plan' : 'Reading'} for ${name}: ${parts.join(' and ') || 'nothing'}; every comment of each post is read.`);
  const all = [];
  const keysMissing = item => (NEEDS[item.route === 'scrapecreators' ? 'scrapecreators' : item.platform] || []).filter(key => !process.env[key]);

  for (const entry of posts) {
    const label = `${entry.platform} (${ownLabel(entry)}, ${entry.route}) ${entry.url}`;
    if (entry.route === 'mcp') { console.log(`${label}: read by the agent through the TikTok Social connector, then imported with import.js --tiktok-mcp <file> --post <this link>.`); continue; }
    const missing = keysMissing(entry);
    if (missing.length) { console.log(`${label}: not read, key not saved yet: ${missing.join(', ')}`); continue; }
    try {
      const { posts: [post], records, skipped } = await MODULES[`${entry.platform}:${entry.route}`].read(entry, ctx);
      if (skipped) console.log(`${label}: skipped, ${skipped}.`);
      else if (plan) console.log(`${label}: ${post.comments ?? 'unknown number of'} comments; reading them: ${post.comments === 0 ? 'nothing to read' : estimate(entry, [post], ctx.maxPages)}.`);
      else console.log(`${label}: ${records.length} comments read${typeof post.comments === 'number' ? ` (the post shows ${post.comments})` : ''}.`);
      all.push(...records);
    } catch (error) {
      console.log(`${label}: stopped: ${error.message}`);
    }
  }

  // The accounts' posts: found by the plan and kept in posts.json, so that the read covers what the plan showed.
  const key = JSON.stringify(request.time);
  const saved = loadFound(name, dataDir);
  const fresh = saved && saved.time === key && Date.now() - Date.parse(saved.found_at) < DAY ? saved : null;
  const found = { time: key, found_at: new Date().toISOString(), accounts: {} };
  for (const account of accounts) {
    const id = `${account.platform}:${account.account}`;
    const label = `${account.platform} account ${account.account} (${ownLabel(account)}, ${account.route})`;
    if (account.route === 'mcp') { console.log(`${label}: listed and read by the agent through the TikTok Social connector (AGENTS.md).`); continue; }
    const missing = keysMissing(account);
    if (missing.length) { console.log(`${label}: not read, key not saved yet: ${missing.join(', ')}`); continue; }
    const module = MODULES[`${account.platform}:${account.route}`];
    try {
      let group = !plan && fresh?.accounts?.[id];
      if (!group) group = await module.list(account, ctx);
      found.accounts[id] = { account: group.account || account.account, posts: group.posts, skipped: group.skipped || null };
      if (group.skipped) { console.log(`${label}: skipped, ${group.skipped}.`); continue; }
      const withComments = group.posts.filter(p => p.comments !== 0);
      if (plan) {
        console.log(`${label}: ${plural(group.posts.length, 'post')} from ${request.window.label}, ${withComments.length} with comments; comments: ${group.posts.map(p => p.comments ?? '?').join(', ') || 'none'}; reading them: ${withComments.length ? estimate(account, withComments, ctx.maxPages) : 'nothing to read'}.`);
        continue;
      }
      const entry = { platform: account.platform, route: account.route, own: account.own, account: group.account || account.account };
      let read = 0;
      for (const post of withComments) {
        const records = await module.comments(post, { ...entry, url: post.url }, ctx);
        read += records.length;
        all.push(...records);
      }
      console.log(`${label}: ${plural(group.posts.length, 'post')} from ${request.window.label}, ${read} comments read.`);
    } catch (error) {
      console.log(`${label}: stopped: ${error.message}`);
    }
  }
  if (Object.keys(found.accounts).length) {
    const kept = { ...found, accounts: { ...(fresh?.accounts || {}), ...found.accounts } };
    fs.writeFileSync(foundPath(name, dataDir), JSON.stringify(kept, null, 2) + '\n', { mode: 0o600 });
  }

  if (!plan) {
    const result = addRecords(all, dataDir);
    console.log(`Database: ${result.added} new, ${result.updated} updated, ${result.total} comments in all.`);
  }
  ctx.notes.forEach(note => console.log(`Note: ${note}`));
  const c = ctx.cost;
  const costs = [];
  if (c.scrapecreatorsCharged || c.scrapecreatorsLeft !== null) costs.push(`ScrapeCreators ${plural(c.scrapecreatorsCharged, 'credit')} used${c.scrapecreatorsLeft !== null ? `, ${c.scrapecreatorsLeft} left` : ''}`);
  if (c.youtubeUnits) costs.push(`YouTube ${c.youtubeUnits} quota units (free)`);
  if (c.xPosts || c.xUsers) costs.push(`X about US$${(c.xPosts * 0.005 + c.xUsers * 0.01).toFixed(3)} (${c.xPosts} posts, ${c.xUsers} users)`);
  console.log(`Cost of this run: ${costs.join('; ') || 'nothing'}.`);
}

main();
