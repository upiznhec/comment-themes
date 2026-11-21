// X through the official API with an app Bearer Token (X_BEARER_TOKEN). Paid per item read from the person's
// credit at console.x.com: $0.005 a post (each post found or looked up, and each reply) and $0.010 a user.
// Posts and replies are found by search, which covers only the last 7 days, so older posts are left out.
const { getJson } = require('../lib/http');
const { postInfo, toIso } = require('./common');
const { accountOfUrl } = require('../lib/sources');

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

// Search may start no earlier than 7 days ago; one minute is kept as a margin.
function searchStart(now = Date.now()) {
  return new Date(now - SEVEN_DAYS + 60000).toISOString();
}

// The replies to a post, up to maxPages pages of 100. A post with more replies than that is read most
// relevant first (X's "relevancy" order), otherwise newest first.
async function readConversation(post, conversationId, entry, ctx) {
  const items = [];
  const users = new Map();
  let nextToken = '';
  const sortOrder = typeof post.comments === 'number' && post.comments > ctx.maxPages * 100 ? 'relevancy' : 'recency';
  for (let page = 0; page < ctx.maxPages; page += 1) {
    const params = {
      query: `conversation_id:${conversationId} is:reply`, max_results: '100', start_time: searchStart(), sort_order: sortOrder,
      'tweet.fields': 'author_id,created_at,public_metrics,in_reply_to_user_id,referenced_tweets,conversation_id',
      expansions: 'author_id', 'user.fields': 'username,name'
    };
    if (nextToken) params.next_token = nextToken;
    const body = await xget('tweets/search/recent', params, ctx);
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
  if (Date.parse(tweet.created_at) < Date.now() - SEVEN_DAYS) {
    return { posts: [post], records: [], skipped: 'posted more than 7 days ago, and X search reaches only the last 7 days' };
  }
  if (ctx.plan || post.comments === 0) return { posts: [post], records: [] };
  return { posts: [post], records: await readConversation(post, tweet.conversation_id || id, entry, ctx) };
}

// An account given as @handle, handle or profile link.
function handleOf(account) {
  const text = String(account).trim();
  return (accountOfUrl(`${text}/status/0`) || text).replace(/^@/, '').replace(/^https?:\/\/(www\.)?(x|twitter)\.com\//i, '').split(/[/?]/)[0];
}

// The account's own posts (no replies or reposts) in the window, as far as the last 7 days reach.
async function list(account, ctx) {
  const handle = handleOf(account.account);
  const floor = searchStart();
  if (Date.parse(ctx.window.until) <= Date.parse(floor)) {
    return { posts: [], skipped: 'the time range ended more than 7 days ago, and X search reaches only the last 7 days' };
  }
  if (Date.parse(ctx.window.since) < Date.parse(floor)) ctx.notes.push(`X @${handle}: only posts from the last 7 days can be found; earlier ones in the time range were left out`);
  const posts = [];
  let nextToken = '';
  for (let page = 0; page < ctx.listPages; page += 1) {
    const params = {
      query: `from:${handle} -is:retweet -is:reply`, max_results: '100',
      start_time: Date.parse(ctx.window.since) > Date.parse(floor) ? ctx.window.since : floor,
      'tweet.fields': 'created_at,public_metrics,conversation_id'
    };
    if (Date.parse(ctx.window.until) < Date.now() - 60000) params.end_time = ctx.window.until;
    if (nextToken) params.next_token = nextToken;
    const body = await xget('tweets/search/recent', params, ctx);
    for (const t of body.data || []) {
      posts.push({ ...postInfo('x', t.id, `https://x.com/${handle}/status/${t.id}`, t.created_at, t.public_metrics?.reply_count ?? null), conversation: t.conversation_id || t.id });
    }
    ctx.cost.xPosts += (body.data || []).length;
    nextToken = body.meta?.next_token;
    if (!nextToken) break;
  }
  return { account: `@${handle}`, posts };
}

// The replies to a post found by list().
async function comments(post, entry, ctx) {
  return readConversation(post, post.conversation || post.id, entry, ctx);
}

module.exports = { comments, handleOf, list, read, searchStart, tweetIdFromUrl };
