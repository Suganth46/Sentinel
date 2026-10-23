'use strict';
const { query } = require('../../db/pool');
const { resolveSafe } = require('../../lib/ssrfGuard');
const env = require('../../config/env');

/**
 * Validate that a URL is safe (no SSRF) and doesn't use disallowed protocols.
 * Throws with status 400 if blocked.
 */
async function validateUrl(url) {
  try {
    await resolveSafe(url);
  } catch (err) {
    const code = err.code === 'ssrf_blocked' ? 'SSRF_BLOCKED'
               : err.code === 'bad_protocol' ? 'INVALID_URL'
               : err.code === 'dns_failure'  ? 'DNS_FAILURE'
               : 'INVALID_URL';
    const e = new Error(err.message);
    e.status = 400;
    e.code   = code;
    throw e;
  }
}

/**
 * List all monitors for a user.
 */
async function listMonitors(userId) {
  const { rows } = await query(
    `SELECT * FROM monitors WHERE user_id = $1 ORDER BY created_at DESC`,
    [userId],
  );
  return rows;
}

/**
 * Get a single monitor, ensuring it belongs to userId (returns null if not found).
 */
async function getMonitor(id, userId) {
  const { rows } = await query(
    'SELECT * FROM monitors WHERE id = $1 AND user_id = $2',
    [id, userId],
  );
  return rows[0] ?? null;
}

/**
 * Create a new monitor. Enforces per-user cap.
 */
async function createMonitor(userId, data) {
  // Per-user monitor cap
  const { rows: countRows } = await query(
    'SELECT count(*) AS cnt FROM monitors WHERE user_id = $1',
    [userId],
  );
  if (parseInt(countRows[0].cnt, 10) >= env.MAX_MONITORS_PER_USER) {
    const err = new Error(`Monitor limit of ${env.MAX_MONITORS_PER_USER} reached`);
    err.status = 422;
    err.code   = 'MONITOR_LIMIT_REACHED';
    throw err;
  }

  await validateUrl(data.url);

  const { rows } = await query(
    `INSERT INTO monitors
       (user_id, name, url, method, interval_seconds, timeout_ms, expected_status,
        failure_threshold, is_active, is_public)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
     RETURNING *`,
    [
      userId,
      data.name,
      data.url,
      data.method        ?? 'GET',
      data.interval_seconds  ?? 300,
      data.timeout_ms    ?? 10000,
      data.expected_status ?? 200,
      data.failure_threshold ?? 3,
      data.is_active     ?? true,
      data.is_public     ?? false,
    ],
  );
  return rows[0];
}

/**
 * Update a monitor. Only touches fields provided.
 */
async function updateMonitor(id, userId, data) {
  const monitor = await getMonitor(id, userId);
  if (!monitor) return null;

  if (data.url && data.url !== monitor.url) {
    await validateUrl(data.url);
  }

  const { rows } = await query(
    `UPDATE monitors SET
       name              = COALESCE($3, name),
       url               = COALESCE($4, url),
       method            = COALESCE($5, method),
       interval_seconds  = COALESCE($6, interval_seconds),
       timeout_ms        = COALESCE($7, timeout_ms),
       expected_status   = COALESCE($8, expected_status),
       failure_threshold = COALESCE($9, failure_threshold),
       is_active         = COALESCE($10, is_active),
       is_public         = COALESCE($11, is_public)
     WHERE id = $1 AND user_id = $2
     RETURNING *`,
    [
      id, userId,
      data.name               ?? null,
      data.url                ?? null,
      data.method             ?? null,
      data.interval_seconds   ?? null,
      data.timeout_ms         ?? null,
      data.expected_status    ?? null,
      data.failure_threshold  ?? null,
      data.is_active          ?? null,
      data.is_public          ?? null,
    ],
  );
  return rows[0] ?? null;
}

/**
 * Delete a monitor.
 */
async function deleteMonitor(id, userId) {
  const { rowCount } = await query(
    'DELETE FROM monitors WHERE id = $1 AND user_id = $2',
    [id, userId],
  );
  return rowCount > 0;
}

/**
 * Get recent checks for a monitor.
 */
async function getChecks(monitorId, userId, limit = 100) {
  // Verify ownership
  const monitor = await getMonitor(monitorId, userId);
  if (!monitor) return null;

  const { rows } = await query(
    `SELECT id, success, status_code, latency_ms, error, checked_at
     FROM checks WHERE monitor_id = $1
     ORDER BY checked_at DESC LIMIT $2`,
    [monitorId, Math.min(limit, 500)],
  );
  return rows;
}

/**
 * Get incidents for a monitor.
 */
async function getIncidents(monitorId, userId) {
  const monitor = await getMonitor(monitorId, userId);
  if (!monitor) return null;

  const { rows } = await query(
    `SELECT * FROM incidents WHERE monitor_id = $1 ORDER BY started_at DESC LIMIT 100`,
    [monitorId],
  );
  return rows;
}

module.exports = {
  listMonitors, getMonitor, createMonitor, updateMonitor, deleteMonitor,
  getChecks, getIncidents,
};
