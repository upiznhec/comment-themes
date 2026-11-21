#!/usr/bin/env node

// Checks the saved keys without showing them. For ScrapeCreators it asks for the credit balance, which
// is also how the person sees how many credits are left. Prints only names, results and numbers.
// Usage: node scripts/check-keys.js

const { envFilePath, getDataDir, loadEnvFile } = require('./lib/env-file');

async function checkScrapeCreators(key) {
  const response = await fetch('https://api.scrapecreators.com/v1/account/credit-balance', {
    headers: { 'x-api-key': key }
  });
  let body = {};
  try { body = await response.json(); } catch (error) { body = {}; }
  if (!response.ok) return `not accepted (HTTP ${response.status}). Check the key on scrapecreators.com and save it again.`;
  const credits = body.creditCount ?? body.credits_remaining;
  return typeof credits === 'number' ? `works, ${credits.toLocaleString('en-US')} credits left.` : 'works.';
}

// One request that costs 1 unit of the project's 10,000 a day and needs no video: it fails when the key
// is wrong, restricted to other APIs, or when the YouTube Data API is not turned on in its project.
async function checkYouTube(key) {
  const url = new URL('https://www.googleapis.com/youtube/v3/i18nLanguages');
  url.searchParams.set('part', 'snippet');
  url.searchParams.set('hl', 'en');
  url.searchParams.set('key', key);
  const response = await fetch(url);
  let body = {};
  try { body = await response.json(); } catch (error) { body = {}; }
  if (response.ok) return 'works.';
  // Newer Google errors name the cause in details[].reason; older ones in errors[].reason.
  const info = (body.error?.details || []).find(detail => detail && detail.reason);
  const reason = info?.reason || body.error?.errors?.[0]?.reason || body.error?.status || `HTTP ${response.status}`;
  const advice = {
    API_KEY_INVALID: 'The key is not valid. Copy it again from Google Cloud and save it again.',
    keyInvalid: 'The key is not valid. Copy it again from Google Cloud and save it again.',
    accessNotConfigured: 'The YouTube Data API v3 is not turned on in this key\'s Google Cloud project.',
    SERVICE_DISABLED: 'The YouTube Data API v3 is not turned on in this key\'s Google Cloud project.',
    quotaExceeded: 'Today\'s quota for this project is used up. It resets at midnight Pacific Time.',
    API_KEY_SERVICE_BLOCKED: 'The key is restricted to other APIs. Add YouTube Data API v3 under its API restrictions.'
  }[reason] || 'Check the key in Google Cloud and save it again.';
  return `not accepted (${reason}). ${advice}`;
}

// X's usage endpoint reads no posts, so it should not cost credit; it shows how many posts the project
// has read in this billing cycle.
async function checkX(token) {
  const response = await fetch('https://api.x.com/2/usage/tweets', { headers: { authorization: `Bearer ${token}` } });
  let body = {};
  try { body = await response.json(); } catch (error) { body = {}; }
  if (response.status === 401) return 'not accepted (401). Copy the Bearer Token of the new app again and save it again.';
  if (response.status === 402 || /credit/i.test(JSON.stringify(body.title || body.detail || ''))) return 'accepted, but the account has no credit left. Buy credit at console.x.com.';
  if (!response.ok) return `not accepted (HTTP ${response.status}: ${body.title || body.detail || 'no reason given'}).`;
  const usage = body.data?.project_usage;
  return usage !== undefined ? `works, ${Number(usage).toLocaleString('en-US')} posts read by this project in the current billing cycle.` : 'works.';
}

// The Page token reads the Page itself and, through it, the linked Instagram account. Free.
async function checkMeta(token) {
  const graph = 'https://graph.facebook.com/v27.0';
  const page = await (await fetch(`${graph}/me?fields=id,name&access_token=${encodeURIComponent(token)}`)).json();
  if (page.error) return `not accepted (${page.error.code}: ${page.error.type || 'error'}). Run meta-token.js again.`;
  let line = `works, Page "${page.name}"`;
  const igId = process.env.IG_USER_ID;
  if (igId) {
    const ig = await (await fetch(`${graph}/${igId}?fields=username,media_count&access_token=${encodeURIComponent(token)}`)).json();
    line += ig.error ? `; Instagram not readable (${ig.error.code}: ${ig.error.type || 'error'})` : `, Instagram @${ig.username} (${ig.media_count} posts)`;
  }
  return line + '.';
}

async function main() {
  const dataDir = getDataDir();
  loadEnvFile(dataDir);
  const checks = [
    ['SCRAPECREATORS_API_KEY', 'ScrapeCreators', checkScrapeCreators],
    ['YOUTUBE_API_KEY', 'YouTube', checkYouTube],
    ['X_BEARER_TOKEN', 'X', checkX],
    ['META_PAGE_TOKEN', 'Meta', checkMeta]
  ];
  let saved = 0;
  for (const [name, label, check] of checks) {
    const key = process.env[name];
    if (!key) {
      console.log(`${label}: not saved.`);
      continue;
    }
    saved += 1;
    try {
      console.log(`${label}: ${await check(key)}`);
    } catch (error) {
      console.log(`${label}: could not be checked (${error.cause?.code || error.message}). Check the internet connection.`);
    }
  }
  if (!saved) console.log(`No keys are saved yet in ${envFilePath(dataDir)}.`);
}

main();
