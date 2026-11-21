// What to read for one request: data/runs/<name>/request.json, written by the agent from the person's message.
// Like ScrapeCreators' comment-mining, the input is post and video links, and every comment of each listed
// post is read. Each link says whether it is the person's own post ("own": true or false); for Instagram,
// Facebook and TikTok links that is required, because it decides the route. Own Instagram and Facebook posts
// are read by "official" or "scrapecreators", own TikTok videos by "mcp" (the TikTok Social connector, which
// the agent calls) or "scrapecreators": the route comes from the post itself or from the person's remembered
// choice in data/choices.json. Other people's posts on those three platforms go through ScrapeCreators.
// YouTube and X are always official, Reddit always ScrapeCreators.
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

// raw: the request; choices: data/choices.json ({ "own_routes": { "instagram": "official", ... } }).
// Returns { entries, problems }; a post with a problem is left out, and the problem says what to ask.
function normalizeRequest(raw, choices = {}) {
  const problems = [];
  const entries = [];
  const seen = new Set();
  if (Array.isArray(raw.accounts) && raw.accounts.length) {
    problems.push('This workflow reads post links, not whole accounts: list the posts under "posts" instead');
  }
  for (const item of raw.posts || []) {
    const url = String(item.url || '').trim();
    const platform = platformOfUrl(url);
    if (!url) { problems.push('a post without a link'); continue; }
    if (seen.has(url)) { problems.push(`${url}: listed twice`); continue; }
    seen.add(url);
    if (!platform) { problems.push(`${url}: not a YouTube, Instagram, Facebook, TikTok, X or Reddit link`); continue; }
    const own = item.own === true ? true : item.own === false ? false : null;
    let route = FIXED_ROUTE[platform];
    if (!route) {
      if (own === null) { problems.push(`${url}: ask whether this ${platform} post is the person's own (it decides how it is read)`); continue; }
      route = item.route || (own ? choices.own_routes?.[platform] : 'scrapecreators') || null;
      if (!route) { problems.push(`${url}: ask how to read the person's own ${platform} posts (${ROUTES[platform].join(' or ')}) and save the answer in data/choices.json`); continue; }
      if (!ROUTES[platform].includes(route)) { problems.push(`${url}: ${platform} can be read by ${ROUTES[platform].join(' or ')}, not "${route}"`); continue; }
      if (!own && route !== 'scrapecreators') { problems.push(`${url}: the ${route} route reads only the person's own posts`); continue; }
    }
    entries.push({ platform, route, own, url, account: item.account || accountOfUrl(url) });
  }
  return { entries, problems };
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

// The links of a request as written, or null when the run has no request.json.
function requestLinks(name, dataDir = getDataDir()) {
  const raw = readJson(requestPath(name, dataDir), 'the request');
  return raw ? (raw.posts || []).map(item => String(item.url || '').trim()).filter(Boolean) : null;
}

function loadRequest(name, dataDir = getDataDir()) {
  const raw = readJson(requestPath(name, dataDir), 'the request');
  if (!raw) throw new Error(`${requestPath(name, dataDir)} is missing. Write the request's post links there first (see AGENTS.md).`);
  return normalizeRequest(raw, loadChoices(dataDir));
}

module.exports = {
  PLATFORMS, ROUTES, accountOfUrl, choicesPath, loadChoices, loadRequest, normalizeRequest, platformOfUrl,
  requestLinks, requestPath
};
