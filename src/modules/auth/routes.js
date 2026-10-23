'use strict';
const { Router }      = require('express');
const rateLimit       = require('express-rate-limit');
const { z }           = require('zod');
const { validate }    = require('../../middleware/validate');
const { authenticate }= require('../../middleware/auth');
const ctrl            = require('./controller');

const router = Router();

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,  // 15 minutes
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { code: 'RATE_LIMITED', message: 'Too many requests, please try again later' } },
});

const registerSchema = z.object({
  email:    z.string().email(),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  slug:     z.string().min(3).max(32).regex(/^[a-z0-9-]+$/, 'Slug must be lowercase alphanumeric with hyphens'),
});

const loginSchema = z.object({
  email:    z.string().email(),
  password: z.string().min(1),
});

const patchMeSchema = z.object({
  slug:             z.string().min(3).max(32).regex(/^[a-z0-9-]+$/).optional(),
  telegram_chat_id: z.string().optional(),
}).refine(d => d.slug || d.telegram_chat_id, { message: 'Provide at least one field to update' });

router.post('/auth/register', authLimiter, validate(registerSchema), ctrl.register);
router.post('/auth/login',    authLimiter, validate(loginSchema),    ctrl.login);
router.get('/me',    authenticate, ctrl.getMe);
router.patch('/me',  authenticate, validate(patchMeSchema), ctrl.patchMe);

module.exports = router;
