'use strict';
const dns    = require('node:dns/promises');
const ipaddr = require('ipaddr.js');

const BLOCKED_RANGES = [
  'private', 'loopback', 'linkLocal', 'uniqueLocal',
  'unspecified', 'reserved', 'carrierGradeNat', 'multicast', 'broadcast',
];

/**
 * Resolve the hostname in `urlString` and verify no returned IP falls in a
 * private/reserved range.  Returns the first safe IP address so callers can
 * pin their connection to it (preventing DNS rebinding attacks).
 *
 * @param {string} urlString  A full URL, e.g. "https://example.com/health"
 * @returns {Promise<string>} The first resolved, safe IP address
 * @throws {Error} with message 'bad_protocol' | 'ssrf_blocked' | 'dns_failure'
 */
async function resolveSafe(urlString) {
  let url;
  try {
    url = new URL(urlString);
  } catch {
    throw Object.assign(new Error('Invalid URL'), { code: 'bad_url' });
  }

  if (!['http:', 'https:'].includes(url.protocol)) {
    throw Object.assign(new Error('Only http and https are allowed'), { code: 'bad_protocol' });
  }

  // Block embedded credentials
  if (url.username || url.password) {
    throw Object.assign(new Error('URLs with credentials are not allowed'), { code: 'ssrf_blocked' });
  }

  let addrs;
  try {
    addrs = await dns.lookup(url.hostname, { all: true });
  } catch (err) {
    throw Object.assign(
      new Error(`DNS resolution failed for ${url.hostname}: ${err.message}`),
      { code: 'dns_failure' },
    );
  }

  if (!addrs || addrs.length === 0) {
    throw Object.assign(new Error(`No addresses returned for ${url.hostname}`), { code: 'dns_failure' });
  }

  for (const { address } of addrs) {
    let parsed;
    try {
      parsed = ipaddr.parse(address);
    } catch {
      throw Object.assign(new Error(`Cannot parse IP: ${address}`), { code: 'ssrf_blocked' });
    }

    const range = parsed.range();
    if (BLOCKED_RANGES.includes(range)) {
      throw Object.assign(
        new Error(`IP ${address} (${range}) is not allowed`),
        { code: 'ssrf_blocked' },
      );
    }
  }

  return addrs[0].address;
}

module.exports = { resolveSafe };
