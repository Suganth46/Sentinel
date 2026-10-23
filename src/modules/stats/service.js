'use strict';
const { query } = require('../../db/pool');

const WINDOWS = { '24h': '24 hours', '7d': '7 days', '30d': '30 days' };

/**
 * Get uptime %, avg and p95 latency for a monitor over a time window.
 * @param {string} monitorId
 * @param {string} userId    For ownership scoping
 * @param {'24h'|'7d'|'30d'} window
 */
async function getStats(monitorId, userId, window = '24h') {
  // Ownership check
  const { rows: mRows } = await query(
    'SELECT id FROM monitors WHERE id = $1 AND user_id = $2',
    [monitorId, userId],
  );
  if (!mRows.length) return null;

  const interval = WINDOWS[window] ?? WINDOWS['24h'];

  const { rows } = await query(
    `SELECT
       count(*)                                                               AS total_checks,
       count(*) FILTER (WHERE success)                                       AS successful_checks,
       round(
         100.0 * count(*) FILTER (WHERE success) / NULLIF(count(*), 0), 2
       )                                                                      AS uptime_pct,
       round(avg(latency_ms) FILTER (WHERE success))                          AS avg_latency_ms,
       percentile_cont(0.95) WITHIN GROUP (ORDER BY latency_ms)
         FILTER (WHERE success)                                               AS p95_latency_ms
     FROM checks
     WHERE monitor_id = $1 AND checked_at > now() - $2::interval`,
    [monitorId, interval],
  );

  return rows[0];
}

/**
 * Get daily uptime percentages for the last N days (for the "green bars" strip).
 * @param {string} monitorId
 * @param {number} [days=90]
 */
async function getDailyUptime(monitorId, days = 90) {
  const { rows } = await query(
    `SELECT
       date_trunc('day', checked_at)::date AS day,
       round(
         100.0 * count(*) FILTER (WHERE success) / NULLIF(count(*), 0), 2
       )                                   AS uptime_pct,
       count(*)                            AS total_checks
     FROM checks
     WHERE monitor_id = $1 AND checked_at > now() - make_interval(days => $2)
     GROUP BY 1
     ORDER BY 1 DESC`,
    [monitorId, days],
  );
  return rows;
}

module.exports = { getStats, getDailyUptime };
