#!/usr/bin/env node

// The person's own TikTok videos through TikTok's official TikTok Social connector, for AI apps that cannot
// add the connector themselves. In the DeepSeek Harness test (2026-11-21) the app's MCP client had no sign-in
// step, and the agent built a bridge like this one on the spot. This script runs the connector through
// mcp-remote (a small MIT program on npm, pinned below), which does TikTok's sign-in in the person's browser,
// and calls only the connector's four reading tools. The sign-in is kept in data/tiktok-auth/, next to the
// keys in data/.env, so it is asked for only once (TikTok's authorization lasts a year).
// Usage:
//   node scripts/tiktok-bridge.js --check          signs in if needed (TikTok's page opens in the browser) and
//                                                  prints the TikTok account the connector reads
//   node scripts/tiktok-bridge.js --run <name>     reads every comment of the request's own TikTok videos (route
//                                                  "mcp"), keeps TikTok's answers in the run folder, imports them
//                                                  and keeps each video's own text in posts.json
//   options: --max-pages <n> (pages of up to 30 comments per video, default 30)
// npx downloads mcp-remote the first time. Free. Prints counts, never comment text or names.
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { getDataDir } = require('./lib/env-file');
const { runDir } = require('./lib/runs');
const { loadRequest } = require('./lib/sources');
const { addRecords } = require('./lib/db');
const { fromMcp } = require('./platforms/tiktok-mcp');
const { toIso } = require('./platforms/common');
const { withoutPictures } = require('./import');
const { readSummary, savePosts } = require('./fetch');

const ENDPOINT = 'https://business-api.tiktok.com/open_mcp/tt-ads-mcp-organic-social';
// Pinned: a version more than two weeks old when it was chosen, not the newest one.
const MCP_REMOTE = 'mcp-remote@0.16.4';
// AGENTS.md rule 7: only these. The connector also has tools that reply, hide, delete and publish.
const READ_TOOLS = new Set(['account_user_get', 'account_user_post_list_get', 'account_user_comment_list_get', 'account_user_comment_reply_list_get']);
const SIGN_IN_WAIT = 10 * 60 * 1000;
const CALL_WAIT = 2 * 60 * 1000;

function option(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : fallback;
}

function guard(name) {
  if (!READ_TOOLS.has(name)) throw new Error(`${name} is not one of the connector's reading tools; this script never calls it`);
}

// One mcp-remote process speaking MCP (JSON-RPC, one message a line) over its standard input and output.
class Bridge {
  constructor(authDir) {
    const npx = path.join(path.dirname(process.execPath), process.platform === 'win32' ? 'npx.cmd' : 'npx');
    const env = {
      ...process.env,
      // mcp-remote keeps the sign-in under HOME/.mcp-auth, and npx its download under HOME/.npm: both go to
      // data/tiktok-auth/, which a sandboxed app can write (DeepSeek's could not write the home folder).
      HOME: authDir, USERPROFILE: authDir, npm_config_cache: path.join(authDir, 'npm-cache'),
      PATH: `${path.dirname(process.execPath)}${path.delimiter}${process.env.PATH || ''}`
    };
    this.child = spawn(fs.existsSync(npx) ? npx : 'npx', ['-y', MCP_REMOTE, ENDPOINT],
      { env, stdio: ['pipe', 'pipe', 'pipe'], shell: process.platform === 'win32' });
    this.nextId = 1;
    this.pending = new Map();
    this.buffer = '';
    this.child.stdout.on('data', chunk => this.onData(chunk));
    // Shows mcp-remote's sign-in request and its link (in case the browser did not open by itself); nothing else.
    let showLink = false;
    this.child.stderr.on('data', chunk => {
      for (const raw of String(chunk).split('\n')) {
        const line = raw.replace(/^\[\d+\]\s*/, '').trim();
        // mcp-remote 0.16.4 writes "Please authorize this client by visiting:" (or "To authorize this client,
        // visit:") with the link on the next line.
        if (/please authorize|to authorize this client/i.test(line)) { console.log(line); showLink = !/https?:\/\//.test(line); continue; }
        if (showLink && /^https?:\/\//.test(line)) { console.log(line); showLink = false; }
      }
    });
    this.child.on('exit', code => {
      for (const { reject } of this.pending.values()) reject(new Error(`mcp-remote stopped (exit ${code})`));
      this.pending.clear();
    });
  }

  onData(chunk) {
    this.buffer += String(chunk);
    let index;
    while ((index = this.buffer.indexOf('\n')) >= 0) {
      const line = this.buffer.slice(0, index).trim();
      this.buffer = this.buffer.slice(index + 1);
      if (!line.startsWith('{')) continue;
      let message;
      try { message = JSON.parse(line); } catch (error) { continue; }
      const waiting = this.pending.get(message.id);
      if (!waiting) continue;
      this.pending.delete(message.id);
      clearTimeout(waiting.timer);
      if (message.error) waiting.reject(new Error(message.error.message || JSON.stringify(message.error)));
      else waiting.resolve(message.result);
    }
  }

  request(method, params, wait = CALL_WAIT) {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`no answer to ${method} within ${Math.round(wait / 60000)} minutes`));
      }, wait);
      this.pending.set(id, { resolve, reject, timer });
      this.child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`);
    });
  }

  async start() {
    await this.request('initialize', { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'comment-themes', version: '0.1.0' } }, SIGN_IN_WAIT);
    this.child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' })}\n`);
  }

  // A reading tool's answer, as TikTok gave it ({ code, message, data }).
  async call(name, args, wait = CALL_WAIT) {
    guard(name);
    const result = await this.request('tools/call', { name, arguments: args }, wait);
    const text = (result?.content || []).find(part => part.type === 'text')?.text || '';
    let answer;
    try { answer = JSON.parse(text); } catch (error) { throw new Error(`${name}: TikTok's answer was not JSON (${text.slice(0, 120)})`); }
    if (result?.isError || (answer.code !== undefined && answer.code !== 0)) throw new Error(`${name}: TikTok answered ${answer.code} ${answer.message || ''}`.trim());
    return answer;
  }

  stop() { try { this.child.kill(); } catch (error) { /* already gone */ } }
}

// Every comment of one video, with the replies beyond the three that come with each comment. call(name, args)
// returns TikTok's answer; save(answer, suffix) keeps it. A video with more than 900 comments is read most-liked
// first, as AGENTS.md says for the connector.
async function readVideo(call, save, videoId, { maxPages = 30, total = null } = {}) {
  const byLikes = typeof total === 'number' && total > 900;
  let cursor;
  let pages = 0;
  for (let page = 1; page <= maxPages; page += 1) {
    const answer = await call('account_user_comment_list_get', {
      video_id: videoId, include_replies: true, max_count: 30,
      ...(cursor !== undefined ? { cursor } : {}), ...(byLikes ? { sort_field: 'likes', sort_order: 'desc' } : {})
    });
    save(answer, `${page}`);
    pages += 1;
    for (const comment of answer?.data?.comments || []) {
      const shown = Array.isArray(comment.reply_list) ? comment.reply_list.length : 0;
      if (!(comment.replies > shown)) continue;
      let replyCursor;
      for (let replyPage = 1; replyPage <= maxPages; replyPage += 1) {
        const replies = await call('account_user_comment_reply_list_get', {
          video_id: videoId, comment_id: String(comment.comment_id), max_count: 30, ...(replyCursor !== undefined ? { cursor: replyCursor } : {})
        });
        save(replies, `${comment.comment_id}-${replyPage}`);
        if (!replies?.data?.has_more) break;
        replyCursor = replies.data.cursor;
      }
    }
    if (!answer?.data?.has_more) break;
    cursor = answer.data.cursor;
  }
  return pages;
}

async function check(bridge) {
  let answer;
  try { answer = await bridge.call('account_user_get', { fields: ['display_name', 'username'] }, SIGN_IN_WAIT); } catch (error) {
    answer = await bridge.call('account_user_get', {}, SIGN_IN_WAIT);
  }
  const data = answer?.data || {};
  console.log(`TikTok connector: signed in as ${data.username ? `@${data.username}` : '(no username given)'}${data.display_name ? ` (${data.display_name})` : ''}.`);
  return data;
}

async function readRun(bridge, name, dataDir, maxPages) {
  const request = loadRequest(name, dataDir);
  const videos = request.entries.filter(entry => entry.platform === 'tiktok' && entry.route === 'mcp');
  if (!videos.length) { console.log(`The request ${name} has no own TikTok videos to read through the connector.`); return; }
  const dir = runDir(name, dataDir);
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const records = [];
  const posts = [];
  for (const entry of videos) {
    const videoId = (entry.url.match(/\/video\/(\d+)/) || [])[1];
    if (!videoId) { console.log(`${entry.url}: no video number in the link; send the video's full link.`); continue; }
    let info = {};
    try {
      const list = await bridge.call('account_user_post_list_get', { fields: ['item_id', 'caption', 'comments', 'create_time'], filters: { video_ids: [videoId] }, max_count: 1 });
      info = (list?.data?.videos || []).find(video => String(video.item_id) === videoId) || {};
    } catch (error) {
      console.log(`${entry.url}: the video's own text could not be read (${error.message}).`);
    }
    const kept = [];
    const save = (answer, suffix) => {
      const clean = withoutPictures(answer);
      fs.writeFileSync(path.join(dir, `tiktok-${videoId}-${suffix}.json`), `${JSON.stringify(clean, null, 2)}\n`, { mode: 0o600 });
      kept.push(...fromMcp(clean, entry.url));
    };
    const total = typeof info.comments === 'number' ? info.comments : null;
    console.log(`${entry.url}: reading`);
    await readVideo((tool, args) => bridge.call(tool, args), save, videoId, { maxPages, total });
    console.log(`${entry.url}: ${readSummary(kept, { comments: total })}.`);
    records.push(...kept);
    posts.push({ platform: 'tiktok', url: entry.url, time: toIso(info.create_time), comments: total, text: info.caption ? String(info.caption).slice(0, 2000) : null });
  }
  const result = addRecords(records, dataDir);
  console.log(`Database: ${result.added} new, ${result.updated} updated, ${result.total} comments in all.`);
  savePosts(name, dataDir, posts);
  console.log('Cost of this run: nothing (TikTok Social connector).');
}

async function main() {
  const name = option('run');
  if (!process.argv.includes('--check') && !name) {
    console.log('Usage: node scripts/tiktok-bridge.js --check | --run <name> [--max-pages <n>]');
    process.exit(2);
  }
  const dataDir = getDataDir();
  const authDir = path.join(dataDir, 'tiktok-auth');
  fs.mkdirSync(authDir, { recursive: true, mode: 0o700 });
  console.log('Starting the TikTok connector. The first time, TikTok\'s sign-in page opens in your browser: sign in with the account that posted the videos and allow access.');
  const bridge = new Bridge(authDir);
  try {
    await bridge.start();
    if (process.argv.includes('--check')) await check(bridge);
    if (name) await readRun(bridge, name, dataDir, Number(option('max-pages', 30)));
  } catch (error) {
    console.log(`TikTok connector: stopped: ${error.message}`);
    process.exitCode = 1;
  } finally {
    bridge.stop();
  }
}

if (require.main === module) main();

module.exports = { ENDPOINT, MCP_REMOTE, READ_TOOLS, guard, readVideo };
