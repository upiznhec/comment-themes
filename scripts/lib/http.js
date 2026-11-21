// One GET request that returns parsed JSON. Keys and tokens can sit in URLs (YouTube, Meta), so error
// messages never include the URL. Retries once on a network error or a 5xx answer.

async function getJson(url, { headers = {}, timeout = 30000, retries = 1 } = {}) {
  let lastError;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    try {
      const response = await fetch(url, { headers, signal: controller.signal });
      const text = await response.text();
      let body = null;
      try { body = text ? JSON.parse(text) : null; } catch (error) { body = { raw: text.slice(0, 200) }; }
      if (response.status >= 500 && attempt < retries) { lastError = new Error(`HTTP ${response.status}`); continue; }
      return { status: response.status, ok: response.ok, body };
    } catch (error) {
      lastError = new Error(error.name === 'AbortError' ? 'timed out' : (error.cause?.code || error.message));
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastError;
}

module.exports = { getJson };
