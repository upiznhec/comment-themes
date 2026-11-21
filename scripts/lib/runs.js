// An analysis run: data/runs/<name>/ holds the comments chosen for it (comments.jsonl, with short IDs
// C0001...), the batches the agent labels (batch-01.jsonl...: ID, text and likes only, no names), the
// agent's labels (labels*.jsonl: {"id","bucket","theme"} per line), and what tally.js writes.
const fs = require('fs');
const path = require('path');
const { getDataDir } = require('./env-file');

// The buckets of ScrapeCreators' comment-mining skill, plus not_useful for what its cleaning step drops
// (spam, emoji only, tagging a friend, off-topic): counted, but kept out of the themes.
const BUCKETS = {
  questions: 'asks something',
  objections: 'a reason not to buy, try or believe',
  complaints: 'a complaint or pain point',
  praise: 'praise',
  confusion: 'misunderstands or is unsure about something',
  requests: 'asks for a product, feature or piece of content',
  buying_intent: 'wants to buy, asks where or how to buy, or says they bought',
  debate: 'controversy or argument',
  culture: 'joke, meme or culture signal',
  not_useful: 'spam, emoji only, tags a friend, or off-topic'
};

function runDir(name, dataDir = getDataDir()) {
  if (!/^[\w.-]+$/.test(String(name || ''))) throw new Error('A run name may use letters, digits, dots, dashes and underscores.');
  return path.join(dataDir, 'runs', name);
}

function readJsonl(file) {
  return fs.readFileSync(file, 'utf8').split('\n').filter(line => line.trim()).map((line, index) => {
    try { return JSON.parse(line); } catch (error) { throw new Error(`${path.basename(file)} line ${index + 1} is not valid JSON`); }
  });
}

function readRun(name, dataDir = getDataDir()) {
  const dir = runDir(name, dataDir);
  if (!fs.existsSync(path.join(dir, 'comments.jsonl'))) throw new Error(`No run named ${name}: make one with prepare.js`);
  const comments = readJsonl(path.join(dir, 'comments.jsonl'));
  const labelFiles = fs.readdirSync(dir).filter(file => /^labels.*\.jsonl$/.test(file)).sort();
  const labels = labelFiles.flatMap(file => readJsonl(path.join(dir, file)).map(label => ({ ...label, file })));
  return { dir, comments, labels };
}

module.exports = { BUCKETS, readJsonl, readRun, runDir };
