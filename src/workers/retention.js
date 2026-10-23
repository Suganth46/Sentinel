'use strict';
require('../config/env');
const { query }  = require('../db/pool');
const logger     = require('../lib/logger');
const env        = require('../config/env');

const RETENTION_DAYS = env.RETENTION_DAYS;
const BATCH_SIZE     = 10000;

/**
 * Delete old checks in batches to avoid locking the table.
 */
async function runRetention() {
  logger.info({ retentionDays: RETENTION_DAYS }, 'Retention job starting');

  let totalDeleted = 0;
  let deleted;

  do {
    const { rowCount } = await query(
      `WITH to_delete AS (
         SELECT id FROM checks
         WHERE checked_at < now() - make_interval(days => $1)
         LIMIT $2
       )
       DELETE FROM checks WHERE id IN (SELECT id FROM to_delete)`,
      [RETENTION_DAYS, BATCH_SIZE],
    );
    deleted = rowCount ?? 0;
    totalDeleted += deleted;

    if (deleted > 0) {
      logger.debug({ deleted }, 'Deleted check batch');
      // Small pause to let other queries breathe
      await new Promise(r => setTimeout(r, 100));
    }
  } while (deleted === BATCH_SIZE);

  logger.info({ totalDeleted }, 'Retention job complete');
}

// Run once immediately, then schedule daily at 03:00 UTC
runRetention().catch(err => logger.error({ err }, 'Retention run failed'));

const MS_IN_DAY = 24 * 60 * 60 * 1000;
setInterval(runRetention, MS_IN_DAY);
