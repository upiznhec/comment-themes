#!/usr/bin/env node

// Chooses the comments for an analysis and writes them as batches for the agent to label.
// Usage: node scripts/prepare.js --run <name> [--days <n> | --since <date>] [--platform <name>]
//        [--account <name>] [--own | --others] [--batch <size, default 150>]
// Writes data/runs/<name>/comments.jsonl and batch-01.jsonl, batch-02.jsonl ... (short ID, text, likes;
// no names), and prints the buckets to label with.
const fs = require('fs');
const path = require('path');
const { getDataDir } = require('./lib/env-file');
const { keyOf, readAll } = require('./lib/db');
const { BUCKETS, runDir } = require('./lib/runs');

function option(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

function select(records, { since, platform, account, own }) {
  return records.filter(r => {
    if (since && r.time && Date.parse(r.time) < Date.parse(since)) return false;
    if (platform && r.platform !== platform) return false;
    if (account && String(r.account || '').toLowerCase() !== String(account).toLowerCase()) return false;
    if (own === true && !r.own) return false;
    if (own === false && r.own) return false;
    return String(r.text || '').trim() !== '';
  });
}

function main() {
  const name = option('run');
  if (!name) { console.log('Usage: node scripts/prepare.js --run <name> [--days n | --since date] [--platform p] [--account a] [--own | --others]'); process.exit(2); }
  const dataDir = getDataDir();
  const days = option('days');
  const since = option('since') ? new Date(option('since')).toISOString() : days ? new Date(Date.now() - Number(days) * 86400000).toISOString() : null;
  const own = process.argv.includes('--own') ? true : process.argv.includes('--others') ? false : null;
  const chosen = select(readAll(dataDir), { since, platform: option('platform'), account: option('account'), own })
    .sort((a, b) => String(a.time || '').localeCompare(String(b.time || '')));
  if (!chosen.length) { console.log('No comments match. Read some with fetch.js or import.js first, or widen the choice.'); process.exit(1); }
  const dir = runDir(name, dataDir);
  if (fs.existsSync(dir) && fs.readdirSync(dir).some(file => file.startsWith('labels'))) {
    console.log(`The run ${name} already has labels. Choose another name, so that its labels are not mixed up.`);
    process.exit(1);
  }
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const width = Math.max(4, String(chosen.length).length);
  const rows = chosen.map((r, i) => ({
    id: `C${String(i + 1).padStart(width, '0')}`, key: keyOf(r), platform: r.platform, account: r.account, own: r.own,
    post_url: r.post_url, time: r.time, likes: r.likes, reply: Boolean(r.parent_id), text: r.text
  }));
  fs.writeFileSync(path.join(dir, 'comments.jsonl'), rows.map(row => JSON.stringify(row)).join('\n') + '\n', { mode: 0o600 });
  const size = Number(option('batch') || 150);
  let batches = 0;
  for (let i = 0; i < rows.length; i += size) {
    batches += 1;
    const batch = rows.slice(i, i + size).map(row => JSON.stringify({ id: row.id, text: row.text, likes: row.likes }));
    fs.writeFileSync(path.join(dir, `batch-${String(batches).padStart(2, '0')}.jsonl`), batch.join('\n') + '\n', { mode: 0o600 });
  }
  console.log(`Run ${name}: ${rows.length} comments in ${batches} batches, in ${dir}`);
  console.log('Label every comment in every batch: one line per comment in labels.jsonl (or labels-01.jsonl ...), like');
  console.log('  {"id":"C0001","bucket":"questions","theme":"price of the travel size"}');
  console.log('Buckets:');
  for (const [bucket, meaning] of Object.entries(BUCKETS)) console.log(`  ${bucket}: ${meaning}`);
  console.log('A theme is a few words naming what the comment is about; reuse the same words for the same topic. not_useful needs no theme.');
  console.log(`Then run: node scripts/tally.js --run ${name}`);
}

if (require.main === module) main();

module.exports = { select };
