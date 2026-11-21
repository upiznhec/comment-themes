// Database, source list and import. All sample data here is made up.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test } = require('node:test');

const { addRecords, parseCsv, readAll } = require('../scripts/lib/db');
const { normalizeSources, platformOfUrl } = require('../scripts/lib/sources');
const { contentId, fromRows } = require('../scripts/import');

const tempDir = () => fs.mkdtempSync(path.join(os.tmpdir(), 'comment-themes-'));
const comment = (over = {}) => ({ platform: 'youtube', comment_id: 'c1', text: 'Is there a travel size?', likes: 2, ...over });

test('adding the same comment twice updates it instead of adding a copy', () => {
  const dir = tempDir();
  assert.deepEqual(addRecords([comment()], dir, '2026-11-21T00:00:00.000Z'), { added: 1, updated: 0, total: 1 });
  assert.deepEqual(addRecords([comment({ likes: 9 })], dir, '2026-11-22T00:00:00.000Z'), { added: 0, updated: 1, total: 1 });
  const [saved] = readAll(dir);
  assert.equal(saved.likes, 9);
  assert.equal(saved.first_seen, '2026-11-21T00:00:00.000Z');
  assert.equal(saved.last_seen, '2026-11-22T00:00:00.000Z');
});

test('only the known fields are stored, so a gender or picture from a platform is dropped', () => {
  const dir = tempDir();
  addRecords([comment({ gender: 'female', profile_picture: 'https://example.com/a.jpg', author_name: 'Sample Name' })], dir);
  const [saved] = readAll(dir);
  assert.equal(saved.gender, undefined);
  assert.equal(saved.profile_picture, undefined);
  assert.equal(saved.author_name, 'Sample Name');
});

test('empty comments are not stored', () => {
  const dir = tempDir();
  assert.equal(addRecords([comment({ text: '   ' })], dir).added, 0);
});

test('CSV cells may hold quotes, commas and line breaks', () => {
  const rows = parseCsv('text,likes\n"Love it, ""really""",3\n"two\nlines",1\n');
  assert.deepEqual(rows, [['text', 'likes'], ['Love it, "really"', '3'], ['two\nlines', '1']]);
});

test('imported rows without an ID get a stable one, so importing twice adds nothing', () => {
  const rows = [['comment', 'author', 'likes'], ['Where can I buy this?', 'A. Sample', '4']];
  const [first] = fromRows(rows, { platform: 'instagram', route: 'import', own: true, account: 'shop' });
  const [again] = fromRows(rows, { platform: 'instagram', route: 'import', own: true, account: 'shop' });
  assert.equal(first.comment_id, again.comment_id);
  assert.equal(first.likes, 4);
  assert.match(contentId('a'), /^h[0-9a-f]{16}$/);
  assert.throws(() => fromRows([['author'], ['x']], {}), /column named text/);
});

test('platform of a post link', () => {
  assert.equal(platformOfUrl('https://youtu.be/abc'), 'youtube');
  assert.equal(platformOfUrl('https://www.reddit.com/r/x/comments/1/y/'), 'reddit');
  assert.equal(platformOfUrl('https://x.com/a/status/1'), 'x');
  assert.equal(platformOfUrl('https://example.com/'), null);
});

test('source list: fixed routes, own-only routes and the window', () => {
  const now = Date.parse('2026-11-21T00:00:00Z');
  const { since, entries, problems } = normalizeSources({
    days: 7,
    accounts: [
      { platform: 'youtube', account: '@brand' },
      { platform: 'instagram', account: 'mine', own: true, route: 'official' },
      { platform: 'instagram', account: 'rival', route: 'official' },
      { platform: 'tiktok', account: 'mine', own: true },
      { platform: 'reddit', account: 'someone' },
      { platform: 'facebook', account: 'https://facebook.com/rival' }
    ],
    posts: [{ url: 'https://www.reddit.com/r/skincare/comments/1/x/' }]
  }, now);
  assert.equal(since, '2026-11-14T00:00:00.000Z');
  assert.deepEqual(entries.map(e => `${e.platform}:${e.route}:${e.own}`), [
    'youtube:official:false', 'instagram:official:true', 'facebook:scrapecreators:false', 'reddit:scrapecreators:false'
  ]);
  assert.equal(problems.length, 3);
  assert.match(problems.join('\n'), /reads only your own account/);
  assert.match(problems.join('\n'), /choose how to read your own tiktok/);
  assert.match(problems.join('\n'), /Reddit is read by post links/);
});
