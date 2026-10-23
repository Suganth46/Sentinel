'use strict';
const pino = require('pino');
const env  = require('../config/env');

const isTest = env.NODE_ENV === 'test' || process.env.NODE_ENV === 'test';
const isDev = env.NODE_ENV === 'development';

const logger = pino({
  level: isTest ? 'silent' : env.LOG_LEVEL,
  transport: (isDev && !isTest)
    ? { target: 'pino-pretty', options: { colorize: true, translateTime: 'HH:MM:ss' } }
    : undefined,
});

module.exports = logger;
