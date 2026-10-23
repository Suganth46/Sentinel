'use strict';
const jwt = require('jsonwebtoken');
const env = require('../config/env');

/**
 * Express middleware that verifies a Bearer JWT and attaches
 * the decoded payload as `req.user`.
 */
function authenticate(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({
      error: { code: 'UNAUTHORIZED', message: 'Missing or invalid Authorization header' },
    });
  }

  const token = header.slice(7);
  try {
    const payload = jwt.verify(token, env.JWT_SECRET);
    req.user = payload;
    next();
  } catch (err) {
    return res.status(401).json({
      error: {
        code: 'TOKEN_INVALID',
        message: err.name === 'TokenExpiredError' ? 'Token expired' : 'Invalid token',
      },
    });
  }
}

module.exports = { authenticate };
