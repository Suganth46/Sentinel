'use strict';
const { Pool } = require('pg');
const env = require('../config/env');
const logger = require('../lib/logger');

const pool = new Pool({
  connectionString: env.DATABASE_URL,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

pool.on('error', (err) => {
  logger.error({ err }, 'Unexpected database pool error');
});

/**
 * Execute a parameterized query using the shared pool.
 * @param {string} text  SQL text with $1, $2 placeholders
 * @param {Array}  [params]  Query parameters
 */
async function query(text, params) {
  const start = Date.now();
  const res = await pool.query(text, params);
  const duration = Date.now() - start;
  logger.trace({ query: text, duration, rows: res.rowCount }, 'db query');
  return res;
}

module.exports = { pool, query };
