# Arteaga AI Visibility Audit (Node / Vercel)

SEO, AEO and GEO audit for a single page. URL in, scored report out. Results can be
downloaded as JSON, CSV or PDF (browser print dialog).

## Run locally

    npm install
    npm run dev        # http://localhost:3000
    npm test           # local test sites, no internet needed

To audit `localhost` pages while developing, start with `AUDIT_ALLOW_PRIVATE_HOSTS=true`.
Never set that on Vercel.

## Deploy

Import the folder in Vercel (or `vercel` from the CLI). No build step. `public/` is served
as static files and `api/audit.js` becomes `POST /api/audit`.

## Where things live

    config.js         timeouts, size limits, AI bot list: the settings you tweak
    checks/seo.js     one block per check (id, title, weight, run(ctx))
    checks/aeo.js     add a check by copying a block
    checks/geo.js
    checks/index.js   the three categories
    lib/context.js    downloads the page once, builds `ctx` for the checks
    lib/audit.js      runs every check, calculates scores
    lib/safety.js     blocks private/internal addresses (SSRF guard)
    public/           frontend (logo: public/img/logo.svg, brand color: --brand in css/styles.css)

## Blocked sites (Cloudflare etc.)

If the site refuses the request (403, timeout, connection failure) the page opens a
"paste your HTML" panel. Pasted HTML is audited directly. Checks that need the live server
(HTTPS, response time, robots.txt, sitemap, llms.txt) are marked "Skipped" and do not affect
the score, unless the visitor also types the page address, in which case robots.txt,
sitemap and llms.txt are still fetched.

## Scoring

Pass = 1, Warning = 0.5, Fail = 0, multiplied by each check's weight. Category score is
earned / possible. Overall is the average of the three categories.
