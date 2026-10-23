'use strict';
require('../config/env');   // validate env first
const { pool }      = require('../db/pool');
const { checkQueue } = require('../lib/queue');
const logger        = require('../lib/logger');
const env           = require('../config/env');

const TICK_MS  = env.SCHEDULER_TICK_MS;
const BATCH    = 200;

/**
 * One scheduler tick:
 *  1. Claim all due monitors atomically with FOR UPDATE SKIP LOCKED
 *  2. Advance their next_check_at
 *  3. Enqueue one BullMQ job per monitor
 */
async function tick() {
  const client = await pool.connect();
  try {
    const { rows } = await client.query(`
      WITH due AS (
        SELECT id FROM monitors
        WHERE is_active AND next_check_at <= now()
        ORDER BY next_check_at
        LIMIT ${BATCH}
        FOR UPDATE SKIP LOCKED
      )
      UPDATE monitors m
      SET next_check_at = now() + make_interval(secs => m.interval_seconds)
      FROM due
      WHERE m.id = due.id
      RETURNING m.id
    `);

    if (rows.length === 0) return;

    logger.debug({ count: rows.length }, 'Scheduler tick: enqueuing jobs');

    const jobs = rows.map(({ id }) => ({
      name: 'check',
      data: { monitorId: id },
      opts: { removeOnComplete: 100, removeOnFail: 500, attempts: 1 },
    }));

    await checkQueue.addBulk(jobs);
    logger.info({ count: rows.length }, 'Enqueued check jobs');
  } catch (err) {
    logger.error({ err }, 'Scheduler tick failed');
  } finally {
    client.release();
  }
}

async function main() {
  logger.info({ tickMs: TICK_MS }, 'Scheduler starting');

  // Run immediately on start
  await tick();

  setInterval(tick, TICK_MS);
}

main().catch((err) => {
  logger.error({ err }, 'Scheduler fatal error');
  process.exit(1);
});
