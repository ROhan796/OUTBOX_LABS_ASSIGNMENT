# ASSUMPTIONS.md — Assumptions, Shortcuts & Trade-offs

> Assignment deliverable **#5**: *"Note any assumptions, shortcuts, or trade-offs you made."*
> Full feature-by-feature conformance table lives in **`audit.md`**; the recording walkthrough lives in **`DEMO_SCRIPT.md`**; hosting/deployment lives in **`DEPLOY.md`**.
> Everything below was written against the code as it runs today (verified 2026-10-08: `npm run lint` clean, `start_all.bat --test` → **30/30**).

---

## 1. Assumptions

### 1.1 Environment (this machine)
| # | Assumption | Consequence if false |
|---|---|---|
| A1 | Windows + Node 18+ on PATH (Node 22 used here) | `start_all.bat` fails at step 1/5 |
| A2 | **No Docker daemon**, local Redis is **3.0.504** (< 6.2 required by BullMQ) | — this is *why* the queue runs in-process (see §2) |
| A3 | No `DATABASE_URL` / no Postgres (NeonDB unreachable) | durable store is `data/db.json` |
| A4 | Internet access is available at runtime for **Ethereal** (`smtp.ethereal.email`) | offline → Nodemailer `jsonTransport` fallback; preview URLs become synthetic (still stored) |
| A5 | Port **3000** is free and UI + API share that one origin | CORS config from `UNIFY.MD §6` is not applicable (see §2.7) |
| A6 | One Node process = API + queue worker + UI (deployment model) | in-memory rate counters/queue are only safe single-process |

### 1.2 Credentials & integrations
| # | Assumption | Behaviour without credentials (verified) |
|---|---|---|
| A7 | **Google OAuth** client id/secret may be absent | `/api/auth/google` falls back to a *simulated* sign-in + `?auth=success`; real token-exchange code path is written and used when `GOOGLE_CLIENT_ID/SECRET` are set |
| A8 | **Slack** app/webhook may be absent | rate-limit alerts always land in the local alert feed (**Slack** tab); a real webhook/token is used automatically when `SLACK_WEBHOOK_URL` / `SLACK_ACCESS_TOKEN` is configured |
| A9 | Assignment scope = **fake SMTP**, not real inbox delivery | delivery is Ethereal (real SMTP to a test account, public preview URLs). "Real mail" in the demo means *really sent over SMTP and really viewable*, not a mocked `sent` flag |
| A10 | Demo sign-in is acceptable for the video (no passwords in scope) | session = httpOnly cookie `reachinbox_uid` holding a user id; every email job is scoped to its owner |

### 1.3 Runtime semantics assumed by the UI/tests
- **Rate-limit windows are UTC hour buckets** — key `rate_limit:{sender}:{Y-M-D-H}` (matches the spec'd Redis key format).
- **Past `startTime` is clamped to "now"**; `delaySeconds ≥ 1`, `hourlyLimit` capped at 10 000, ≤ 5 000 leads/campaign, duplicate leads de-duplicated (`campaignId:recipient` idempotency key).
- **Rate-limited jobs are deferred to the next hour (+2 s)** — they do not retry seconds later; the demo shows the deferral, not a fast resend.
- **Slack alert de-duplication = one alert per user + sender + hour window** (fixed during demo prep — see §5).
- **Statuses:** `scheduled → sent | failed | rate_limited`; the dashboard polls every **4 s**, so status flips are near-live, not instant.
- Health checks and the launcher probe **`127.0.0.1`**, never `localhost` (IPv6 `::1` stall of ~2.2 s used to kill a healthy server).

---

## 2. Shortcuts (spec → what actually runs → why → swap point)

The assignment's reference stack is *BullMQ + Redis + NeonDB/Drizzle + Elasticsearch + express-session*. This machine cannot run most of that (A2/A3), so each piece has a **documented equivalent with the same semantics** and a **single-file swap point**.

| # | Spec'd | Runs instead | Why (blocker) | Swap point |
|---|---|---|---|---|
| 2.1 | **BullMQ delayed queue** on Redis | In-process delayed queue: `executeAt` timers, idempotent re-enqueue, concurrency cap, pause/resume, retries w/ exponential backoff (3 attempts), boot recovery, 60 s orphan sweeper | Redis 3.0.504, Docker daemon off | `src/server/queue.ts` (`docker-compose.yml` ships `redis:7` for the real thing) |
| 2.2 | **Redis `INCR`** rate-limit counters | Atomic in-process counters, **identical key format** `rate_limit:{sender}:{Y-M-D-H}`, rollback on failure | same | `src/server/db.ts` → Redis `INCR` when scaling out |
| 2.3 | **NeonDB + Drizzle** + migrations | `data/db.json` — atomic write (tmp + rename), debounced 150 ms, table shapes mirrored 1:1 in `src/server/types.ts` | no `DATABASE_URL`/Postgres | `src/server/db.ts` |
| 2.4 | **Elasticsearch** index/search | Weighted in-process index (recipient ×10, subject ×7, sender ×5, status ×4, body ×2) + `matchReason` chips. **A real ES driver is already written** (mappings, bulk index, `_search` with boosts) and activates with `ELASTICSEARCH_URL` | no cluster to test against | `src/server/search.ts` |
| 2.5 | `express-session` + `connect-redis` | httpOnly cookie identity + DB lookup — **survives restarts without Redis** | no Redis | `src/server/routes/auth.ts` |
| 2.6 | **bull-board** UI at `/api/admin/queues` | **Queue** tab (metric cards, hourly counters, live event stream, pause/resume) + JSON stats at `GET /api/admin/queues` | bull-board only renders real BullMQ | route `src/server/routes/admin.ts` |
| 2.7 | CORS `credentials:true` + `VITE_API_URL` pairing | **Not applicable** — UI and API share `:3000`, cookies just work. axios still honours `VITE_API_URL` if you later split origins | single-origin architecture | `src/api/client.ts` |
| 2.8 | Google / Slack OAuth consent flows | Full code paths written (redirect, `state`, code exchange, upsert, redirect back with `?auth=success` / `?slack_connected=true`) — **simulated fallback** until real credentials exist | no client ids | `.env` |
| 2.9 | Multi-worker horizontal scale | Single process by design; **cannot scale out** with in-process counters/queue | follows from 2.1/2.2 | see swap points above |

### 2.10 Smaller, honest shortcuts
- **`PORT` is read from the environment** (`server.ts`: `process.env.PORT || 3000`) so a host can inject its own port — fixed during deployment prep (see `DEPLOY.md` §7); default remains `3000` locally.
- **`DELAY_BETWEEN_EMAILS_MS`** is reserved/unused: real pacing comes from per-campaign `delaySeconds` stagger + concurrency + the throughput limiter.
- **`GET /api/admin/queues → workers[]`** returns 5 illustrative worker cards; the *real* state is `stats.concurrency` / `stats.activeWorkers`.
- Some **UI labels say "Redis" / "Bull-Board"** (e.g. *"Hourly Sender Counters (Redis)"*) — they name the target architecture; the backing store today is in-process state + `db.json`.
- **No headless browser** in this environment: the frontend is verified by `tsc`, a production build, served SPA routes, and the API-level E2E suite — the **video itself is the browser proof**.
- **Admin helpers** (`Seed Demo (10 Leads)`, `Test Rate Limit & Slack`) hard-code sample leads/limits to make demos one click.

---

## 3. Trade-offs (chosen on purpose, with the cost)

| Decision | Why | Cost / risk | Mitigation |
|---|---|---|---|
| **JSON file store** instead of SQL | zero infra, restart-safe, atomic writes | no transactions, no concurrent writers, whole file rewritten on change | debounced + atomic rename; single process; swap `db.ts` for Drizzle later |
| **In-memory queue + boot recovery** instead of a shared broker | survives restart *without* Redis; no duplicate delivery possible | jobs only exist in memory while running — a hard kill loses nothing durable, but recovery runs at next boot | recovery scan at boot + 60 s sweeper + idempotency keys + "already sent" guard |
| **Polling every 4 s** instead of WebSockets/SSE | fewer moving parts, matches `FRONTEND.MD` | status freshness ≤ 4 s | cheap and observable in the demo (rows flip live) |
| **Rate-limited = defer to next hour** (spec'd) | keeps senders under provider limits | a demo hit looks "stuck" for up to an hour | show the deferral message; manual **Retry** button exists |
| **Rollback the counter on failed sends** | a bounce must not consume quota | counter can be momentarily non-monotonic | single-threaded process → no race |
| **Retry 3 attempts, exponential backoff (2 s → 4 s)** | transient SMTP failures self-heal | permanent failures take ~6 s to surface | `JOB_MAX_ATTEMPTS` / `JOB_BACKOFF_MS` tunable; proven by fault injection (`audit.md` §1) |
| **Slack alert dedupe per user+sender+hour** | one ping per window, feed stays readable | repeated hits in the same hour are suppressed (logged as *"duplicate suppressed"*) | by design; dedupe is now scoped per user so it can't silence another user's feed |
| **Cookie = user id (signed/httpOnly), no passwords** | demo-friendly, restart-proof | possession of the cookie = that identity; no CSRF tokens beyond `SameSite=Lax` | dev/demo scope; server-side sessions are the production path |
| **Weighted local search** as ES fallback | instant, no infra | not multi-node / not ranked by ES analyzers | ES driver already in `search.ts`, activates on `ELASTICSEARCH_URL` |
| **Throughput limiter** (`jobsPerInterval` / `limiterIntervalMs`) enforced in the worker | BullMQ `limiter` equivalent; smooths restart bursts | a large backlog drains at ≤ 10 jobs/s (default) | tune via env; per-campaign `delaySeconds` is the primary pacing knob |

---

## 4. What is NOT done (and cannot be, here)

| Item | Status | Blocked by |
|---|---|---|
| BullMQ + Redis queue **live** | not runnable | Redis 3.0.504, Docker daemon off (`docker-compose.yml` ready) |
| Redis rate-limit counters **live** | not runnable | same |
| NeonDB/Drizzle migrations | not run | no `DATABASE_URL` |
| Elasticsearch **live** cluster | driver written, untested against a real cluster | Docker |
| Real Google sign-in / real Slack workspace | code written, simulated fallback used | needs client ids / Slack app |
| Split-origin CORS in production | n/a today | architecture is single-origin |

---

## 5. Changes made while preparing this demo (and for deployment)

| File | Change | Reason |
|---|---|---|
| `start_all.bat` | auto-detect the app folder (the one containing `server.ts`) | the assignment folder was renamed to `OUBOX_LAB_ASSISGNMENT`, the launcher still pointed at `OUBOX_LABS_FRONTEND` → **it could not start at all** |
| `README.md` | corrected the folder name in Quick start + architecture tree | same rename |
| `scripts/smoke-test.mjs` | assertion now walks pages until it finds the new campaign | with a backlog the newest campaign can land past page 1 → false failure (was 29/30) |
| `src/server/queue.ts` | **throughput limiter actually enforced** (`applyThroughputLimiter`) | `JOBS_PER_INTERVAL` / `LIMITER_INTERVAL_MS` were only *displayed* in stats — `audit.md` claimed they were live |
| `src/server/slack.ts` | alert de-duplication scoped **per user** | it was global, so one user's recent alert silently suppressed another user's — and the alert feed is per-user, which made the E2E suite time out after a reset |
| `server.ts` | `PORT` now read from the environment | hosts (Render etc.) inject their own port — was hard-coded `3000` |
| `src/server/db.ts` | `DATA_DIR` env override for the JSON store | lets a paid host mount a persistent disk and keep `db.json` across restarts |
| `package.json` / lock | `tsx` moved `devDependencies` → `dependencies` | it runs the server (`npm start`) — production installs omit dev deps |
| `.gitignore` | ignore runtime state (`data/db.json`, `*.pid`, `*.tmp`) | deployment prep — history must never be committed (see `DEPLOY.md`) |

All demo fixes re-verified: `npm run lint` → 0 errors, `start_all.bat --test` → **30 passed, 0 failed**, plus a live restart-recovery rehearsal (5 pending jobs → `[Recovery] Restored 5 pending jobs` → all delivered with working Ethereal previews) and a live rate-limit rehearsal (2 sent, 4 `rate_limited`, counter pinned at 2, Slack alert recorded). Deployment changes verified the same day: `PORT=4567` honoured, `DATA_DIR` honoured, `NODE_ENV=production` boot served health + built UI (see **`DEPLOY.md`**).

---

## 6. One-line summary for the video's closing caption

> *Same semantics as the reference stack — delayed jobs, idempotency, hourly limits with rollback, retries, restart recovery — running in one process with a JSON store, because this machine has no Docker/Redis 6+/Postgres; every substitution is single-file swappable (see `audit.md` §3 and `ASSUMPTIONS.md` §2).*
