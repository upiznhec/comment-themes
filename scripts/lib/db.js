// The comment database: data/comments.jsonl, one comment per line. A comment is known by platform and
// comment ID, so reading the same post again updates likes and replies instead of adding a copy.
// Kept about each commenter: the name shown on the platform, the handle and the platform's ID, nothing
// else (no pictures, no gender).
const fs = require('fs');
const path = require('path');
const { getDataDir } = require('./env-file');

const FIELDS = [
  'platform', 'route', 'own', 'account', 'post_id', 'post_url', 'post_time',
  'comment_id', 'parent_id', 'time', 'likes', 'replies', 'hidden', 'text',
  'author_name', 'author_handle', 'author_id', 'first_seen', 'last_seen'
];
const UPDATABLE = ['likes', 'replies', 'hidden', 'text', 'author_name', 'author_handle', 'author_id', 'post_url', 'post_time', 'last_seen'];

function dbPath(dataDir = getDataDir()) {
  return path.join(dataDir, 'comments.jsonl');
}

function keyOf(record) {
  return `${record.platform}:${record.comment_id}`;
}

function readAll(dataDir = getDataDir()) {
  let text = '';
  try { text = fs.readFileSync(dbPath(dataDir), 'utf8'); } catch (error) { return []; }
  return text.split('\n').filter(line => line.trim()).map(line => JSON.parse(line));
}

// Keeps only the known fields, in order, so that nothing else a platform returns is stored.
function clean(record, now) {
  const out = {};
  for (const field of FIELDS) out[field] = record[field] === undefined ? null : record[field];
  if (typeof out.text === 'string') out.text = out.text.replace(/\r\n/g, '\n').trim();
  out.first_seen = out.first_seen || now;
  out.last_seen = now;
  return out;
}

// Adds new comments and updates known ones; returns how many of each. Writes the file in one step.
function addRecords(records, dataDir = getDataDir(), now = new Date().toISOString()) {
  const existing = new Map(readAll(dataDir).map(record => [keyOf(record), record]));
  let added = 0;
  let updated = 0;
  for (const raw of records) {
    if (!raw || !raw.platform || !raw.comment_id || !String(raw.text || '').trim()) continue;
    const record = clean(raw, now);
    const key = keyOf(record);
    const old = existing.get(key);
    if (old) {
      for (const field of UPDATABLE) if (record[field] !== null) old[field] = record[field];
      updated += 1;
    } else {
      existing.set(key, record);
      added += 1;
    }
  }
  fs.mkdirSync(dataDir, { recursive: true, mode: 0o700 });
  const file = dbPath(dataDir);
  const temp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(temp, [...existing.values()].map(record => JSON.stringify(record)).join('\n') + '\n', { mode: 0o600 });
  fs.renameSync(temp, file);
  return { added, updated, total: existing.size };
}

function csvCell(value) {
  const text = value === null || value === undefined ? '' : String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function toCsv(rows, columns) {
  return [columns.join(','), ...rows.map(row => columns.map(column => csvCell(row[column])).join(','))].join('\n') + '\n';
}

// A small CSV reader: quoted cells, doubled quotes and line breaks inside quotes.
function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  const input = String(text).replace(/^﻿/, '');
  for (let i = 0; i < input.length; i += 1) {
    const char = input[i];
    if (quoted) {
      if (char === '"' && input[i + 1] === '"') { cell += '"'; i += 1; }
      else if (char === '"') quoted = false;
      else cell += char;
    } else if (char === '"') quoted = true;
    else if (char === ',') { row.push(cell); cell = ''; }
    else if (char === '\n' || char === '\r') {
      if (char === '\r' && input[i + 1] === '\n') i += 1;
      row.push(cell); rows.push(row); row = []; cell = '';
    } else cell += char;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows.filter(cells => cells.some(value => value.trim() !== ''));
}

module.exports = { FIELDS, addRecords, clean, dbPath, keyOf, parseCsv, readAll, toCsv };
