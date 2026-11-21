// X through the official API with an app Bearer Token (X_BEARER_TOKEN). Paid per item read: $0.005 a post
// (replies included) and $0.010 a user, from the person's credit at console.x.com. Search covers only the
// last 7 days, so older posts are not read.
const { getJson } = require('../lib/http');
const { postInfo, toIso } = require('./common');

const API = 'https://api.x.com/2/';
const SEVEN_DAYS = 7 * 86400000;

async function xget(endpoint, params, ctx) {
  const url = new URL(API + endpoint);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const { ok, status, body } = await getJson(url, { headers: { authorization: `Bearer ${ctx.env.X_BEARER_TOKEN}` } });
  if (!ok) throw new Error(`X: HTTP ${status} ${body?.title || ''} ${body?.detail || ''}`.trim());
  return body;
}

function tweetIdFromUrl(url) {
  const match = String(url).match(/status(?:es)?\/(\d+)/);
  return match ? match[1] : null;
}

// Search starts no earlier than 7 days ago (X refuses older start times).
function searchStart(since, now = Date.now()) {
  const floor = new Date(now - SEVEN_DAYS + 60000).toISOString();
  return Date.parse(since) > Date.parse(floor) ? since : floor;
}

async function search(query, extra, ctx) {
  const items = [];
  const users = new Map();
  let nextToken = '';
  for (let page = 0; page < ctx.maxPages; page += 1) {
    const params = { query, max_results: '100', start_time: searchStart(ctx.since), ...extra };
    if (nextToken) params.next_token = nextToken;
    const body = await xget('tweets/search/recent', params, ctx);
    items.push(...(body.data || []));
    for (const user of body.includes?.users || []) users.set(user.id, user);
    ctx.cost.xPosts += (body.data || []).length;
    ctx.cost.xUsers += (body.includes?.users || []).length;
    nextToken = body.meta?.next_token;
    if (!nextToken) break;
  }
  return { items, users };
}

async function readConversation(post, entry, ctx) {
  const { items, users } = await search(`conversation_id:${post.id} is:reply`, {
    'tweet.fields': 'author_id,created_at,public_metrics,in_reply_to_user_id,referenced_tweets,conversation_id',
    expansions: 'author_id', 'user.fields': 'username,name'
  }, ctx);
  return items.map(tweet => {
    const user = users.get(tweet.author_id) || {};
    const repliedTo = (tweet.referenced_tweets || []).find(ref => ref.type === 'replied_to')?.id || null;
    return {
      platform: 'x', route: 'official', own: entry.own, account: entry.account,
      post_id: post.id, post_url: post.url, post_time: post.time,
      comment_id: tweet.id, parent_id: repliedTo && repliedTo !== post.id ? repliedTo : null,
      time: toIso(tweet.created_at), likes: tweet.public_metrics?.like_count ?? null,
      replies: tweet.public_metrics?.reply_count ?? null, hidden: null, text: tweet.text || '',
      author_name: user.name || null, author_handle: user.username ? `@${user.username}` : null, author_id: tweet.author_id || null
    };
  });
}

async function read(entry, ctx) {
  if (Date.parse(ctx.since) < Date.now() - SEVEN_DAYS) ctx.notes.push('X: only the last 7 days can be searched; older posts were skipped');
  let posts;
  if (entry.kind === 'post') {
    const id = tweetIdFromUrl(entry.url);
    if (!id) throw new Error(`X: no post ID in ${entry.url}`);
    posts = [postInfo('x', id, entry.url, null, undefined)];
  } else {
    const handle = String(entry.account).replace(/^@/, '');
    const { items } = await search(`from:${handle} -is:retweet -is:reply`, { 'tweet.fields': 'created_at,public_metrics,conversation_id' }, ctx);
    posts = items.map(t => postInfo('x', t.id, `https://x.com/${handle}/status/${t.id}`, t.created_at, t.public_metrics?.reply_count ?? null));
  }
  if (ctx.plan) return { posts, records: [] };
  const records = [];
  for (const post of posts) {
    if (post.comments === 0) continue;
    records.push(...await readConversation(post, entry, ctx));
  }
  return { posts, records };
}

module.exports = { read, searchStart, tweetIdFromUrl };
