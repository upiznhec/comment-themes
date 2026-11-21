// YouTube through the official YouTube Data API (YOUTUBE_API_KEY): any public video or channel, the person's own
// or not. Each request costs 1 unit of the project's 10,000 a day: a channel or video lookup, a page of 50
// uploads, a page of 100 comment threads, a page of 100 replies.
const { getJson } = require('../lib/http');
const { before, inside, postInfo, toIso } = require('./common');

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

// A channel given as @handle, a channel ID (UC...) or a channel link.
function channelParams(account) {
  const text = String(account).trim();
  const fromUrl = text.match(/youtube\.com\/(?:channel\/(UC[\w-]{20,})|(@[\w.-]+))/i);
  if (fromUrl) return fromUrl[1] ? { id: fromUrl[1] } : { forHandle: fromUrl[2] };
  if (/^UC[\w-]{20,}$/.test(text)) return { id: text };
  return { forHandle: text.startsWith('@') ? text : `@${text}` };
}

// The channel's videos published in the window, with their comment counts.
async function list(account, ctx) {
  const channel = (await yt('channels', { part: 'contentDetails,snippet', ...channelParams(account.account) }, ctx)).items?.[0];
  if (!channel) throw new Error(`YouTube: no channel found for ${account.account}`);
  const uploads = channel.contentDetails.relatedPlaylists.uploads;
  const videos = [];
  let pageToken = '';
  for (let page = 0; page < ctx.listPages; page += 1) {
    const params = { part: 'contentDetails', playlistId: uploads, maxResults: '50' };
    if (pageToken) params.pageToken = pageToken;
    const body = await yt('playlistItems', params, ctx);
    const items = body.items || [];
    for (const item of items) {
      const published = item.contentDetails.videoPublishedAt;
      if (published && inside(published, ctx.window)) videos.push({ id: item.contentDetails.videoId, time: published });
    }
    pageToken = body.nextPageToken;
    if (!pageToken || before(items[items.length - 1]?.contentDetails?.videoPublishedAt, ctx.window)) break;
  }
  for (let i = 0; i < videos.length; i += 50) {
    const stats = await yt('videos', { part: 'statistics', id: videos.slice(i, i + 50).map(v => v.id).join(',') }, ctx);
    for (const item of stats.items || []) {
      const video = videos.find(v => v.id === item.id);
      if (video) video.comments = item.statistics.commentCount === undefined ? 0 : Number(item.statistics.commentCount);
    }
  }
  return {
    account: channel.snippet?.title || account.account,
    posts: videos.map(v => postInfo('youtube', v.id, `https://www.youtube.com/watch?v=${v.id}`, v.time, v.comments ?? null))
  };
}

// The comments of a video found by list().
async function comments(post, entry, ctx) {
  return readVideo(post, entry, ctx);
}

module.exports = { comments, list, read, readVideo, videoIdFromUrl };
