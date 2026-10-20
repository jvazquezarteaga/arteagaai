// All the settings you are likely to tweak live here.

module.exports = {
  // Identifies our requests in the audited site's server logs.
  userAgent: 'ArteagaAuditBot/1.0 (+https://arteaga.com/audit)',

  // Time limits in milliseconds.
  pageTimeoutMs: 8000,
  extraFileTimeoutMs: 5000, // robots.txt, sitemap.xml, llms.txt

  // Safety limits.
  maxHtmlBytes: 2 * 1024 * 1024, // stop reading a page after 2 MB
  maxSmallFileBytes: 200 * 1024, // robots.txt etc. never need more than 200 KB
  maxRedirects: 5,

  // Set AUDIT_ALLOW_PRIVATE_HOSTS=true ONLY on your own machine to audit
  // localhost pages while developing. Never set it on Vercel.
  allowPrivateHosts: process.env.AUDIT_ALLOW_PRIVATE_HOSTS === 'true',

  // AI crawlers we look for in robots.txt (GEO category).
  // To track a new bot, add one line here. No other code changes needed.
  aiCrawlers: [
    { name: 'GPTBot', owner: 'OpenAI (training)' },
    { name: 'OAI-SearchBot', owner: 'OpenAI (ChatGPT search)' },
    { name: 'ChatGPT-User', owner: 'OpenAI (user browsing)' },
    { name: 'ClaudeBot', owner: 'Anthropic' },
    { name: 'PerplexityBot', owner: 'Perplexity' },
    { name: 'Google-Extended', owner: 'Google (Gemini training)' },
    { name: 'Applebot-Extended', owner: 'Apple' },
    { name: 'CCBot', owner: 'Common Crawl' },
  ],

  // Schema.org types we treat as useful "answer engine" signals.
  faqSchemaTypes: ['faqpage', 'howto', 'qapage'],
  organizationSchemaTypes: ['organization', 'localbusiness', 'professionalservice', 'corporation'],
};
