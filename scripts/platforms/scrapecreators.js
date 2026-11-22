// Instagram, TikTok, Facebook and Reddit posts through ScrapeCreators (SCRAPECREATORS_API_KEY), by post link:
// public posts, the person's own or anyone's. 1 credit for each page that returns data; empty or failed pages
// cost nothing. Pages hold about 10 to 20 comments. Replies: Reddit's come nested and are kept; Instagram's,
// TikTok's and Facebook's need extra requests and are not read (the reply count is kept).
// Before the comments, the post's own text (caption or description) and its comment count are read, 1 more
// credit, because the comment endpoints do not give them; Reddit's come with the comments (checked
// 2026-11-21 on four public posts).
const { getJson } = require('../lib/http');
const { postInfo, toIso } = require('./common');

const API = 'https://api.scrapecreators.com';

async function sc(endpoint, params, ctx) {
  const url = new URL(API + endpoint);
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, v);
  const { ok, status, body } = await getJson(url, { headers: { 'x-api-key': ctx.env.SCRAPECREATORS_API_KEY }, timeout: 60000 });
  if (body && typeof body.credits_charged === 'number') ctx.cost.scrapecreatorsCharged += body.credits_charged;
  if (body && typeof body.credits_remaining === 'number') ctx.cost.scrapecreatorsLeft = body.credits_remaining;
  if (!ok || body?.success === false) throw new Error(`ScrapeCreators ${endpoint}: HTTP ${status} ${body?.message || body?.error || ''}`.trim());
  return body;
}

// Where each post-information answer keeps the post's own text, comment count and time.
const ABOUT = {
  instagram: {
    endpoint: '/v1/instagram/post',
    pick: body => {
      const media = body?.data?.xdt_shortcode_media || {};
      return { text: media.edge_media_to_caption?.edges?.[0]?.node?.text, comments: media.comment_count, time: media.taken_at_timestamp };
    }
  },
  tiktok: {
    endpoint: '/v2/tiktok/video',
    pick: body => ({ text: body?.aweme_detail?.desc, comments: body?.aweme_detail?.statistics?.comment_count, time: body?.aweme_detail?.create_time })
  },
  facebook: {
    endpoint: '/v1/facebook/post',
    pick: body => ({ text: body?.description, comments: body?.comment_count, time: body?.creation_time })
  }
};

// The post's own text and comment count. If they cannot be read, the comments are still read.
async function about(entry, post, ctx) {
  const source = ABOUT[entry.platform];
  if (!source) return;
  try {
    const found = source.pick(await sc(source.endpoint, { url: post.url }, ctx));
    post.text = found.text ? String(found.text).slice(0, 2000) : null;
    if (typeof found.comments === 'number') post.comments = found.comments;
    if (!post.time && found.time) post.time = toIso(found.time);
  } catch (error) {
    ctx.notes.push(`${entry.platform} ${post.url}: the post's own text could not be read (${error.message})`);
  }
}

function base(entry, platform, post) {
  return {
    platform, route: 'scrapecreators', own: entry.own, account: entry.account,
    post_id: post.id, post_url: post.url, post_time: post.time
  };
}

const instagram = {
  async comments(entry, post, ctx) {
    const records = [];
    let cursor;
    for (let page = 0; page < ctx.maxPages; page += 1) {
      const body = await sc('/v2/instagram/post/comments', { url: post.url, cursor }, ctx);
      for (const c of body.comments || []) {
        records.push({
          ...base(entry, 'instagram', post), comment_id: String(c.id), parent_id: null, time: toIso(c.created_at),
          likes: c.comment_like_count ?? null, replies: c.child_comment_count ?? null, hidden: null, text: c.text || '',
          author_name: c.user?.username || null, author_handle: c.user?.username || null, author_id: c.user?.id || c.user?.pk || null
        });
      }
      ctx.progress?.(entry, page + 1, records.length);
      cursor = body.cursor;
      if (!cursor || !(body.comments || []).length) break;
    }
    return records;
  }
};

const tiktok = {
  async comments(entry, post, ctx) {
    const records = [];
    let cursor;
    for (let page = 0; page < ctx.maxPages; page += 1) {
      const body = await sc('/v1/tiktok/video/comments', { url: post.url, cursor }, ctx);
      for (const c of body.comments || []) {
        records.push({
          ...base(entry, 'tiktok', post), comment_id: String(c.cid), parent_id: null, time: toIso(c.create_time),
          likes: c.digg_count ?? null, replies: c.reply_comment_total ?? null, hidden: null, text: c.text || '',
          author_name: c.user?.nickname || null, author_handle: c.user?.unique_id ? `@${c.user.unique_id}` : null, author_id: c.user?.uid || null
        });
      }
      ctx.progress?.(entry, page + 1, records.length);
      cursor = body.cursor;
      if (!body.has_more || !(body.comments || []).length) break;
    }
    return records;
  }
};

const facebook = {
  async comments(entry, post, ctx) {
    const records = [];
    let cursor;
    for (let page = 0; page < ctx.maxPages; page += 1) {
      const body = await sc('/v1/facebook/post/comments', { url: post.url, sort: 'all', cursor }, ctx);
      for (const c of body.comments || []) {
        records.push({
          ...base(entry, 'facebook', post), comment_id: String(c.id), parent_id: null, time: toIso(c.created_at),
          likes: c.reaction_count ?? null, replies: c.reply_count ?? null, hidden: null, text: c.text || '',
          author_name: c.author?.name || null, author_handle: null, author_id: c.author?.id || null
        });
      }
      ctx.progress?.(entry, page + 1, records.length);
      cursor = body.cursor;
      if (!body.has_next_page || !cursor) break;
    }
    return records;
  }
};

function flattenReddit(list, parentId, out) {
  for (const c of list || []) {
    if (!c || typeof c !== 'object' || !c.id) continue;
    out.push({ c, parentId });
    const replies = c.replies && typeof c.replies === 'object' ? (c.replies.items || c.replies) : [];
    flattenReddit(Array.isArray(replies) ? replies : [], c.id, out);
  }
  return out;
}

const reddit = {
  async comments(entry, post, ctx) {
    const records = [];
    let cursor;
    for (let page = 0; page < ctx.maxPages; page += 1) {
      const body = await sc('/v1/reddit/post/comments', { url: post.url, trim: 'true', cursor }, ctx);
      if (body.post && !post.time) post.time = toIso(body.post.created_utc);
      if (body.post && page === 0) {
        post.title = body.post.title || null;
        post.text = body.post.selftext ? String(body.post.selftext).slice(0, 2000) : null;
        if (typeof body.post.num_comments === 'number') post.comments = body.post.num_comments;
      }
      for (const { c, parentId } of flattenReddit(body.comments, null, [])) {
        if (!c.body || c.body === '[deleted]' || c.body === '[removed]') continue;
        records.push({
          ...base(entry, 'reddit', post), comment_id: String(c.id), parent_id: parentId, time: toIso(c.created_utc),
          likes: c.score ?? null, replies: null, hidden: null, text: c.body,
          author_name: c.author || null, author_handle: c.author ? `u/${c.author}` : null, author_id: c.author_fullname || null
        });
      }
      ctx.progress?.(entry, page + 1, records.length);
      cursor = body.more?.has_more ? body.more.cursor : null;
      if (!cursor) break;
    }
    return records;
  }
};

const READERS = { instagram, tiktok, facebook, reddit };

// The number of comments is not known before reading, so --plan shows it as unknown and reads nothing.
async function read(entry, ctx) {
  const post = postInfo(entry.platform, entry.url, entry.url, null, undefined);
  if (ctx.plan) return { posts: [post], records: [] };
  await about(entry, post, ctx);
  if (post.comments === 0) return { posts: [post], records: [] };
  return { posts: [post], records: await READERS[entry.platform].comments(entry, post, ctx) };
}

module.exports = { ABOUT, flattenReddit, read };
