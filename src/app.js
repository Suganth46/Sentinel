'use strict';
const express      = require('express');
const helmet       = require('helmet');
const cors         = require('cors');
const pinoHttp     = require('pino-http');
const rateLimit    = require('express-rate-limit');
const path         = require('path');
const YAML         = require('js-yaml');
const fs           = require('fs');
const swaggerUi    = require('swagger-ui-express');

const env          = require('./config/env');
const logger       = require('./lib/logger');
const { errorHandler } = require('./middleware/errorHandler');

// Routes
const authRoutes        = require('./modules/auth/routes');
const monitorRoutes     = require('./modules/monitors/routes');
const statsRoutes       = require('./modules/stats/routes');
const statusPageRoutes  = require('./modules/status-page/routes');

// Swagger
let swaggerDoc = null;
try {
  const yamlPath = path.join(__dirname, '../docs/openapi.yaml');
  if (fs.existsSync(yamlPath)) {
    swaggerDoc = YAML.load(fs.readFileSync(yamlPath, 'utf8'));
  }
} catch { /* ignore if missing */ }

function buildApp() {
  const app = express();

  // ── Security ──────────────────────────────────────────────────
  app.use(helmet({
    contentSecurityPolicy: false,  // disabled to allow inline styles on status page
  }));
  app.use(cors({ origin: env.CORS_ORIGIN ?? '*' }));

  // ── Logging ───────────────────────────────────────────────────
  app.use(pinoHttp({ logger }));

  // ── Body parsing ──────────────────────────────────────────────
  app.use(express.json({ limit: '10kb' }));
  app.use(express.urlencoded({ extended: false, limit: '10kb' }));

  // ── View engine (EJS for status page) ────────────────────────
  app.set('view engine', 'ejs');

  // ── Global rate limit ─────────────────────────────────────────
  const globalLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 200,
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) => req.path === '/health',
  });
  app.use(globalLimiter);

  // ── Health check ──────────────────────────────────────────────
  app.get('/health', async (req, res) => {
    const { pool }  = require('./db/pool');
    const { connection } = require('./lib/queue');
    try {
      await pool.query('SELECT 1');
      const redisStatus = connection.status;
      res.json({
        status:   'ok',
        db:       'ok',
        redis:    redisStatus === 'ready' ? 'ok' : redisStatus,
        uptime:   process.uptime(),
        version:  require('../package.json').version,
      });
    } catch (err) {
      res.status(503).json({ status: 'error', error: err.message });
    }
  });

  // ── API routes ────────────────────────────────────────────────
  app.use('/api/v1', authRoutes);
  app.use('/api/v1/monitors', monitorRoutes);
  app.use('/api/v1', statsRoutes);

  // ── Public status page ────────────────────────────────────────
  app.use('/', statusPageRoutes);

  // ── Swagger UI ────────────────────────────────────────────────
  if (swaggerDoc) {
    app.use('/docs', swaggerUi.serve, swaggerUi.setup(swaggerDoc));
  }

  // ── 404 ───────────────────────────────────────────────────────
  app.use((req, res) => {
    res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Route not found' } });
  });

  // ── Central error handler ────────────────────────────────────
  app.use(errorHandler);

  return app;
}

module.exports = { buildApp };
