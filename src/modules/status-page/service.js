'use strict';
const { query } = require('../../db/pool');

/**
 * Get public status page data for a user slug.
 * Only returns monitors where is_public = true.
 */
async function getStatusPage(slug) {
  // Get user by slug
  const { rows: userRows } = await query(
    'SELECT id, email, slug FROM users WHERE slug = $1',
    [slug],
  );
  if (!userRows.length) return null;
  const user = userRows[0];

  // Get public monitors
  const { rows: monitors } = await query(
    `SELECT id, name, url, status, last_checked_at, consecutive_failures, interval_seconds
     FROM monitors
     WHERE user_id = $1 AND is_public = true
     ORDER BY name`,
    [user.id],
  );

  // Get stats and recent incidents for each monitor
  const monitorData = await Promise.all(monitors.map(async (m) => {
    const { rows: statsRows } = await query(
      `SELECT
         round(100.0 * count(*) FILTER (WHERE success) / NULLIF(count(*), 0), 2) AS uptime_pct,
         round(avg(latency_ms) FILTER (WHERE success)) AS avg_latency_ms
       FROM checks
       WHERE monitor_id = $1 AND checked_at > now() - interval '30 days'`,
      [m.id],
    );

    // Last 90 daily uptime bars
    const { rows: dailyRows } = await query(
      `SELECT
         date_trunc('day', checked_at)::date AS day,
         round(100.0 * count(*) FILTER (WHERE success) / NULLIF(count(*), 0), 2) AS uptime_pct
       FROM checks
       WHERE monitor_id = $1 AND checked_at > now() - interval '90 days'
       GROUP BY 1 ORDER BY 1`,
      [m.id],
    );

    // Recent open incident
    const { rows: incidentRows } = await query(
      `SELECT started_at, cause FROM incidents
       WHERE monitor_id = $1 AND resolved_at IS NULL
       ORDER BY started_at DESC LIMIT 1`,
      [m.id],
    );

    return {
      ...m,
      stats:        statsRows[0] ?? { uptime_pct: null, avg_latency_ms: null },
      daily_uptime: dailyRows,
      open_incident: incidentRows[0] ?? null,
    };
  }));

  return { user, monitors: monitorData };
}

module.exports = { getStatusPage };
