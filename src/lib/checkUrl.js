'use strict';
const { fetch, Agent } = require('undici');
const { resolveSafe }  = require('./ssrfGuard');

/**
 * Map undici / Node.js error codes to readable classifier strings.
 */
function classifyError(err) {
  const msg  = err.message ?? '';
  const code = err.code    ?? '';

  if (code === 'UND_ERR_CONNECT_TIMEOUT' || code === 'UND_ERR_HEADERS_TIMEOUT'
      || code === 'UND_ERR_BODY_TIMEOUT'  || err.name === 'AbortError') {
    return 'timeout';
  }
  if (code === 'ENOTFOUND' || code === 'EAI_AGAIN') return 'dns_failure';
  if (code === 'ECONNREFUSED')                        return 'connection_refused';
  if (msg.includes('CERT') || msg.includes('SSL') || code === 'UNABLE_TO_VERIFY_LEAF_SIGNATURE') {
    return 'tls_error';
  }
  if (code === 'ssrf_blocked' || code === 'bad_protocol' || code === 'bad_url') return code;
  return 'unknown_error';
}

/**
 * Perform a single HTTP check against a monitor.
 *
 * @param {{ url: string, method: string, timeout_ms: number, expected_status: number }} monitor
 * @returns {Promise<{ success: boolean, statusCode: number|null, latencyMs: number, error: string|null }>}
 */
async function checkUrl(monitor) {
  const { url, method, timeout_ms, expected_status } = monitor;
  const start = process.hrtime.bigint();

  try {
    // SSRF guard: resolve and pin the IP
    const pinnedIp = await resolveSafe(url);
    const urlObj   = new URL(url);

    // Create an agent that connects to the pinned IP (prevents DNS rebinding)
    const agent = new Agent({
      connect: {
        lookup: (_hostname, _opts, cb) => cb(null, pinnedIp, urlObj.hostname),
      },
    });

    const controller = new AbortController();
    const timeoutId  = setTimeout(() => controller.abort(), timeout_ms);

    let response;
    try {
      response = await fetch(url, {
        method,
        signal:     controller.signal,
        dispatcher: agent,
        headers:    { 'User-Agent': 'Sentinel-Monitor/1.0' },
        redirect:   'follow',
        maxRedirections: 3,
      });
    } finally {
      clearTimeout(timeoutId);
    }

    const latencyMs  = Number(process.hrtime.bigint() - start) / 1e6;
    const statusCode = response.status;
    const success    = statusCode === expected_status;

    return { success, statusCode, latencyMs: Math.round(latencyMs), error: null };

  } catch (err) {
    const latencyMs = Number(process.hrtime.bigint() - start) / 1e6;
    const errorCode = classifyError(err);
    return { success: false, statusCode: null, latencyMs: Math.round(latencyMs), error: errorCode };
  }
}

module.exports = { checkUrl, classifyError };
