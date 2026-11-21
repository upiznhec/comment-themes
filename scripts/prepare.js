#!/usr/bin/env node

// Chooses the comments for an analysis and writes them as batches for the agent to label.
// Usage: node scripts/prepare.js --run <name> [--days <n> | --since <date>] [--platform <name>]
//        [--post <link or part of one>]... [--own | --others] [--max <n per post, default 1000> | --all]
//        [--batch <size, default 150>]
// A post with more comments than --max is analysed on its --max most-liked comments, the same limit per post as
// ScrapeCreators' YouTube comments endpoint (at most about 1,000 top comments a video). sample.json records which
// posts were cut, for the report.
// When the run has a request (data/runs/<name>/request.json), only the comments of its posts are taken, and
// posts with no comments stored yet are named. Without a request, the whole database is taken, narrowed by
// the options.
// Writes data/runs/<name>/comments.jsonl and batch-01.jsonl, batch-02.jsonl ... (short ID, text, likes;
// no names), and prints the buckets to label with.
const fs = require('fs');
const path = require('path');
const { getDataDir } = require('./lib/env-file');
const { keyOf, readAll } = require('./lib/db');
const { BUCKETS, runDir } = require('./lib/runs');
const { requestLinks } = require('./lib/sources');

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

function option(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

function options(name) {
  return process.argv.flatMap((item, i) => (item === `--${name}` && process.argv[i + 1] ? [process.argv[i + 1]] : []));
}

// At most max comments from each post: a post with more keeps its most-liked ones (equal likes keep their
// order). Returns { picked: [{ record, pick: 'all' | 'liked' }], cut: [{ post_url, comments, kept }] }.
function sample(records, max) {
  const byPost = new Map();
  for (const record of records) {
    const post = record.post_url || record.post_id || '(no post link)';
    if (!byPost.has(post)) byPost.set(post, []);
    byPost.get(post).push(record);
  }
  const picked = [];
  const cut = [];
  for (const [post, list] of byPost) {
    if (!max || list.length <= max) { list.forEach(record => picked.push({ record, pick: 'all' })); continue; }
    [...list].sort((a, b) => (Number(b.likes) || 0) - (Number(a.likes) || 0)).slice(0, max)
      .forEach(record => picked.push({ record, pick: 'liked' }));
    cut.push({ post_url: post, comments: list.length, kept: max });
  }
  return { picked, cut };
}

// links: the request's post links (exact); posts: parts of links or post IDs (any one may match).
function select(records, { since, platform, links, posts = [], own }) {
  const parts = posts.map(part => String(part).toLowerCase());
  return records.filter(r => {
    if (links && !links.has(String(r.post_url || '').trim())) return false;
    if (parts.length && !parts.some(part => String(r.post_url || '').toLowerCase().includes(part) || String(r.post_id || '').toLowerCase().includes(part))) return false;
    if (since && r.time && Date.parse(r.time) < Date.parse(since)) return false;
    if (platform && r.platform !== platform) return false;
    if (own === true && !r.own) return false;
    if (own === false && r.own) return false;
    return String(r.text || '').trim() !== '';
  });
}

function main() {
  const name = option('run');
  if (!name) { console.log('Usage: node scripts/prepare.js --run <name> [--days n | --since date] [--platform p] [--post link]... [--own | --others]'); process.exit(2); }
  const dataDir = getDataDir();
  const days = option('days');
  const since = option('since') ? new Date(option('since')).toISOString() : days ? new Date(Date.now() - Number(days) * 86400000).toISOString() : null;
  const own = process.argv.includes('--own') ? true : process.argv.includes('--others') ? false : null;
  const requested = requestLinks(name, dataDir);
  const links = requested ? new Set(requested) : null;
  const chosen = select(readAll(dataDir), { since, platform: option('platform'), links, posts: options('post'), own })
    .sort((a, b) => String(a.time || '').localeCompare(String(b.time || '')));
  if (requested) {
    const stored = new Set(chosen.map(r => String(r.post_url || '').trim()));
    const empty = requested.filter(link => !stored.has(link));
    console.log(`Request ${name}: ${requested.length} posts.`);
    if (empty.length) console.log(`No comments stored for these posts (not read yet, nothing to read, or skipped):\n${empty.map(link => `  ${link}`).join('\n')}`);
  }
  if (!chosen.length) { console.log('No comments match. Read some with fetch.js or import.js first, or widen the choice.'); process.exit(1); }
  const dir = runDir(name, dataDir);
  if (fs.existsSync(dir) && fs.readdirSync(dir).some(file => file.startsWith('labels'))) {
    console.log(`The run ${name} already has labels. Choose another name, so that its labels are not mixed up.`);
    process.exit(1);
  }
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const max = process.argv.includes('--all') ? 0 : Number(option('max') || 1000);
  const { picked: chosenPicks, cut } = sample(chosen, max);
  const picked = chosenPicks.sort((a, b) => String(a.record.time || '').localeCompare(String(b.record.time || '')));
  const width = Math.max(4, String(picked.length).length);
  const rows = picked.map(({ record: r, pick }, i) => ({
    id: `C${String(i + 1).padStart(width, '0')}`, key: keyOf(r), platform: r.platform, account: r.account, own: r.own,
    post_url: r.post_url, time: r.time, likes: r.likes, reply: Boolean(r.parent_id), pick, text: r.text
  }));
  fs.writeFileSync(path.join(dir, 'comments.jsonl'), rows.map(row => JSON.stringify(row)).join('\n') + '\n', { mode: 0o600 });
  const sampled = cut.length > 0;
  const info = {
    comments_chosen: chosen.length, comments_labelled: rows.length, sampled,
    rule: sampled ? `the ${max} most-liked comments of each post that has more (${cut.length} of ${new Set(chosen.map(r => r.post_url || r.post_id || '(no post link)')).size} posts); every comment of the others` : 'every comment chosen',
    posts_cut: cut
  };
  fs.writeFileSync(path.join(dir, 'sample.json'), JSON.stringify(info, null, 2) + '\n', { mode: 0o600 });
  const size = Number(option('batch') || 150);
  let batches = 0;
  for (let i = 0; i < rows.length; i += size) {
    batches += 1;
    const batch = rows.slice(i, i + size).map(row => JSON.stringify({ id: row.id, text: row.text, likes: row.likes }));
    fs.writeFileSync(path.join(dir, `batch-${String(batches).padStart(2, '0')}.jsonl`), batch.join('\n') + '\n', { mode: 0o600 });
  }
  console.log(`Run ${name}: ${rows.length} comments to label in ${batches} batches, in ${dir}`);
  if (sampled) {
    console.log(`${plural(cut.length, 'post')} had more than ${max} comments, so only ${cut.length === 1 ? 'its' : 'their'} ${max} most-liked are included (${chosen.length} comments chosen in all; --all includes every one, which costs many more tokens):`);
    cut.forEach(post => console.log(`  ${post.post_url}: ${post.kept} of ${post.comments}`));
  }
  console.log(`Tell the person you will label ${rows.length} comments before you start.`);
  console.log('Label every comment in every batch: one line per comment in labels.jsonl (or labels-01.jsonl ...), like');
  console.log('  {"id":"C0001","bucket":"questions","theme":"price of the travel size"}');
  console.log('Buckets:');
  for (const [bucket, meaning] of Object.entries(BUCKETS)) console.log(`  ${bucket}: ${meaning}`);
  console.log('A theme is a few words naming what the comment is about; reuse the same words for the same topic. not_useful needs no theme.');
  console.log(`Then run: node scripts/tally.js --run ${name}`);
}

if (require.main === module) main();

module.exports = { sample, select };
