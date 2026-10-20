// Every check returns one of these results.
//   pass    = all good
//   warn    = could be better
//   fail    = needs fixing
//   skipped = could not be checked (left out of the score)
// `fix` is the "how to fix it" tip shown to the user.

const pass = (message) => ({ status: 'pass', message, fix: '' });
const warn = (message, fix) => ({ status: 'warn', message, fix });
const fail = (message, fix) => ({ status: 'fail', message, fix });
const skip = (message) => ({ status: 'skipped', message, fix: '' });

module.exports = { pass, warn, fail, skip };
