// The person's keys live in data/.env inside this folder (or COMMENT_THEMES_DATA_DIR/.env), readable
// only by their own account and never uploaded by git (data/ is ignored). Lines are NAME=value or
// export NAME=value; surrounding quotes are removed. A variable already set in the environment wins.
// Adapted from the Workflow 2 repository (Sibyl System Hotspot Monitor fork, MIT).
const fs = require('fs');
const path = require('path');

const ENV_FILE = '.env';

function getDataDir() {
  return process.env.COMMENT_THEMES_DATA_DIR || path.join(__dirname, '..', '..', 'data');
}

function parseEnvText(text) {
  const values = {};
  for (const raw of String(text || '').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const match = line.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!match) continue;
    let value = match[2].trim();
    if (value.length >= 2 && (value[0] === '"' || value[0] === "'") && value[value.length - 1] === value[0]) {
      value = value.slice(1, -1);
    }
    values[match[1]] = value;
  }
  return values;
}

// Removes every line for NAME (with or without "export") and keeps the rest.
function unsetEnvValue(text, name) {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(String(name))) throw new Error(`Not a variable name: ${name}`);
  const earlier = new RegExp(`^\\s*(?:export\\s+)?${name}\\s*=`);
  const kept = String(text || '').split(/\r?\n/).filter(line => !earlier.test(line));
  while (kept.length && kept[kept.length - 1].trim() === '') kept.pop();
  return kept.length ? `${kept.join('\n')}\n` : '';
}

// Sets NAME=value, replacing any earlier line for NAME and keeping the rest.
function setEnvValue(text, name, value) {
  if (/[\r\n]/.test(String(value))) throw new Error('The value must be one line.');
  return `${unsetEnvValue(text, name)}${name}=${value}\n`;
}

function envFilePath(dataDir = getDataDir()) {
  return path.join(dataDir, ENV_FILE);
}

function readEnvText(dataDir = getDataDir()) {
  try {
    return fs.readFileSync(envFilePath(dataDir), 'utf8');
  } catch (error) {
    return '';
  }
}

// The saved values, without touching process.env.
function readEnvValues(dataDir = getDataDir()) {
  return parseEnvText(readEnvText(dataDir));
}

// Puts the saved values into process.env, unless a variable is already set there.
function loadEnvFile(dataDir = getDataDir()) {
  const loaded = [];
  for (const [name, value] of Object.entries(readEnvValues(dataDir))) {
    if (process.env[name] === undefined || process.env[name] === '') {
      process.env[name] = value;
      loaded.push(name);
    }
  }
  return loaded;
}

// Writes the whole file in one step, readable only by the owner; the folder too.
function writeEnvText(dataDir, text) {
  fs.mkdirSync(dataDir, { recursive: true, mode: 0o700 });
  const file = envFilePath(dataDir);
  const temp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(temp, text, { mode: 0o600 });
  fs.renameSync(temp, file);
  if (process.platform !== 'win32') fs.chmodSync(file, 0o600);
  return file;
}

function writeEnvValue(dataDir, name, value) {
  return writeEnvText(dataDir, setEnvValue(readEnvText(dataDir), name, value));
}

// Removes NAME from the file; false when it was not there.
function removeEnvValue(dataDir, name) {
  const text = readEnvText(dataDir);
  if (!Object.prototype.hasOwnProperty.call(parseEnvText(text), name)) return false;
  writeEnvText(dataDir, unsetEnvValue(text, name));
  return true;
}

module.exports = {
  envFilePath,
  getDataDir,
  loadEnvFile,
  parseEnvText,
  readEnvValues,
  removeEnvValue,
  setEnvValue,
  unsetEnvValue,
  writeEnvValue
};
