// Small helpers shared by the platform readers.

// Epoch seconds (number or digit string), epoch milliseconds or an ISO string -> ISO string, or null.
function toIso(value) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number' || /^\d+$/.test(String(value))) {
    const number = Number(value);
    const date = new Date(number > 1e12 ? number : number * 1000);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function newCost() {
  return { scrapecreatorsCharged: 0, scrapecreatorsLeft: null, youtubeUnits: 0, xPosts: 0, xUsers: 0 };
}

// What a post list entry looks like in --plan mode and in the summary.
function postInfo(platform, id, url, time, comments) {
  return { platform, id: String(id), url, time: toIso(time), comments: comments === undefined ? null : comments };
}

// True when time (any form toIso reads) is on or after since (ISO). Unknown times count as inside.
function inWindow(time, since) {
  const iso = toIso(time);
  return !iso || Date.parse(iso) >= Date.parse(since);
}

module.exports = { inWindow, newCost, postInfo, toIso };
