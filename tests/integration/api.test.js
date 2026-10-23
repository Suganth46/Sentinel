'use strict';
/**
 * Integration tests for Auth and Monitor CRUD endpoints.
 * Requires a running Postgres with the schema applied.
 */
const request = require('supertest');
const { buildApp } = require('../../src/app');
const { pool, query } = require('../../src/db/pool');

const app = buildApp();

let token;
let userId;
const email    = `test-api-${Date.now()}@example.com`;
const password = 'password123';
const slug     = `test-${Date.now()}`;

afterAll(async () => {
  if (userId) await query('DELETE FROM users WHERE id = $1', [userId]);
  await pool.end();
});

// ── Auth ──────────────────────────────────────────────────────
describe('POST /api/v1/auth/register', () => {
  test('creates a user and returns JWT', async () => {
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({ email, password, slug })
      .expect(201);

    expect(res.body.token).toBeDefined();
    expect(res.body.user.email).toBe(email);
    token  = res.body.token;
    userId = res.body.user.id;
  });

  test('returns 409 on duplicate email', async () => {
    await request(app)
      .post('/api/v1/auth/register')
      .send({ email, password, slug: `other-${Date.now()}` })
      .expect(409);
  });

  test('returns 400 on invalid email', async () => {
    await request(app)
      .post('/api/v1/auth/register')
      .send({ email: 'not-an-email', password, slug: 'valid-slug' })
      .expect(400);
  });

  test('returns 400 when password too short', async () => {
    await request(app)
      .post('/api/v1/auth/register')
      .send({ email: `short-${Date.now()}@example.com`, password: 'short', slug: 'abc' })
      .expect(400);
  });
});

describe('POST /api/v1/auth/login', () => {
  test('returns JWT for valid credentials', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email, password })
      .expect(200);
    expect(res.body.token).toBeDefined();
  });

  test('returns 401 for wrong password', async () => {
    await request(app)
      .post('/api/v1/auth/login')
      .send({ email, password: 'wrongpassword' })
      .expect(401);
  });
});

describe('GET /api/v1/me', () => {
  test('returns user profile with valid token', async () => {
    const res = await request(app)
      .get('/api/v1/me')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(res.body.user.email).toBe(email);
  });

  test('returns 401 without token', async () => {
    await request(app).get('/api/v1/me').expect(401);
  });

  test('returns 401 with invalid token', async () => {
    await request(app)
      .get('/api/v1/me')
      .set('Authorization', 'Bearer invalid.token.here')
      .expect(401);
  });
});

// ── Monitor CRUD ──────────────────────────────────────────────
describe('Monitor CRUD', () => {
  let monitorId;

  test('POST /monitors creates a monitor', async () => {
    const res = await request(app)
      .post('/api/v1/monitors')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Test Site', url: 'https://example.com' })
      .expect(201);

    expect(res.body.monitor.name).toBe('Test Site');
    expect(res.body.monitor.status).toBe('unknown');
    monitorId = res.body.monitor.id;
  });

  test('GET /monitors lists monitors', async () => {
    const res = await request(app)
      .get('/api/v1/monitors')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(res.body.monitors.length).toBeGreaterThan(0);
  });

  test('GET /monitors/:id returns monitor', async () => {
    const res = await request(app)
      .get(`/api/v1/monitors/${monitorId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(res.body.monitor.id).toBe(monitorId);
  });

  test('PATCH /monitors/:id updates monitor', async () => {
    const res = await request(app)
      .patch(`/api/v1/monitors/${monitorId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Updated Name', interval_seconds: 120 })
      .expect(200);
    expect(res.body.monitor.name).toBe('Updated Name');
    expect(res.body.monitor.interval_seconds).toBe(120);
  });

  test('DELETE /monitors/:id deletes monitor', async () => {
    await request(app)
      .delete(`/api/v1/monitors/${monitorId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(204);
  });

  test('GET /monitors/:id returns 404 after deletion', async () => {
    await request(app)
      .get(`/api/v1/monitors/${monitorId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(404);
  });
});

// ── Ownership isolation ───────────────────────────────────────
describe('Monitor ownership', () => {
  let monitorId;
  let otherToken;

  beforeAll(async () => {
    // Create a monitor under the first user
    const res = await request(app)
      .post('/api/v1/monitors')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Private Monitor', url: 'https://example.com' });
    monitorId = res.body.monitor.id;

    // Register a second user
    const otherEmail = `other-${Date.now()}@example.com`;
    const reg = await request(app)
      .post('/api/v1/auth/register')
      .send({ email: otherEmail, password: 'password123', slug: `other-${Date.now()}` });
    otherToken = reg.body.token;
  });

  afterAll(async () => {
    await query('DELETE FROM monitors WHERE id = $1', [monitorId]);
  });

  test('other user gets 404, not 403, for cross-user monitor', async () => {
    // Returns 404, not 403 (so users can't even confirm the monitor exists)
    await request(app)
      .get(`/api/v1/monitors/${monitorId}`)
      .set('Authorization', `Bearer ${otherToken}`)
      .expect(404);
  });

  test('other user cannot delete cross-user monitor', async () => {
    await request(app)
      .delete(`/api/v1/monitors/${monitorId}`)
      .set('Authorization', `Bearer ${otherToken}`)
      .expect(404);
  });
});

// ── Health endpoint ───────────────────────────────────────────
describe('GET /health', () => {
  test('returns ok', async () => {
    const res = await request(app).get('/health').expect(200);
    expect(res.body.status).toBe('ok');
  });
});
