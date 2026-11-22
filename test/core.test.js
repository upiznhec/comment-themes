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

test('a later read fills in a parent that the first read left empty, and never empties one', () => {
  const dir = tempDir();
  addRecords([comment({ parent_id: null })], dir);
  addRecords([comment({ parent_id: 'p1' })], dir);
  assert.equal(readAll(dir)[0].parent_id, 'p1');
  addRecords([comment({ parent_id: null })], dir);
  assert.equal(readAll(dir)[0].parent_id, 'p1');
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

test('saving a key refuses the save command pasted by mistake, and nothing is saved', () => {
  const { looksLikeCommand } = require('../scripts/lib/prompt');
  const command = 'cd /Users/someone/CommentThemes && node scripts/save-secret.js scrapecreators';
  assert.equal(looksLikeCommand(command), true);
  assert.equal(looksLikeCommand('node scripts/meta-token.js'), true);
  assert.equal(looksLikeCommand('sc_1a2b3c4d5e6f7g8h9i0j'), false);
  assert.equal(looksLikeCommand('AIzaSyExampleExampleExampleExample12345'), false);
  const dir = tempDir();
  const run = require('node:child_process').spawnSync(process.execPath, [path.join(__dirname, '..', 'scripts', 'save-secret.js'), 'scrapecreators', '--from-stdin'],
    { input: `${command}\n`, env: { ...process.env, COMMENT_THEMES_DATA_DIR: dir }, encoding: 'utf8' });
  assert.equal(run.status, 1);
  assert.match(run.stdout, /This is a command, not the ScrapeCreators API key/);
  assert.equal(fs.existsSync(path.join(dir, '.env')), false);
});

test('what each post says is kept by its link, and a later read without the text keeps the earlier one', () => {
  const { savePosts } = require('../scripts/fetch');
  const { postsAbout } = require('../scripts/prepare');
  const dir = tempDir();
  const link = 'https://www.instagram.com/p/SAMPLE/';
  savePosts('run-1', dir, [{ platform: 'instagram', url: link, time: '2026-11-20T00:00:00.000Z', comments: 40, text: 'The new travel size is here' }]);
  savePosts('run-1', dir, [{ platform: 'instagram', url: link, time: null, comments: 42, text: null }]);
  const [saved] = JSON.parse(fs.readFileSync(path.join(dir, 'runs', 'run-1', 'posts.json'), 'utf8'));
  assert.equal(saved.text, 'The new travel size is here');
  assert.equal(saved.comments_shown, 42);
  const lines = postsAbout('run-1', dir, [link, 'https://www.tiktok.com/@x/video/1']);
  assert.match(lines[0], /The new travel size is here/);
  assert.match(lines[1], /its own text was not saved/);
});

test('prepare shows what each post says and, with several batches, asks for one theme list', () => {
  const dir = tempDir();
  const link = 'https://www.youtube.com/watch?v=SAMPLE1';
  addRecords([comment({ comment_id: 'a', post_url: link }), comment({ comment_id: 'b', post_url: link, text: 'Where can I buy it?' })], dir);
  fs.mkdirSync(path.join(dir, 'runs', 'run-2'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'runs', 'run-2', 'request.json'), JSON.stringify({ posts: [{ url: link }] }));
  require('../scripts/fetch').savePosts('run-2', dir, [{ platform: 'youtube', url: link, title: 'Travel size launch', text: null, comments: 2 }]);
  const run = require('node:child_process').spawnSync(process.execPath, [path.join(__dirname, '..', 'scripts', 'prepare.js'), '--run', 'run-2', '--batch', '1'],
    { env: { ...process.env, COMMENT_THEMES_DATA_DIR: dir }, encoding: 'utf8' });
  assert.equal(run.status, 0, run.stdout + run.stderr);
  assert.match(run.stdout, /What each post says itself/);
  assert.match(run.stdout, /Travel size launch/);
  assert.match(run.stdout, /There are 2 batches\. Keep the themes you use in .*themes\.md/);
});

test('the Meta script asks for the app ID itself and points to the page with the app secret', () => {
  const { QUESTIONS, secretPage } = require('../scripts/meta-token');
  assert.match(QUESTIONS.appId, /number after \/apps\//);
  assert.equal(secretPage('1234567890'), 'https://developers.facebook.com/apps/1234567890/settings/basic/');
});

test('several platforms can be read in one go, and a TikTok post list answer keeps the video\'s own text', () => {
  const { pick } = require('../scripts/fetch');
  const entries = [{ platform: 'instagram', url: 'https://www.instagram.com/p/A/' }, { platform: 'facebook', url: 'https://www.facebook.com/1/posts/2' }, { platform: 'x', url: 'https://x.com/a/status/3' }];
  assert.deepEqual(pick(entries, { platforms: ['instagram', 'facebook'] }).map(e => e.platform), ['instagram', 'facebook']);
  assert.equal(pick(entries, {}).length, 3);
  assert.deepEqual(pick(entries, { post: 'status/3' }).map(e => e.platform), ['x']);
  const dir = tempDir();
  const link = 'https://www.tiktok.com/@sample/video/123';
  const file = path.join(dir, 'tiktok-123-post.json');
  fs.writeFileSync(file, JSON.stringify({ code: 0, data: { videos: [{ item_id: '123', caption: 'Scoreboard animation', comments: 4, create_time: 1775502000 }] } }));
  const run = require('node:child_process').spawnSync(process.execPath, [path.join(__dirname, '..', 'scripts', 'import.js'), '--tiktok-mcp', file, '--post', link, '--run', 'run-3'],
    { env: { ...process.env, COMMENT_THEMES_DATA_DIR: dir }, encoding: 'utf8' });
  assert.equal(run.status, 0, run.stdout);
  const [saved] = JSON.parse(fs.readFileSync(path.join(dir, 'runs', 'run-3', 'posts.json'), 'utf8'));
  assert.equal(saved.text, 'Scoreboard animation');
  assert.equal(saved.comments_shown, 4);
});
