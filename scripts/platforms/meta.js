// The person's own Instagram professional account and Facebook Page posts through Meta's Graph API, with the
// Page token saved by meta-token.js (META_PAGE_TOKEN, META_PAGE_ID, IG_USER_ID). Free.
// Instagram gives each commenter's username and ID. Facebook, while the person's Meta app is in development
// mode, gives the text of other people's comments but not who wrote them (tested 2026-11-21).
const { getJson } = require('../lib/http');
const { postInfo, toIso } = require('./common');

const GRAPH = 'https://graph.facebook.com/v27.0/';

async function graph(pathOrUrl, params, ctx) {
  const url = pathOrUrl.startsWith('https://') ? new URL(pathOrUrl) : new URL(GRAPH + pathOrUrl);
  for (const [k, v] of Object.entries(params || {})) url.searchParams.set(k, v);
  if (!url.searchParams.get('access_token')) url.searchParams.set('access_token', ctx.env.META_PAGE_TOKEN);
  const { ok, status, body } = await getJson(url);
  if (!ok || body?.error) {
    const error = new Error(`Meta: ${body?.error?.code || status} ${body?.error?.message ? body.error.message.slice(0, 160) : ''}`.trim());
    error.code = body?.error?.code;
    throw error;
  }
  return body;
}

// Follows paging.next (it carries the token, so it is never printed) until found() or maxPages.
async function pages(first, params, ctx, found) {
  const items = [];
  let body = await graph(first, params, ctx);
  for (let page = 0; page < ctx.maxPages; page += 1) {
    items.push(...(body.data || []));
    if (!body.paging?.next || (found && found(items))) break;
    body = await graph(body.paging.next, null, ctx);
  }
  return items;
}

// The code in an Instagram post link: instagram.com/p/<code>/, /reel/<code>/ or /tv/<code>/.
function shortcodeOf(url) {
  const match = String(url).match(/instagram\.com\/(?:[\w.]+\/)?(?:p|reel|reels|tv)\/([\w-]+)/i);
  return match ? match[1] : null;
}

// A Facebook post's number, when the link has one; share links (pfbid..., /share/p/...) do not.
function facebookPostNumber(url) {
  const patterns = [/\/posts\/(\d+)/, /story_fbid=(\d+)/, /\/permalink\/(\d+)/, /[?&]fbid=(\d+)/, /\/videos\/(\d+)/, /\/reel\/(\d+)/, /\/photos\/[^/]+\/(\d+)/];
  for (const pattern of patterns) {
    const match = String(url).match(pattern);
    if (match) return match[1];
  }
  return null;
}

function igRecord(item, parentId, entry, post) {
  return {
    platform: 'instagram', route: 'official', own: true, account: entry.account,
    post_id: post.id, post_url: post.url, post_time: post.time,
    comment_id: item.id, parent_id: parentId, time: toIso(item.timestamp), likes: item.like_count ?? null,
    replies: item.replies?.data ? item.replies.data.length : null, hidden: item.hidden ?? null, text: item.text || '',
    author_name: item.username || item.from?.username || null, author_handle: item.username || item.from?.username || null,
    author_id: item.from?.id || null
  };
}

// Finds the post among the linked Instagram account's own posts by the code in the link.
async function readInstagram(entry, ctx) {
  const ig = ctx.env.IG_USER_ID;
  if (!ig) throw new Error('Instagram: no Instagram account is linked to the saved Page. Link one and run meta-token.js again.');
  const code = shortcodeOf(entry.url);
  if (!code) throw new Error(`Instagram: no post code in ${entry.url}`);
  const has = item => String(item.permalink || '').includes(`/${code}/`);
  const media = (await pages(`${ig}/media`, { fields: 'id,permalink,timestamp,comments_count', limit: '50' }, ctx, items => items.some(has))).find(has);
  if (!media) throw new Error(`Instagram: ${entry.url} is not a post of the Instagram account linked to your Page (the official route reads only that account's posts)`);
  const post = postInfo('instagram', media.id, entry.url, media.timestamp, media.comments_count ?? null);
  if (ctx.plan || !media.comments_count) return { posts: [post], records: [] };
  const records = [];
  const comments = await pages(`${media.id}/comments`, {
    fields: 'id,text,timestamp,like_count,hidden,username,from,replies{id,text,timestamp,like_count,hidden,username,from}', limit: '50'
  }, ctx);
  for (const c of comments) {
    records.push(igRecord(c, null, entry, post));
    for (const reply of c.replies?.data || []) records.push(igRecord(reply, c.id, entry, post));
  }
  return { posts: [post], records };
}

// Finds the Page post a link points to: by the number in the link, or for a share link by the same link
// among the Page's posts; otherwise lists the Page's latest posts so the person can say which one it is.
async function findFacebookPost(entry, ctx) {
  const page = ctx.env.META_PAGE_ID;
  const number = facebookPostNumber(entry.url);
  if (number) {
    for (const id of [`${page}_${number}`, number]) {
      try {
        return await graph(id, { fields: 'id,permalink_url,created_time' }, ctx);
      } catch (error) { /* try the next form */ }
    }
  }
  const code = (String(entry.url).match(/pfbid\w+/) || [])[0];
  const has = p => Boolean(code) && String(p.permalink_url || '').includes(code);
  const fields = { fields: 'id,permalink_url,created_time,message', limit: '25' };
  const recent = code
    ? await pages(`${page}/published_posts`, fields, ctx, items => items.some(has))
    : (await graph(`${page}/published_posts`, fields, ctx)).data || [];
  const match = recent.find(has);
  if (match) return match;
  const list = recent.slice(0, 10).map(p => `  ${String(p.created_time).slice(0, 10)}  ${(p.message || '(no text)').replace(/\s+/g, ' ').slice(0, 50)}  ${p.permalink_url}`).join('\n');
  throw new Error(`Facebook: ${entry.url} could not be matched to a post of your Page. If it is on a personal profile, read it with ScrapeCreators. Otherwise ask which of the Page's latest posts it is and put that link in request.json instead:\n${list}`);
}

async function readFacebook(entry, ctx) {
  const found = await findFacebookPost(entry, ctx);
  const summary = await graph(`${found.id}/comments`, { summary: 'true', limit: '0', filter: 'stream' }, ctx);
  const post = postInfo('facebook', found.id, entry.url, found.created_time, summary.summary?.total_count ?? null);
  if (ctx.plan || post.comments === 0) return { posts: [post], records: [] };
  const comments = await pages(`${found.id}/comments`, { fields: 'id,message,created_time,like_count,comment_count,from,parent{id}', filter: 'stream', limit: '100' }, ctx);
  let withoutAuthor = 0;
  const records = comments.map(c => {
    if (!c.from) withoutAuthor += 1;
    return {
      platform: 'facebook', route: 'official', own: true, account: entry.account,
      post_id: post.id, post_url: post.url, post_time: post.time,
      comment_id: c.id, parent_id: c.parent?.id || null, time: toIso(c.created_time), likes: c.like_count ?? null,
      replies: c.comment_count ?? null, hidden: null, text: c.message || '',
      author_name: c.from?.name || null, author_handle: null, author_id: c.from?.id || null
    };
  });
  if (withoutAuthor) ctx.notes.push(`Facebook: ${withoutAuthor} comments came without the commenter's name (the Meta app is in development mode; ScrapeCreators gives names)`);
  return { posts: [post], records };
}

async function read(entry, ctx) {
  return entry.platform === 'instagram' ? readInstagram(entry, ctx) : readFacebook(entry, ctx);
}

module.exports = { facebookPostNumber, read, shortcodeOf };
