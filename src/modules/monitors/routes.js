'use strict';
const { Router }   = require('express');
const { z }        = require('zod');
const { validate } = require('../../middleware/validate');
const { authenticate } = require('../../middleware/auth');
const ctrl         = require('./controller');

const router = Router();

const createSchema = z.object({
  name:              z.string().min(1).max(100),
  url:               z.string().url(),
  method:            z.enum(['GET', 'HEAD']).default('GET'),
  interval_seconds:  z.coerce.number().int().min(60).max(3600).default(300),
  timeout_ms:        z.coerce.number().int().min(1000).max(30000).default(10000),
  expected_status:   z.coerce.number().int().min(100).max(599).default(200),
  failure_threshold: z.coerce.number().int().min(1).max(10).default(3),
  is_active:         z.boolean().default(true),
  is_public:         z.boolean().default(false),
});

const updateSchema = z.object({
  name:              z.string().min(1).max(100).optional(),
  url:               z.string().url().optional(),
  method:            z.enum(['GET', 'HEAD']).optional(),
  interval_seconds:  z.coerce.number().int().min(60).max(3600).optional(),
  timeout_ms:        z.coerce.number().int().min(1000).max(30000).optional(),
  expected_status:   z.coerce.number().int().min(100).max(599).optional(),
  failure_threshold: z.coerce.number().int().min(1).max(10).optional(),
  is_active:         z.boolean().optional(),
  is_public:         z.boolean().optional(),
}).refine(d => Object.values(d).some(v => v !== undefined), { message: 'Provide at least one field' });

const checksQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(500).default(100),
});

router.use(authenticate);

router.get('/',              ctrl.list);
router.post('/',             validate(createSchema),   ctrl.create);
router.get('/:id',           ctrl.get);
router.patch('/:id',         validate(updateSchema),  ctrl.update);
router.delete('/:id',        ctrl.remove);
router.get('/:id/checks',    validate(checksQuerySchema, 'query'), ctrl.checks);
router.get('/:id/incidents', ctrl.incidents);

module.exports = router;
