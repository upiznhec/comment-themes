// YouTube through the official YouTube Data API (YOUTUBE_API_KEY): any public video, the person's own or not.
// Each request costs 1 unit of the project's 10,000 a day: a video lookup, a page of 100 comment threads,
// a page of 100 replies.
const { getJson } = require('../lib/http');
const { postInfo, toIso } = require('./common');

const API = 'https://www.googleapis.com/youtube/v3/';

async function yt(endpoint, params, ctx) {
  const url = new URL(API + endpoint);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  url.searchParams.set('key', ctx.env.YOUTUBE_API_KEY);
  const { ok, status, body } = await getJson(url);
  ctx.cost.youtubeUnits += 1;
  if (!ok) {
    const reason = body?.error?.errors?.[0]?.reason || body?.error?.status || `HTTP ${status}`;
    const error = new Error(`YouTube: ${reason}`);
    error.reason = reason;
    throw error;
  }
  return body;
}

function videoIdFromUrl(url) {
  try {
    const u = new URL(url);
    if (u.hostname.endsWith('youtu.be')) return u.pathname.slice(1).split('/')[0] || null;
    if (u.searchParams.get('v')) return u.searchParams.get('v');
    const match = u.pathname.match(/\/(shorts|live|embed)\/([^/?]+)/);
    return match ? match[2] : null;
  } catch (error) {
    return null;
  }
}

function record(snippet, id, parentId, entry, post) {
  return {
    platform: 'youtube', route: 'official', own: entry.own, account: entry.account,
    post_id: post.id, post_url: post.url, post_time: post.time,
    comment_id: id, parent_id: parentId, time: toIso(snippet.publishedAt),
    likes: snippet.likeCount ?? null, replies: null, hidden: false, text: snippet.textOriginal ?? snippet.textDisplay ?? '',
    author_name: snippet.authorDisplayName || null,
    author_handle: /^@/.test(snippet.authorDisplayName || '') ? snippet.authorDisplayName : null,
    author_id: snippet.authorChannelId?.value || null
  };
}

// All comments and replies of one video.
async function readVideo(post, entry, ctx) {
  const records = [];
  let pageToken = '';
  for (let page = 0; page < ctx.maxPages; page += 1) {
    const params = { part: 'snippet,replies', videoId: post.id, maxResults: '100', order: 'time', textFormat: 'plainText' };
    if (pageToken) params.pageToken = pageToken;
    let body;
    try {
      body = await yt('commentThreads', params, ctx);
    } catch (error) {
      if (error.reason === 'commentsDisabled') { ctx.notes.push(`YouTube ${post.id}: comments are turned off`); return records; }
      throw error;
    }
    for (const thread of body.items || []) {
      const top = thread.snippet.topLevelComment;
      const item = record(top.snippet, top.id, null, entry, post);
      item.replies = thread.snippet.totalReplyCount ?? 0;
      records.push(item);
      const inline = thread.replies?.comments || [];
      if (item.replies > inline.length && !ctx.noReplies) {
        let replyToken = '';
        for (let replyPage = 0; replyPage < ctx.maxPages; replyPage += 1) {
          const replyParams = { part: 'snippet', parentId: top.id, maxResults: '100', textFormat: 'plainText' };
          if (replyToken) replyParams.pageToken = replyToken;
          const replies = await yt('comments', replyParams, ctx);
          for (const reply of replies.items || []) records.push(record(reply.snippet, reply.id, top.id, entry, post));
          replyToken = replies.nextPageToken;
          if (!replyToken) break;
        }
      } else {
        for (const reply of inline) records.push(record(reply.snippet, reply.id, top.id, entry, post));
      }
    }
    pageToken = body.nextPageToken;
    if (!pageToken) break;
  }
  return records;
}

async function read(entry, ctx) {
  const id = videoIdFromUrl(entry.url);
  if (!id) throw new Error(`YouTube: no video ID in ${entry.url}`);
  const video = (await yt('videos', { part: 'statistics,snippet', id }, ctx)).items?.[0];
  if (!video) throw new Error(`YouTube: video ${id} not found (private or deleted?)`);
  const counted = video.statistics?.commentCount !== undefined;
  const post = postInfo('youtube', id, entry.url, video.snippet?.publishedAt, counted ? Number(video.statistics.commentCount) : 0);
  if (!counted) { ctx.notes.push(`YouTube ${id}: comments are turned off`); return { posts: [post], records: [] }; }
  if (ctx.plan || !post.comments) return { posts: [post], records: [] };
  const withChannel = { ...entry, account: entry.account || video.snippet?.channelTitle || null };
  return { posts: [post], records: await readVideo(post, withChannel, ctx) };
}

module.exports = { read, readVideo, videoIdFromUrl };
