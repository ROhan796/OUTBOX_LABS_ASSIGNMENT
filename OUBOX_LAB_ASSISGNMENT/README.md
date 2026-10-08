# ReachInbox — Email Job Scheduler

Production-style cold-email scheduler: a **delayed job queue with per-sender hourly rate limits**, real **Ethereal SMTP** delivery (with live web previews), **Slack** rate-limit alerts, boot-time **crash recovery**, and a dark React dashboard.

One Node process serves everything on **http://localhost:3000** — REST API + queue worker + React (Vite) UI.

> Assignment sources of truth: `../BACKEND.md`, `../FRONTEND.md`, `../SYSTEM_DESIGN.md`, `../UNIFY.md`
> What is done / partial / not done: **`../audit.md`**
> Demo video (5 min) shot list: **`../DEMO_SCRIPT.md`** · Assumptions / shortcuts / trade-offs: **`../ASSUMPTIONS.md`**
> **Hosting guide (Render step-by-step, Vercel verdict, free-tier limits): `../DEPLOY.md`**

---

## Quick start

```bat
cd C:\INTERNSHIP_TASK\TASK32
start_all.bat              :: start stack + open dashboard
start_all.bat --test       :: start stack + run the 30-check E2E suite
start_all.bat --stop       :: stop everything
start_all.bat --no-browser :: start without opening a browser
```

Manual:

```bash
cd OUBOX_LAB_ASSISGNMENT
npm install
npm run dev                # Express + queue worker + Vite on :3000
```

| Command | What it does |
|---|---|
| `npm run dev` | Dev server on `http://localhost:3000` (Vite middleware) |
| `npm run build` | Production bundle → `dist/` |
| `NODE_ENV=production npm start` | Serves the built `dist/` instead of Vite |
| `npm run lint` | `tsc --noEmit` type check |
| `node scripts/smoke-test.mjs [baseUrl]` | 30-assertion end-to-end workflow test |

**Open the app at `http://localhost:3000`** and use the demo login (or the Google button).

---

## What it does

- **Schedule** a campaign: sender, subject/body, CSV or pasted leads, start time, delay between sends, hourly limit.
- **Queue** runs jobs with staggered delay (`index × delaySeconds`), worker concurrency and a throughput limiter.
- **Rate limit**: per-sender hourly counter; when exceeded, the job is deferred to the next hour window and a **Slack alert** fires (de-duplicated to one alert per user + sender per hour window). Failed sends roll the counter back.
- **Deliver** via real Ethereal SMTP — each sent job stores a **preview URL** you can open in the Sent tab.
- **Retry**: automatic retries with exponential backoff (3 attempts) plus a manual *Retry Send* button.
- **Recover**: on boot, pending/rate-limited jobs are re-enqueued (honouring their deferred window); a 60s sweeper re-enqueues anything orphaned.
- **Search** scheduled/sent emails with match-reason chips (Elasticsearch when `ELASTICSEARCH_URL` is set, otherwise an in-process weighted index).
- **Multi-user**: every job is scoped to its session user (401 without a session, 404 for foreign jobs).

---

## Architecture

```
OUBOX_LAB_ASSISGNMENT/
├── server.ts                 Express app + Vite middleware + PID file
├── src/server/               Backend
│   ├── routes/               auth · emails · slack · admin  (requireAuth everywhere)
│   ├── queue.ts              delayed queue, worker, rate limiter, retries, recovery
│   ├── db.ts                 durable JSON store (atomic write, debounced)
│   ├── ethereal.ts           Nodemailer + auto-created test account
│   ├── slack.ts              rate-limit notifications (dedupe per hour)
│   └── search.ts             in-process search + optional Elasticsearch driver
├── src/
│   ├── api/                  axios client + typed API modules
│   ├── components/
│   │   ├── ui/               shared primitives (Spinner)
│   │   ├── layout/           Header
│   │   └── features/         compose · scheduled · sent · queue · slack
│   ├── hooks/                useAuth (session)
│   ├── pages/                LoginPage · DashboardPage
│   └── types/                shared client types (camelCase)
├── data/db.json              jobs, campaigns, users, alerts, logs, counters
├── logs/server.log           server output (written by start_all.bat)
└── scripts/smoke-test.mjs    E2E verification
```

**Stack:** Express 4 · TypeScript · React 19 + Vite 8 · Tailwind v4 · react-router-dom · TanStack Query · react-hook-form + zod · react-hot-toast · axios · Nodemailer/Ethereal.

See `../audit.md` §3 for why the queue/limiters/search run in-process here instead of BullMQ+Redis/Elasticsearch (local Redis is 3.0.504, Docker daemon unavailable), and where the swap points are.

---

## Configuration

Copy `.env.example` → `.env` (loaded automatically at boot). Nothing is required for local demo; fill in to activate real integrations:

| Variable | Effect |
|---|---|
| `GOOGLE_CLIENT_ID/SECRET` | Real Google OAuth sign-in (falls back to simulated) |
| `SLACK_CLIENT_ID/SECRET` | Real Slack OAuth (falls back to simulated) |
| `SLACK_WEBHOOK_URL` / `SLACK_ACCESS_TOKEN` | Post real rate-limit messages |
| `ELASTICSEARCH_URL` | Search through Elasticsearch instead of the local index |
| `ETHEREAL_USER/PASS` | Reuse one Ethereal account instead of creating one per boot |
| `WORKER_CONCURRENCY`, `JOBS_PER_INTERVAL`, `LIMITER_INTERVAL_MS`, `JOB_MAX_ATTEMPTS`, `JOB_BACKOFF_MS`… | Queue tuning |

Optional infrastructure: `../docker-compose.yml` (`redis:7`, `elasticsearch`) — the app runs fine without it.

---

## API (summary)

| Method | Route | Notes |
|---|---|---|
| GET | `/api/health` | liveness |
| GET | `/api/auth/me` | 401 without session |
| GET | `/api/auth/google` → `/callback` | full-page OAuth redirect |
| POST | `/api/auth/demo-login` · `/logout` | session cookie `reachinbox_uid` |
| POST | `/api/emails/schedule` | 201 `{campaignId,totalScheduled}` / 400 `{error}` |
| GET | `/api/emails/scheduled\|sent?page&limit` | `{data,total,page,limit}` |
| GET | `/api/emails/search?q=` | matches + `matchReason` |
| POST | `/api/emails/:id/retry` | manual retry |
| GET/DELETE | `/api/slack/status\|authorize\|callback\|disconnect\|alerts` | + `webhook-config`, `test-alert` |
| GET | `/api/admin/queues` | stats, logs, alerts, workers (+pause/resume/seed/reset/simulate) |

All protected routes return `401 {"error":"Unauthorized"}` without a session (`UNIFY.md` §4).
