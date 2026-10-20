// Downloads a URL safely: validates it, follows redirects by hand (so every
// hop is re-checked), enforces a timeout and a maximum size.

const config = require('../config');
const { assertPublicUrl } = require('./safety');

// Reads the response body but stops once we hit maxBytes.
async function readBody(response, maxBytes) {
  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;

  while (total < maxBytes) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    total += value.length;
  }
  reader.cancel().catch(() => {});

  return Buffer.concat(chunks).subarray(0, maxBytes).toString('utf8');
}

// options: { timeoutMs, maxBytes }
// Returns { ok, status, finalUrl, headers, body, ms, redirects }
async function fetchUrl(startUrl, options = {}) {
  const timeoutMs = options.timeoutMs || config.pageTimeoutMs;
  const maxBytes = options.maxBytes || config.maxHtmlBytes;

  let currentUrl = startUrl;
  const started = Date.now();

  for (let hop = 0; hop <= config.maxRedirects; hop++) {
    await assertPublicUrl(currentUrl); // re-check on every redirect

    const response = await fetch(currentUrl, {
      redirect: 'manual',
      signal: AbortSignal.timeout(timeoutMs),
      headers: {
        'User-Agent': config.userAgent,
        Accept: 'text/html,application/xhtml+xml,text/plain,*/*;q=0.8',
      },
    });

    // 3xx with a Location header = redirect: loop again with the new URL.
    const location = response.headers.get('location');
    if (response.status >= 300 && response.status < 400 && location) {
      currentUrl = new URL(location, currentUrl).href;
      continue;
    }

    return {
      ok: response.ok,
      status: response.status,
      finalUrl: currentUrl,
      headers: Object.fromEntries(response.headers.entries()),
      body: await readBody(response, maxBytes),
      ms: Date.now() - started,
      redirects: hop,
    };
  }

  throw new Error('That page redirects too many times.');
}

module.exports = { fetchUrl };
