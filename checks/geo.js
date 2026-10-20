// GEO checks (Generative Engine Optimization): can AI tools such as ChatGPT,
// Claude, Perplexity and Gemini reach, trust and cite this site?

const { pass, warn, fail, skip } = require('../lib/result');
const { parseRobots, isFullyBlocked } = require('../lib/robots');
const config = require('../config');

module.exports = [
  {
    id: 'ai-crawlers',
    title: 'AI crawlers are allowed',
    weight: 3,
    run(ctx) {
      if (!ctx.robots.checked) return skip('robots.txt could not be retrieved, so AI crawlers were not checked.');
      if (!ctx.robots.found) {
        return pass('No robots.txt, so AI crawlers are not blocked.');
      }

      const groups = parseRobots(ctx.robots.body);
      const blocked = config.aiCrawlers.filter((bot) => isFullyBlocked(groups, bot.name));
      const names = blocked.map((bot) => bot.name).join(', ');

      if (blocked.length === 0) return pass('robots.txt does not block any known AI crawler.');

      const fix =
        'Blocking is fine if intentional (for example training bots), but AI search bots like ' +
        'OAI-SearchBot and PerplexityBot must be allowed if you want to be cited in answers.';
      if (blocked.length === config.aiCrawlers.length) {
        return fail('robots.txt blocks every AI crawler we check.', fix);
      }
      return warn(`robots.txt blocks: ${names}.`, fix);
    },
  },
  {
    id: 'llms-txt',
    title: 'llms.txt file',
    weight: 1,
    run(ctx) {
      if (!ctx.llms.checked) return skip('llms.txt could not be retrieved, so it was not checked.');
      if (ctx.llms.found) return pass('llms.txt was found.');
      return warn(
        'No llms.txt found.',
        'llms.txt is an emerging convention: a short Markdown file that summarizes your site for AI. ' +
          'Not every AI tool uses it yet, so treat it as a low-effort bonus.'
      );
    },
  },
  {
    id: 'author-signals',
    title: 'Author or publisher is identified',
    weight: 2,
    run(ctx) {
      const hasMetaAuthor = ctx.$('meta[name="author"]').length > 0;
      const hasRelAuthor = ctx.$('[rel="author"]').length > 0;
      const hasSchemaAuthor = ctx.jsonLd.nodes.some((n) => n.author || n.publisher);
      const hasOrganization = config.organizationSchemaTypes.some((t) => ctx.jsonLd.types.has(t));

      if (hasMetaAuthor || hasRelAuthor || hasSchemaAuthor || hasOrganization) {
        return pass('The page identifies who is behind the content.');
      }
      return warn(
        'No author or publisher information found.',
        'Add an author or publisher (meta tag or schema) so AI models can attribute and trust the content.'
      );
    },
  },
  {
    id: 'freshness',
    title: 'Publish or update date',
    weight: 2,
    run(ctx) {
      const hasSchemaDate = ctx.jsonLd.nodes.some((n) => n.datePublished || n.dateModified);
      const hasMetaDate = ctx.$(
        'meta[property="article:published_time"], meta[property="article:modified_time"]'
      ).length > 0;
      const hasTimeTag = ctx.$('time[datetime]').length > 0;

      if (hasSchemaDate || hasMetaDate || hasTimeTag) return pass('A publish or update date was found.');
      return warn(
        'No publish or update date found.',
        'Show dates on the page and in schema (datePublished, dateModified). AI tools prefer fresh sources.'
      );
    },
  },
  {
    id: 'outbound-citations',
    title: 'Cites external sources',
    weight: 1,
    run(ctx) {
      const count = ctx.links.externalDomains.size;
      if (count >= 2) return pass(`Links out to ${count} other websites.`);
      return warn(
        `Links out to only ${count} other website(s).`,
        'Reference trustworthy sources (studies, official sites). It makes content more credible.'
      );
    },
  },
  {
    id: 'same-as',
    title: 'Brand profiles linked (sameAs)',
    weight: 2,
    run(ctx) {
      // "sameAs" lists your official profiles (LinkedIn, Facebook...), which
      // helps AI recognize your brand as a single entity.
      const profiles = ctx.jsonLd.nodes.flatMap((n) => [].concat(n.sameAs || []));
      if (profiles.length >= 2) return pass(`${profiles.length} sameAs profile links found in schema.`);
      return warn(
        'Fewer than 2 sameAs profile links found in schema.',
        'Add sameAs to your Organization schema, pointing to your official social and directory profiles.'
      );
    },
  },
  {
    id: 'no-js-content',
    title: 'Content visible without JavaScript',
    weight: 3,
    run(ctx) {
      // Most AI crawlers read the raw HTML and do not run JavaScript.
      if (ctx.wordCount >= 100) return pass('The text is present in the HTML, so crawlers can read it.');
      if (ctx.scriptCount > 3) {
        return fail(
          'Almost no text in the HTML, but many scripts. The content may be built by JavaScript.',
          'Use server-side rendering or static generation so AI crawlers can read the content.'
        );
      }
      return warn(
        'Very little text in the HTML.',
        'Check that the important content is in the HTML itself and not loaded later by JavaScript.'
      );
    },
  },
];
