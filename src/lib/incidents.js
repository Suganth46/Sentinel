'use strict';
const { pool }  = require('../db/pool');
const { notify } = require('./notifiers');
const logger    = require('./logger');

/**
 * Apply the result of a single HTTP check to the monitor's state machine.
 * Runs inside a DB transaction with a row lock so concurrent workers can't
 * double-fire alerts or create duplicate incidents.
 *
 * @param {string} monitorId  UUID
 * @param {{ success: boolean, statusCode: number|null, latencyMs: number, error: string|null }} result
 */
async function applyResult(monitorId, result) {
  const client = await pool.connect();
  let alert = null;
  let monitorSnapshot = null;

  try {
    await client.query('BEGIN');

    // Lock the monitor row for this transaction
    const { rows } = await client.query(
      'SELECT * FROM monitors WHERE id = $1 FOR UPDATE',
      [monitorId],
    );
    const monitor = rows[0];
    if (!monitor) {
      await client.query('ROLLBACK');
      logger.warn({ monitorId }, 'applyResult: monitor not found');
      return;
    }
    monitorSnapshot = monitor;

    if (result.success) {
      if (monitor.status === 'down') {
        // Resolve open incident
        await client.query(
          `UPDATE incidents SET resolved_at = now()
           WHERE monitor_id = $1 AND resolved_at IS NULL`,
          [monitorId],
        );
        alert = 'recovered';
      }
      await client.query(
        `UPDATE monitors
         SET status = 'up', consecutive_failures = 0, last_checked_at = now()
         WHERE id = $1`,
        [monitorId],
      );
    } else {
      const failures = monitor.consecutive_failures + 1;
      const goDown   = failures >= monitor.failure_threshold && monitor.status !== 'down';

      if (goDown) {
        // Partial unique index prevents duplicate open incidents
        await client.query(
          `INSERT INTO incidents (monitor_id, cause) VALUES ($1, $2)
           ON CONFLICT DO NOTHING`,
          [monitorId, result.error ?? `status_${result.statusCode}`],
        );
        alert = 'down';
      }

      await client.query(
        `UPDATE monitors
         SET consecutive_failures = $2,
             status       = CASE WHEN $3 THEN 'down' ELSE status END,
             last_checked_at = now()
         WHERE id = $1`,
        [monitorId, failures, goDown],
      );
    }

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    logger.error({ err, monitorId }, 'applyResult transaction failed');
    throw err;
  } finally {
    client.release();
  }

  // Fire notifications AFTER commit so the DB state is consistent
  if (alert && monitorSnapshot) {
    try {
      await notify(monitorSnapshot, alert, result);
    } catch (err) {
      logger.error({ err, monitorId, alert }, 'Notification failed');
    }
  }
}

module.exports = { applyResult };
