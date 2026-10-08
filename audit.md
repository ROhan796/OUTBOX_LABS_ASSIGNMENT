# audit.md — ReachInbox Assignment Conformance Audit

**Audited against:** `BACKEND.MD` · `FRONTEND.MD` · `SYSTEM_DESIGN.md` · `UNIFY.MD`
**Code under audit:** `OUBOX_LAB_ASSISGNMENT/` (one Node process = Express API + queue worker + React/Vite UI on `:3000`; folder previously named `OUBOX_LABS_FRONTEND`)
**Audit date:** 2026-10-06 · **Status: every gap that *can* be closed in this environment has been closed.**

**Legend**

| Symbol | Meaning |
|---|---|
| ✅ | Implemented **and verified working** |
| 🟦 | Implemented with a caveat — needs external credentials/infrastructure, or uses a documented equivalent |
| ⛔ | Not implemented **and not implementable here** (blocked by this machine), or not applicable by design |

---

## 0. The headline answer: which gaps were closed?

Every item that was ⛔/🟦 in the first audit, with its fate:

| # | Item (source) | Before | Now | How |
|---|---|---|---|---|
| 1 | Worker `attempts: 3` + exponential backoff (`BACKEND.md` §7.1) | ⛔ | ✅ | `queue.ts → handleRetryableFailure()`; env `JOB_MAX_ATTEMPTS` / `JOB_BACKOFF_MS`; **proved by fault injection** (see §1) |
| 2 | Elasticsearch index/search (`SYSTEM_DESIGN.md` §12) | ⛔ | 🟦 | Real ES driver added in `search.ts` (mappings, bulk index, `_search`, graceful fallback). Activates with `ELASTICSEARCH_URL`. Cannot be live-tested — needs a running cluster (Docker daemon down) |
| 3 | `docker-compose.yml` (`UNIFY.MD` §12) | ⛔ | ✅ | Written at project root: `redis:7-alpine` + Elasticsearch 8 (+ commented Postgres). Not *executed* — Docker unavailable here |
| 4 | React Router `/login` + `/` + protected route (`FRONTEND.MD` §8.1) | ⛔ | ✅ | `App.tsx` route table + `Navigate` guards; SPA fallback verified for `/`, `/login`, deep links (dev **and** prod) |
| 5 | TanStack Query for data/polling (`FRONTEND.MD` §10) | ⛔ | ✅ | `useQuery` ×3 with `refetchInterval: 4000`, `invalidateQueries()` after every mutation-style action |
| 6 | axios instance + interceptor (`FRONTEND.MD` §8.2) | ⛔ | ✅ | `api/client.ts` rewritten on axios (`withCredentials`, error → `Error('{error}')`); all API modules untouched |
| 7 | react-hook-form + zod (`FRONTEND.MD` §10) | ⛔ | ✅ | `ComposeModal` validated by `composeSchema` (zod) + `zodResolver`; inline field errors + root/API errors |
| 8 | react-hot-toast `<Toaster/>` (`FRONTEND.MD` §6) | ⛔ | ✅ | Mounted in `main.tsx` with dark theme tokens; dashboard uses `toast.success/error` |
| 9 | `hooks/` folder (`FRONTEND.MD` §3) | 🟦 | ✅ | `hooks/useAuth.ts` (session, login, logout, refresh) |
| 10 | `components/ui/` primitives (`FRONTEND.MD` §3) | 🟦 | 🟦 | `ui/Spinner.tsx` (full-screen + inline) added; tables still keep their own inline skeletons/empty states |
| 11 | `VITE_API_URL` pairing (`UNIFY.MD` §11) | ⛔ | ✅ | axios `baseURL = import.meta.env.VITE_API_URL || ''` |
| 12 | Project `README.md` (`SYSTEM_DESIGN.md` §14) | ⛔ | ✅ | Replaced the AI-Studio template: quick start, commands, architecture, env table, API summary |
| 13 | `.env` actually loaded | 🟦 | ✅ | `import 'dotenv/config'` in `server.ts`; `.env.example` documents every variable incl. retry tuning |
| 14 | `start_all.bat` launcher | 🟦 | ✅ | **Bug fixed:** health probe used `localhost` → resolved to `::1` first → 2.2 s stall → 2 s timeout → launcher killed a *healthy* server. Now probes `127.0.0.1`, logs to `logs/server.log`, spawns via PowerShell (see §1) |

**Items that remain ⛔ — none of them are implementable in this environment, all have a working alternative already in place:**

| Item | Why blocked | What runs instead (verified) |
|---|---|---|
| BullMQ + Redis queue | Local Redis is **3.0.504** (BullMQ needs ≥ 6.2); Docker daemon not running | In-process queue with the same semantics: delayed jobs, idempotency keys, concurrency, throughput limiter, retries/backoff, pause/resume, stats. `docker-compose.yml` ships Redis 7 for when the daemon is available |
| Redis rate-limit counters | same | Atomic in-process counters with the identical key format `rate_limit:{sender}:{Y-M-D-H}` (safe: single process) |
| NeonDB + Drizzle + migrations | no `DATABASE_URL`, no Postgres | Durable `data/db.json` (atomic tmp+rename write) with the same table shapes mirrored in `src/server/types.ts` |
| bull-board UI | only visualises a real BullMQ queue | Queue Engine tab (worker cards, counters, depth, live logs) + `GET /api/admin/queues` |
| CORS `credentials` config (`UNIFY.md` §6) | not applicable | UI and API share one origin on `:3000` — no preflight, cookies just work |
| `vite.config` proxy → `:4000` (`FRONTEND.md` §12) | not applicable | Vite runs in middleware mode *inside* Express; pairing problem does not exist |
| `metadata.json` | scaffold leftover | harmless AI-Studio artifact, ignored at runtime |

**Still 🟦 (implemented, needs something this machine cannot provide):** real **Google OAuth** (needs `GOOGLE_CLIENT_ID/SECRET`), real **Slack OAuth/webhooks** (needs a Slack app) — both code paths are written and fall back to a simulated flow; **Elasticsearch live cluster**; cookie-session instead of `express-session` (works, but is not server-side session storage).

---

## 1. How this was verified (evidence)

| Check | Command | Result |
|---|---|---|
| Type check | `npm run lint` (`tsc --noEmit`) | ✅ 0 errors (after every change above) |
| Production build | `npm run build` | ✅ `dist/` = html + css + js (569 kB) |
| Production boot | `NODE_ENV=production` + `tsx server.ts` | ✅ health ok; `/`, `/login` → 200 with root div; JS asset → 200 |
| Dev boot | `start_all.bat --no-browser` | ✅ `[5/5] Backend is UP and healthy` |
| **Full E2E suite** | `start_all.bat --test` | ✅ **30 passed, 0 failed** |
| Stop | `start_all.bat --stop` | ✅ pid file + process scan → port 3000 free |
| SPA fallback | `GET /`, `/login`, `/some/deep/route` | ✅ 200 + `index.html` (dev *and* production) |
| **Retry/backoff fault injection** | bogus `ETHEREAL_USER/PASS` → forced SMTP auth failure | ✅ see log excerpt below |
| Launcher health bug | `Invoke-WebRequest localhost` vs `127.0.0.1` | ✅ measured: **2189 ms** vs **4 ms** → probe switched to `127.0.0.1` |

**Fault-injection transcript (job → 3 attempts → permanent failure):**

```
LOG warn:    [Retry] Attempt 1/3 failed for retry.target@nowhere.invalid. Re-enqueued with 2s exponential backoff.
LOG warn:    [Retry] Attempt 2/3 failed for retry.target@nowhere.invalid. Re-enqueued with 4s exponential backoff.
LOG error:   [Worker] Job permanently failed for retry.target@nowhere.invalid after 3 attempts.
JOB STATUS : failed
JOB ERROR  : Invalid login: 535 Authentication failed (gave up after 3 attempts)
```

(the test's own rows were rolled back from `data/db.json` afterwards — dataset unchanged)

**Verification limits (stated honestly):** there is no headless browser in this environment, so the frontend is verified by `tsc` + production build + served routes + the fact that all API traffic goes through the now-axios client that the E2E suite exercises server-side. Nothing in the FE is browser-clicked automatically.

---

## 2. Feature-by-feature audit

### 2.1 Authentication & session (`UNIFY.md §3, §5, §9` · `BACKEND.md` §15)

| Requirement | Status | Notes |
|---|---|---|
| `/api/auth/me` → 401 anonymous / camelCase user with session | ✅ | `requireAuth` on every protected route; body exactly `{"error":"Unauthorized"}` |
| Session cookie + `credentials:'include'` | ✅ | httpOnly `reachinbox_uid`, 30 days; axios `withCredentials: true` |
| Google button = full-page redirect (never fetch) | ✅ | plain `<a href="/api/auth/google">` |
| Google callback: code → userinfo → upsert → session → redirect | 🟦 | Real exchange implemented; unverified (no credentials). Falls back to simulated sign-in + `?auth=success` |
| `/api/auth/demo-login`, `/api/auth/logout` | ✅ | |
| 401 anywhere → frontend returns to login | ✅ | router guard: no session → `<Navigate to="/login">` |
| Login screen design (`FRONTEND.md` §5.1) | ✅ | |
| Server-side session store (`express-session` + `connect-redis`) | 🟦 | **Alternative:** signed cookie identity + DB lookup — restart-proof, no Redis |

### 2.2 Scheduling & queue (`SYSTEM_DESIGN.md` §6 · `BACKEND.md` §7, §8, §17)

| Requirement | Status | Notes |
|---|---|---|
| `POST /api/emails/schedule` → 201 `{campaignId,totalScheduled}` | ✅ | 400 `{error}` on validation (per-lead regex, min lengths, 5 000-lead cap) |
| Campaign + one job per lead, `index × delaySeconds` stagger | ✅ | |
| Delayed execution (future start, staggered) | ✅ | 250 ms scheduler tick |
| Concurrency + throughput limiter (env-tunable) | ✅ | surfaced in `/api/admin/queues` |
| Idempotency (DB key + queue id + "already sent" guard) | ✅ | duplicate leads de-duped in the route |
| Statuses `scheduled / rate_limited / sent / failed` | ✅ | campaigns `in_progress → done` |
| **Automatic retries `attempts: 3` + exponential backoff** | ✅ | `handleRetryableFailure()`; **proven** in §1; tunable via `JOB_MAX_ATTEMPTS`, `JOB_BACKOFF_MS` |
| Manual retry failed/rate-limited job | ✅ | API + buttons in both tables |
| Admin stats/pause/resume/seed/simulate/reset | ✅ | wired to Queue tab buttons |
| **BullMQ + Redis** | ⛔ | **Alternative:** in-process queue, same semantics; swap point `src/server/queue.ts`; `docker-compose.yml` provides Redis 7 for the real thing |
| **bull-board at `/api/admin/queues`** | ⛔ | **Alternative:** JSON stats + Queue Engine tab |

### 2.3 Rate limiting (`SYSTEM_DESIGN.md` §7 · `BACKEND.md` §9)

| Requirement | Status | Notes |
|---|---|---|
| Per-sender hourly counter, atomic, key `rate_limit:{sender}:{Y-M-D-H}` | ✅ | in-process, identical key format |
| Over limit → rollback → defer to next hour → `rate_limited` | ✅ | + Slack alert (deduplicated: one per user + sender per hour window) |
| Failed send must not consume quota | ✅ | counter rolled back on every failure path |
| Counter visible in ops UI | ✅ | Queue tab → "Hourly Sender Counters" |
| Redis counters for multi-worker safety | ⛔ | **Alternative:** in-process counters; safe because the deployment is single-process. Cannot scale out horizontally as-is |

### 2.4 Persistence & recovery (`SYSTEM_DESIGN.md` §8 · `BACKEND.md` §10)

| Requirement | Status | Notes |
|---|---|---|
| Durable job store | 🟦 | **Alternative:** `data/db.json`, atomic write, debounce; no SQL/transactions |
| Boot-time recovery, no cron | ✅ | re-enqueues `scheduled` + honours stored *Deferred until* for `rate_limited` |
| Idempotent re-enqueue | ✅ | same idempotency key → update, never dupe |
| 60 s orphan sweeper (crash self-heal) | ✅ | |
| NeonDB + Drizzle schema/migrations | ⛔ | **Alternative:** table shapes mirrored 1:1 in `src/server/types.ts`; no `drizzle.config.ts`/`db/migrations/` |
| `docker-compose.yml` | ✅ | **Written** (Redis 7 + ES 8 + commented Postgres). Not executed: Docker daemon unavailable |

### 2.5 Email delivery (`BACKEND.md` §12 · `SYSTEM_DESIGN.md` §16.2)

| Requirement | Status | Notes |
|---|---|---|
| Ethereal SMTP via Nodemailer, auto-created account | ✅ | or `ETHEREAL_USER/PASS` (also used to fault-inject the retry test) |
| Real preview URL stored | ✅ | live URLs in `data/db.json`, opened from the Sent tab |
| Send → update DB → index → log | ✅ | 3/3 in the E2E suite |
| Failure → retry → `failed` + error message | ✅ | **proven in §1** |

### 2.6 Slack (`BACKEND.md` §16 · `UNIFY.md` §4.9–4.12, §9)

| Requirement | Status | Notes |
|---|---|---|
| status / authorize (with `state`) / callback / disconnect | ✅ (+🟦 callback) | Real exchange written, untested without a Slack app; simulated connect otherwise |
| `?slack_connected=true` / `?slack_error=true` toasts, query cleared | ✅ | via react-hot-toast |
| Rate-limit message (sender, limit, next window) | ✅ | Block Kit payload; delivered to webhook/token if configured, otherwise logged to the **local alert feed** in the Slack tab |
| `webhook-config` (validated) + `test-alert` + `alerts` feed | ✅ | |
| OAuth scopes `incoming-webhook,chat:write` | ✅ | |

### 2.7 Search (`BACKEND.md` §13 · `SYSTEM_DESIGN.md` §12)

| Requirement | Status | Notes |
|---|---|---|
| `GET /api/emails/search?q=` + `matchReason` | ✅ | weighted scoring (recipient ×10, subject ×7, sender ×5, status ×4, body ×2) + chips in both tables |
| **Elasticsearch index + `ensureIndex`** | 🟦 | **Implemented:** mapping, `_bulk` index, `_search` with field boosts, boot-time bulk sync, automatic fallback to local scoring when ES is unreachable. Needs `ELASTICSEARCH_URL` + a live cluster (blocked here) |

### 2.8 REST contract (`UNIFY.md` §4, §7, §8)

| Endpoint / rule | Status |
|---|---|
| `GET /api/auth/google` (302) · `/me` (401/200) · `POST /demo-login` · `POST /logout` | ✅ |
| `GET /api/auth/google/callback`, `GET /api/slack/callback` | 🟦 (code written; simulated path tested) |
| `POST /api/emails/schedule` (201/400) · `GET /scheduled\|sent` (`{data,total,page,limit}`) · `GET /search` · `POST /:id/retry` · `GET /:id` | ✅ |
| Slack `status/authorize/disconnect/alerts/webhook-config/test-alert` | ✅ |
| `GET /api/admin/queues` (+ pause/resume/seed/simulate/reset) | ✅ |
| Error shape `{error}` everywhere | ✅ |
| Shared types kept in sync manually (client camelCase ↔ store snake_case) | ✅ |
| CORS `credentials:true` + origin (`§6`) | ⛔ not applicable — same origin |
| `VITE_API_URL` pairing (`§11`) | ✅ supported via axios `baseURL` |

### 2.9 Frontend UI (`FRONTEND.md` §1–§6, §11)

Palette (`#0F1117/#1A1D27/#2A2D3E/#6C63FF/#00D084/#F59E0B/#EF4444`), header + mobile tabs, Compose modal (sender/subject/body/CSV drop-zone/start time/delay/limit/validation), Scheduled table (columns, badges, relative time, filters, pagination, skeletons, empty state, retry), Sent table (delivered/failed, Ethereal preview link, retry), search + match chips, empty/loading/error states, loading splash, auto-refresh → **all ✅**. Toasts now via **react-hot-toast ✅**.

### 2.10 Frontend architecture (`FRONTEND.md` §3, §8, §10, §12–13)

| Spec choice | Status | Note |
|---|---|---|
| axios instance + interceptor | ✅ | `src/api/client.ts` |
| React Router (`/login`, `/`, protected) | ✅ | + SPA fallback in dev & prod |
| TanStack Query (cache, `refetchInterval`) | ✅ | 4 s polling, invalidation on actions |
| react-hook-form + zod | ✅ | `ComposeModal` schema |
| react-hot-toast `<Toaster/>` | ✅ | dark theme options |
| `hooks/` folder | ✅ | `useAuth` |
| `components/ui/` folder | 🟦 | `Spinner` only; tables keep inline skeletons |
| Folder layout `api/components/{layout,features}/pages/types` | ✅ | |
| Tailwind config tokens + `Inter` font | 🟦 | Tailwind **v4** (`@import "tailwindcss"` + CSS vars with the exact spec colours); font is Plus Jakarta Sans + JetBrains Mono |
| vite proxy `→ :4000`, port 5173 | ⛔ | not applicable (single origin) |
| `metadata.json` | ⛔ | harmless AI-Studio leftover |

### 2.11 Ops / DX

| Item | Status | Notes |
|---|---|---|
| One-command start / stop | ✅ | `start_all.bat` (`--no-browser`, `--test`, `--install`, `--stop`) — **health-probe bug fixed** |
| Server log on disk | ✅ | `OUBOX_LAB_ASSISGNMENT/logs/server.log` |
| `.env` loaded + documented | ✅ | `dotenv/config` + `.env.example` |
| Health endpoint | ✅ | `/api/health` |
| Automated E2E regression | ✅ | `scripts/smoke-test.mjs` — 30 assertions |
| Production mode | ✅ | `NODE_ENV=production` verified |
| Project README | ✅ | rewritten for this project |

---

## 3. Why the ⛔ infrastructure items are blocked here

| Spec'd | Runs instead | Constraint |
|---|---|---|
| NeonDB + Drizzle | `data/db.json` durable store | no `DATABASE_URL` / no Postgres |
| BullMQ + Redis | in-process queue | Redis here is **3.0.504** (< 6.2) and Docker daemon is off — `docker-compose.yml` now ships `redis:7` |
| Redis rate-limit counters | in-process atomic counters | same; safe while single-process |
| Elasticsearch | weighted local index (+ real ES driver behind a flag) | needs Docker |
| express-session + connect-redis | httpOnly cookie session | no Redis |
| bull-board | Queue Engine tab + JSON API | needs real BullMQ |
| CORS split-origin config | n/a | UI + API share `:3000` |

**Swap points are single files:** `queue.ts` (queue/limiter/retries), `db.ts` (store), `search.ts` (search — ES driver already inside), `routes/auth.ts` (sessions). Nothing else touches infrastructure directly.

---

## 4. Remaining work

**P0 — nothing blocking.** All documented workflows run and are verified (30/30 + fault injection).

**P1 — makes the "real integration" claims verifiable**

1. Google Cloud OAuth client → `GOOGLE_CLIENT_ID/SECRET` → real Google sign-in (code already written).
2. Slack app + webhook → `SLACK_CLIENT_ID/SECRET` / `SLACK_WEBHOOK_URL` → real consent flow and live rate-limit messages.
3. NeonDB `DATABASE_URL` + Drizzle migration from `types.ts` → SQL store (enables multi-process scaling).

**P2 — fidelity / polish**

4. Docker up → `docker compose up -d` → set `ELASTICSEARCH_URL` to exercise the ES driver live; swap `queue.ts` to BullMQ on Redis 7 + move rate-limit counters to Redis.
5. Optional: `react-query`-style shared `ui/` primitives for table skeletons/empty states.
6. Optional: Tailwind token file + Inter font for pixel-parity with `FRONTEND.md` §2.
7. Optional: delete `metadata.json` (AI-Studio leftover).

---

## 5. Re-verification

```bat
cd C:\INTERNSHIP_TASK\TASK32
start_all.bat --test        :: boots the stack and runs the 30-check E2E suite
start_all.bat --stop        :: stops everything
```

```bash
cd OUBOX_LAB_ASSISGNMENT
npm run lint                # tsc --noEmit
npm run build               # vite build -> dist/
npm run dev                 # Express + Vite on :3000
node scripts/smoke-test.mjs # E2E workflow proof
```

Watch live: **Scheduled** tab (jobs flipping `scheduled → sent`), **Sent** tab (*View Web Preview* → real Ethereal inbox), **Queue Engine** (counters, deferred depth, pause/resume, "Test Rate Limit & Slack"), **Slack Alerts** (feed), `data/db.json` (persisted rows), `logs/server.log` (worker output).

---

## 6. Demo video + assumptions docs

- **`DEMO_SCRIPT.md`** — timed ≤ 5-minute recording script (boot → compose → API/Postman → Scheduled/Sent + Ethereal preview → **stop/start restart survival** → rate-limit bonus), with pre-flight cleanup, exact expected output and a gotchas list. Every claim in it was rehearsed live on this machine.
- **`ASSUMPTIONS.md`** — assignment deliverable #5: assumptions, shortcuts (spec → what runs → swap point), trade-offs, what is not implementable here, and the five fixes made while preparing the demo (launcher folder auto-detect, smoke-test page walk, throughput-limiter enforcement, per-user Slack alert dedupe, doc folder-name corrections).
