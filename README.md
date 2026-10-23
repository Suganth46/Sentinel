# Sentinel 🛡️

> **Uptime monitoring as a backend engineering showcase** — scheduled HTTP checks, consecutive-failure incident detection, email/Telegram alerting, and a public status page.

[![CI](https://github.com/Suganth46/Sentinel/actions/workflows/ci.yml/badge.svg)](https://github.com/Suganth46/Sentinel/actions/workflows/ci.yml)

---

## What it does

Sentinel lets users register URLs, monitors them on a configurable schedule (60s–60min), detects outages after *N* consecutive failures, fires email and Telegram alerts, and renders a public status page with a 90-day uptime history bar chart.

---

## Architecture

```
            +-----------+        +-----------------+
 Client --> |  Express  | -----> |   PostgreSQL    |
            |   API     |        | users, monitors |
            +-----------+        | checks, incidents
                                 +--------^--------+
                                          |
 +------------+   enqueue    +--------+   |  write results,
 | Scheduler  | -----------> | Redis  |   |  state transitions
 | (tick 15s) |              | BullMQ |   |
 +------------+              +---+----+   |
                                 |        |
                           +-----v--------+--+
                           |  Check workers  | --> HTTP checks to user URLs
                           |  (concurrency N)|
                           +--------+--------+
                                    |
                              +-----v-----+
                              |  Alerting | --> Email / Telegram
                              +-----------+
```

**Three entry points** — all in one codebase, independently scalable:

| Process | Entry | Role |
|---|---|---|
| API | `src/server.js` | REST API + status page |
| Scheduler | `src/workers/scheduler.js` | Claims due monitors → enqueues jobs |
| Checker | `src/workers/checker.js` | Executes HTTP checks + runs state machine |

---

## Design decisions

### Why not alert on the first failure?

Transient network blips cause alert fatigue. The `failure_threshold` (default: 3 consecutive failures) trades a small detection delay for much higher signal quality.

### How are duplicate incidents prevented under concurrent workers?

The `applyResult` function locks the monitor row with `FOR UPDATE` inside a transaction. A partial unique index (`WHERE resolved_at IS NULL`) on `incidents.monitor_id` provides a second, DB-level guarantee — correctness doesn't rely solely on application code.

### Why `FOR UPDATE SKIP LOCKED` in the scheduler?

It lets multiple scheduler instances run safely in parallel: each claims a disjoint batch of due monitors without blocking each other. State lives in the database, so the scheduler survives restarts.

### SSRF protection (the standout feature)

Users supply URLs that the server will fetch, so an attacker could point a monitor at `http://169.254.169.254/` (cloud metadata) or `http://localhost:5432`. Sentinel defends at **two points**:

1. **At create/update time** — `ssrfGuard.resolveSafe()` resolves DNS and rejects any address in a private/reserved range.
2. **At check time** — the validated IP is pinned into undici's `connect.lookup` so DNS rebinding attacks can't redirect mid-flight.

### How does the `checks` table stay manageable?

A daily retention job deletes rows older than `RETENTION_DAYS` (default: 30) in batches of 10,000 rows, pausing 100ms between batches so it doesn't lock the table.

---

## Quick start

### With Docker (recommended)

```bash
git clone https://github.com/Suganth46/Sentinel
cd Sentinel

# Start everything: postgres, redis, migrate, api, scheduler, checker
docker compose up --build
```

The API is available at `http://localhost:3000`.  
Swagger UI: `http://localhost:3000/docs`

### Local development

```bash
# 1. Start dependencies
docker compose up postgres redis -d

# 2. Copy and edit env
cp .env.example .env

# 3. Install and migrate
npm install
npm run migrate:up

# 4. Run all three processes (requires concurrently)
npm run dev
```

---

## Environment variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `DATABASE_URL` | ✅ | — | PostgreSQL connection string |
| `REDIS_URL` | ✅ | `redis://localhost:6379` | Redis connection |
| `JWT_SECRET` | ✅ | — | Min 32 chars. Keep it secret. |
| `JWT_EXPIRES_IN` | | `1h` | JWT TTL |
| `SMTP_HOST` | | — | Email alerts (leave blank to disable) |
| `SMTP_PORT` | | `587` | |
| `SMTP_USER` | | — | |
| `SMTP_PASS` | | — | |
| `TELEGRAM_BOT_TOKEN` | | — | Telegram bot (leave blank to disable) |
| `MAX_MONITORS_PER_USER` | | `20` | Per-user monitor cap |
| `CHECKER_CONCURRENCY` | | `20` | BullMQ worker concurrency |
| `SCHEDULER_TICK_MS` | | `15000` | How often the scheduler ticks (ms) |
| `RETENTION_DAYS` | | `30` | How long check records are kept |

---

## API overview

Base path: `/api/v1`. All routes except auth and the public status page require `Authorization: Bearer <jwt>`.

| Method | Route | Description |
|---|---|---|
| POST | `/auth/register` | Register → returns JWT |
| POST | `/auth/login` | Login → returns JWT |
| GET | `/me` | Current user profile |
| PATCH | `/me` | Update slug or Telegram chat ID |
| POST | `/monitors` | Create monitor |
| GET | `/monitors` | List own monitors |
| GET | `/monitors/:id` | Monitor details |
| PATCH | `/monitors/:id` | Update monitor |
| DELETE | `/monitors/:id` | Delete monitor |
| GET | `/monitors/:id/checks` | Recent checks (`?limit=100`) |
| GET | `/monitors/:id/stats` | Uptime %, avg & p95 latency (`?window=24h\|7d\|30d`) |
| GET | `/monitors/:id/incidents` | Incident history |
| GET | `/status/:slug` | **Public** HTML status page |
| GET | `/status/:slug.json` | **Public** JSON status page |
| GET | `/health` | Liveness probe |
| GET | `/docs` | Swagger UI |

Full spec: [`docs/openapi.yaml`](docs/openapi.yaml)

---

## Setting up Telegram alerts

1. Message `@BotFather` on Telegram → `/newbot` → copy the token → set `TELEGRAM_BOT_TOKEN`.
2. Message your bot once to create the chat.
3. Call `PATCH /api/v1/me` with `{ "telegram_chat_id": "<your chat id>" }`.
4. Alerts for down and recovered events will be sent to that chat.

---

## Testing

```bash
# Unit tests only (no DB required)
npm test -- tests/unit

# All tests (requires DATABASE_URL pointing at a test DB)
npm test
```

Test coverage:
- **Unit**: SSRF guard (10 cases including localhost, cloud metadata, IPv6, DNS rebinding)
- **Integration**: Auth flow, monitor CRUD, ownership isolation (404 not 403), incident state machine

---

## Project structure

```
src/
  server.js                # HTTP server entry point
  app.js                   # Express app factory (importable by tests)
  config/env.js            # Zod-validated env vars
  db/
    pool.js                # Shared pg pool
    migrations/            # node-pg-migrate files
  middleware/
    auth.js                # JWT Bearer verification
    validate.js            # Zod validation factory
    errorHandler.js        # Central error handler
  modules/
    auth/                  # register, login, profile
    monitors/              # CRUD + checks + incidents
    stats/                 # uptime % and latency
    status-page/           # public HTML + JSON page
  workers/
    scheduler.js           # tick job: claims and enqueues due monitors
    checker.js             # BullMQ worker: performs checks + state machine
    retention.js           # daily delete of old checks
  lib/
    checkUrl.js            # HTTP check with timeout + error classification
    ssrfGuard.js           # DNS resolution + private-IP blocking
    incidents.js           # transactional state machine
    queue.js               # BullMQ connection + queue
    logger.js              # pino logger
    notifiers/
      email.js             # Nodemailer
      telegram.js          # plain fetch to Bot API
      index.js             # orchestrator with cooldown
tests/
  unit/ssrfGuard.test.js
  integration/api.test.js
  integration/incidents.test.js
docs/openapi.yaml
```

---

## Limitations and next steps

- **No refresh tokens** — JWTs expire in 1h with no rotation (straightforward to add).
- **Single-region checks** — adding a second worker in another AWS region would give geographic redundancy.
- **No aggregated rollups** — the 30-day retention job discards raw checks; a `daily_rollups` table would preserve long-term uptime history.
- **Stretch features planned**: Prometheus `/metrics` endpoint, latency Chart.js overlay on the status page, embeddable SVG uptime badge, Terraform for AWS deployment.
