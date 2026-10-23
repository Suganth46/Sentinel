'use strict';
require('../config/env');   // validate env first
const { Worker }     = require('bullmq');
const { connection } = require('../lib/queue');
const { query }      = require('../db/pool');
const { checkUrl }   = require('../lib/checkUrl');
const { applyResult }= require('../lib/incidents');
const logger         = require('../lib/logger');
const env            = require('../config/env');

/**
 * Process a single check job.
 * @param {import('bullmq').Job} job
 */
async function processJob(job) {
  const { monitorId } = job.data;

  // Load the monitor
  const { rows } = await query('SELECT * FROM monitors WHERE id = $1 AND is_active = true', [monitorId]);
  const monitor = rows[0];

  if (!monitor) {
    logger.warn({ monitorId }, 'Checker: monitor not found or inactive, skipping');
    return;
  }

  logger.debug({ monitorId, url: monitor.url }, 'Running check');

  // Perform the HTTP check (includes SSRF guard)
  const result = await checkUrl(monitor);

  logger.info({
    monitorId,
    url:        monitor.url,
    success:    result.success,
    statusCode: result.statusCode,
    latencyMs:  result.latencyMs,
    error:      result.error,
  }, 'Check complete');

  // Persist the raw check result
  await query(
    `INSERT INTO checks (monitor_id, success, status_code, latency_ms, error)
     VALUES ($1, $2, $3, $4, $5)`,
    [monitorId, result.success, result.statusCode, result.latencyMs, result.error],
  );

  // Run the incident state machine (may fire alerts)
  await applyResult(monitorId, result);
}

const worker = new Worker('checks', processJob, {
  connection,
  concurrency: env.CHECKER_CONCURRENCY,
});

worker.on('completed', (job) => {
  logger.debug({ jobId: job.id }, 'Job completed');
});

worker.on('failed', (job, err) => {
  logger.error({ jobId: job?.id, err }, 'Job failed');
});

worker.on('error', (err) => {
  logger.error({ err }, 'Worker error');
});

logger.info({ concurrency: env.CHECKER_CONCURRENCY }, 'Checker worker started');
