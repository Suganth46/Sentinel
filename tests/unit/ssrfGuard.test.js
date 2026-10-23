'use strict';
/**
 * Unit tests for the SSRF guard.
 * These tests mock dns.lookup so they don't make real network calls.
 */
const dns    = require('node:dns/promises');
const { resolveSafe } = require('../../src/lib/ssrfGuard');

jest.mock('node:dns/promises');

describe('ssrfGuard.resolveSafe', () => {
  afterEach(() => jest.resetAllMocks());

  test('resolves a valid public IP', async () => {
    dns.lookup.mockResolvedValue([{ address: '93.184.216.34', family: 4 }]);
    const ip = await resolveSafe('https://example.com');
    expect(ip).toBe('93.184.216.34');
  });

  test('blocks loopback 127.0.0.1', async () => {
    dns.lookup.mockResolvedValue([{ address: '127.0.0.1', family: 4 }]);
    await expect(resolveSafe('http://localhost')).rejects.toMatchObject({ code: 'ssrf_blocked' });
  });

  test('blocks localhost by name', async () => {
    dns.lookup.mockResolvedValue([{ address: '127.0.0.1', family: 4 }]);
    await expect(resolveSafe('http://localhost:5432')).rejects.toMatchObject({ code: 'ssrf_blocked' });
  });

  test('blocks private range 10.0.0.5', async () => {
    dns.lookup.mockResolvedValue([{ address: '10.0.0.5', family: 4 }]);
    await expect(resolveSafe('http://internal.company.local')).rejects.toMatchObject({ code: 'ssrf_blocked' });
  });

  test('blocks link-local 169.254.169.254 (cloud metadata)', async () => {
    dns.lookup.mockResolvedValue([{ address: '169.254.169.254', family: 4 }]);
    await expect(resolveSafe('http://169.254.169.254/latest/meta-data/')).rejects.toMatchObject({ code: 'ssrf_blocked' });
  });

  test('blocks IPv6 loopback ::1', async () => {
    dns.lookup.mockResolvedValue([{ address: '::1', family: 6 }]);
    await expect(resolveSafe('http://[::1]')).rejects.toMatchObject({ code: 'ssrf_blocked' });
  });

  test('blocks non-http protocols', async () => {
    await expect(resolveSafe('ftp://example.com')).rejects.toMatchObject({ code: 'bad_protocol' });
  });

  test('blocks URLs with embedded credentials', async () => {
    dns.lookup.mockResolvedValue([{ address: '93.184.216.34', family: 4 }]);
    await expect(resolveSafe('https://user:pass@example.com')).rejects.toMatchObject({ code: 'ssrf_blocked' });
  });

  test('blocks unique-local fc00::/7 IPv6', async () => {
    dns.lookup.mockResolvedValue([{ address: 'fc00::1', family: 6 }]);
    await expect(resolveSafe('http://internal.v6')).rejects.toMatchObject({ code: 'ssrf_blocked' });
  });

  test('throws dns_failure when lookup fails', async () => {
    dns.lookup.mockRejectedValue(Object.assign(new Error('getaddrinfo ENOTFOUND'), { code: 'ENOTFOUND' }));
    await expect(resolveSafe('http://nonexistent.invalid')).rejects.toMatchObject({ code: 'dns_failure' });
  });
});
