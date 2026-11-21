// The person's own Instagram professional account and Facebook Page through Meta's Graph API, with the
// Page token saved by meta-token.js (META_PAGE_TOKEN, META_PAGE_ID, IG_USER_ID). Free.
// Instagram gives each commenter's username and ID. Facebook, while the person's Meta app is in
// development mode, gives the text of other people's comments but not who wrote them (tested
// 2026-11-21): author fields stay empty and the summary says how many.
const { getJson } = require('../lib/http');
const { inWindow, postInfo, toIso } = require('./common');

const GRAPH = 'https://graph.facebook.com/v27.0/';

async function graph(pathOrUrl, params, ctx) {
  const url = pathOrUrl.startsWith('https://') ? new URL(pathOrUrl) : new URL(GRAPH + pathOrUrl);
  for (const [k, v] of Object.entries(params || {})) url.searchParams.set(k, v);
  if (!url.searchParams.get('access_token')) url.searchParams.set('access_token', ctx.env.META_PAGE_TOKEN);
  const { ok, status, body } = await getJson(url);
  if (!ok || body?.error) throw new Error(`Meta: ${body?.error?.code || status} ${body?.error?.message ? body.error.message.slice(0, 160) : ''}`.trim());
  return body;
}

// Follows paging.next (it carries the token, so it is never printed) until stop() or maxPages.
async function pages(first, params, ctx, stop) {
  const items = [];
  let body = await graph(first, params, ctx);
  for (let page = 0; page < ctx.maxPages; page += 1) {
    items.push(...(body.data || []));
    if (!body.paging?.next || (stop && stop(body.data || []))) break;
    body = await graph(body.paging.next, null, ctx);
  }
  return items;
}

function igRecord(item, parentId, entry, media) {
  return {
    platform: 'instagram', route: 'official', own: true, account: entry.account,
    post_id: media.id, post_url: media.permalink || null, post_time: toIso(media.timestamp),
    comment_id: item.id, parent_id: parentId, time: toIso(item.timestamp), likes: item.like_count ?? null,
    replies: item.replies?.data ? item.replies.data.length : null, hidden: item.hidden ?? null, text: item.text || '',
    author_name: item.username || item.from?.username || null, author_handle: item.username || item.from?.username || null,
    author_id: item.from?.id || null
  };
}

async function readInstagram(entry, ctx) {
  const ig = ctx.env.IG_USER_ID;
  if (!ig) throw new Error('Instagram: no Instagram account is linked to the saved Page. Link one and run meta-token.js again.');
  const media = (await pages(`${ig}/media`, { fields: 'id,permalink,timestamp,comments_count', limit: '50' }, ctx,
    data => data.length && !inWindow(data[data.length - 1].timestamp, ctx.since)))
    .filter(item => inWindow(item.timestamp, ctx.since));
  const posts = media.map(m => postInfo('instagram', m.id, m.permalink, m.timestamp, m.comments_count ?? null));
  if (ctx.plan) return { posts, records: [] };
  const records = [];
  for (const m of media) {
    if (!m.comments_count) continue;
    const comments = await pages(`${m.id}/comments`, {
      fields: 'id,text,timestamp,like_count,hidden,username,from,replies{id,text,timestamp,like_count,hidden,username,from}',
      limit: '50'
    }, ctx);
    for (const c of comments) {
      records.push(igRecord(c, null, entry, m));
      for (const reply of c.replies?.data || []) records.push(igRecord(reply, c.id, entry, m));
    }
  }
  return { posts, records };
}

async function readFacebook(entry, ctx) {
  const page = ctx.env.META_PAGE_ID;
  const list = (await pages(`${page}/published_posts`, { fields: 'id,permalink_url,created_time', limit: '25' }, ctx,
    data => data.length && !inWindow(data[data.length - 1].created_time, ctx.since)))
    .filter(item => inWindow(item.created_time, ctx.since));
  const posts = list.map(p => postInfo('facebook', p.id, p.permalink_url, p.created_time, undefined));
  if (ctx.plan) {
    for (const post of posts) {
      const summary = await graph(`${post.id}/comments`, { summary: 'true', limit: '0', filter: 'stream' }, ctx);
      post.comments = summary.summary?.total_count ?? null;
    }
    return { posts, records: [] };
  }
  const records = [];
  let withoutAuthor = 0;
  for (const post of posts) {
    const comments = await pages(`${post.id}/comments`, {
      fields: 'id,message,created_time,like_count,comment_count,from,parent{id}', filter: 'stream', limit: '100'
    }, ctx);
    for (const c of comments) {
      if (!c.from) withoutAuthor += 1;
      records.push({
        platform: 'facebook', route: 'official', own: true, account: entry.account,
        post_id: post.id, post_url: post.url, post_time: post.time,
        comment_id: c.id, parent_id: c.parent?.id || null, time: toIso(c.created_time), likes: c.like_count ?? null,
        replies: c.comment_count ?? null, hidden: null, text: c.message || '',
        author_name: c.from?.name || null, author_handle: null, author_id: c.from?.id || null
      });
    }
  }
  if (withoutAuthor) ctx.notes.push(`Facebook: ${withoutAuthor} comments came without the commenter's name (the Meta app is in development mode; ScrapeCreators gives names)`);
  return { posts, records };
}

async function read(entry, ctx) {
  if (entry.kind === 'post') throw new Error(`${entry.platform}: the official route reads your whole account; list the account instead of a post link`);
  return entry.platform === 'instagram' ? readInstagram(entry, ctx) : readFacebook(entry, ctx);
}

module.exports = { read };
