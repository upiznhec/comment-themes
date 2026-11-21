// Platform readers against made-up answers shaped like the real ones (recorded 2026-11-21).
const assert = require('node:assert/strict');
const { test, afterEach } = require('node:test');

const youtube = require('../scripts/platforms/youtube');
const sc = require('../scripts/platforms/scrapecreators');
const x = require('../scripts/platforms/x');
const meta = require('../scripts/platforms/meta');
const { fromMcp } = require('../scripts/platforms/tiktok-mcp');
const { newCost } = require('../scripts/platforms/common');

const realFetch = global.fetch;
afterEach(() => { global.fetch = realFetch; });

// Answers by the first rule whose test matches the URL; records each URL asked for.
function fake(rules) {
  const asked = [];
  global.fetch = async url => {
    const u = new URL(url);
    asked.push(u);
    const rule = rules.find(r => r.test(u));
    const body = rule ? rule.body(u) : { error: 'no rule' };
    return { ok: rule ? rule.status === undefined || rule.status < 400 : false, status: rule?.status || (rule ? 200 : 404), text: async () => JSON.stringify(body) };
  };
  return asked;
}

const ctx = (over = {}) => ({ since: '2026-11-14T00:00:00.000Z', env: { YOUTUBE_API_KEY: 'k', SCRAPECREATORS_API_KEY: 'k', X_BEARER_TOKEN: 't', META_PAGE_TOKEN: 'p', META_PAGE_ID: '99', IG_USER_ID: '77' }, maxPages: 10, cost: newCost(), notes: [], ...over });
const ytComment = (text, extra = {}) => ({ textOriginal: text, authorDisplayName: '@sample', authorChannelId: { value: 'UCx' }, likeCount: 1, publishedAt: '2026-11-20T10:00:00Z', ...extra });

test('YouTube video link: two pages of threads, and replies beyond the five shown are read separately', async () => {
  const asked = fake([
    { test: u => u.pathname.endsWith('/commentThreads') && !u.searchParams.get('pageToken'), body: () => ({ nextPageToken: 'p2', items: [
      { snippet: { totalReplyCount: 1, topLevelComment: { id: 't1', snippet: ytComment('first') } }, replies: { comments: [{ id: 't1.r1', snippet: ytComment('reply', { parentId: 't1' }) }] } }
    ] }) },
    { test: u => u.pathname.endsWith('/commentThreads'), body: () => ({ items: [
      { snippet: { totalReplyCount: 7, topLevelComment: { id: 't2', snippet: ytComment('second') } }, replies: { comments: [] } }
    ] }) },
    { test: u => u.pathname.endsWith('/comments'), body: () => ({ items: Array.from({ length: 7 }, (_, i) => ({ id: `t2.r${i}`, snippet: ytComment(`r${i}`) })) }) }
  ]);
  const c = ctx();
  const { records } = await youtube.read({ kind: 'post', platform: 'youtube', own: false, account: null, url: 'https://youtu.be/VID123' }, c);
  assert.equal(records.length, 10);
  assert.equal(records[1].parent_id, 't1');
  assert.equal(records.filter(r => r.parent_id === 't2').length, 7);
  assert.equal(records[0].author_id, 'UCx');
  assert.equal(c.cost.youtubeUnits, 3);
  assert.ok(asked.every(u => u.searchParams.get('key') === 'k'));
});

test('YouTube: a video with comments turned off is noted, not an error', async () => {
  fake([{ test: () => true, status: 403, body: () => ({ error: { errors: [{ reason: 'commentsDisabled' }] } }) }]);
  const c = ctx();
  const { records } = await youtube.read({ kind: 'post', platform: 'youtube', url: 'https://www.youtube.com/watch?v=abc' }, c);
  assert.equal(records.length, 0);
  assert.match(c.notes[0], /comments are turned off/);
});

test('ScrapeCreators Reddit: nested replies are flattened with their parent, deleted ones skipped', async () => {
  fake([{ test: u => u.pathname === '/v1/reddit/post/comments', body: () => ({ success: true, credits_charged: 1, credits_remaining: 50,
    post: { created_utc: 1763600000 },
    comments: [
      { id: 'a', body: 'Top comment', created_utc: 1763700000, score: 5, author: 'user1', author_fullname: 't2_1',
        replies: { items: [{ id: 'b', body: 'A reply', created_utc: 1763700100, score: 1, author: 'user2', replies: '' }, { id: 'c', body: '[deleted]', replies: '' }], more: { has_more: false } } }
    ], more: { has_more: false } }) }]);
  const c = ctx();
  const { records } = await sc.read({ kind: 'post', platform: 'reddit', own: false, account: null, url: 'https://www.reddit.com/r/x/comments/1/y/' }, c);
  assert.deepEqual(records.map(r => [r.comment_id, r.parent_id]), [['a', null], ['b', 'a']]);
  assert.equal(records[0].author_handle, 'u/user1');
  assert.equal(c.cost.scrapecreatorsCharged, 1);
  assert.equal(c.cost.scrapecreatorsLeft, 50);
});

test('ScrapeCreators Instagram account: posts outside the window are not read', async () => {
  const asked = fake([
    { test: u => u.pathname === '/v2/instagram/user/posts', body: () => ({ success: true, more_available: false, items: [
      { id: '1', code: 'NEW', taken_at: 1795119759, comment_count: 2 },
      { id: '2', code: 'OLD', taken_at: 1790000000, comment_count: 9 }
    ] }) },
    { test: u => u.pathname === '/v2/instagram/post/comments', body: () => ({ success: true, credits_charged: 1, comments: [
      { id: 'x1', text: 'Price?', created_at: '2026-11-21T01:00:00.000Z', comment_like_count: 3, user: { username: 'buyer', id: '55' } }
    ] }) }
  ]);
  const { posts, records } = await sc.read({ kind: 'account', platform: 'instagram', own: true, account: 'shop' }, ctx());
  assert.deepEqual(posts.map(p => p.url), ['https://www.instagram.com/p/NEW/']);
  assert.equal(records[0].author_handle, 'buyer');
  assert.equal(asked.filter(u => u.pathname.endsWith('/comments')).length, 1);
});

test('X: replies get the replier from the user list; a reply to a reply keeps its parent', async () => {
  fake([{ test: u => u.pathname.endsWith('/tweets/search/recent'), body: () => ({
    data: [
      { id: '11', text: 'Nice', author_id: 'u1', created_at: '2026-11-20T00:00:00.000Z', public_metrics: { like_count: 2, reply_count: 0 }, referenced_tweets: [{ type: 'replied_to', id: '10' }] },
      { id: '12', text: 'Agree', author_id: 'u2', created_at: '2026-11-20T01:00:00.000Z', public_metrics: { like_count: 0, reply_count: 0 }, referenced_tweets: [{ type: 'replied_to', id: '11' }] }
    ],
    includes: { users: [{ id: 'u1', name: 'One', username: 'one' }, { id: 'u2', name: 'Two', username: 'two' }] }, meta: {} }) }]);
  const c = ctx({ since: new Date(Date.now() - 86400000).toISOString() });
  const { records } = await x.read({ kind: 'post', platform: 'x', own: false, url: 'https://x.com/brand/status/10' }, c);
  assert.deepEqual(records.map(r => [r.comment_id, r.parent_id, r.author_handle]), [['11', null, '@one'], ['12', '11', '@two']]);
  assert.equal(c.cost.xPosts, 2);
  assert.equal(c.cost.xUsers, 2);
});

test('X search never starts more than 7 days back', () => {
  const now = Date.parse('2026-11-21T00:00:00Z');
  assert.equal(x.searchStart('2026-11-01T00:00:00.000Z', now), new Date(now - 7 * 86400000 + 60000).toISOString());
  assert.equal(x.searchStart('2026-11-20T00:00:00.000Z', now), '2026-11-20T00:00:00.000Z');
});

test('Meta Facebook Page: comments without a commenter are kept and counted in a note', async () => {
  fake([
    { test: u => u.pathname.endsWith('/99/published_posts'), body: () => ({ data: [{ id: '99_1', permalink_url: 'https://facebook.com/p/1', created_time: '2026-11-20T00:00:00+0000' }] }) },
    { test: u => u.pathname.endsWith('/99_1/comments'), body: () => ({ data: [
      { id: 'f1', message: 'From the Page', created_time: '2026-11-20T01:00:00+0000', like_count: 0, from: { id: '99', name: 'Page' } },
      { id: 'f2', message: 'From a visitor', created_time: '2026-11-20T02:00:00+0000', like_count: 1 }
    ] }) }
  ]);
  const c = ctx();
  const { records } = await meta.read({ kind: 'account', platform: 'facebook', own: true, account: 'page' }, c);
  assert.deepEqual(records.map(r => r.author_name), ['Page', null]);
  assert.match(c.notes[0], /1 comments came without the commenter's name/);
});

test('TikTok connector answers: comments and their replies, hidden ones marked', () => {
  const records = fromMcp({ code: 0, data: { comments: [
    { comment_id: '1', video_id: 'v', text: 'So cool', create_time: '1775503142', likes: 0, replies: 1, status: 'PUBLIC', display_name: 'Name', username: 'name1', user_id: 'abc',
      reply_list: [{ comment_id: '2', parent_comment_id: '1', video_id: 'v', text: 'Thanks', create_time: '1775503200', status: 'HIDDEN', username: 'owner' }] }
  ] } }, '@owner');
  assert.deepEqual(records.map(r => [r.comment_id, r.parent_id, r.hidden]), [['1', null, false], ['2', '1', true]]);
  assert.equal(records[0].post_url, 'https://www.tiktok.com/@owner/video/v');
  assert.equal(records[0].time, '2026-04-06T19:19:02.000Z');
});
