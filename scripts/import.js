#!/usr/bin/env node

// Puts comments that did not come from fetch.js into the database:
//   node scripts/import.js --tiktok-mcp <file.json> --account <handle>   a TikTok Social connector answer
//   node scripts/import.js --csv <file.csv> [--platform <name>] [--account <name>] [--own]
//        columns: text (or comment), and if there are: author, time (or date), likes, url (or post_url), id
//   node scripts/import.js --text <file.txt> [--platform ...] [--account ...] [--own]
//        one comment per line, for comments pasted from an app
// Rows without an ID get one made from their content, so importing the same file twice adds nothing.
const crypto = require('crypto');
const fs = require('fs');
const { getDataDir } = require('./lib/env-file');
const { addRecords, parseCsv } = require('./lib/db');
const { fromMcp } = require('./platforms/tiktok-mcp');
const { toIso } = require('./platforms/common');

function option(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

function contentId(...parts) {
  return 'h' + crypto.createHash('sha256').update(parts.map(part => String(part ?? '')).join('\u0000')).digest('hex').slice(0, 16);
}

function fromRows(rows, defaults) {
  const header = rows[0].map(name => name.trim().toLowerCase());
  const col = (...names) => header.findIndex(name => names.includes(name));
  const text = col('text', 'comment', 'message', 'body');
  if (text < 0) throw new Error('The CSV needs a column named text (or comment).');
  const author = col('author', 'author_name', 'name', 'username');
  const time = col('time', 'date', 'created_at');
  const likes = col('likes', 'like_count');
  const url = col('url', 'post_url', 'link');
  const id = col('id', 'comment_id');
  return rows.slice(1).map(cells => {
    const value = index => (index >= 0 ? (cells[index] || '').trim() : '');
    const body = value(text);
    return {
      ...defaults, post_url: value(url) || null, post_id: value(url) || null,
      comment_id: value(id) || contentId(defaults.platform, value(url), value(author), body),
      time: toIso(value(time)), likes: value(likes) === '' ? null : Number(value(likes)), text: body,
      author_name: value(author) || null
    };
  });
}

function main() {
  const defaults = {
    platform: (option('platform') || 'pasted').toLowerCase(), route: 'import', own: process.argv.includes('--own'),
    account: option('account') || null
  };
  let records;
  if (option('tiktok-mcp')) {
    records = fromMcp(JSON.parse(fs.readFileSync(option('tiktok-mcp'), 'utf8')), option('account'));
  } else if (option('csv')) {
    records = fromRows(parseCsv(fs.readFileSync(option('csv'), 'utf8')), defaults);
  } else if (option('text')) {
    records = fs.readFileSync(option('text'), 'utf8').split(/\r?\n/).map(line => line.trim()).filter(Boolean)
      .map(line => ({ ...defaults, comment_id: contentId(defaults.platform, defaults.account, line), text: line }));
  } else {
    console.log('Usage: node scripts/import.js --tiktok-mcp <file.json> --account <handle> | --csv <file.csv> | --text <file.txt>');
    process.exit(2);
  }
  const result = addRecords(records, getDataDir());
  console.log(`Imported ${records.length} comments: ${result.added} new, ${result.updated} already there. ${result.total} comments in all.`);
}

if (require.main === module) {
  try { main(); } catch (error) { console.log(`Nothing imported: ${error.message}`); process.exit(1); }
}

module.exports = { contentId, fromRows };
