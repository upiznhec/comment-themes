// Database, source list and import. All sample data here is made up.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test } = require('node:test');

const { addRecords, parseCsv, readAll } = require('../scripts/lib/db');
const { accountOfUrl, normalizeRequest, platformOfUrl } = require('../scripts/lib/sources');
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

test('request: post links only; fixed routes; own posts take the remembered route; what to ask is named', () => {
  const { entries, problems } = normalizeRequest({
    accounts: [{ platform: 'instagram', account: 'rival' }],
    posts: [
      { url: 'https://www.youtube.com/watch?v=abc' },
      { url: 'https://www.instagram.com/p/MINE/', own: true },
      { url: 'https://www.instagram.com/p/OTHER/', own: false },
      { url: 'https://www.instagram.com/p/OTHER/', own: false },
      { url: 'https://www.facebook.com/61500000000000/posts/pfbid0abc', own: true, route: 'scrapecreators' },
      { url: 'https://www.tiktok.com/@me/video/1', own: true },
      { url: 'https://www.tiktok.com/@rival/video/2', own: false, route: 'mcp' },
      { url: 'https://www.facebook.com/somepage/posts/3' },
      { url: 'https://www.reddit.com/r/skincare/comments/4/y/' },
      { url: 'https://example.com/post' }
    ]
  }, { own_routes: { instagram: 'official' } });
  assert.deepEqual(entries.map(e => `${e.platform}:${e.route}:${e.own}`), [
    'youtube:official:null', 'instagram:official:true', 'instagram:scrapecreators:false',
    'facebook:scrapecreators:true', 'reddit:scrapecreators:null'
  ]);
  assert.equal(entries[4].account, 'r/skincare');
  const text = problems.join('\n');
  assert.equal(problems.length, 6);
  assert.match(text, /not whole accounts/);
  assert.match(text, /listed twice/);
  assert.match(text, /tiktok\.com\/@me\/video\/1: ask how to read the person's own tiktok posts/);
  assert.match(text, /the mcp route reads only the person's own posts/);
  assert.match(text, /ask whether this facebook post is the person's own/);
  assert.match(text, /example\.com\/post: not a YouTube/);
});

test('the account a link names', () => {
  assert.equal(accountOfUrl('https://www.tiktok.com/@brand.shop/video/1'), '@brand.shop');
  assert.equal(accountOfUrl('https://x.com/brand/status/1'), '@brand');
  assert.equal(accountOfUrl('https://www.instagram.com/p/CODE/'), null);
});
