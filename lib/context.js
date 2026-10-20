// Gathers everything the checks need, ONCE, so each check stays tiny.
// The result is called `ctx` (context) and is handed to every check.
//
// Two ways to get the page:
//   1. We download it from the URL (normal mode).
//   2. The user pastes the HTML (for sites that block automated visitors,
//      for example behind Cloudflare). Then ctx.source === 'pasted' and
//      anything that needs the live server is marked "not checked".

const cheerio = require('cheerio');
const config = require('../config');
const { fetchUrl } = require('./fetcher');

const hostKey = (hostname) => hostname.replace(/^www\./, '').toLowerCase();

// Used when pasted HTML comes without any page address.
const PLACEHOLDER_URL = 'https://pasted.invalid/';

// An error the frontend answers with "paste your HTML instead".
function blockedError(message) {
  return Object.assign(new Error(message), { suggestPaste: true });
}

// Downloads a small helper file (robots.txt, sitemap, llms.txt). Never throws.
// Returns { found, checked, body, url }
//   checked = false means "we could not find out" (blocked, server error...).
//   That is different from found = false, which means "it really is missing".
async function fetchSmallFile(url, looksValid) {
  const unknown = { found: false, checked: false, body: '', url };
  try {
    const res = await fetchUrl(url, {
      timeoutMs: config.extraFileTimeoutMs,
      maxBytes: config.maxSmallFileBytes,
    });
    if (res.status === 404 || res.status === 410) return { ...unknown, checked: true };
    if (res.status !== 200) return unknown; // 403, 5xx...: we cannot tell

    // Some sites answer 200 with an HTML "not found" page. Don't count that.
    const isHtml = /<html|<!doctype html/i.test(res.body.slice(0, 500));
    const found = res.body.trim() !== '' && !isHtml && looksValid(res.body);
    return { found, checked: true, body: found ? res.body : '', url: res.finalUrl };
  } catch {
    return unknown;
  }
}

// Reads every <script type="application/ld+json"> block (structured data).
function readJsonLd($) {
  const nodes = [];
  let errors = 0;

  // JSON-LD can be one object, a list, or an object with an "@graph" list.
  const flatten = (item) => {
    if (Array.isArray(item)) return item.forEach(flatten);
    if (item && typeof item === 'object') {
      nodes.push(item);
      if (item['@graph']) flatten(item['@graph']);
    }
  };

  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      flatten(JSON.parse($(el).contents().text()));
    } catch {
      errors += 1; // broken JSON, one of the checks will report it
    }
  });

  // Collect every @type in lowercase so checks can compare easily.
  const types = new Set();
  nodes.forEach((node) => {
    [].concat(node['@type'] || []).forEach((t) => types.add(String(t).toLowerCase()));
  });

  return { nodes, types, errors };
}

function readLinks($, pageUrl) {
  const pageHost = hostKey(pageUrl.hostname);
  const internal = [];
  const externalDomains = new Set();

  $('a[href]').each((_, el) => {
    const href = ($(el).attr('href') || '').trim();
    if (!href || /^(#|mailto:|tel:|javascript:)/i.test(href)) return;

    let link;
    try {
      link = new URL(href, pageUrl);
    } catch {
      return;
    }
    if (link.protocol !== 'http:' && link.protocol !== 'https:') return;

    if (hostKey(link.hostname) === pageHost) internal.push(link.href);
    else externalDomains.add(hostKey(link.hostname));
  });

  return { internal, externalDomains };
}

// Step 1: get the HTML, either by downloading it or from what the user pasted.
async function loadPage(startUrl, pastedHtml) {
  if (pastedHtml) {
    if (Buffer.byteLength(pastedHtml) > config.maxHtmlBytes) {
      throw new Error('The pasted HTML is too large (2 MB maximum).');
    }
    return { source: 'pasted', html: pastedHtml, finalUrl: startUrl, status: null, headers: {}, ms: null };
  }

  const page = await fetchUrl(startUrl);

  if (page.status >= 400) {
    if (page.status === 404 || page.status === 410) {
      throw new Error(`That page was not found (HTTP ${page.status}).`);
    }
    throw blockedError(
      `The website refused our request (HTTP ${page.status}). Some sites, for example behind Cloudflare, block automated tools.`
    );
  }
  if (!/html/i.test(page.headers['content-type'] || '')) {
    throw new Error('That URL does not return a web page (HTML).');
  }
  return { source: 'url', html: page.body, finalUrl: page.finalUrl, status: page.status, headers: page.headers, ms: page.ms };
}

// Works out the page address. For pasted HTML without an address we try the
// page's own canonical / og:url tags. Returns a URL object or null.
function findPageUrl(page, $) {
  const candidate =
    page.finalUrl || $('link[rel="canonical"]').attr('href') || $('meta[property="og:url"]').attr('content');
  try {
    const url = new URL(candidate);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url : null;
  } catch {
    return null;
  }
}

async function buildContext(startUrl, pastedHtml) {
  const page = await loadPage(startUrl, pastedHtml);
  const $ = cheerio.load(page.html);

  const pageUrl = findPageUrl(page, $);
  const urlKnown = pageUrl !== null;

  // Step 2: helper files. Only possible when we know the site address.
  let robots = { found: false, checked: false, body: '', url: '' };
  let sitemap = robots;
  let llms = robots;

  if (urlKnown) {
    robots = await fetchSmallFile(`${pageUrl.origin}/robots.txt`, () => true);

    // robots.txt can say where the sitemap is; otherwise try the usual place.
    const sitemapLine = robots.body.match(/^sitemap:\s*(\S+)/im);
    const sitemapUrl = sitemapLine ? sitemapLine[1] : `${pageUrl.origin}/sitemap.xml`;

    // The sitemap and llms.txt do not depend on each other: fetch both at once.
    [sitemap, llms] = await Promise.all([
      fetchSmallFile(sitemapUrl, (body) => /<urlset|<sitemapindex/i.test(body)),
      fetchSmallFile(`${pageUrl.origin}/llms.txt`, () => true),
    ]);
  }

  // Step 3: plain visible text of the page (without scripts and styles).
  const $body = $('body').clone();
  $body.find('script, style, noscript').remove();
  const text = $body.text().replace(/\s+/g, ' ').trim();

  return {
    source: page.source, // 'url' or 'pasted'
    urlKnown,
    finalUrl: urlKnown ? pageUrl.href : null,
    status: page.status,
    headers: page.headers,
    responseMs: page.ms, // null when HTML was pasted
    html: page.html,
    $,
    text,
    wordCount: text ? text.split(' ').length : 0,
    scriptCount: $('script[src]').length,
    jsonLd: readJsonLd($),
    links: readLinks($, pageUrl || new URL(PLACEHOLDER_URL)),
    robots,
    sitemap,
    llms,
  };
}

module.exports = { buildContext };
