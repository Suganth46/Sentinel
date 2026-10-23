'use strict';
const logger = require('../lib/logger');
const env    = require('../config/env');

/**
 * Central Express error handler.
 * Must have 4 params so Express recognises it as an error handler.
 */
// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  const status = err.status || err.statusCode || 500;

  logger.error({
    err,
    method: req.method,
    url: req.url,
    status,
  }, 'Unhandled error');

  const body = {
    error: {
      code:    err.code    || 'INTERNAL_ERROR',
      message: env.NODE_ENV === 'production' ? 'An unexpected error occurred' : err.message,
    },
  };

  if (env.NODE_ENV !== 'production' && err.stack) {
    body.error.stack = err.stack;
  }

  res.status(status).json(body);
}

module.exports = { errorHandler };
