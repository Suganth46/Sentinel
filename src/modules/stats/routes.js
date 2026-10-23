'use strict';
const { Router }   = require('express');
const { z }        = require('zod');
const { validate } = require('../../middleware/validate');
const { authenticate } = require('../../middleware/auth');
const { getStats, getDailyUptime } = require('./service');

const router = Router();

const statsQuerySchema = z.object({
  window: z.enum(['24h', '7d', '30d']).default('24h'),
});

router.get('/monitors/:id/stats',
  authenticate,
  validate(statsQuerySchema, 'query'),
  async (req, res, next) => {
    try {
      const stats = await getStats(req.params.id, req.user.sub, req.query.window);
      if (!stats) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Monitor not found' } });
      const daily = await getDailyUptime(req.params.id, 90);
      res.json({ stats, daily_uptime: daily });
    } catch (err) { next(err); }
  },
);

module.exports = router;
