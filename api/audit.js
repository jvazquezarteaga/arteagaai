// POST /api/audit
//   body: { "url": "arteaga.com" }                      -> we download the page
//   body: { "html": "<!doctype html>...", "url": "..." } -> we audit pasted HTML
// Vercel turns every file in /api into an endpoint automatically.

const { runAudit } = require('../lib/audit');

// Turns technical errors into sentences a visitor can understand.
// canPaste = true tells the frontend to offer the "paste your HTML" option.
function describeError(error) {
  if (error.name === 'TimeoutError' || error.name === 'AbortError') {
    return { error: 'The website took too long to respond.', canPaste: true };
  }
  if (error.message === 'fetch failed') {
    return { error: 'We could not connect to that website. Check the address and try again.', canPaste: true };
  }
  return {
    error: error.message || 'Something went wrong while auditing that page.',
    canPaste: Boolean(error.suggestPaste),
  };
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Use POST.' });
  }

  try {
    const body = req.body || {};
    const report = await runAudit(body.url, body.html);
    return res.status(200).json(report);
  } catch (error) {
    return res.status(422).json(describeError(error));
  }
};
