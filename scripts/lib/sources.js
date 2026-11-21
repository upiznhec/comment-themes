// What to read for one request: data/runs/<name>/request.json, written by the agent from the person's message.
// A request lists post links ("posts"), whose every comment is read, like ScrapeCreators' comment-mining, and/or
// accounts ("accounts") with a time range ("time"), whose every post published in that range is read in full.
// Each post or account says whether it is the person's own ("own": true or false); for Instagram, Facebook and
// TikTok that is required, because it decides the route. Own Instagram and Facebook posts are read by
// "official" or "scrapecreators", own TikTok videos by "mcp" (the TikTok Social connector, which the agent
// calls) or "scrapecreators": the route comes from the item itself or from the person's remembered choice in
// data/choices.json. Other people's posts on those three platforms go through ScrapeCreators. YouTube and X
// are always official, Reddit always ScrapeCreators (by post link only).
const fs = require('fs');
const path = require('path');
const { getDataDir } = require('./env-file');
const { runDir } = require('./runs');

const PLATFORMS = ['youtube', 'instagram', 'facebook', 'tiktok', 'x', 'reddit'];
const FIXED_ROUTE = { youtube: 'official', x: 'official', reddit: 'scrapecreators' };
const ROUTES = {
  instagram: ['official', 'scrapecreators'],
  facebook: ['official', 'scrapecreators'],
  tiktok: ['mcp', 'scrapecreators']
};

function platformOfUrl(url) {
  const host = (() => { try { return new URL(url).hostname.replace(/^www\.|^m\./, ''); } catch (error) { return ''; } })();
  if (/(^|\.)youtube\.com$|^youtu\.be$/.test(host)) return 'youtube';
  if (/(^|\.)instagram\.com$/.test(host)) return 'instagram';
  if (/(^|\.)facebook\.com$|^fb\.watch$/.test(host)) return 'facebook';
  if (/(^|\.)tiktok\.com$/.test(host)) return 'tiktok';
  if (/(^|\.)(x|twitter)\.com$/.test(host)) return 'x';
  if (/(^|\.)reddit\.com$|^redd\.it$/.test(host)) return 'reddit';
  return null;
}

// The account a link belongs to, when the link says it (TikTok, X, Reddit); null otherwise.
function accountOfUrl(url) {
  const match = String(url || '').match(/tiktok\.com\/(@[\w.-]+)|(?:x|twitter)\.com\/(\w+)\/status|reddit\.com\/(r\/\w+)/i);
  if (!match) return null;
  return match[1] || (match[2] ? `@${match[2]}` : match[3]);
}

// Settles how an item (a post or an account) is read, or names what to ask; returns { own, route } or null.
function routeFor(platform, item, choices, label, what, problems) {
  const own = item.own === true ? true : item.own === false ? false : null;
  let route = FIXED_ROUTE[platform];
  if (!route) {
    if (own === null) { problems.push(`${label}: ask whether this ${platform} ${what} is the person's own (it decides how it is read)`); return null; }
    route = item.route || (own ? choices.own_routes?.[platform] : 'scrapecreators') || null;
    if (!route) { problems.push(`${label}: ask how to read the person's own ${platform} posts (${ROUTES[platform].join(' or ')}) and save the answer in data/choices.json`); return null; }
    if (!ROUTES[platform].includes(route)) { problems.push(`${label}: ${platform} can be read by ${ROUTES[platform].join(' or ')}, not "${route}"`); return null; }
    if (!own && route !== 'scrapecreators') { problems.push(`${label}: the ${route} route reads only the person's own posts`); return null; }
  }
  return { own, route };
}

// The time range for accounts: { "days": 30 } (the past 30 days) or { "from": "2026-10-18", "to": "2026-11-04" }
// (whole days on the computer's clock; "to" may be left out for today). Returns { since, until, label } or null.
function windowOf(time, now = Date.now()) {
  if (!time || typeof time !== 'object') return null;
  if (time.days !== undefined) {
    const days = Number(time.days);
    if (!(days > 0)) return null;
    return { since: new Date(now - days * 86400000).toISOString(), until: new Date(now).toISOString(), label: `the past ${days} days` };
  }
  const day = /^\d{4}-\d{2}-\d{2}$/;
  if (!day.test(String(time.from || '')) || (time.to && !day.test(String(time.to)))) return null;
  const since = new Date(`${time.from}T00:00:00`);
  const until = time.to ? new Date(`${time.to}T23:59:59.999`) : new Date(now);
  if (Number.isNaN(since.getTime()) || Number.isNaN(until.getTime()) || since > until) return null;
  return { since: since.toISOString(), until: until.toISOString(), label: `${time.from} to ${time.to || 'today'}` };
}

// raw: the request; choices: data/choices.json ({ "own_routes": { "instagram": "official", ... } }).
// Returns { entries (posts), accounts, window, problems }; an item with a problem is left out, and the problem
// says what to ask.
function normalizeRequest(raw, choices = {}, now = Date.now()) {
  const problems = [];
  const entries = [];
  const accounts = [];
  const seen = new Set();
  for (const item of raw.posts || []) {
    const url = String(item.url || '').trim();
    const platform = platformOfUrl(url);
    if (!url) { problems.push('a post without a link'); continue; }
    if (seen.has(url)) { problems.push(`${url}: listed twice`); continue; }
    seen.add(url);
    if (!platform) { problems.push(`${url}: not a YouTube, Instagram, Facebook, TikTok, X or Reddit link`); continue; }
    const settled = routeFor(platform, item, choices, url, 'post', problems);
    if (settled) entries.push({ platform, ...settled, url, account: item.account || accountOfUrl(url) });
  }
  const listed = Array.isArray(raw.accounts) ? raw.accounts : [];
  const window = listed.length ? windowOf(raw.time, now) : null;
  if (listed.length && !window) {
    problems.push('ask which posts of the accounts to read: those from the past how many days, or from which date to which date ("time" in request.json)');
  }
  for (const item of listed) {
    const platform = String(item.platform || '').toLowerCase();
    const name = String(item.account || '').trim();
    if (!PLATFORMS.includes(platform)) { problems.push(`account ${name || '(no name)'}: say which platform it is on (${PLATFORMS.join(', ')})`); continue; }
    if (!name) { problems.push(`a ${platform} account without a name`); continue; }
    if (platform === 'reddit') { problems.push(`${name}: Reddit is read by post links, not accounts`); continue; }
    const key = `${platform}:${name.toLowerCase()}`;
    if (seen.has(key)) { problems.push(`${platform} account ${name}: listed twice`); continue; }
    seen.add(key);
    const settled = routeFor(platform, item, choices, `${platform} account ${name}`, 'account', problems);
    if (settled && window) accounts.push({ platform, ...settled, account: name });
  }
  return { entries, accounts, window, problems };
}

function requestPath(name, dataDir = getDataDir()) {
  return path.join(runDir(name, dataDir), 'request.json');
}

function choicesPath(dataDir = getDataDir()) {
  return path.join(dataDir, 'choices.json');
}

function readJson(file, what) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw new Error(`${file} is not valid JSON (${what})`);
  }
}

function loadChoices(dataDir = getDataDir()) {
  return readJson(choicesPath(dataDir), 'the remembered choices') || {};
}

// Where fetch.js keeps the posts it found for the request's accounts, so that the read covers the posts
// the plan showed, and prepare.js takes their comments.
function foundPath(name, dataDir = getDataDir()) {
  return path.join(runDir(name, dataDir), 'posts.json');
}

function loadFound(name, dataDir = getDataDir()) {
  return readJson(foundPath(name, dataDir), 'the posts found for the accounts');
}

// The posts of a request: { listed: the links in request.json, found: posts found for its accounts },
// or null when the run has no request.json.
function requestPosts(name, dataDir = getDataDir()) {
  const raw = readJson(requestPath(name, dataDir), 'the request');
  if (!raw) return null;
  const listed = (raw.posts || []).map(item => String(item.url || '').trim()).filter(Boolean);
  const found = Object.values(loadFound(name, dataDir)?.accounts || {}).flatMap(group => group.posts || []);
  return { listed, found };
}

function loadRequest(name, dataDir = getDataDir(), now = Date.now()) {
  const raw = readJson(requestPath(name, dataDir), 'the request');
  if (!raw) throw new Error(`${requestPath(name, dataDir)} is missing. Write the request there first (see AGENTS.md).`);
  return { ...normalizeRequest(raw, loadChoices(dataDir), now), time: raw.time || null };
}

module.exports = {
  PLATFORMS, ROUTES, accountOfUrl, choicesPath, foundPath, loadChoices, loadFound, loadRequest, normalizeRequest,
  platformOfUrl, requestPath, requestPosts, windowOf
};
