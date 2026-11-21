#!/usr/bin/env node

// Checks the agent's labels and counts them, so that no number in the report is a model's guess.
// Usage: node scripts/tally.js --run <name>
// Writes data/runs/<name>/summary.json (for the agent's report) and labelled.csv (for the person: every
// comment with its bucket and theme). Stops with a list of problems if any comment is unlabelled,
// labelled twice, or has an unknown bucket or no theme.
const fs = require('fs');
const path = require('path');
const { getDataDir } = require('./lib/env-file');
const { keyOf, readAll, toCsv } = require('./lib/db');
const { BUCKETS, readRun } = require('./lib/runs');

function option(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

function themeKey(theme) {
  return String(theme || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function check(comments, labels) {
  const problems = [];
  const ids = new Set(comments.map(c => c.id));
  const byId = new Map();
  for (const label of labels) {
    if (!ids.has(label.id)) { problems.push(`${label.file}: ${label.id} is not in this run`); continue; }
    if (byId.has(label.id)) problems.push(`${label.id} is labelled more than once`);
    if (!BUCKETS[label.bucket]) problems.push(`${label.id}: unknown bucket "${label.bucket}"`);
    if (label.bucket !== 'not_useful' && !themeKey(label.theme)) problems.push(`${label.id}: no theme`);
    byId.set(label.id, label);
  }
  const missing = comments.filter(c => !byId.has(c.id)).map(c => c.id);
  if (missing.length) problems.push(`${missing.length} comments have no label: ${missing.slice(0, 15).join(', ')}${missing.length > 15 ? ' ...' : ''}`);
  return { problems, byId };
}

function summarize(comments, byId, authors) {
  const buckets = Object.fromEntries(Object.keys(BUCKETS).map(bucket => [bucket, 0]));
  const themes = new Map();
  const platforms = {};
  for (const c of comments) {
    const label = byId.get(c.id);
    buckets[label.bucket] += 1;
    platforms[c.platform] = (platforms[c.platform] || 0) + 1;
    if (label.bucket === 'not_useful') continue;
    const key = `${label.bucket}|${themeKey(label.theme)}`;
    if (!themes.has(key)) themes.set(key, { bucket: label.bucket, theme: label.theme.trim(), count: 0, likes: 0, people: new Set(), platforms: new Set(), ids: [] });
    const t = themes.get(key);
    t.count += 1;
    t.likes += Number(c.likes) || 0;
    t.people.add(authors.get(c.key) || c.key);
    t.platforms.add(c.platform);
    t.ids.push(c);
  }
  const themeList = [...themes.values()].map(t => ({
    bucket: t.bucket, theme: t.theme, comments: t.count, people: t.people.size, likes: t.likes,
    platforms: [...t.platforms],
    one_loud_comment: t.count === 1,
    examples: t.ids.sort((a, b) => (Number(b.likes) || 0) - (Number(a.likes) || 0)).slice(0, 3).map(c => ({ id: c.id, likes: c.likes, text: c.text }))
  })).sort((a, b) => b.comments - a.comments || b.likes - a.likes);
  const useful = comments.length - buckets.not_useful;
  return {
    comments: comments.length, useful, not_useful: buckets.not_useful,
    confidence: useful < 30 ? 'Low' : useful < 200 ? 'Medium' : 'High',
    buckets, platforms, themes: themeList
  };
}

function main() {
  const name = option('run');
  if (!name) { console.log('Usage: node scripts/tally.js --run <name>'); process.exit(2); }
  const dataDir = getDataDir();
  const { dir, comments, labels } = readRun(name, dataDir);
  const { problems, byId } = check(comments, labels);
  if (problems.length) {
    console.log(`Not counted yet; fix these labels first (${problems.length}):`);
    problems.slice(0, 40).forEach(problem => console.log(`  - ${problem}`));
    process.exit(1);
  }
  const authors = new Map(readAll(dataDir).map(r => [keyOf(r), r.author_id || r.author_handle || r.author_name || null]));
  const summary = summarize(comments, byId, authors);
  fs.writeFileSync(path.join(dir, 'summary.json'), JSON.stringify(summary, null, 2) + '\n', { mode: 0o600 });
  const names = new Map(readAll(dataDir).map(r => [keyOf(r), r.author_name || r.author_handle || '']));
  const rows = comments.map(c => ({ ...c, bucket: byId.get(c.id).bucket, theme: byId.get(c.id).theme || '', author: names.get(c.key) || '' }));
  fs.writeFileSync(path.join(dir, 'labelled.csv'), toCsv(rows, ['id', 'platform', 'account', 'own', 'post_url', 'time', 'likes', 'bucket', 'theme', 'author', 'text']), { mode: 0o600 });
  console.log(`Run ${name}: ${summary.comments} comments, ${summary.useful} useful, ${summary.not_useful} not useful. Confidence by size: ${summary.confidence}.`);
  console.log('Buckets: ' + Object.entries(summary.buckets).filter(([, n]) => n).map(([b, n]) => `${b} ${n}`).join(', '));
  console.log('Top themes (comments / different people / likes):');
  for (const t of summary.themes.slice(0, 15)) {
    console.log(`  ${t.comments} / ${t.people} / ${t.likes}  ${t.bucket}: ${t.theme}${t.one_loud_comment ? '  (one comment)' : ''}  e.g. ${t.examples.map(e => e.id).join(', ')}`);
  }
  console.log(`Wrote ${path.join(dir, 'summary.json')} and labelled.csv. Write the report from summary.json, then run check-quotes.js --run ${name}.`);
}

if (require.main === module) main();

module.exports = { check, summarize, themeKey };
