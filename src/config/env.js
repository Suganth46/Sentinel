'use strict';
const { z } = require('zod');

const envSchema = z.object({
  NODE_ENV:    z.enum(['development', 'production', 'test']).default('development'),
  PORT:        z.coerce.number().int().positive().default(3000),
  LOG_LEVEL:   z.enum(['fatal','error','warn','info','debug','trace']).default('info'),

  DATABASE_URL: z.string().url(),

  REDIS_URL: z.string().url().default('redis://localhost:6379'),

  JWT_SECRET: process.env.NODE_ENV === 'test'
    ? z.string().min(32).default('test_jwt_secret_that_is_at_least_32_characters_long')
    : z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  JWT_EXPIRES_IN: z.string().default('1h'),

  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().positive().optional(),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  SMTP_FROM: z.string().optional(),

  TELEGRAM_BOT_TOKEN: z.string().optional(),

  MAX_MONITORS_PER_USER: z.coerce.number().int().positive().default(20),
  CHECKER_CONCURRENCY:   z.coerce.number().int().positive().default(20),
  SCHEDULER_TICK_MS:     z.coerce.number().int().positive().default(15000),
  RETENTION_DAYS:        z.coerce.number().int().positive().default(30),
});

// Load .env file in non-production environments
if (process.env.NODE_ENV !== 'production') {
  try {
    const fs   = require('fs');
    const path = require('path');
    const envPath = path.resolve(__dirname, '../../.env');
    if (fs.existsSync(envPath)) {
      const lines = fs.readFileSync(envPath, 'utf8').split('\n');
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const eqIdx = trimmed.indexOf('=');
        if (eqIdx === -1) continue;
        const key = trimmed.slice(0, eqIdx).trim();
        const val = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, '');
        if (!(key in process.env)) process.env[key] = val;
      }
    }
  } catch { /* ignore */ }
}

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  const issues = parsed.error.issues.map(i => `  ${i.path.join('.')}: ${i.message}`).join('\n');
  console.error(`[config] Invalid environment variables:\n${issues}`);
  process.exit(1);
}

module.exports = parsed.data;
