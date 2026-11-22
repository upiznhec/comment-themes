#!/usr/bin/env node

// Puts comments that did not come from fetch.js into the database:
//   node scripts/import.js --tiktok-mcp <file.json> --post <link>   a TikTok Social connector answer for that video
//   node scripts/import.js --csv <file.csv> [--post <link>] [--platform <name>] [--own]
//        columns: text (or comment), and if there are: author, time (or date), likes, url (or post_url), id
//   node scripts/import.js --text <file.txt> [--post <link>] [--platform <name>] [--own]
//        one comment per line, for comments pasted from an app
// --post is the post's link as in the request, so that the request's analysis finds these comments; the
// platform is taken from it unless --platform says otherwise.
// Rows without an ID get one made from their content, so importing the same file twice adds nothing.
// A connector answer file is rewritten without its profile picture links, which are never kept.
const crypto = require('crypto');
const fs = require('fs');
const { getDataDir } = require('./lib/env-file');
const { addRecords, parseCsv, withoutText } = require('./lib/db');
const { fromMcp } = require('./platforms/tiktok-mcp');
const { toIso } = require('./platforms/common');
const { accountOfUrl, platformOfUrl } = require('./lib/sources');

function option(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

// Removes profile picture links from a saved answer, at any depth.
function withoutPictures(value) {
  if (Array.isArray(value)) return value.map(withoutPictures);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).filter(([key]) => !/^(profile_image|avatar)/i.test(key)).map(([key, item]) => [key, withoutPictures(item)]));
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
      ...defaults, post_url: value(url) || defaults.post_url || null, post_id: value(url) || defaults.post_id || null,
      comment_id: value(id) || contentId(defaults.platform, value(url), value(author), body),
      time: toIso(value(time)), likes: value(likes) === '' ? null : Number(value(likes)), text: body,
      author_name: value(author) || null
    };
  });
}

function main() {
  const post = option('post') ? String(option('post')).trim() : null;
  const defaults = {
    platform: (option('platform') || platformOfUrl(post) || 'pasted').toLowerCase(), route: 'import', own: process.argv.includes('--own'),
    account: accountOfUrl(post), post_url: post, post_id: post
  };
  let records;
  if (option('tiktok-mcp')) {
    if (!post) throw new Error('Give the video\'s link with --post, as in the request.');
    const answer = withoutPictures(JSON.parse(fs.readFileSync(option('tiktok-mcp'), 'utf8')));
    fs.writeFileSync(option('tiktok-mcp'), JSON.stringify(answer, null, 2) + '\n', { mode: 0o600 });
    records = fromMcp(answer, post);
  } else if (option('csv')) {
    records = fromRows(parseCsv(fs.readFileSync(option('csv'), 'utf8')), defaults);
  } else if (option('text')) {
    records = fs.readFileSync(option('text'), 'utf8').split(/\r?\n/).map(line => line.trim()).filter(Boolean)
      .map(line => ({ ...defaults, comment_id: contentId(defaults.platform, post, line), text: line }));
  } else {
    console.log('Usage: node scripts/import.js --tiktok-mcp <file.json> --post <link> | --csv <file.csv> [--post <link>] | --text <file.txt> [--post <link>]');
    process.exit(2);
  }
  const result = addRecords(records, getDataDir());
  const blank = withoutText(records);
  console.log(`Imported ${records.length} comments: ${result.added} new, ${result.updated} already there. ${result.total} comments in all.`
    + (blank ? ` ${blank} of them ${blank === 1 ? 'has' : 'have'} no text and ${blank === 1 ? 'was' : 'were'} not stored.` : ''));
}

if (require.main === module) {
  try { main(); } catch (error) { console.log(`Nothing imported: ${error.message}`); process.exit(1); }
}

module.exports = { contentId, fromRows, withoutPictures };
