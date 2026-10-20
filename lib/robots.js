// A small robots.txt reader. We only need one answer:
// "is this bot told to stay out of the whole site?"

// Turns robots.txt text into groups like:
//   [{ agents: ['gptbot'], rules: [{ type: 'disallow', path: '/' }] }, ...]
function parseRobots(text) {
  const groups = [];
  let current = null;
  let lastLineWasAgent = false;

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.split('#')[0].trim(); // drop comments
    const colon = line.indexOf(':');
    if (colon === -1) continue;

    const field = line.slice(0, colon).trim().toLowerCase();
    const value = line.slice(colon + 1).trim();

    if (field === 'user-agent') {
      // Several User-agent lines in a row share the same rules.
      if (!current || !lastLineWasAgent) {
        current = { agents: [], rules: [] };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
      lastLineWasAgent = true;
    } else {
      if ((field === 'disallow' || field === 'allow') && current) {
        current.rules.push({ type: field, path: value });
      }
      lastLineWasAgent = false;
    }
  }
  return groups;
}

// A bot uses its own group if there is one, otherwise the "*" group.
function isFullyBlocked(groups, botName) {
  const bot = botName.toLowerCase();
  const group =
    groups.find((g) => g.agents.includes(bot)) || groups.find((g) => g.agents.includes('*'));
  if (!group) return false;

  const blocksEverything = group.rules.some((r) => r.type === 'disallow' && r.path === '/');
  const allowsEverything = group.rules.some((r) => r.type === 'allow' && r.path === '/');
  return blocksEverything && !allowsEverything;
}

module.exports = { parseRobots, isFullyBlocked };
