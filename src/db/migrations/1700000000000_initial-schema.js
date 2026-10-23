/* eslint-disable camelcase */
'use strict';

/**
 * @param {import('node-pg-migrate').MigrationBuilder} pgm
 */
exports.up = (pgm) => {
  pgm.sql(`CREATE EXTENSION IF NOT EXISTS pgcrypto;`);

  pgm.sql(`
    CREATE TABLE users (
      id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      email            TEXT NOT NULL UNIQUE,
      password_hash    TEXT NOT NULL,
      slug             TEXT NOT NULL UNIQUE,
      telegram_chat_id TEXT,
      created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);

  pgm.sql(`
    CREATE TABLE monitors (
      id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id              UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name                 TEXT NOT NULL,
      url                  TEXT NOT NULL,
      method               TEXT NOT NULL DEFAULT 'GET'
                             CHECK (method IN ('GET','HEAD')),
      interval_seconds     INT  NOT NULL DEFAULT 300
                             CHECK (interval_seconds BETWEEN 60 AND 3600),
      timeout_ms           INT  NOT NULL DEFAULT 10000
                             CHECK (timeout_ms BETWEEN 1000 AND 30000),
      expected_status      INT  NOT NULL DEFAULT 200,
      failure_threshold    INT  NOT NULL DEFAULT 3
                             CHECK (failure_threshold BETWEEN 1 AND 10),
      is_active            BOOLEAN NOT NULL DEFAULT true,
      is_public            BOOLEAN NOT NULL DEFAULT false,
      status               TEXT NOT NULL DEFAULT 'unknown'
                             CHECK (status IN ('unknown','up','down')),
      consecutive_failures INT NOT NULL DEFAULT 0,
      next_check_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
      last_checked_at      TIMESTAMPTZ,
      created_at           TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);

  pgm.sql(`CREATE INDEX idx_monitors_due ON monitors (next_check_at) WHERE is_active;`);
  pgm.sql(`CREATE INDEX idx_monitors_user ON monitors (user_id);`);

  pgm.sql(`
    CREATE TABLE checks (
      id          BIGSERIAL PRIMARY KEY,
      monitor_id  UUID NOT NULL REFERENCES monitors(id) ON DELETE CASCADE,
      success     BOOLEAN NOT NULL,
      status_code INT,
      latency_ms  INT,
      error       TEXT,
      checked_at  TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);

  pgm.sql(`CREATE INDEX idx_checks_monitor_time ON checks (monitor_id, checked_at DESC);`);

  pgm.sql(`
    CREATE TABLE incidents (
      id          BIGSERIAL PRIMARY KEY,
      monitor_id  UUID NOT NULL REFERENCES monitors(id) ON DELETE CASCADE,
      started_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
      resolved_at TIMESTAMPTZ,
      cause       TEXT
    );
  `);

  // Partial unique index: at most one open incident per monitor
  pgm.sql(`
    CREATE UNIQUE INDEX uniq_open_incident
      ON incidents (monitor_id)
      WHERE resolved_at IS NULL;
  `);

  pgm.sql(`
    CREATE TABLE alerts_log (
      id          BIGSERIAL PRIMARY KEY,
      monitor_id  UUID NOT NULL REFERENCES monitors(id) ON DELETE CASCADE,
      incident_id BIGINT REFERENCES incidents(id) ON DELETE SET NULL,
      type        TEXT NOT NULL CHECK (type IN ('down','recovered')),
      channel     TEXT NOT NULL,
      sent_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
      error       TEXT
    );
  `);
};

/**
 * @param {import('node-pg-migrate').MigrationBuilder} pgm
 */
exports.down = (pgm) => {
  pgm.sql(`DROP TABLE IF EXISTS alerts_log;`);
  pgm.sql(`DROP TABLE IF EXISTS incidents;`);
  pgm.sql(`DROP TABLE IF EXISTS checks;`);
  pgm.sql(`DROP TABLE IF EXISTS monitors;`);
  pgm.sql(`DROP TABLE IF EXISTS users;`);
  pgm.sql(`DROP EXTENSION IF EXISTS pgcrypto;`);
};
