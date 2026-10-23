'use strict';
require('./config/env');    // validate env vars before anything else
const { buildApp } = require('./app');
const logger       = require('./lib/logger');
const env          = require('./config/env');

const app = buildApp();

const server = app.listen(env.PORT, () => {
  logger.info({ port: env.PORT, env: env.NODE_ENV }, 'Sentinel API started');
});

// Graceful shutdown
function shutdown(signal) {
  logger.info({ signal }, 'Shutting down gracefully');
  server.close(() => {
    logger.info('HTTP server closed');
    const { pool } = require('./db/pool');
    pool.end().then(() => {
      logger.info('DB pool closed');
      process.exit(0);
    });
  });

  // Force exit after 10s
  setTimeout(() => {
    logger.error('Forced shutdown after timeout');
    process.exit(1);
  }, 10_000);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT',  () => shutdown('SIGINT'));
process.on('uncaughtException',  (err) => { logger.fatal({ err }, 'Uncaught exception'); process.exit(1); });
process.on('unhandledRejection', (err) => { logger.fatal({ err }, 'Unhandled rejection');  process.exit(1); });
