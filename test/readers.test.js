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

const ctx = (over = {}) => ({ env: { YOUTUBE_API_KEY: 'k', SCRAPECREATORS_API_KEY: 'k', X_BEARER_TOKEN: 't', META_PAGE_TOKEN: 'p', META_PAGE_ID: '99', IG_USER_ID: '77' }, maxPages: 10, listPages: 5, cost: newCost(), notes: [], ...over });
const ytComment = (text, extra = {}) => ({ textOriginal: text, authorDisplayName: '@sample', authorChannelId: { value: 'UCx' }, likeCount: 1, publishedAt: '2026-11-20T10:00:00Z', ...extra });
const daysAgo = days => new Date(Date.now() - days * 86400000).toISOString();

test('YouTube video link: two pages of threads, and replies beyond the five shown are read separately', async () => {
  const asked = fake([
    { test: u => u.pathname.endsWith('/videos'), body: () => ({ items: [{ statistics: { commentCount: '10' }, snippet: { publishedAt: '2026-11-19T00:00:00Z', channelTitle: 'Sample channel' } }] }) },
    { test: u => u.pathname.endsWith('/commentThreads') && !u.searchParams.get('pageToken'), body: () => ({ nextPageToken: 'p2', items: [
      { snippet: { totalReplyCount: 1, topLevelComment: { id: 't1', snippet: ytComment('first') } }, replies: { comments: [{ id: 't1.r1', snippet: ytComment('reply', { parentId: 't1' }) }] } }
    ] }) },
    { test: u => u.pathname.endsWith('/commentThreads'), body: () => ({ items: [
      { snippet: { totalReplyCount: 7, topLevelComment: { id: 't2', snippet: ytComment('second') } }, replies: { comments: [] } }
    ] }) },
    { test: u => u.pathname.endsWith('/comments'), body: () => ({ items: Array.from({ length: 7 }, (_, i) => ({ id: `t2.r${i}`, snippet: ytComment(`r${i}`) })) }) }
  ]);
  const c = ctx();
  const url = 'https://youtu.be/VID123';
  const { posts, records } = await youtube.read({ platform: 'youtube', own: false, account: null, url }, c);
  assert.equal(posts[0].comments, 10);
  assert.equal(records.length, 10);
  assert.equal(records[1].parent_id, 't1');
  assert.equal(records.filter(r => r.parent_id === 't2').length, 7);
  assert.equal(records[0].author_id, 'UCx');
  assert.equal(records[0].post_url, url);
  assert.equal(records[0].account, 'Sample channel');
  assert.equal(c.cost.youtubeUnits, 4);
  assert.ok(asked.every(u => u.searchParams.get('key') === 'k'));
});

test('YouTube: a video with comments turned off is noted, not an error', async () => {
  fake([{ test: u => u.pathname.endsWith('/videos'), body: () => ({ items: [{ statistics: {}, snippet: {} }] }) }]);
  const c = ctx();
  const { records } = await youtube.read({ platform: 'youtube', url: 'https://www.youtube.com/watch?v=abc' }, c);
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
  const url = 'https://www.reddit.com/r/x/comments/1/y/';
  const { records } = await sc.read({ platform: 'reddit', own: null, account: 'r/x', url }, c);
  assert.deepEqual(records.map(r => [r.comment_id, r.parent_id]), [['a', null], ['b', 'a']]);
  assert.equal(records[0].author_handle, 'u/user1');
  assert.equal(records[0].post_url, url);
  assert.equal(c.cost.scrapecreatorsCharged, 1);
  assert.equal(c.cost.scrapecreatorsLeft, 50);
});

test('ScrapeCreators post link: the plan reads nothing; a read follows the cursor', async () => {
  const asked = fake([{ test: u => u.pathname === '/v2/instagram/post/comments', body: u => (u.searchParams.get('cursor')
    ? { success: true, credits_charged: 1, comments: [{ id: 'x2', text: 'Shade range?', created_at: '2026-11-21T02:00:00.000Z', user: { username: 'two', id: '56' } }] }
    : { success: true, credits_charged: 1, cursor: 'next', comments: [{ id: 'x1', text: 'Price?', created_at: '2026-11-21T01:00:00.000Z', comment_like_count: 3, user: { username: 'buyer', id: '55' } }] }) }]);
  const entry = { platform: 'instagram', route: 'scrapecreators', own: false, account: null, url: 'https://www.instagram.com/p/OTHER/' };
  const planned = await sc.read(entry, ctx({ plan: true }));
  assert.equal(planned.posts[0].comments, null);
  assert.equal(asked.length, 0);
  const c = ctx();
  const { records } = await sc.read(entry, c);
  assert.deepEqual(records.map(r => r.author_handle), ['buyer', 'two']);
  assert.equal(c.cost.scrapecreatorsCharged, 2);
});

test('X: the post is looked up, then replies get the replier from the user list; a reply to a reply keeps its parent', async () => {
  fake([
    { test: u => u.pathname.endsWith('/tweets/10'), body: () => ({ data: { id: '10', created_at: daysAgo(1), conversation_id: '10', public_metrics: { reply_count: 2 } } }) },
    { test: u => u.pathname.endsWith('/tweets/search/recent'), body: u => {
      assert.equal(u.searchParams.get('query'), 'conversation_id:10 is:reply');
      return {
        data: [
          { id: '11', text: 'Nice', author_id: 'u1', created_at: daysAgo(0.5), public_metrics: { like_count: 2, reply_count: 0 }, referenced_tweets: [{ type: 'replied_to', id: '10' }] },
          { id: '12', text: 'Agree', author_id: 'u2', created_at: daysAgo(0.4), public_metrics: { like_count: 0, reply_count: 0 }, referenced_tweets: [{ type: 'replied_to', id: '11' }] }
        ],
        includes: { users: [{ id: 'u1', name: 'One', username: 'one' }, { id: 'u2', name: 'Two', username: 'two' }] }, meta: {}
      };
    } }
  ]);
  const c = ctx();
  const { records } = await x.read({ platform: 'x', own: false, url: 'https://x.com/brand/status/10' }, c);
  assert.deepEqual(records.map(r => [r.comment_id, r.parent_id, r.author_handle]), [['11', null, '@one'], ['12', '11', '@two']]);
  assert.equal(c.cost.xPosts, 3);
  assert.equal(c.cost.xUsers, 2);
});

test('X: a post older than 7 days is skipped without searching', async () => {
  const asked = fake([{ test: u => u.pathname.endsWith('/tweets/10'), body: () => ({ data: { id: '10', created_at: daysAgo(9), public_metrics: { reply_count: 40 } } }) }]);
  const { records, skipped } = await x.read({ platform: 'x', own: true, url: 'https://x.com/me/status/10' }, ctx());
  assert.equal(records.length, 0);
  assert.match(skipped, /more than 7 days ago/);
  assert.equal(asked.length, 1);
});

test('X search never starts more than 7 days back', () => {
  const now = Date.parse('2026-11-21T00:00:00Z');
  assert.equal(x.searchStart(now), new Date(now - 7 * 86400000 + 60000).toISOString());
});

test('Meta Instagram: the post is found among the account\'s own posts by the code in its link', async () => {
  fake([
    { test: u => u.pathname.endsWith('/77/media') && !u.searchParams.get('after'), body: () => ({ data: [{ id: 'm1', permalink: 'https://www.instagram.com/p/AAA/', comments_count: 1 }], paging: { next: 'https://graph.facebook.com/v27.0/77/media?after=x&access_token=p' } }) },
    { test: u => u.pathname.endsWith('/77/media'), body: () => ({ data: [{ id: 'm2', permalink: 'https://www.instagram.com/reel/BBB/', timestamp: '2026-11-20T00:00:00+0000', comments_count: 2 }] }) },
    { test: u => u.pathname.endsWith('/m2/comments'), body: () => ({ data: [
      { id: 'i1', text: 'Where to buy?', timestamp: '2026-11-20T01:00:00+0000', like_count: 1, username: 'fan', from: { id: '501', username: 'fan' },
        replies: { data: [{ id: 'i2', text: 'Link in bio', timestamp: '2026-11-20T02:00:00+0000', username: 'shop', from: { id: '77', username: 'shop' } }] } }
    ] }) }
  ]);
  const url = 'https://www.instagram.com/p/BBB/?igsh=abc';
  const { posts, records } = await meta.read({ platform: 'instagram', route: 'official', own: true, account: null, url }, ctx());
  assert.equal(posts[0].id, 'm2');
  assert.deepEqual(records.map(r => [r.comment_id, r.parent_id, r.author_handle]), [['i1', null, 'fan'], ['i2', 'i1', 'shop']]);
  assert.equal(records[0].post_url, url);
  await assert.rejects(meta.read({ platform: 'instagram', own: true, url: 'https://www.instagram.com/p/ZZZ/' }, ctx()), /not a post of the Instagram account/);
});

test('Meta Facebook Page: a link with the post number; comments without a commenter are counted in a note', async () => {
  fake([
    { test: u => u.pathname.endsWith('/99_1'), body: () => ({ id: '99_1', permalink_url: 'https://www.facebook.com/99/posts/pfbid0X', created_time: '2026-11-20T00:00:00+0000' }) },
    { test: u => u.pathname.endsWith('/99_1/comments'), body: () => ({ summary: { total_count: 2 }, data: [
      { id: 'f1', message: 'From the Page', created_time: '2026-11-20T01:00:00+0000', like_count: 0, from: { id: '99', name: 'Page' } },
      { id: 'f2', message: 'From a visitor', created_time: '2026-11-20T02:00:00+0000', like_count: 1 }
    ] }) }
  ]);
  const c = ctx();
  const url = 'https://www.facebook.com/99/posts/1';
  const { records } = await meta.read({ platform: 'facebook', route: 'official', own: true, url }, c);
  assert.deepEqual(records.map(r => r.author_name), ['Page', null]);
  assert.equal(records[0].post_url, url);
  assert.match(c.notes[0], /1 comments came without the commenter's name/);
});

test('Meta Facebook Page: a share link is matched among the Page\'s posts, or the latest posts are listed', async () => {
  fake([
    { test: u => u.pathname.endsWith('/99/published_posts'), body: () => ({ data: [
      { id: '99_5', permalink_url: 'https://www.facebook.com/99/posts/pfbid0KNOWN', created_time: '2026-11-19T00:00:00+0000', message: 'Launch day' },
      { id: '99_4', permalink_url: 'https://www.facebook.com/99/posts/pfbid0OLDER', created_time: '2026-11-10T00:00:00+0000', message: 'Behind the scenes' }
    ] }) },
    { test: u => u.pathname.endsWith('/99_5/comments'), body: () => ({ summary: { total_count: 0 }, data: [] }) }
  ]);
  const { posts } = await meta.read({ platform: 'facebook', own: true, url: 'https://www.facebook.com/brand/posts/pfbid0KNOWN' }, ctx());
  assert.equal(posts[0].id, '99_5');
  await assert.rejects(meta.read({ platform: 'facebook', own: true, url: 'https://www.facebook.com/share/p/1AbC/' }, ctx()), /Launch day[\s\S]*Behind the scenes/);
});

test('TikTok connector answers: comments and their replies, hidden ones marked, kept under the video link', () => {
  const answer = { code: 0, data: { comments: [
    { comment_id: '1', video_id: 'v', text: 'So cool', create_time: '1775503142', likes: 0, replies: 1, status: 'PUBLIC', display_name: 'Name', username: 'name1', user_id: 'abc',
      reply_list: [{ comment_id: '2', parent_comment_id: '1', video_id: 'v', text: 'Thanks', create_time: '1775503200', status: 'HIDDEN', username: 'owner' }] }
  ] } };
  const records = fromMcp(answer, '@owner');
  assert.deepEqual(records.map(r => [r.comment_id, r.parent_id, r.hidden]), [['1', null, false], ['2', '1', true]]);
  assert.equal(records[0].post_url, 'https://www.tiktok.com/@owner/video/v');
  assert.equal(records[0].time, '2026-04-06T19:19:02.000Z');
  const link = 'https://www.tiktok.com/@owner/video/v?lang=en';
  assert.equal(fromMcp(answer, link)[0].post_url, link);
  assert.equal(fromMcp(answer, link)[0].account, '@owner');
});

const window = (sinceDays, untilDays = 0) => ({ since: daysAgo(sinceDays), until: daysAgo(untilDays) });

test('YouTube account: the channel\'s videos inside the time range, with their comment counts; older pages are not read', async () => {
  const asked = fake([
    { test: u => u.pathname.endsWith('/channels'), body: u => {
      assert.equal(u.searchParams.get('forHandle'), '@SampleChannel');
      return { items: [{ snippet: { title: 'Sample Channel' }, contentDetails: { relatedPlaylists: { uploads: 'UU1' } } }] };
    } },
    { test: u => u.pathname.endsWith('/playlistItems') && !u.searchParams.get('pageToken'), body: () => ({ nextPageToken: 'p2', items: [
      { contentDetails: { videoId: 'new', videoPublishedAt: daysAgo(1) } },
      { contentDetails: { videoId: 'v1', videoPublishedAt: daysAgo(3) } },
      { contentDetails: { videoId: 'v2', videoPublishedAt: daysAgo(20) } },
      { contentDetails: { videoId: 'old', videoPublishedAt: daysAgo(40) } }
    ] }) },
    { test: u => u.pathname.endsWith('/videos'), body: () => ({ items: [{ id: 'v1', statistics: { commentCount: '120' } }, { id: 'v2', statistics: {} }] }) }
  ]);
  const { account, posts } = await youtube.list({ platform: 'youtube', account: 'https://www.youtube.com/@SampleChannel' }, ctx({ window: window(30, 2) }));
  assert.equal(account, 'Sample Channel');
  assert.deepEqual(posts.map(p => [p.id, p.comments, p.url]), [['v1', 120, 'https://www.youtube.com/watch?v=v1'], ['v2', 0, 'https://www.youtube.com/watch?v=v2']]);
  assert.equal(asked.filter(u => u.pathname.endsWith('/playlistItems')).length, 1);
});

test('ScrapeCreators Instagram account: only posts inside the time range; a pinned old post does not stop the list', async () => {
  const asked = fake([{ test: u => u.pathname === '/v2/instagram/user/posts', body: u => (u.searchParams.get('next_max_id')
    ? { success: true, more_available: true, next_max_id: 'c3', items: [{ id: '4', code: 'OLD', taken_at: Math.floor(Date.parse(daysAgo(50)) / 1000), comment_count: 9 }] }
    : { success: true, more_available: true, next_max_id: 'c2', items: [
      { id: '0', code: 'PINNED', taken_at: Math.floor(Date.parse(daysAgo(90)) / 1000), comment_count: 50 },
      { id: '1', code: 'TODAY', taken_at: Math.floor(Date.parse(daysAgo(0.5)) / 1000), comment_count: 1 },
      { id: '2', code: 'INSIDE', taken_at: Math.floor(Date.parse(daysAgo(5)) / 1000), comment_count: 2 }
    ] }) }]);
  const { posts } = await sc.list({ platform: 'instagram', account: '@shop' }, ctx({ window: window(30, 1) }));
  assert.deepEqual(posts.map(p => p.url), ['https://www.instagram.com/p/INSIDE/']);
  assert.equal(asked.length, 2);
  assert.equal(asked[0].searchParams.get('handle'), 'shop');
});

test('X account: its own posts from the last 7 days; a range that ended earlier is skipped', async () => {
  const asked = fake([{ test: u => u.pathname.endsWith('/tweets/search/recent'), body: () => ({ data: [
    { id: '21', created_at: daysAgo(2), conversation_id: '21', public_metrics: { reply_count: 4 } }
  ], meta: {} }) }]);
  const c = ctx({ window: window(30) });
  const { account, posts } = await x.list({ platform: 'x', account: 'https://x.com/brand' }, c);
  assert.equal(account, '@brand');
  assert.deepEqual(posts.map(p => [p.url, p.comments, p.conversation]), [['https://x.com/brand/status/21', 4, '21']]);
  assert.equal(asked[0].searchParams.get('query'), 'from:brand -is:retweet -is:reply');
  assert.match(c.notes[0], /only posts from the last 7 days/);
  assert.equal(c.cost.xPosts, 1);
  const old = await x.list({ platform: 'x', account: '@brand' }, ctx({ window: window(40, 10) }));
  assert.match(old.skipped, /more than 7 days ago/);
});

test('Meta Facebook Page account: the Page\'s posts inside the time range, each with its comment count', async () => {
  fake([
    { test: u => u.pathname.endsWith('/99/published_posts'), body: () => ({ data: [
      { id: '99_3', permalink_url: 'https://www.facebook.com/99/posts/3', created_time: daysAgo(1) },
      { id: '99_2', permalink_url: 'https://www.facebook.com/99/posts/2', created_time: daysAgo(40) }
    ] }) },
    { test: u => u.pathname.endsWith('/99_3/comments'), body: () => ({ summary: { total_count: 5 }, data: [] }) }
  ]);
  const { posts } = await meta.list({ platform: 'facebook', account: 'My Page', own: true }, ctx({ window: window(30) }));
  assert.deepEqual(posts.map(p => [p.id, p.comments]), [['99_3', 5]]);
});

test('a post with more comments than the page limit is read top comments first', async () => {
  const asked = fake([{ test: u => u.pathname.endsWith('/commentThreads'), body: () => ({ items: [] }) }]);
  await youtube.readVideo({ id: 'big', comments: 5000 }, { platform: 'youtube' }, ctx({ maxPages: 10 }));
  await youtube.readVideo({ id: 'small', comments: 50 }, { platform: 'youtube' }, ctx({ maxPages: 10 }));
  assert.deepEqual(asked.map(u => u.searchParams.get('order')), ['relevance', 'time']);
  const searched = fake([
    { test: u => u.pathname.endsWith('/tweets/20'), body: () => ({ data: { id: '20', created_at: daysAgo(1), conversation_id: '20', public_metrics: { reply_count: 4000 } } }) },
    { test: u => u.pathname.endsWith('/tweets/search/recent'), body: () => ({ data: [], meta: {} }) }
  ]);
  await x.read({ platform: 'x', url: 'https://x.com/a/status/20' }, ctx({ maxPages: 10 }));
  assert.equal(searched.find(u => u.pathname.endsWith('/search/recent')).searchParams.get('sort_order'), 'relevancy');
});
