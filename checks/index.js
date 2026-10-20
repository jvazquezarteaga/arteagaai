// The three audit categories. To add a category, create a new file in this
// folder and add one entry here.

module.exports = [
  {
    id: 'seo',
    label: 'SEO',
    description: 'Search engine basics',
    checks: require('./seo'),
  },
  {
    id: 'aeo',
    label: 'AEO',
    description: 'Answer engine readiness',
    checks: require('./aeo'),
  },
  {
    id: 'geo',
    label: 'GEO',
    description: 'AI and generative engine visibility',
    checks: require('./geo'),
  },
];
