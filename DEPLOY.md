# DEPLOY.md — Hosting ReachInbox on the web (step-by-step)

> Audience: you have **never deployed anything before**. Follow the steps in order.
> Everything marked ✅ was rehearsed on this machine on **2026-10-08** (`npm run lint` clean · `start_all.bat --test` → **30/30** · `PORT`/`DATA_DIR`/production-mode boots verified).
> Total time: ~10 min local rehearsal + ~20 min Render.

---

## 0. TL;DR

- The app is **one Node process** (Express API + queue worker + built React UI on one port) → it fits any plain "web service" host. No split frontend/backend deploy needed.
- **Recommended: Render free tier** ✅ — Node web service, one URL, zero config beyond 4 fields.
- **Not Vercel** ❌ for the full app — its serverless model cannot keep the queue worker alive, its filesystem is read-only, and it can't run this server process (details in §11).
- **Honest free-tier limits** (§2): Render's free tier blocks outbound SMTP ports (25/465/587) since 2026-09-26 and has an **ephemeral disk** — so on *free*, the app runs and the queue works, but **real Ethereal email delivery fails** and **saved history resets** on every redeploy/spin-down. For a fully working public demo: Render **paid** web service ($7/mo) or run locally (§12).

---

## 1. Where to host — the decision

| Option | Verdict | Why |
|---|---|---|
| **Render** (web service) | ✅ **Recommended** | Runs long-lived Node processes, injects `PORT`, free tier exists, single URL keeps cookie auth working, deploy from GitHub in ~5 clicks |
| **Railway / Fly.io / Render paid / DigitalOcean App Platform / any VPS** | ✅ Also fine | Same requirement: a long-lived Node process with a writable disk. Any of them works with the exact same build/start commands |
| **Vercel** (full app) | ❌ **Not suitable** | Serverless functions are short-lived and stateless — see §11 for the three hard blockers |
| **Local only** (`start_all.bat`) | ✅ For the video | Zero setup, full SMTP + persistence; but not a public URL |

**Requirements this app has from a host** (so you can judge any host yourself):

1. Long-lived Node 18+ process (`npm start` keeps running) — because the queue worker is an in-process loop.
2. Writable filesystem — or acceptance that `data/db.json` resets (the app recovers pending jobs on every boot).
3. Outbound SMTP allowed if you want Ethereal delivery to work.
4. Same origin for UI + API (one URL) — that is how session cookies work here.

---

## 2. What Render's free tier really gives you (read before deploying)

| Aspect | Free tier | Effect on *this* app |
|---|---|---|
| CPU / RAM | 0.1 CPU / 512 MB | Fine — the app idles at a few MB |
| Hours | 750/month (~25/day) | Enough for a demo; Render suspends service if you exceed |
| **Spin-down** | No traffic for **15 min** → instance stops; first request after that takes **~1 min** cold start | First visitor waits ~1 min (show the health URL first, or accept it) |
| **Disk** | **Ephemeral** — wiped on every spin-down/redeploy; **no persistent disks on free** | `data/db.json` history resets; **pending jobs are re-enqueued at next boot** (built-in recovery), so nothing "scheduled" is lost while the process sleeps — but sent history/counters are |
| **Outbound SMTP** | **Blocked (ports 25/465/587) on free web services since 2026-09-26** | Ethereal sends fail → jobs go to `failed`/retries; the queue, rate-limiter, Slack alerts, previews *links* all still work |
| Public URL | `https://<name>.onrender.com` | OAuth redirect URIs must match it (§9) |
| Price | $0 | — |

**Paid escape hatches (only if you want them):** Render paid web service **$7/mo** (persistent disk **$0.25/GB**) restores both SMTP and disk. Render's free *Postgres* expires after 30 days — **not needed**: this app stores everything in `data/db.json`.

---

## 3. Step 0 — rehearse production mode locally ✅

This is **exactly** what Render will run. Do it once so nothing on the platform is a surprise.

```bat
cd C:\INTERNSHIP_TASK\TASK32\OUBOX_LAB_ASSISGNMENT
npm run build          :: compiles the React UI into dist/  (~2 s)
set NODE_ENV=production&& npm start
```

PowerShell equivalent of the start line: `$env:NODE_ENV="production"; npm start`

**You should see** (all verified ✅):

```
[ReachInbox Scheduler] Server running on http://0.0.0.0:3000
```

Then check, in a second terminal:

```bat
curl http://127.0.0.1:3000/api/health
:: {"status":"ok","service":"ReachInbox Email Job Scheduler", ...}
curl -s -o nul -w "%{http_code}" http://127.0.0.1:3000/         :: 200 (built UI)
curl -s -o nul -w "%{http_code}" http://127.0.0.1:3000/login    :: 200 (SPA route)
```

Open `http://localhost:3000`, sign in with the demo button, schedule a 1-lead campaign, confirm it lands. Stop with **Ctrl+C**.

> Why `NODE_ENV=production` matters: without it the server serves the **Vite dev middleware** instead of your built `dist/`. On Render you set it in the dashboard (§5).

Optional full gate before pushing: `start_all.bat --test --no-browser` → expect **30 passed, 0 failed**.

---

## 4. Step 1 — put the code on GitHub

This project is **not a git repository yet**, so create one. Run from the **project root** (`C:\INTERNSHIP_TASK\TASK32`) so the launcher, docs *and* the app travel together:

```bat
cd C:\INTERNSHIP_TASK\TASK32
git init
git add .
git status
```

**Before committing, `git status` must NOT show any of these** (the app's `.gitignore` already excludes them):

| Must be absent | Why |
|---|---|
| `OUBOX_LAB_ASSISGNMENT/node_modules/` | huge, recreated by `npm install` |
| `OUBOX_LAB_ASSISGNMENT/dist/` | rebuilt by `npm run build` on Render |
| `OUBOX_LAB_ASSISGNMENT/data/db.json` | runtime state, private |
| `OUBOX_LAB_ASSISGNMENT/.env` | secrets (`.env.example` *is* committed) |
| `OUBOX_LAB_ASSISGNMENT/logs/*.log` | local logs |

Then commit and push (create an empty repo on github.com first, no README needed):

```bat
git commit -m "ReachInbox email job scheduler"
git branch -M main
git remote add origin https://github.com/<your-name>/<your-repo>.git
git push -u origin main
```

---

## 5. Step 2 — create the Render web service

1. Go to **dashboard.render.com** → **New +** → **Web Service** → connect your GitHub repo (grant access to just that repo if asked).
2. Fill in the form:

| Field | Value |
|---|---|
| Name | e.g. `reachinbox-scheduler` (becomes your URL) |
| Region | nearest to you |
| Branch | `main` |
| **Root Directory** | **`OUBOX_LAB_ASSISGNMENT`** ← the #1 mistake is leaving this empty; Render would run in the repo root where there is no `package.json` |
| Runtime | `Node` |
| **Build Command** | `npm install && npm run build` |
| **Start Command** | `npm start` |
| Instance Type | **Free** (or Starter $7/mo if you want SMTP + disk) |

3. Open the **Environment** tab and add:

| Key | Value | Needed? |
|---|---|---|
| `NODE_ENV` | `production` | **required** — serves the built UI instead of Vite dev |
| `FRONTEND_URL` | `https://<your-app>.onrender.com` | for OAuth post-login redirects |
| `DATA_DIR` | *(leave unset on free)* | only with a persistent disk (§8) |

   Everything else (Google/Slack credentials, queue tuning) is optional — the app runs fully without them (simulated fallbacks). You do **not** upload a `.env` file; the dashboard *is* the env on Render (`dotenv` only reads a local file).

4. **Settings → Health Check Path** → `/api/health`.
5. **Create Web Service** → watch the deploy log → after *"Deploy live"*, your app is at `https://<your-app>.onrender.com`.

---

## 6. Step 3 — verify the live deployment

| # | Check | Expected |
|---|---|---|
| 1 | `https://<app>.onrender.com/api/health` | JSON `{"status":"ok",...}` |
| 2 | `https://<app>.onrender.com/` | 200, the dark login page |
| 3 | `https://<app>.onrender.com/login` | 200 (SPA fallback works on the host) |
| 4 | Demo **Enter Dashboard** button | dashboard loads, session cookie set |
| 5 | Schedule a 1-lead campaign | job appears as `scheduled`, then executes |
| 6 | **Sent tab** after execution | ⚠️ **Free tier:** `failed` with an SMTP/connect error (§2, expected) · **Paid/local:** `sent` + working Ethereal preview URL |
| 7 | **Queue tab** | worker cards + hourly counters move |
| 8 | Stop touching it for 15 min, reload | first load is slow (~1 min), then healthy (spin-down, expected) |

Optional from your machine: `node scripts/smoke-test.mjs https://<app>.onrender.com` — note checks that rely on SMTP may fail on the free tier (see #6).

---

## 7. Environment variables — full reference

| Variable | Read by | Default | On Render |
|---|---|---|---|
| `PORT` | `server.ts` | `3000` | **Render injects it automatically and the app honours it** ✅ (verified) — never hard-code a port on a host |
| `NODE_ENV` | `server.ts` | dev | set `production` |
| `DATA_DIR` | `src/server/db.ts` | `<cwd>/data` | set only when you mount a disk (§8) ✅ (verified: DB created at the custom path) |
| `FRONTEND_URL` | OAuth routes | `http://localhost:3000` | your `https://` service URL |
| `GOOGLE_CLIENT_ID/SECRET` | Google OAuth | blank → simulated sign-in | optional |
| `SLACK_CLIENT_ID/SECRET`, `SLACK_WEBHOOK_URL`, `SLACK_ACCESS_TOKEN` | Slack | blank → simulated + local alert feed | optional |
| `ETHEREAL_USER/PASS` | SMTP | blank → fresh test account each boot | optional |
| `WORKER_CONCURRENCY`, `JOBS_PER_INTERVAL`, `LIMITER_INTERVAL_MS`, `JOB_MAX_ATTEMPTS`, `JOB_BACKOFF_MS`… | queue | see `.env.example` | optional tuning |

---

## 8. Keeping data between restarts (optional, paid hosts only)

- **Free/ephemeral:** accept the reset. Boot-time recovery re-enqueues `scheduled`/`rate_limited`/`rate_limited` pending jobs, so the *queue* survives; sent history and counters do not.
- **Persistent disk (Render Starter+):** create a disk mounted at e.g. `/var/data`, then set **`DATA_DIR=/var/data`**. The app writes `db.json` there (verified locally: pointing `DATA_DIR` at a folder makes the server create `db.json` in it). Never point `DATA_DIR` at a read-only folder — writes are atomic (temp file + rename) and would throw at boot.

---

## 9. OAuth redirect URIs for the live URL

Only needed if you use the *real* sign-in buttons (demo login needs nothing):

| Service | Console | Values |
|---|---|---|
| Google | console.cloud.google.com → Credentials | Authorized JavaScript origin: `https://<app>.onrender.com` · Redirect URI: `https://<app>.onrender.com/api/auth/google/callback` |
| Slack | api.slack.com → OAuth | Redirect URL: `https://<app>.onrender.com/api/slack/callback` |

Locally the equivalents are `http://localhost:3000/...` (see `.env.example`).

---

## 10. Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| Build fails: `Cannot find package.json` / "no lockfile" | **Root Directory** left empty | set it to `OUBOX_LAB_ASSISGNMENT` and redeploy |
| Build fails on `vite`/`tsc` | deps or source broken | run `npm install && npm run build && npm run lint` locally first — it must pass before you push |
| Deploy "failing" at health check | wrong Health Check Path, missing `NODE_ENV`, or start command typo | Health check = `/api/health`, Start = `npm start`, env `NODE_ENV=production` |
| Site loads but every login/OAuth bounces back | `FRONTEND_URL` doesn't match the real URL | set it to `https://<app>.onrender.com` |
| Data is gone after a while | free-tier spin-down/redeploy wiped the ephemeral disk | expected (§2); add a disk (§8) or run paid |
| Jobs go `failed` with SMTP/ECONNREFUSED/timeout | **free tier blocks outbound SMTP** (since 2026-09-26) | run locally, or paid tier — the queue/rate-limit/Slack demo still works on free |
| First request takes ~1 min | cold start after 15-min idle | expected; open `/api/health` first, or keep-alive ping every 10 min |
| `ECONNREFUSED 127.0.0.1:3000` (locally) | server not running | `start_all.bat` (start) / `start_all.bat --stop` |
| Local page loads but API 401s | session expired/demo cookie cleared | sign in again |

---

## 11. Why not Vercel (the three hard blockers)

1. **The queue worker must stay alive.** Sends are driven by in-process timers/loops (`setInterval`, delayed execution). Serverless functions freeze after responding → nothing would ever dispatch a queued job.
2. **Read-only filesystem.** Vercel allows writes only in `/tmp`; the durable store `data/db.json` (and any mounted disk path) can't be written → the app would crash on first save.
3. **This is one long-lived server, not an API-only backend.** `npm start` runs Express + Vite-built static serving + worker as a single process; Vercel needs serverless functions split by route (and splitting the API to another origin breaks the same-origin session cookie without extra CORS work).

Vercel *could* host the React UI alone if you later split it (set `VITE_API_URL`) — but then it's two deploys, CORS config, and cross-origin cookies: strictly more work for zero benefit here. **Any long-lived Node host beats it for this app.**

---

## 12. Local vs deployed quick reference

| Task | Local (for the video) | Deployed |
|---|---|---|
| Start | `start_all.bat` | Render dashboard (auto on push) |
| Stop | `start_all.bat --stop` | Render → Stop (data wiped on free) |
| Test | `start_all.bat --test` → 30/30 | `node scripts/smoke-test.mjs https://<app>.onrender.com` |
| Logs | `OUBOX_LAB_ASSISGNMENT/logs/server.log` | Render → Logs |
| Env vars | `.env` (from `.env.example`) | Render → Environment |
| Data | `data/db.json` (persistent) | ephemeral on free / disk on paid |
| SMTP | works (Ethereal) | paid only (free blocks SMTP) |

---

*Verified 2026-10-08: production boot on `:3000` (health OK, `/` and `/login` → 200, bundle served), `PORT=4567` honoured, `DATA_DIR` honoured, `start_all.bat --test` → 30/30, `npm run lint` clean.*
