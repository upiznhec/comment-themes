#!/usr/bin/env node

// Answers the person's own questions about the comments with exact counts and comment IDs, so that the
// agent does not have to read every comment or guess a number.
// Usage: node scripts/find.js [--text "words"] [--regex <pattern>] [--platform p] [--post <part of a link>]
//        [--own | --others] [--days n | --since date] [--run <name> [--bucket b] [--theme t]]
//        [--count] [--limit n, default 20] [--names]
// --text: every word must appear (any case). --run with --bucket or --theme searches that run's labels.
// --count prints only the numbers. --names adds the commenter's shown name (left out by default).
const { getDataDir } = require('./lib/env-file');
const { keyOf, readAll } = require('./lib/db');
const { readRun } = require('./lib/runs');

function option(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

function matches(record, { words, regex, platform, post, own, since }) {
  const text = String(record.text || '');
  if (words.length && !words.every(word => text.toLowerCase().includes(word))) return false;
  if (regex && !regex.test(text)) return false;
  if (platform && record.platform !== platform) return false;
  if (post && ![record.post_url, record.post_id].some(value => String(value || '').toLowerCase().includes(post.toLowerCase()))) return false;
  if (own === true && !record.own) return false;
  if (own === false && record.own) return false;
  if (since && record.time && Date.parse(record.time) < Date.parse(since)) return false;
  return true;
}

function main() {
  const dataDir = getDataDir();
  const days = option('days');
  const filter = {
    words: String(option('text') || '').toLowerCase().split(/\s+/).filter(Boolean),
    regex: option('regex') ? new RegExp(option('regex'), 'i') : null,
    platform: option('platform'), post: option('post'),
    own: process.argv.includes('--own') ? true : process.argv.includes('--others') ? false : null,
    since: option('since') ? new Date(option('since')).toISOString() : days ? new Date(Date.now() - Number(days) * 86400000).toISOString() : null
  };
  let records = readAll(dataDir).map(r => ({ ...r, ref: keyOf(r) }));
  if (option('run')) {
    const { comments, labels } = readRun(option('run'), dataDir);
    const label = new Map(labels.map(l => [l.id, l]));
    const byKey = new Map(records.map(r => [r.ref, r]));
    records = comments.map(c => ({ ...(byKey.get(c.key) || c), ref: c.id, bucket: label.get(c.id)?.bucket, theme: label.get(c.id)?.theme }));
    if (option('bucket')) records = records.filter(r => r.bucket === option('bucket'));
    if (option('theme')) records = records.filter(r => String(r.theme || '').toLowerCase().includes(option('theme').toLowerCase()));
  }
  const found = records.filter(r => matches(r, filter)).sort((a, b) => (Number(b.likes) || 0) - (Number(a.likes) || 0));
  const byPlatform = {};
  found.forEach(r => { byPlatform[r.platform] = (byPlatform[r.platform] || 0) + 1; });
  const people = new Set(found.map(r => r.author_id || r.author_handle || r.author_name || r.ref)).size;
  console.log(`${found.length} comments from ${people} different people. By platform: ${Object.entries(byPlatform).map(([p, n]) => `${p} ${n}`).join(', ') || 'none'}.`);
  if (process.argv.includes('--count')) return;
  const limit = Number(option('limit') || 20);
  for (const r of found.slice(0, limit)) {
    const who = process.argv.includes('--names') ? ` | ${r.author_name || r.author_handle || '?'}` : '';
    const text = String(r.text).replace(/\s+/g, ' ');
    console.log(`${r.ref} | ${r.platform} | ${String(r.time || '').slice(0, 10)} | likes ${r.likes ?? '?'}${r.bucket ? ` | ${r.bucket}: ${r.theme || ''}` : ''}${who} | ${text.length > 220 ? text.slice(0, 217) + '...' : text}`);
  }
  if (found.length > limit) console.log(`... ${found.length - limit} more (use --limit).`);
}

if (require.main === module) main();

module.exports = { matches };
