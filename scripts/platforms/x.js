// X through the official API with an app Bearer Token (X_BEARER_TOKEN). Paid per item read from the person's
// credit at console.x.com: $0.005 a post (the post itself and each reply) and $0.010 a user. X has no list of a
// post's replies, so they are found by searching the post's conversation: recent search for a post from the
// last 7 days, full-archive search (back to 2006; pay-per-use and Enterprise accounts) for an older one.
const { getJson } = require('../lib/http');
const { postInfo, toIso } = require('./common');

const API = 'https://api.x.com/2/';
const SEVEN_DAYS = 7 * 86400000;
const MARGIN = 60000;
// Full-archive search allows 1 request a second (and 300 in 15 minutes); a little more is kept between requests.
const ARCHIVE_GAP = 1100;
let lastArchiveRequest = 0;

async function xget(endpoint, params, ctx) {
  const url = new URL(API + endpoint);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const { ok, status, body } = await getJson(url, { headers: { authorization: `Bearer ${ctx.env.X_BEARER_TOKEN}` } });
  if (!ok) {
    const error = new Error(`X: HTTP ${status} ${body?.title || ''} ${body?.detail || ''}`.trim());
    Object.assign(error, { status, title: body?.title || null, reason: body?.reason || null });
    throw error;
  }
  return body;
}

function tweetIdFromUrl(url) {
  const match = String(url).match(/status(?:es)?\/(\d+)/);
  return match ? match[1] : null;
}

// Recent search may start no earlier than 7 days ago; one minute is kept as a margin.
function searchStart(now = Date.now()) {
  return new Date(now - SEVEN_DAYS + MARGIN).toISOString();
}

// The search that finds the replies of a post made at `time`: recent search when the post falls inside its
// 7 days, otherwise full-archive search from the post's own time (no reply is older than its post).
function searchFor(time, now = Date.now()) {
  const posted = Date.parse(time);
  if (posted >= Date.parse(searchStart(now))) return { endpoint: 'tweets/search/recent', start: searchStart(now), pageSize: 100, archive: false };
  return { endpoint: 'tweets/search/all', start: Number.isFinite(posted) ? new Date(posted).toISOString() : '2006-03-21T00:00:00Z', pageSize: 500, archive: true };
}

async function archiveTurn(ctx) {
  const wait = lastArchiveRequest + (ctx.xArchiveGap ?? ARCHIVE_GAP) - Date.now();
  if (wait > 0) await new Promise(resolve => setTimeout(resolve, wait));
  lastArchiveRequest = Date.now();
}

// The replies to a post, at most maxPages × 100 of them (pages of up to 100, or 500 with full-archive search).
// A post with more replies than that is read most relevant first (X's "relevancy" order), otherwise newest first.
async function readConversation(post, conversationId, entry, ctx) {
  const search = searchFor(post.time);
  const cap = ctx.maxPages * 100;
  const sortOrder = typeof post.comments === 'number' && post.comments > cap ? 'relevancy' : 'recency';
  const items = [];
  const users = new Map();
  let nextToken = '';
  for (let page = 0; page < ctx.maxPages && items.length < cap; page += 1) {
    const params = {
      query: `conversation_id:${conversationId} is:reply`, max_results: String(Math.max(10, Math.min(search.pageSize, cap - items.length))),
      start_time: search.start, sort_order: sortOrder,
      'tweet.fields': 'author_id,created_at,public_metrics,in_reply_to_user_id,referenced_tweets,conversation_id',
      expansions: 'author_id', 'user.fields': 'username,name'
    };
    if (nextToken) params.next_token = nextToken;
    if (search.archive) await archiveTurn(ctx);
    let body;
    try {
      body = await xget(search.endpoint, params, ctx);
    } catch (error) {
      if (search.archive && page === 0 && error.status === 403) error.archiveRefused = true;
      throw error;
    }
    items.push(...(body.data || []));
    for (const user of body.includes?.users || []) users.set(user.id, user);
    ctx.cost.xPosts += (body.data || []).length;
    ctx.cost.xUsers += (body.includes?.users || []).length;
    nextToken = body.meta?.next_token;
    if (!nextToken) break;
  }
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

// Looks the post up first ($0.005), also in --plan, for its reply count and age.
async function read(entry, ctx) {
  const id = tweetIdFromUrl(entry.url);
  if (!id) throw new Error(`X: no post ID in ${entry.url}`);
  const tweet = (await xget(`tweets/${id}`, { 'tweet.fields': 'created_at,public_metrics,conversation_id' }, ctx)).data;
  ctx.cost.xPosts += 1;
  if (!tweet) throw new Error(`X: post ${id} not found (deleted or protected?)`);
  const post = postInfo('x', id, entry.url, tweet.created_at, tweet.public_metrics?.reply_count ?? null);
  if (ctx.plan || post.comments === 0) return { posts: [post], records: [] };
  try {
    return { posts: [post], records: await readConversation(post, tweet.conversation_id || id, entry, ctx) };
  } catch (error) {
    if (!error.archiveRefused) throw error;
    const said = [error.title, error.reason].filter(Boolean).join(', ');
    return { posts: [post], records: [], skipped: `posted more than 7 days ago, and X refused full-archive search for this account (HTTP 403${said ? `: ${said}` : ''}); pay-per-use accounts (credit bought at console.x.com) include it` };
  }
}

module.exports = { read, searchFor, searchStart, tweetIdFromUrl };
