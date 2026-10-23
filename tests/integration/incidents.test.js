'use strict';
/**
 * Unit tests for the incident state machine (applyResult).
 * Uses a real test database (set DATABASE_URL in env).
 */
const { pool, query } = require('../../src/db/pool');
const { applyResult } = require('../../src/lib/incidents');

// Suppress notifications in tests
jest.mock('../../src/lib/notifiers', () => ({
  notify: jest.fn().mockResolvedValue(undefined),
}));

const { notify } = require('../../src/lib/notifiers');

let userId;
let monitorId;

async function createTestUser() {
  const { rows } = await query(
    `INSERT INTO users (email, password_hash, slug)
     VALUES ($1, 'hash', $2) RETURNING id`,
    [`test-incidents-${Date.now()}@example.com`, `test-slug-${Date.now()}`],
  );
  return rows[0].id;
}

async function createTestMonitor(userId, overrides = {}) {
  const { rows } = await query(
    `INSERT INTO monitors
       (user_id, name, url, failure_threshold)
     VALUES ($1, 'Test Monitor', 'https://example.com', $2)
     RETURNING id`,
    [userId, overrides.failure_threshold ?? 3],
  );
  return rows[0].id;
}

async function getMonitor(id) {
  const { rows } = await query('SELECT * FROM monitors WHERE id = $1', [id]);
  return rows[0];
}

async function getOpenIncident(monitorId) {
  const { rows } = await query(
    'SELECT * FROM incidents WHERE monitor_id = $1 AND resolved_at IS NULL',
    [monitorId],
  );
  return rows[0] ?? null;
}

beforeAll(async () => {
  userId    = await createTestUser();
  monitorId = await createTestMonitor(userId, { failure_threshold: 3 });
});

afterAll(async () => {
  await query('DELETE FROM users WHERE id = $1', [userId]);
  await pool.end();
});

beforeEach(() => {
  notify.mockClear();
  // Reset monitor state
  return query(
    `UPDATE monitors SET status='unknown', consecutive_failures=0 WHERE id=$1`,
    [monitorId],
  );
});

describe('applyResult – success path', () => {
  test('sets status to up on first success', async () => {
    await applyResult(monitorId, { success: true, statusCode: 200, latencyMs: 50, error: null });
    const m = await getMonitor(monitorId);
    expect(m.status).toBe('up');
    expect(m.consecutive_failures).toBe(0);
  });

  test('does not notify on first success', async () => {
    await applyResult(monitorId, { success: true, statusCode: 200, latencyMs: 50, error: null });
    expect(notify).not.toHaveBeenCalled();
  });
});

describe('applyResult – failure path', () => {
  test('increments consecutive_failures on single failure', async () => {
    await applyResult(monitorId, { success: false, statusCode: 503, latencyMs: 100, error: null });
    const m = await getMonitor(monitorId);
    expect(m.consecutive_failures).toBe(1);
    expect(m.status).toBe('unknown');   // threshold not reached yet
    expect(notify).not.toHaveBeenCalled();
  });

  test('does NOT open incident before threshold reached (N=3)', async () => {
    // 2 failures on threshold=3
    await applyResult(monitorId, { success: false, statusCode: 503, latencyMs: 0, error: null });
    await applyResult(monitorId, { success: false, statusCode: 503, latencyMs: 0, error: null });
    const incident = await getOpenIncident(monitorId);
    expect(incident).toBeNull();
    expect(notify).not.toHaveBeenCalled();
  });

  test('opens incident and sends down alert exactly at threshold (N=3)', async () => {
    await applyResult(monitorId, { success: false, statusCode: 503, latencyMs: 0, error: null });
    await applyResult(monitorId, { success: false, statusCode: 503, latencyMs: 0, error: null });
    await applyResult(monitorId, { success: false, statusCode: 503, latencyMs: 0, error: null });

    const m        = await getMonitor(monitorId);
    const incident = await getOpenIncident(monitorId);

    expect(m.status).toBe('down');
    expect(incident).not.toBeNull();
    expect(notify).toHaveBeenCalledWith(expect.anything(), 'down', expect.anything());
  });

  test('does NOT open a second incident while already down', async () => {
    // Bring to down state
    for (let i = 0; i < 3; i++) {
      await applyResult(monitorId, { success: false, statusCode: 503, latencyMs: 0, error: null });
    }
    notify.mockClear();

    // One more failure while down
    await applyResult(monitorId, { success: false, statusCode: 503, latencyMs: 0, error: null });

    const { rows } = await query(
      'SELECT count(*) AS cnt FROM incidents WHERE monitor_id = $1 AND resolved_at IS NULL',
      [monitorId],
    );
    expect(parseInt(rows[0].cnt, 10)).toBe(1);   // still just one
    expect(notify).not.toHaveBeenCalled();       // no duplicate alert
  });
});

describe('applyResult – recovery path', () => {
  async function bringDown() {
    for (let i = 0; i < 3; i++) {
      await applyResult(monitorId, { success: false, statusCode: 503, latencyMs: 0, error: null });
    }
    notify.mockClear();
  }

  test('closes incident on recovery', async () => {
    await bringDown();
    await applyResult(monitorId, { success: true, statusCode: 200, latencyMs: 50, error: null });

    const incident = await getOpenIncident(monitorId);
    expect(incident).toBeNull();

    const m = await getMonitor(monitorId);
    expect(m.status).toBe('up');
    expect(m.consecutive_failures).toBe(0);
  });

  test('sends recovered alert on recovery', async () => {
    await bringDown();
    await applyResult(monitorId, { success: true, statusCode: 200, latencyMs: 50, error: null });
    expect(notify).toHaveBeenCalledWith(expect.anything(), 'recovered', expect.anything());
  });
});
