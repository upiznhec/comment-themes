// YouTube through the official YouTube Data API (YOUTUBE_API_KEY). Reads any public video, own or not.
// Each request costs 1 unit of the project's 10,000 a day: a channel lookup, a page of 50 uploads, a page
// of 100 comment threads, a page of 100 replies.
const { getJson } = require('../lib/http');
const { inWindow, postInfo, toIso } = require('./common');

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

function record(snippet, id, parentId, entry, videoId) {
  return {
    platform: 'youtube', route: 'official', own: entry.own, account: entry.account,
    post_id: videoId, post_url: `https://www.youtube.com/watch?v=${videoId}`,
    comment_id: id, parent_id: parentId, time: toIso(snippet.publishedAt),
    likes: snippet.likeCount ?? null, replies: null, hidden: false, text: snippet.textOriginal ?? snippet.textDisplay ?? '',
    author_name: snippet.authorDisplayName || null,
    author_handle: /^@/.test(snippet.authorDisplayName || '') ? snippet.authorDisplayName : null,
    author_id: snippet.authorChannelId?.value || null
  };
}

// All comments and replies of one video.
async function readVideo(videoId, entry, ctx) {
  const records = [];
  let pageToken = '';
  for (let page = 0; page < ctx.maxPages; page += 1) {
    const params = { part: 'snippet,replies', videoId, maxResults: '100', order: 'time', textFormat: 'plainText' };
    if (pageToken) params.pageToken = pageToken;
    let body;
    try {
      body = await yt('commentThreads', params, ctx);
    } catch (error) {
      if (error.reason === 'commentsDisabled') { ctx.notes.push(`YouTube ${videoId}: comments are turned off`); return records; }
      throw error;
    }
    for (const thread of body.items || []) {
      const top = thread.snippet.topLevelComment;
      const item = record(top.snippet, top.id, null, entry, videoId);
      item.replies = thread.snippet.totalReplyCount ?? 0;
      records.push(item);
      const inline = thread.replies?.comments || [];
      if (item.replies > inline.length && !ctx.noReplies) {
        let replyToken = '';
        for (let replyPage = 0; replyPage < ctx.maxPages; replyPage += 1) {
          const replyParams = { part: 'snippet', parentId: top.id, maxResults: '100', textFormat: 'plainText' };
          if (replyToken) replyParams.pageToken = replyToken;
          const replies = await yt('comments', replyParams, ctx);
          for (const reply of replies.items || []) records.push(record(reply.snippet, reply.id, top.id, entry, videoId));
          replyToken = replies.nextPageToken;
          if (!replyToken) break;
        }
      } else {
        for (const reply of inline) records.push(record(reply.snippet, reply.id, top.id, entry, videoId));
      }
    }
    pageToken = body.nextPageToken;
    if (!pageToken) break;
  }
  return records;
}

// The channel's uploads published since ctx.since, newest first.
async function listUploads(entry, ctx) {
  const handle = String(entry.account).trim();
  const params = { part: 'contentDetails,snippet' };
  if (/^UC[\w-]{20,}$/.test(handle)) params.id = handle;
  else params.forHandle = handle.startsWith('@') ? handle : `@${handle}`;
  const channel = (await yt('channels', params, ctx)).items?.[0];
  if (!channel) throw new Error(`YouTube: no channel found for ${handle}`);
  const uploads = channel.contentDetails.relatedPlaylists.uploads;
  const videos = [];
  let pageToken = '';
  for (let page = 0; page < ctx.maxPages; page += 1) {
    const listParams = { part: 'contentDetails', playlistId: uploads, maxResults: '50' };
    if (pageToken) listParams.pageToken = pageToken;
    const body = await yt('playlistItems', listParams, ctx);
    const items = body.items || [];
    for (const item of items) {
      const published = item.contentDetails.videoPublishedAt;
      if (published && inWindow(published, ctx.since)) videos.push({ id: item.contentDetails.videoId, time: published });
    }
    const last = items[items.length - 1]?.contentDetails?.videoPublishedAt;
    pageToken = body.nextPageToken;
    if (!pageToken || (last && !inWindow(last, ctx.since))) break;
  }
  if (videos.length) {
    for (let i = 0; i < videos.length; i += 50) {
      const stats = await yt('videos', { part: 'statistics', id: videos.slice(i, i + 50).map(v => v.id).join(',') }, ctx);
      for (const item of stats.items || []) {
        const video = videos.find(v => v.id === item.id);
        if (video) video.comments = item.statistics.commentCount === undefined ? null : Number(item.statistics.commentCount);
      }
    }
  }
  return videos.map(v => postInfo('youtube', v.id, `https://www.youtube.com/watch?v=${v.id}`, v.time, v.comments));
}

async function read(entry, ctx) {
  const posts = entry.kind === 'post'
    ? [postInfo('youtube', videoIdFromUrl(entry.url), entry.url, null, undefined)]
    : await listUploads(entry, ctx);
  if (posts.some(post => !post.id || post.id === 'null')) throw new Error(`YouTube: no video ID in ${entry.url}`);
  if (ctx.plan) return { posts, records: [] };
  const records = [];
  for (const post of posts) {
    if (post.comments === 0) continue;
    records.push(...await readVideo(post.id, entry, ctx));
  }
  return { posts, records };
}

module.exports = { read, readVideo, videoIdFromUrl };
