#!/usr/bin/env node

// Saves one key or token in data/.env, so that it never passes through a chat with an agent. The person
// runs this in their own terminal and pastes at a prompt that does not show the value, only how many
// characters arrived; the agent never sees it. Running it again replaces the old value, except that a
// value which does not look right does not replace one that does without the person's yes. Other lines
// are kept, and only the person's account can read the file.
// Adapted from the Workflow 2 repository (Sibyl System Hotspot Monitor fork, MIT).
//
// Usage: node scripts/save-secret.js <name>
//   scrapecreators  SCRAPECREATORS_API_KEY  comments on Instagram, TikTok, Facebook and Reddit posts
//   youtube         YOUTUBE_API_KEY         comments on YouTube videos
//   x               X_BEARER_TOKEN          replies on X
// --remove deletes a saved value. --from-stdin reads the first line of standard input instead of a
// prompt (for tests).

const { envFilePath, getDataDir, readEnvValues, removeEnvValue, writeEnvValue } = require('./lib/env-file');
const { readHidden, readLine, readVisible } = require('./lib/prompt');

const SECRETS = {
  scrapecreators: { name: 'SCRAPECREATORS_API_KEY', label: 'ScrapeCreators API key', shape: /^\S{16,}$/, hint: 'An API key is one long code with no spaces.' },
  youtube: { name: 'YOUTUBE_API_KEY', label: 'YouTube key', shape: /^AIza[0-9A-Za-z_-]{30,}$/, hint: 'Google keys start with "AIza".' },
  x: { name: 'X_BEARER_TOKEN', label: 'X Bearer Token', shape: /^AAAA\S{20,}$/, hint: 'X Bearer Tokens start with "AAAA".' }
};

function resolveSecret(arg) {
  const key = String(arg || '').trim().toLowerCase();
  return SECRETS[key] || null;
}

function looksRight(secret, value) {
  return !secret.shape || secret.shape.test(value);
}

async function main() {
  const args = process.argv.slice(2);
  const fromStdin = args.includes('--from-stdin');
  const secret = resolveSecret(args.find(arg => !arg.startsWith('--')));
  if (!secret) {
    console.log('Usage: node scripts/save-secret.js <scrapecreators | youtube | x> [--remove]');
    process.exit(2);
  }
  const dataDir = getDataDir();

  if (args.includes('--remove')) {
    console.log(removeEnvValue(dataDir, secret.name)
      ? `Removed ${secret.name} from ${envFilePath(dataDir)}.`
      : `${secret.name} was not saved, so there was nothing to remove.`);
    return;
  }
  if (!fromStdin && !process.stdin.isTTY) {
    console.log('Run this in your own terminal: it asks you to paste the value there, so that it never goes through a chat.');
    process.exit(2);
  }

  console.log(`Paste your ${secret.label}, then press Return. It is not shown on screen.`);
  let value;
  try {
    value = fromStdin ? await readLine(process.stdin) : await readHidden(process.stdin, process.stdout);
  } catch (error) {
    console.log('Cancelled. Nothing was saved.');
    process.exit(1);
  }
  value = String(value || '').trim();
  if (!value) {
    console.log('Nothing was pasted, so nothing was saved.');
    process.exit(1);
  }

  // A wrong paste (something else left on the clipboard) must not replace a value that works.
  const current = readEnvValues(dataDir)[secret.name] || '';
  if (!looksRight(secret, value) && current && looksRight(secret, current)) {
    console.log(`This does not look like a ${secret.label}. ${secret.hint} The one saved now does.`);
    const answer = fromStdin
      ? ''
      : (await readVisible('Replace it anyway? Type y and press Return, or press Return to keep the saved one: ')).trim().toLowerCase();
    if (answer !== 'y' && answer !== 'yes') {
      console.log('Nothing was changed. Copy the right value and run this command again.');
      process.exit(1);
    }
  }

  writeEnvValue(dataDir, secret.name, value);
  console.log(`Saved as ${secret.name} in ${envFilePath(dataDir)}. Only your account can read that file.`);
  if (!looksRight(secret, value)) {
    console.log(`Check: this does not look like a ${secret.label}. ${secret.hint} If it is wrong, run this command again.`);
  }
  console.log('Now tell your agent that it is saved. Do not paste the value into the chat.');
}

if (require.main === module) main();

module.exports = { SECRETS, resolveSecret };
