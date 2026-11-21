// Label checks, counting, quote checks and search. All sample comments are made up.
const assert = require('node:assert/strict');
const { test } = require('node:test');

const { check, summarize } = require('../scripts/tally');
const { findQuote, quotesIn } = require('../scripts/check-quotes');
const { matches } = require('../scripts/find');

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

test('search: every word must appear; filters by platform', () => {
  const filter = { words: ['white', 'cast'], regex: null, platform: 'youtube', account: null, own: null, since: null };
  assert.equal(comments.filter(c => matches(c, filter)).length, 2);
  assert.equal(comments.filter(c => matches(c, { ...filter, platform: 'instagram' })).length, 0);
});
