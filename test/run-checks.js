// Run with:  npm test
// Starts two tiny local websites and audits them:
//   - a normal site (so we can test the audit end to end)
//   - a site that refuses everything with 403 (like Cloudflare blocking a bot)

process.env.AUDIT_ALLOW_PRIVATE_HOSTS = 'true'; // lets us audit localhost in tests only

const assert = require('node:assert/strict');
const http = require('node:http');
const config = require('../config');
const { runAudit } = require('../lib/audit');
const { assertPublicUrl } = require('../lib/safety');

const PAGE = `<!doctype html>
<html lang="en"><head>
  <title>Arteaga test page for the audit tool demo</title>
  <meta name="description" content="A small page used to test the audit tool. It has enough words to count as a proper description.">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <script type="application/ld+json">{"@context":"https://schema.org","@type":"Organization","name":"Test","sameAs":["https://a.example","https://b.example"]}</script>
</head><body>
  <h1>Hello</h1>
  <h2>What does the tool check?</h2>
  <p>This paragraph has about thirty words so that the concise answer check can count it as a short and direct answer that a search assistant could quote.</p>
  <ul><li>One</li><li>Two</li></ul>
  <a href="/a">A</a><a href="/b">B</a><a href="/c">C</a><a href="https://other.example">Other</a>
</body></html>`;

function startServer(handler) {
  return new Promise((resolve) => {
    const server = http.createServer(handler).listen(0, '127.0.0.1', () => resolve(server));
  });
}

const find = (report, category, id) => report.categories[category].checks.find((c) => c.id === id);
let passed = 0;
async function test(name, fn) {
  await fn();
  passed += 1;
  console.log(`ok - ${name}`);
}

(async () => {
  // Site A: normal, robots.txt blocks GPTBot, no llms.txt
  const normal = await startServer((req, res) => {
    if (req.url === '/robots.txt') {
      res.setHeader('Content-Type', 'text/plain');
      return res.end('User-agent: GPTBot\nDisallow: /\n\nUser-agent: *\nAllow: /\n');
    }
    if (req.url === '/sitemap.xml') {
      res.setHeader('Content-Type', 'application/xml');
      return res.end('<?xml version="1.0"?><urlset></urlset>');
    }
    if (req.url === '/') {
      res.setHeader('Content-Type', 'text/html');
      return res.end(PAGE);
    }
    res.statusCode = 404;
    res.end('not found');
  });
  // Site B: refuses everything, like a bot-protection wall
  const blocked = await startServer((req, res) => {
    res.statusCode = 403;
    res.end('Attention required');
  });

  const urlA = `http://127.0.0.1:${normal.address().port}/`;
  const urlB = `http://127.0.0.1:${blocked.address().port}/`;

  await test('normal audit returns scores and checks', async () => {
    const report = await runAudit(urlA);
    assert.equal(report.source, 'url');
    assert.ok(report.overall >= 0 && report.overall <= 100);
    assert.equal(Object.keys(report.categories).length, 3);
    assert.equal(find(report, 'seo', 'title').status, 'pass');
    assert.equal(find(report, 'seo', 'robots-txt').status, 'pass');
    assert.equal(find(report, 'geo', 'ai-crawlers').status, 'warn'); // GPTBot blocked
    assert.equal(find(report, 'geo', 'llms-txt').status, 'warn'); // 404 = really missing
    assert.equal(find(report, 'geo', 'same-as').status, 'pass');
  });

  await test('a blocked site suggests pasting the HTML', async () => {
    await assert.rejects(runAudit(urlB), (error) => error.suggestPaste === true && /403/.test(error.message));
  });

  await test('pasted HTML without an address skips server-only checks', async () => {
    const report = await runAudit('', PAGE);
    assert.equal(report.source, 'pasted');
    assert.equal(report.url, null);
    ['https', 'response-time', 'robots-txt', 'sitemap'].forEach((id) =>
      assert.equal(find(report, 'seo', id).status, 'skipped', id)
    );
    assert.equal(find(report, 'geo', 'ai-crawlers').status, 'skipped');
    assert.equal(find(report, 'seo', 'title').status, 'pass'); // HTML checks still work
  });

  await test('pasted HTML with an address also checks robots.txt and sitemap', async () => {
    const report = await runAudit(urlA, PAGE);
    assert.equal(report.source, 'pasted');
    assert.equal(find(report, 'seo', 'robots-txt').status, 'pass');
    assert.equal(find(report, 'seo', 'response-time').status, 'skipped');
  });

  await test('robots.txt that answers 403 is "not checked", not "missing"', async () => {
    const report = await runAudit(urlB, PAGE);
    assert.equal(find(report, 'seo', 'robots-txt').status, 'skipped');
    assert.equal(find(report, 'geo', 'llms-txt').status, 'skipped');
  });

  await test('private addresses are refused when the dev switch is off', async () => {
    config.allowPrivateHosts = false;
    await assert.rejects(assertPublicUrl('http://127.0.0.1/'), /Private or local/);
    await assert.rejects(assertPublicUrl('http://[::ffff:10.0.0.1]/'), /Private or local/);
    await assert.rejects(assertPublicUrl('http://169.254.169.254/latest/meta-data'), /Private or local/);
    await assert.rejects(assertPublicUrl('file:///etc/passwd'), /http and https/);
    config.allowPrivateHosts = true;
  });

  console.log(`\n${passed} tests passed`);
  normal.close();
  blocked.close();
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
