'use strict';
const IORedis = require('ioredis');
const { Queue }   = require('bullmq');
const env         = require('../config/env');

const connection = new IORedis(env.REDIS_URL, {
  maxRetriesPerRequest: null,  // required by BullMQ
  enableReadyCheck: false,
});

const checkQueue = new Queue('checks', { connection });

module.exports = { connection, checkQueue };
