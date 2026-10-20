// Safety guard: stops the tool from being used to reach private/internal
// addresses (this is called an SSRF attack). Every URL we fetch goes through
// assertPublicUrl() first.

const dns = require('node:dns').promises;
const net = require('node:net');
const config = require('../config');

// Address ranges that must never be reachable from the public tool.
const blocked = new net.BlockList();
[
  ['0.0.0.0', 8], // "this network"
  ['10.0.0.0', 8], // private
  ['100.64.0.0', 10], // carrier-grade NAT
  ['127.0.0.0', 8], // localhost
  ['169.254.0.0', 16], // link-local (cloud metadata lives here)
  ['172.16.0.0', 12], // private
  ['192.168.0.0', 16], // private
  ['224.0.0.0', 4], // multicast
  ['240.0.0.0', 4], // reserved
].forEach(([ip, bits]) => blocked.addSubnet(ip, bits, 'ipv4'));
blocked.addAddress('::1', 'ipv6'); // localhost
blocked.addAddress('::', 'ipv6');
blocked.addSubnet('fc00::', 7, 'ipv6'); // private
blocked.addSubnet('fe80::', 10, 'ipv6'); // link-local

function isBlockedAddress(address) {
  // "::ffff:127.0.0.1" is an IPv4 address written in IPv6 form. Unwrap it.
  const mapped = address.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i);
  if (mapped) address = mapped[1];

  const family = net.isIPv6(address) ? 'ipv6' : 'ipv4';
  return blocked.check(address, family);
}

// Throws an Error with a friendly message if the URL is not safe to fetch.
// Returns the parsed URL object when it is fine.
async function assertPublicUrl(urlString) {
  let url;
  try {
    url = new URL(urlString);
  } catch {
    throw new Error('That does not look like a valid URL.');
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('Only http and https URLs can be audited.');
  }
  if (url.username || url.password) {
    throw new Error('URLs with a username or password are not allowed.');
  }

  if (config.allowPrivateHosts) return url; // local development only

  const host = url.hostname.replace(/^\[|\]$/g, ''); // strip [] around IPv6
  if (host === 'localhost' || host.endsWith('.local')) {
    throw new Error('Private or local addresses cannot be audited.');
  }

  // Look up every IP the hostname points to and make sure none is private.
  const addresses = net.isIP(host)
    ? [host]
    : (await dns.lookup(host, { all: true }).catch(() => {
        throw new Error('We could not find that website. Check the address and try again.');
      })).map((entry) => entry.address);

  if (addresses.some(isBlockedAddress)) {
    throw new Error('Private or local addresses cannot be audited.');
  }
  return url;
}

module.exports = { assertPublicUrl };
