// SEO checks: the classic basics that help search engines understand the page.
//
// HOW TO ADD A CHECK: copy one block below, change id / title / weight and the
// code inside run(). `weight` = how much it matters to the score (1 to 3).
// run(ctx) must return pass(...), warn(...) or fail(...). See lib/context.js
// for everything available on ctx.

const { pass, warn, fail, skip } = require('../lib/result');

module.exports = [
  {
    id: 'https',
    title: 'Page is served over HTTPS',
    weight: 2,
    run(ctx) {
      if (!ctx.urlKnown) return skip('No page address was provided, so HTTPS could not be checked.');
      if (ctx.finalUrl.startsWith('https://')) return pass('The page is served over HTTPS.');
      return fail(
        'The page is served over plain HTTP.',
        'Install an SSL certificate and redirect all HTTP traffic to HTTPS.'
      );
    },
  },
  {
    id: 'title',
    title: 'Page title (30 to 60 characters)',
    weight: 3,
    run(ctx) {
      const title = ctx.$('head title').first().text().trim();
      if (!title) {
        return fail('The page has no <title> tag.', 'Add a unique, descriptive <title> to the <head>.');
      }
      if (title.length < 30 || title.length > 60) {
        return warn(
          `The title is ${title.length} characters: "${title}".`,
          'Aim for 30 to 60 characters so it is not cut off in search results.'
        );
      }
      return pass(`The title is ${title.length} characters: "${title}".`);
    },
  },
  {
    id: 'meta-description',
    title: 'Meta description (70 to 160 characters)',
    weight: 3,
    run(ctx) {
      const description = (ctx.$('meta[name="description"]').attr('content') || '').trim();
      if (!description) {
        return fail(
          'The page has no meta description.',
          'Add <meta name="description" content="..."> summarizing the page in one or two sentences.'
        );
      }
      if (description.length < 70 || description.length > 160) {
        return warn(
          `The description is ${description.length} characters.`,
          'Aim for 70 to 160 characters so it displays fully in search results.'
        );
      }
      return pass(`The description is ${description.length} characters.`);
    },
  },
  {
    id: 'h1',
    title: 'Exactly one H1 heading',
    weight: 3,
    run(ctx) {
      const count = ctx.$('h1').length;
      if (count === 1) return pass(`One H1 found: "${ctx.$('h1').first().text().trim()}".`);
      if (count === 0) {
        return fail('The page has no H1 heading.', 'Add one H1 that describes the main topic of the page.');
      }
      return warn(`The page has ${count} H1 headings.`, 'Keep a single H1 and use H2 to H6 for sections.');
    },
  },
  {
    id: 'heading-order',
    title: 'Headings follow a logical order',
    weight: 1,
    run(ctx) {
      const levels = ctx.$('h1, h2, h3, h4, h5, h6')
        .map((_, el) => Number(el.tagName.slice(1)))
        .get();

      // A "skip" is going down more than one level, e.g. H2 straight to H4.
      const skips = levels.filter((level, i) => i > 0 && level - levels[i - 1] > 1).length;

      if (levels.length === 0) return warn('No headings found.', 'Structure the page with headings.');
      if (skips > 0) {
        return warn(
          `Heading levels are skipped ${skips} time(s), for example H2 followed by H4.`,
          'Do not skip levels: an H2 should be followed by an H3, not an H4.'
        );
      }
      return pass('Heading levels are in a logical order.');
    },
  },
  {
    id: 'canonical',
    title: 'Canonical URL is set',
    weight: 2,
    run(ctx) {
      const canonical = ctx.$('link[rel="canonical"]').attr('href');
      if (canonical) return pass(`Canonical URL: ${canonical}`);
      return warn(
        'No canonical link found.',
        'Add <link rel="canonical" href="..."> to avoid duplicate-content issues.'
      );
    },
  },
  {
    id: 'indexable',
    title: 'Page can be indexed',
    weight: 3,
    run(ctx) {
      const metaRobots = (ctx.$('meta[name="robots"]').attr('content') || '').toLowerCase();
      const headerRobots = (ctx.headers['x-robots-tag'] || '').toLowerCase();
      if (metaRobots.includes('noindex') || headerRobots.includes('noindex')) {
        return fail(
          'The page tells search engines not to index it (noindex).',
          'Remove the noindex directive if this page should appear in search results.'
        );
      }
      return pass('No noindex directive found.');
    },
  },
  {
    id: 'viewport',
    title: 'Mobile viewport tag',
    weight: 2,
    run(ctx) {
      if (ctx.$('meta[name="viewport"]').length) return pass('The viewport meta tag is present.');
      return fail(
        'No viewport meta tag.',
        'Add <meta name="viewport" content="width=device-width, initial-scale=1">.'
      );
    },
  },
  {
    id: 'lang',
    title: 'Language is declared',
    weight: 1,
    run(ctx) {
      const lang = ctx.$('html').attr('lang');
      if (lang) return pass(`The page language is "${lang}".`);
      return warn('The <html> tag has no lang attribute.', 'Add lang="en" (or "es") to the <html> tag.');
    },
  },
  {
    id: 'image-alt',
    title: 'Images have alt text',
    weight: 2,
    run(ctx) {
      const images = ctx.$('img');
      // alt="" is allowed (decorative image). A missing alt attribute is not.
      const missing = images.filter((_, el) => el.attribs.alt === undefined).length;

      if (images.length === 0) return pass('The page has no images.');
      if (missing === 0) return pass(`All ${images.length} images have an alt attribute.`);

      const message = `${missing} of ${images.length} images have no alt attribute.`;
      const fix = 'Describe each meaningful image in its alt attribute. Use alt="" for decorative ones.';
      return missing / images.length > 0.2 ? fail(message, fix) : warn(message, fix);
    },
  },
  {
    id: 'open-graph',
    title: 'Open Graph tags for sharing',
    weight: 1,
    run(ctx) {
      const wanted = ['og:title', 'og:description', 'og:image'];
      const missing = wanted.filter((name) => !ctx.$(`meta[property="${name}"]`).length);
      if (missing.length === 0) return pass('og:title, og:description and og:image are all set.');
      return warn(
        `Missing: ${missing.join(', ')}.`,
        'Add Open Graph tags so links look good when shared on social media and in chat apps.'
      );
    },
  },
  {
    id: 'internal-links',
    title: 'Internal links',
    weight: 1,
    run(ctx) {
      const count = ctx.links.internal.length;
      if (count >= 3) return pass(`${count} internal links found.`);
      return warn(
        `Only ${count} internal link(s) found.`,
        'Link to related pages on your own site to help visitors and crawlers navigate.'
      );
    },
  },
  {
    id: 'response-time',
    title: 'Server response time',
    weight: 2,
    run(ctx) {
      if (ctx.responseMs === null) return skip('Not measured when HTML is pasted.');
      const seconds = (ctx.responseMs / 1000).toFixed(2);
      if (ctx.responseMs < 800) return pass(`The page responded in ${seconds}s.`);
      const fix = 'Use caching, a CDN and image optimization to speed up the server response.';
      if (ctx.responseMs < 2000) return warn(`The page responded in ${seconds}s.`, fix);
      return fail(`The page responded in ${seconds}s.`, fix);
    },
  },
  {
    id: 'robots-txt',
    title: 'robots.txt file exists',
    weight: 1,
    run(ctx) {
      if (!ctx.robots.checked) return skip('robots.txt could not be retrieved, so it was not checked.');
      if (ctx.robots.found) return pass('robots.txt was found.');
      return warn('No robots.txt found.', 'Add a robots.txt at the root of the site, listing your sitemap.');
    },
  },
  {
    id: 'sitemap',
    title: 'XML sitemap exists',
    weight: 2,
    run(ctx) {
      if (!ctx.sitemap.checked) return skip('The sitemap could not be retrieved, so it was not checked.');
      if (ctx.sitemap.found) return pass(`Sitemap found at ${ctx.sitemap.url}`);
      return warn(
        'No XML sitemap found.',
        'Publish a sitemap.xml and reference it in robots.txt so crawlers find every page.'
      );
    },
  },
];
