// The whole audit in one function: URL (or pasted HTML) in, report out.
// The API route and the tests both call runAudit().

const categories = require('../checks');
const { buildContext } = require('./context');

// How many points each status earns. Score = earned points / possible points.
// "skipped" checks are not in this list, so they never affect the score.
const POINTS = { pass: 1, warn: 0.5, fail: 0 };

// Makes "arteaga.com" work as well as "https://arteaga.com".
function normalizeUrl(input) {
  let value = String(input || '').trim();
  if (!value) return null;
  if (value.length > 2048) throw new Error('That address is too long.');
  if (!/^https?:\/\//i.test(value)) value = `https://${value}`;
  return value;
}

function runCheck(check, ctx) {
  try {
    const result = check.run(ctx);
    return { id: check.id, title: check.title, weight: check.weight, ...result };
  } catch (error) {
    // One broken check must never break the whole report.
    return {
      id: check.id,
      title: check.title,
      weight: check.weight,
      status: 'skipped',
      message: 'This check could not run on this page.',
      fix: '',
    };
  }
}

function scoreOf(results) {
  const scored = results.filter((r) => r.status in POINTS);
  const possible = scored.reduce((sum, r) => sum + r.weight, 0);
  const earned = scored.reduce((sum, r) => sum + r.weight * POINTS[r.status], 0);
  return possible === 0 ? 0 : Math.round((earned / possible) * 100);
}

function countStatuses(results) {
  const counts = { pass: 0, warn: 0, fail: 0, skipped: 0 };
  results.forEach((r) => (counts[r.status] += 1));
  return counts;
}

// pastedHtml is optional. When given, we audit it instead of downloading the
// page, and the URL becomes optional.
async function runAudit(input, pastedHtml) {
  const startedAt = Date.now();

  const url = normalizeUrl(input);
  const pasted = typeof pastedHtml === 'string' && pastedHtml.trim() !== '' ? pastedHtml : null;
  if (!url && !pasted) throw new Error('Please enter a website address.');

  const ctx = await buildContext(url, pasted);

  const report = { categories: {} };
  categories.forEach((category) => {
    const results = category.checks.map((check) => runCheck(check, ctx));
    report.categories[category.id] = {
      label: category.label,
      description: category.description,
      score: scoreOf(results),
      counts: countStatuses(results),
      checks: results,
    };
  });

  // Overall score = simple average of the category scores.
  const scores = Object.values(report.categories).map((c) => c.score);
  report.overall = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);

  report.source = ctx.source; // 'url' or 'pasted'
  report.url = ctx.finalUrl; // null when HTML was pasted without an address
  report.auditedAt = new Date().toISOString();
  report.durationMs = Date.now() - startedAt;
  return report;
}

module.exports = { runAudit };
