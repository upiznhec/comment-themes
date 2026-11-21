#!/usr/bin/env node

// Saves the Meta token for reading comments on the person's own Facebook Page and Instagram professional
// account, so that no token passes through a chat. The person runs this in their own terminal after
// making a token in Graph API Explorer with their own Meta app (the person does every click on Meta's
// sites). Adapted from instagram-token.js in the Workflow 2 repository (Sibyl fork, MIT).
// 1. It asks for the app ID (shown), the app secret and the Explorer's token (neither shown), numbered
//    1 of 3 to 3 of 3, so that the person can see when all three are answered.
// 2. It exchanges the token for a long-lived one, lists the permissions granted, and takes the chosen
//    Page's own token, which does not expire, plus the Instagram account linked to that Page, if any.
// 3. It saves META_PAGE_TOKEN, META_PAGE_ID and, when there is a linked account, IG_USER_ID in data/.env.
//    The app secret is used once and not saved. Nothing secret is printed.
// Usage: node scripts/meta-token.js [--page="Page name or ID"]
// --from-stdin reads the app ID, app secret and token from three lines of standard input (tests).

const { envFilePath, getDataDir, writeEnvValue } = require('./lib/env-file');
const { readHidden, readLines, readVisible } = require('./lib/prompt');

const VERSION = 'v27.0';
const NEEDED = {
  pages_show_list: 'to see your Page',
  pages_read_engagement: 'to read your Page posts',
  pages_read_user_content: 'to read comments on your Page posts',
  instagram_basic: 'to see your Instagram posts',
  instagram_manage_comments: 'to read comments on your Instagram posts'
};
const QUESTIONS = {
  appId: '1 of 3. App ID (App settings, Basic, in your Meta app): ',
  appSecret: '2 of 3. App secret (same page, Show). It is not shown on screen.',
  token: "3 of 3. Graph API Explorer's access token (copy button next to it). It is not shown on screen."
};

function graphBase() {
  return String(process.env.META_GRAPH_BASE || 'https://graph.facebook.com').replace(/\/+$/, '') + '/' + VERSION;
}

async function graphGet(path, params) {
  const response = await fetch(`${graphBase()}/${path}?${new URLSearchParams(params).toString()}`);
  let body = {};
  try { body = await response.json(); } catch (error) { body = {}; }
  if (!response.ok || body.error) {
    const message = body.error?.message || `HTTP ${response.status}`;
    throw new Error(message.replace(/access_token=[^&\s]+/g, 'access_token=…'));
  }
  return body;
}

function pickPage(pages, wanted) {
  if (!wanted) return pages.length === 1 ? pages[0] : null;
  return pages.find(page => page.id === wanted || String(page.name || '').toLowerCase() === wanted.toLowerCase()) || null;
}

async function setUpToken({ appId, appSecret, shortToken, page: wanted = '', choose = null }) {
  const long = await graphGet('oauth/access_token', {
    grant_type: 'fb_exchange_token', client_id: appId, client_secret: appSecret, fb_exchange_token: shortToken
  }).catch(error => { throw new Error(`Meta did not exchange the token (${error.message}). Check the app ID and secret, and make a new token in Graph API Explorer.`); });

  const granted = new Set(((await graphGet('me/permissions', { access_token: long.access_token })).data || [])
    .filter(item => item.status === 'granted').map(item => item.permission));
  const missing = Object.keys(NEEDED).filter(name => !granted.has(name));

  const pages = (await graphGet('me/accounts', {
    fields: 'id,name,access_token,instagram_business_account{id,username}', access_token: long.access_token
  })).data || [];
  if (!pages.length) throw new Error('The token sees no Facebook Page. In Graph API Explorer, make a new token and choose your Page (and Instagram account) in the pop-up.');
  let page = pickPage(pages, wanted);
  if (!page && choose) page = await choose(pages);
  if (!page) throw new Error(`Several Pages: run again with --page="${pages[0].name}" (or another of: ${pages.map(item => item.name).join(', ')})`);
  if (!page.access_token) throw new Error(`Meta gave no token for the Page "${page.name}". Make a new token and choose that Page in the pop-up.`);
  return { pageToken: page.access_token, pageId: page.id, pageName: page.name, ig: page.instagram_business_account || null, missing };
}

async function main() {
  const args = process.argv.slice(2);
  const fromStdin = args.includes('--from-stdin');
  const wanted = (args.find(arg => arg.startsWith('--page=')) || '').slice('--page='.length).replace(/^"|"$/g, '');
  if (!fromStdin && !process.stdin.isTTY) {
    console.log('Run this in your own terminal: it asks you to paste the app secret and the token there, so that they never go through a chat.');
    process.exit(2);
  }
  let appId, appSecret, shortToken;
  try {
    if (fromStdin) {
      [appId, appSecret, shortToken] = (await readLines(process.stdin)).map(line => String(line || '').trim());
    } else {
      console.log('Meta token for your own Page and Instagram comments. It asks 3 questions.');
      appId = (await readVisible(QUESTIONS.appId)).trim();
      console.log(QUESTIONS.appSecret);
      appSecret = (await readHidden()).trim();
      console.log(QUESTIONS.token);
      shortToken = (await readHidden()).trim();
      console.log('All 3 answered. Checking with Meta; this takes a few seconds.');
    }
  } catch (error) {
    console.log('Cancelled. Nothing was saved.');
    process.exit(1);
  }
  if (!/^\d+$/.test(appId || '') || !appSecret || !shortToken) {
    console.log('The app ID must be a number, and the app secret and token cannot be empty. Nothing was saved.');
    process.exit(1);
  }
  const choose = fromStdin ? null : async pages => {
    pages.forEach((page, index) => console.log(`${index + 1}. ${page.name}${page.instagram_business_account ? ` (Instagram @${page.instagram_business_account.username})` : ''}`));
    const answer = Number((await readVisible('Which Page? Type its number: ')).trim());
    return pages[answer - 1] || null;
  };
  let result;
  try {
    result = await setUpToken({ appId, appSecret, shortToken, page: wanted, choose });
  } catch (error) {
    console.log(`Nothing was saved: ${error.message}`);
    process.exit(1);
  }
  const dataDir = getDataDir();
  writeEnvValue(dataDir, 'META_PAGE_TOKEN', result.pageToken);
  writeEnvValue(dataDir, 'META_PAGE_ID', result.pageId);
  writeEnvValue(dataDir, 'IG_USER_ID', result.ig ? result.ig.id : '');
  console.log(`Saved in ${envFilePath(dataDir)}: the Page "${result.pageName}"${result.ig ? ` and Instagram @${result.ig.username}` : ' (no Instagram account is linked to it)'}.`);
  console.log('The Page token does not expire. Removing the app from Facebook (Settings, Business integrations) stops it.');
  if (result.missing.length) {
    console.log('Not granted yet, so these parts will not work:');
    for (const name of result.missing) console.log(`  - ${name} (${NEEDED[name]})`);
    console.log('Add them to the token in Graph API Explorer, make a new token, and run this again.');
  }
  console.log('Now tell your agent that it is saved. Do not paste anything from this into the chat.');
}

if (require.main === module) main();

module.exports = { NEEDED, QUESTIONS, pickPage, setUpToken };
