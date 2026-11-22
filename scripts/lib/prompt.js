// Terminal prompts for the scripts the person runs themselves (save-secret.js). Taken from the
// Workflow 2 repository (Sibyl System Hotspot Monitor fork, MIT).
// A hidden prompt never shows what the person types or pastes, so a key never appears on screen;
// it shows only how many characters have arrived.

const readline = require('readline');

// The first line of standard input, for --from-stdin (scripts and tests).
function readLine(input = process.stdin) {
  return new Promise((resolve, reject) => {
    let data = '';
    input.setEncoding('utf8');
    input.on('data', chunk => { data += chunk; });
    input.on('end', () => resolve(data.split(/\r?\n/)[0]));
    input.on('error', reject);
  });
}

// All lines of standard input, for --from-stdin when a script asks several questions.
function readLines(input = process.stdin) {
  return new Promise((resolve, reject) => {
    let data = '';
    input.setEncoding('utf8');
    input.on('data', chunk => { data += chunk; });
    input.on('end', () => resolve(data.split(/\r?\n/)));
    input.on('error', reject);
  });
}

// The line under a hidden question: how much has arrived, never what. In testing, a person took
// a paste that showed nothing for one that had not worked, or reported a key saved before pressing
// Return.
// Kept short: in a narrow terminal a longer line wraps, and rewriting it then prints copies of it
// (seen in the X token test, 2026-11-21). The question above already says to press Return.
function pasteCount(length) {
  return length ? `Received: ${length} characters` : 'Nothing pasted yet';
}

// The value is not echoed; a line under the question counts the characters received (options.status
// sets its wording). Pasting works, Backspace deletes, Return finishes and Ctrl+C cancels. The
// question should end with a line break, so that the count has a line of its own.
function readHidden(input = process.stdin, output = process.stdout, options = {}) {
  const status = options.status || pasteCount;
  return new Promise((resolve, reject) => {
    let value = '';
    let shown = '';
    const show = () => {
      const line = `  ${status(value.length)}`;
      // Clears the line and writes the new count over the old one.
      output.write(`\r\u001b[2K${line}`);
      shown = line;
    };
    const finish = (error, result) => {
      input.removeListener('data', onData);
      input.setRawMode(false);
      input.pause();
      output.write('\n');
      if (error) reject(error);
      else resolve(result);
    };
    function onData(chunk) {
      // Some terminals wrap a paste in bracketed-paste markers.
      for (const char of String(chunk).replace(/\u001b\[20[01]~/g, '')) {
        if (char === '\r' || char === '\n') return finish(null, value);
        if (char === '\u0003') return finish(new Error('cancelled'));
        if (char === '\u007f' || char === '\b') {
          value = value.slice(0, -1);
          continue;
        }
        if (char >= ' ') value += char;
      }
      show();
      return undefined;
    }
    input.setRawMode(true);
    input.setEncoding('utf8');
    input.on('data', onData);
    input.resume();
    show();
  });
}

// A command pasted where a key belongs. In a test the clipboard still held the save command, because the
// Copy click on the key's page had not worked, and the command was saved as the key. Keys and tokens have
// no spaces, so this never matches one.
function looksLikeCommand(value) {
  const text = String(value || '').trim();
  return /\s/.test(text) && /(^|\s)(cd|node|npm|bash)\s|save-secret\.js|meta-token\.js|&&/.test(text);
}

// A visible question, answered with Return.
function readVisible(question, input = process.stdin, output = process.stdout) {
  return new Promise(resolve => {
    const rl = readline.createInterface({ input, output });
    rl.question(question, answer => {
      rl.close();
      resolve(answer);
    });
  });
}

module.exports = {
  looksLikeCommand,
  pasteCount,
  readHidden,
  readLine,
  readLines,
  readVisible
};
