// Label checks, counting, quote checks and search. All sample comments are made up.
const assert = require('node:assert/strict');
const { test } = require('node:test');

const { check, summarize } = require('../scripts/tally');
const { findQuote, quotesIn } = require('../scripts/check-quotes');
const { matches } = require('../scripts/find');
const { sample, select } = require('../scripts/prepare');

const comments = [
  { id: 'C0001', key: 'yt:1', platform: 'youtube', likes: 10, text: 'Does this leave a white cast on dark skin?' },
  { id: 'C0002', key: 'yt:2', platform: 'youtube', likes: 2, text: 'white cast is real, I returned it' },
  { id: 'C0003', key: 'ig:3', platform: 'instagram', likes: 0, text: '@friend look' }
];

test('labels: missing, doubled, unknown bucket and missing theme are all reported', () => {
  const { problems } = check(comments, [
    { id: 'C0001', bucket: 'questions', theme: 'white cast', file: 'labels.jsonl' },
    { id: 'C0001', bucket: 'questions', theme: 'white cast', file: 'labels.jsonl' },
    { id: 'C0002', bucket: 'angry', theme: 'x', file: 'labels.jsonl' },
    { id: 'C0009', bucket: 'praise', theme: 'x', file: 'labels.jsonl' }
  ]);
  assert.equal(problems.length, 4);
  assert.match(problems.join('\n'), /more than once/);
  assert.match(problems.join('\n'), /unknown bucket "angry"/);
  assert.match(problems.join('\n'), /not in this run/);
  assert.match(problems.join('\n'), /1 comments have no label: C0003/);
});

test('counting: themes merge regardless of case, not_useful stays out of the themes', () => {
  const labels = [
    { id: 'C0001', bucket: 'questions', theme: 'White cast' },
    { id: 'C0002', bucket: 'questions', theme: 'white  cast' },
    { id: 'C0003', bucket: 'not_useful' }
  ];
  const { byId, problems } = check(comments, labels);
  assert.deepEqual(problems, []);
  const summary = summarize(comments, byId, new Map([['yt:1', 'p1'], ['yt:2', 'p2']]));
  assert.equal(summary.useful, 2);
  assert.equal(summary.not_useful, 1);
  assert.equal(summary.themes.length, 1);
  assert.equal(summary.themes[0].comments, 2);
  assert.equal(summary.themes[0].people, 2);
  assert.equal(summary.themes[0].likes, 12);
  assert.equal(summary.themes[0].examples[0].id, 'C0001');
  assert.equal(summary.confidence, 'Low');
});

test('quotes: found in any case and spacing, with ... for left-out words; made-up quotes are caught', () => {
  const report = '# Report\n- "Does this leave a WHITE cast"\n- “white cast is real … returned it”\n> I would buy two of these\n';
  const quotes = quotesIn(report);
  assert.deepEqual(quotes.map(q => findQuote(q, comments)), [['C0001'], ['C0002'], []]);
});

test('search: every word must appear; filters by platform and by part of a post link', () => {
  const filter = { words: ['white', 'cast'], regex: null, platform: 'youtube', post: null, own: null, since: null };
  assert.equal(comments.filter(c => matches(c, filter)).length, 2);
  assert.equal(comments.filter(c => matches(c, { ...filter, platform: 'instagram' })).length, 0);
  const linked = [{ ...comments[0], post_url: 'https://youtu.be/AbC123' }, { ...comments[1], post_url: 'https://youtu.be/Other' }];
  assert.equal(linked.filter(c => matches(c, { ...filter, post: 'abc123' })).length, 1);
});

test('choosing comments: a request takes only its own posts; parts of links narrow a choice without one', () => {
  const stored = [
    { platform: 'youtube', post_url: 'https://youtu.be/A', post_id: 'A', text: 'one', own: false },
    { platform: 'tiktok', post_url: 'https://www.tiktok.com/@me/video/7', post_id: '7', text: 'two', own: true },
    { platform: 'tiktok', post_url: 'https://www.tiktok.com/@me/video/8', post_id: '8', text: 'three', own: true },
    { platform: 'tiktok', post_url: 'https://www.tiktok.com/@me/video/7', post_id: '7', text: '   ', own: true }
  ];
  const links = new Set(['https://youtu.be/A', 'https://www.tiktok.com/@me/video/7']);
  assert.deepEqual(select(stored, { links }).map(r => r.text), ['one', 'two']);
  assert.deepEqual(select(stored, { posts: ['video/8'] }).map(r => r.text), ['three']);
  assert.deepEqual(select(stored, { own: true }).map(r => r.text), ['two', 'three']);
});

test('a large choice is sampled: the most-liked half, the rest at random, the same for the same run name', () => {
  const many = Array.from({ length: 3000 }, (_, i) => ({ comment_id: `c${i}`, likes: i, text: `comment ${i}` }));
  const picked = sample(many, 1000, 'run-a');
  assert.equal(picked.length, 1000);
  assert.equal(new Set(picked.map(p => p.record.comment_id)).size, 1000);
  const liked = picked.filter(p => p.pick === 'liked').map(p => p.record.likes);
  assert.equal(liked.length, 500);
  assert.equal(Math.min(...liked), 2500);
  assert.ok(picked.filter(p => p.pick === 'random').every(p => p.record.likes < 2500));
  assert.deepEqual(sample(many, 1000, 'run-a').map(p => p.record.comment_id), picked.map(p => p.record.comment_id));
  assert.notDeepEqual(sample(many, 1000, 'run-b').map(p => p.record.comment_id), picked.map(p => p.record.comment_id));
  assert.ok(sample(many.slice(0, 800), 1000, 'run-a').every(p => p.pick === 'all'));
  assert.equal(sample(many, 0, 'run-a').length, 3000);
});
