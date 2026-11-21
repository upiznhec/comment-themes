#!/usr/bin/env node

// Checks that every quotation in a report is word for word a real comment of the run.
// Usage: node scripts/check-quotes.js --run <name> [--report <file>, default data/runs/<name>/report.md]
// Quotations are text in "..." or “...” (6 characters or more) and Markdown quote lines (> ...). A quote
// may leave words out with ... or …: each part must then appear, in order, in the same comment.
// Differences in spaces, straight or curly quotes and capital letters are ignored. Exits 1 if any quote
// is not found, so the agent fixes the report before showing it.
const fs = require('fs');
const path = require('path');
const { readRun } = require('./lib/runs');

function option(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

function normalize(text) {
  return String(text).toLowerCase().replace(/[‘’`]/g, "'").replace(/[“”]/g, '"').replace(/\s+/g, ' ').trim();
}

function quotesIn(markdown) {
  const found = [];
  const text = String(markdown).replace(/```[\s\S]*?```/g, '');
  for (const match of text.matchAll(/"([^"\n]{6,})"|“([^”\n]{6,})”/g)) found.push(match[1] || match[2]);
  for (const line of text.split('\n')) {
    const quote = line.match(/^\s*>\s*(.+)$/);
    if (quote && quote[1].trim().length >= 6) found.push(quote[1].trim().replace(/^["“]|["”]$/g, '').replace(/\s+[—–-]+\s*C\d+.*$/, ''));
  }
  return [...new Set(found.map(q => q.trim()))];
}

function findQuote(quote, comments) {
  const parts = normalize(quote).split(/\s*(?:\.\.\.|…)\s*/).filter(Boolean);
  if (!parts.length) return [];
  return comments.filter(c => {
    const body = normalize(c.text);
    let from = 0;
    for (const part of parts) {
      const at = body.indexOf(part, from);
      if (at < 0) return false;
      from = at + part.length;
    }
    return true;
  }).map(c => c.id);
}

function main() {
  const name = option('run');
  if (!name) { console.log('Usage: node scripts/check-quotes.js --run <name> [--report <file>]'); process.exit(2); }
  const { dir, comments } = readRun(name);
  const reportFile = option('report') || path.join(dir, 'report.md');
  const quotes = quotesIn(fs.readFileSync(reportFile, 'utf8'));
  let bad = 0;
  for (const quote of quotes) {
    const ids = findQuote(quote, comments);
    if (!ids.length) bad += 1;
    console.log(`${ids.length ? 'OK' : 'NOT FOUND'}  "${quote.length > 90 ? quote.slice(0, 87) + '...' : quote}"${ids.length ? '  ' + ids.slice(0, 5).join(', ') : ''}`);
  }
  console.log(`${quotes.length} quotations checked, ${bad} not found.`);
  if (bad) process.exit(1);
}

if (require.main === module) main();

module.exports = { findQuote, normalize, quotesIn };
