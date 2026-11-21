// The person's list of what to read: data/sources.json (example: sources.example.json). Every platform is
// optional. Each entry says whether the account or post is the person's own, and for Instagram, Facebook and
// TikTok how to read it: "official" (Instagram, Facebook), "mcp" (TikTok, through the TikTok Social
// connector, which the agent calls) or "scrapecreators". YouTube and X are always official, Reddit always
// ScrapeCreators.
const fs = require('fs');
const path = require('path');
const { getDataDir } = require('./env-file');

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

// Returns { since, entries, problems }. since is an ISO time: "since" in the file, or now minus "days".
function normalizeSources(raw, now = Date.now()) {
  const problems = [];
  const days = Number(raw.days || 7);
  const since = raw.since ? new Date(raw.since).toISOString() : new Date(now - days * 86400000).toISOString();
  const entries = [];
  const add = (item, kind) => {
    const platform = String(item.platform || (kind === 'post' ? platformOfUrl(item.url) : '') || '').toLowerCase();
    const label = kind === 'post' ? item.url : item.account;
    if (!PLATFORMS.includes(platform)) { problems.push(`${label}: unknown platform`); return; }
    if (kind === 'account' && !item.account) { problems.push(`${platform} account without a name`); return; }
    if (kind === 'post' && !item.url) { problems.push(`${platform} post without a link`); return; }
    if (kind === 'account' && platform === 'reddit') { problems.push(`${label}: Reddit is read by post links, not accounts`); return; }
    const own = item.own === true;
    let route = FIXED_ROUTE[platform] || item.route;
    if (!route) route = own ? null : 'scrapecreators';
    if (!route) { problems.push(`${label}: choose how to read your own ${platform} (${ROUTES[platform].join(' or ')})`); return; }
    if (ROUTES[platform] && !ROUTES[platform].includes(route)) { problems.push(`${label}: ${platform} can be read by ${ROUTES[platform].join(' or ')}, not "${route}"`); return; }
    if ((route === 'official' && ['instagram', 'facebook'].includes(platform) || route === 'mcp') && !own) {
      problems.push(`${label}: the official ${platform} route reads only your own account`);
      return;
    }
    entries.push({ kind, platform, route, own, account: item.account || null, url: item.url || null });
  };
  (raw.accounts || []).forEach(item => add(item, 'account'));
  (raw.posts || []).forEach(item => add(item, 'post'));
  return { since, entries, problems };
}

function sourcesPath(dataDir = getDataDir()) {
  return path.join(dataDir, 'sources.json');
}

function loadSources(dataDir = getDataDir()) {
  const file = sourcesPath(dataDir);
  let raw;
  try { raw = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (error) {
    throw new Error(`${file} is missing or is not valid JSON. Copy sources.example.json there and fill it in.`);
  }
  return normalizeSources(raw);
}

module.exports = { PLATFORMS, ROUTES, loadSources, normalizeSources, platformOfUrl, sourcesPath };
