// AEO checks (Answer Engine Optimization): does the page make it easy for
// search assistants and answer boxes to pull out a clear, direct answer?

const { pass, warn, fail } = require('../lib/result');
const config = require('../config');

// Words that usually start a question. English and Spanish.
// Add more here to support other languages.
const QUESTION_STARTS = [
  'what', 'why', 'how', 'when', 'where', 'who', 'which', 'can', 'does', 'do', 'is', 'are', 'should',
  'qué', 'que', 'por qué', 'cómo', 'como', 'cuándo', 'cuando', 'dónde', 'donde', 'cuál', 'quién', 'puede',
];

function looksLikeQuestion(text) {
  const lower = text.trim().toLowerCase();
  if (lower.endsWith('?') || lower.startsWith('¿')) return true;
  return QUESTION_STARTS.some((word) => lower.startsWith(word + ' '));
}

module.exports = [
  {
    id: 'structured-data',
    title: 'Structured data (JSON-LD) present',
    weight: 3,
    run(ctx) {
      const { nodes, errors } = ctx.jsonLd;
      if (nodes.length === 0) {
        return fail(
          'No JSON-LD structured data found.',
          'Add schema.org JSON-LD (Organization, Article, FAQPage...) so machines can read the page.'
        );
      }
      if (errors > 0) {
        return warn(
          `${nodes.length} structured data items found, but ${errors} block(s) contain invalid JSON.`,
          'Validate your JSON-LD with the Schema Markup Validator and fix the syntax errors.'
        );
      }
      return pass(`${nodes.length} structured data items found.`);
    },
  },
  {
    id: 'faq-schema',
    title: 'FAQ / How-to schema',
    weight: 2,
    run(ctx) {
      const found = config.faqSchemaTypes.filter((type) => ctx.jsonLd.types.has(type));
      if (found.length) return pass(`Found schema type: ${found.join(', ')}.`);
      return warn(
        'No FAQPage, HowTo or QAPage schema found.',
        'If the page answers common questions, mark them up with FAQPage schema.'
      );
    },
  },
  {
    id: 'organization-schema',
    title: 'Organization / business schema',
    weight: 2,
    run(ctx) {
      const found = config.organizationSchemaTypes.filter((type) => ctx.jsonLd.types.has(type));
      if (found.length) return pass(`Found schema type: ${found.join(', ')}.`);
      return warn(
        'No Organization or LocalBusiness schema found.',
        'Add Organization schema with name, logo, URL and contact details so AI knows who you are.'
      );
    },
  },
  {
    id: 'question-headings',
    title: 'Headings written as questions',
    weight: 2,
    run(ctx) {
      const questions = ctx.$('h2, h3, h4')
        .map((_, el) => ctx.$(el).text())
        .get()
        .filter(looksLikeQuestion);

      if (questions.length >= 2) return pass(`${questions.length} question-style headings found.`);
      const fix = 'Phrase some headings the way people ask, e.g. "How much does a website cost?", and answer right below.';
      if (questions.length === 1) return warn('Only 1 question-style heading found.', fix);
      return fail('No question-style headings found.', fix);
    },
  },
  {
    id: 'concise-answers',
    title: 'Short, direct answer paragraphs',
    weight: 2,
    run(ctx) {
      // Paragraphs of 20 to 60 words are the right size to be quoted as an answer.
      const answers = ctx.$('p')
        .map((_, el) => ctx.$(el).text().trim().split(/\s+/).length)
        .get()
        .filter((words) => words >= 20 && words <= 60);

      if (answers.length >= 3) return pass(`${answers.length} concise paragraphs (20 to 60 words) found.`);
      const fix = 'Open each section with a 2 to 3 sentence answer, then add the details below it.';
      if (answers.length >= 1) return warn(`Only ${answers.length} concise paragraph(s) found.`, fix);
      return fail('No concise answer-style paragraphs found.', fix);
    },
  },
  {
    id: 'lists-tables',
    title: 'Lists or tables in the content',
    weight: 1,
    run(ctx) {
      // Ignore menus: only count lists and tables outside nav, header and footer.
      const count = ctx.$('ul, ol, table').not('nav *, header *, footer *').length;
      if (count > 0) return pass(`${count} list(s) or table(s) found in the content.`);
      return warn(
        'No lists or tables in the main content.',
        'Use bullet lists, steps and tables. They are easy for AI to quote.'
      );
    },
  },
  {
    id: 'content-depth',
    title: 'Enough content on the page',
    weight: 2,
    run(ctx) {
      const words = ctx.wordCount;
      if (words >= 300) return pass(`About ${words} words of text.`);
      const fix = 'Expand the page with useful detail. Aim for at least 300 words.';
      if (words >= 150) return warn(`Only about ${words} words of text.`, fix);
      return fail(`Very little text: about ${words} words.`, fix);
    },
  },
];
