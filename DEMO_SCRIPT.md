# DEMO_SCRIPT.md — 5-Minute Demo Video Script (ReachInbox Email Job Scheduler)

> **Purpose:** a shot-by-shot, timed recording script for the assignment demo video (**max 5 minutes**).
> Every command, button label, log line, and expected output below was **rehearsed live on this machine** (2026-10-08) — they are not guesses.
>
> **Companion doc:** `ASSUMPTIONS.md` (assumptions, shortcuts, trade-offs — assignment item #5).

**Total runtime: 4:55** · Scenes: 8 · Single screen recording, voice-over optional (on-screen captions provided).

---

## 0. What the video must prove (assignment checklist)

| # | Requirement | Scene |
|---|---|---|
| 1 | Create scheduled emails (frontend **or** Postman) | Scene 3 (frontend) + Scene 4 (API/Postman) |
| 2 | Dashboard showing **Scheduled** and **Sent** emails | Scene 5 |
| 3 | **Restart:** stop server → start again → future emails still send | Scene 6 |
| 4 | *(Bonus)* rate limiting / delay behaviour under load | Scene 7 |
| 5 | Real mail delivery via fake SMTP (Ethereal) with openable previews | Scene 5 |
| 6 | Assumptions / shortcuts / trade-offs noted | `ASSUMPTIONS.md` (say its name in Scene 8) |

---

## 1. Pre-flight (do **before** you hit record — not part of the 5 minutes)

```bat
cd C:\INTERNSHIP_TASK\TASK32
start_all.bat --stop          :: make sure nothing is running
start_all.bat --test --no-browser   :: boot + 30-check E2E suite must print "30 passed, 0 failed"
```

Then reset to a clean dashboard (wipe old campaigns so the video is easy to follow):

1. Open `http://localhost:3000` → **Enter Dashboard Directly →** (demo login).
2. **Queue** tab → bottom of *Hourly Sender Counters* card → **Reset DB** (label: *"Clear all records & reset"*) → confirm the browser prompt.
3. `start_all.bat --stop` then `start_all.bat --no-browser` — *this restart empties the in-memory queue too*, so the dashboard shows a clean slate and the recovery line prints `Restored 0 pending jobs`.

**Window layout for recording**

| Window | Where |
|---|---|
| Terminal A | `C:\INTERNSHIP_TASK\TASK32` — for `start_all.bat` commands |
| Terminal B (optional) | `curl` fallback commands (Appendix A) |
| Browser | `http://localhost:3000` (Chrome/Edge, ~1280×720, zoom 100 %) |
| Postman (optional) | only if you record Scene 4 from Postman instead of curl |

**Sanity check:** `curl http://127.0.0.1:3000/api/health` → `{"status":"ok",...}`
(Use `127.0.0.1`, not `localhost` — see Appendix B.)

---

## 2. The timeline

> **Recording tip:** keep the timer visible. If a scene runs long, trim the narration, not the actions.

| Scene | Time | What the viewer sees | What you say (voice-over) |
|---|---|---|---|
| 1 | 0:00–0:30 | Stack boot in terminal | intro |
| 2 | 0:30–0:55 | Login + dashboard shell | architecture one-liner |
| 3 | 0:55–1:55 | Compose + schedule a campaign | scheduling flow |
| 4 | 1:55–2:25 | Postman/curl creating the same campaign | API contract |
| 5 | 2:25–3:20 | Scheduled → Sent + Ethereal preview | real SMTP delivery |
| 6 | 3:20–4:20 | Stop → start → recovery → sends resume | restart survival |
| 7 | 4:20–4:50 | Rate limit under load + Slack alert | rate limiting |
| 8 | 4:50–4:55 | Wrap-up | where the docs are |

---

### Scene 1 — 0:00–0:30 — Boot the stack
**Actions**
```bat
cd C:\INTERNSHIP_TASK\TASK32
start_all.bat --no-browser
```
**Screen (exact output):**
```
 [1/5] Node.js v22.17.0 found
 [2/5] Dependencies already installed - skipping npm install
 [3/5] Starting server (API + queue worker + web UI) on port 3000...
 [4/5] Waiting for http://127.0.0.1:3000/api/health ...
 [5/5] Backend is UP and healthy.
```
**Say:** *"One command starts everything — Express API, the delayed job queue with its worker, and the React dashboard — all on port 3000."*
**Caption:** `start_all.bat → API + Queue Worker + UI on :3000`

---

### Scene 2 — 0:30–0:55 — Login + dashboard
**Actions**
1. Browser → `http://localhost:3000` → lands on the login screen.
2. Show both options, then click **Enter Dashboard Directly →** (demo session).
3. Point at the header tabs: **Scheduled · Sent · Queue · Slack**, the **Compose Campaign** button, and your user chip.

**Say:** *"Cookie-based session — no JWT. Every protected endpoint returns 401 without it. The dashboard has four tabs: Scheduled, Sent, Queue, Slack."*
**Caption:** `session cookie reachinbox_uid · /api/auth/me · 401 without session`
**Expected:** dashboard renders, tables show empty states (post-reset), count pills hidden at 0.

---

### Scene 3 — 0:55–1:55 — Create scheduled emails (frontend)
**Actions**
1. Click **Compose Campaign** → modal *"Schedule New Email Campaign"* opens (values are pre-filled).
2. Walk the fields (hover, don't retype everything):
   - **Sender Email (Ethereal):** `outreach@reachinbox.test`
   - **Subject Line:** keep default (`Q4 Enterprise Cold Outreach & Partnership`) or type `Demo Campaign — Scene 3`
   - **Email Body:** leave the default HTML body
   - **Recipient Leads:** click **Reset to 10 Sample Leads** → badge *"10 valid email addresses queued"*
   - **Start Time:** `Send Immediately`
   - **Delay Between Emails (sec):** `2`
   - **Hourly Sender Limit:** `100`
3. Click **Schedule Campaign →**.
4. Modal closes, green toast: **`Campaign scheduled! 10 emails added to queue.`**
5. Stay on the **Scheduled** tab — the 10 rows appear with status `Scheduled`; the table auto-polls every 4 s and rows flip to `Sent` one by one (staggered 2 s apart).

**Say:** *"Subject, body, CSV or pasted leads, start time, per-email delay and hourly limit — the backend creates one job per lead, staggered by delay × index, and the dashboard polls so you watch statuses flip live."*
**Caption:** `POST /api/emails/schedule → 201 {campaignId, totalScheduled}`

---

### Scene 4 — 1:55–2:25 — Same thing from Postman / curl (API path)
**Show ONE of the two options below (≈30 s).**

**Option A — Postman**
1. `POST http://localhost:3000/api/auth/demo-login` (JSON body below) → sends the session cookie (Postman → Settings → * Automatically follow redirects * + cookies enabled).
2. `POST http://localhost:3000/api/emails/schedule` with the body from **Appendix A** →
   ```json
   { "success": true, "campaignId": "cmp_1791445010400_stnn", "totalScheduled": 4, ... }
   ```
   HTTP **201**.

**Option B — curl (terminal)**
```bat
curl -s -c cookies.txt -X POST http://localhost:3000/api/auth/demo-login -H "Content-Type: application/json" -d "{\"email\":\"demo@reachinbox.ai\",\"name\":\"Demo Engineer\"}"
curl -s -b cookies.txt -X POST http://localhost:3000/api/emails/schedule -H "Content-Type: application/json" -d @schedule.json
```

**Say:** *"The UI is just a client — here is the documented REST contract: login issues a session cookie, schedule returns 201 with a campaign id. Validation failures return 400 `{error}`."*
**Caption:** `UNIFY.MD §4 — same contract for any client`

---

### Scene 5 — 2:25–3:20 — Dashboard: Scheduled & Sent + real Ethereal mail
**Actions**
1. **Scheduled tab:** point at columns — Recipient, Subject, Status badge `Scheduled`, **Scheduled For** time. Let ~6–8 rows flip to sent (polling visible).
2. **Sent tab:** rows now show `Sent` with a `sentAt` timestamp and a **View Web Preview** button.
3. Click **View Web Preview** on any row → new tab opens `https://ethereal.email/message/<id>` → **the actual delivered email** (recipient + subject + body visible).
4. Back in the app, use the search box (`Search recipient, subject, campaign, or match keyword...`) → type part of the subject → results with match chips.

**Say:** *"Delivery is real SMTP — Nodemailer against an auto-created Ethereal test account, so every sent row has a public preview URL you can open. That's an actual received message, not a mock."*
**Caption:** `Ethereal SMTP (smtp.ethereal.email) · preview URL stored per job`
**Expected:** preview page HTTP 200 containing the exact recipient and subject (verified).

---

### Scene 6 — 3:20–4:20 — **Restart scenario** (the important one)
**Actions (timed precisely)**
1. **Compose Campaign** again: keep the pre-filled **10 Sample Leads**, set **Delay Between Emails = 5**, **Start Time = Send Immediately**, submit.
   → caption: *"10 emails, one every 5 s — plenty of pending work left."*
2. Watch the **Scheduled** tab until the **first 1–2 emails turn `Sent`** (~5–8 s), then immediately switch to the terminal:
   ```bat
   start_all.bat --stop
   ```
   → ` Stopping ReachInbox server...` / `PORT 3000 free` (you may show `netstat` or just the absence of the health URL).
3. Keep it **down ~10 seconds** (say: *"the process is dead — the in-memory queue is gone"*).
4. ```bat
   start_all.bat --no-browser
   ```
   → `[5/5] Backend is UP and healthy.`
5. Back to the browser → **Queue** tab → right-hand column **Live Queue Event Stream** shows:
   ```
   [Recovery] Starting boot-time job recovery scan...
   [Recovery] Restored N pending jobs from persistent database into the queue.
   ```
   (`N` = the jobs that had not sent yet — was `5` in the rehearsal when the server died before the first send.)
6. Stay on the **Scheduled** tab: the remaining jobs deliver at their scheduled times → all rows end `Sent`, and the **Sent** tab shows fresh Ethereal previews.

**Say:** *"Jobs live in a durable store, not memory. On boot the recovery scan re-enqueues every pending job, honouring its original schedule — past-due ones fire immediately, future ones keep their timer. No cron, no duplicates: idempotency keys make re-enqueue a no-op if the job already exists."*
**Caption:** `data/db.json (atomic write) → recoverPendingJobs() at boot + 60 s orphan sweeper`
**Expected (from the live rehearsal):**
```
2026-10-08T07:37:33.820Z [Recovery] Restored 5 pending jobs from persistent database into the queue.
```
…then the past-due jobs fired immediately after boot, the rest at their original scheduled times — every row ending `Sent`, each with a fresh Ethereal preview URL.

---

### Scene 7 — 4:20–4:50 — Bonus: rate limiting / delay under load
**Actions**
1. **Queue** tab → click **Test Rate Limit & Slack** (creates 6 leads with a strict **2/hour** limit, 1 s apart).
2. Immediately show the metric cards: **Delivered (Sent)** climbs to 2, then freezes; **Rate Limited** goes to 4.
3. **Scheduled** tab: leads 3–6 show the amber **Rate Limited** badge; hover the error text:
   `Hourly rate limit (2/hr) reached for stress-test@reachinbox.test. Deferred until 2026-10-08T08:...`
4. Back to **Queue** tab:
   - **Hourly Sender Counters (Redis)** card → `stress-test@reachinbox.test → 2` (exactly the cap; over-limit increments are rolled back)
   - Live log: `[RateLimit] Sender stress-test@reachinbox.test exceeded limit (2/hr). Deferred job to 1:30:02 pm.`
5. **Slack** tab → the alert feed shows the 🚨 rate-limit alert (sender, limit, next window).

**Say:** *"Under load the per-sender hourly counter is checked atomically before every send. Two go out, the third hits the cap: the increment rolls back, the job is deferred to the next hour window, and a de-duplicated Slack alert fires — one per sender per hour. The global throughput limiter and concurrency cap keep the burst smooth."*
**Caption:** `rate_limit:{sender}:{Y-M-D-H} · rollback on failure · defer + Slack alert`
**Note:** the deferred jobs wait until the next hour — that is the designed behaviour, so don't wait for them in the video.

---

### Scene 8 — 4:50–4:55 — Wrap-up
**Actions:** show the repo root files: `README.md` · `audit.md` · `ASSUMPTIONS.md` · `DEMO_SCRIPT.md` (this file).

**Say:** *"Full conformance audit in audit.md, assumptions and trade-offs in ASSUMPTIONS.md — including why the queue is in-process here (no Docker/Redis 6+) and the exact swap points for BullMQ, Redis, NeonDB and Elasticsearch."*
**Caption:** `30/30 E2E checks · start_all.bat --test`

---

## 3. Post-recording

```bat
start_all.bat --stop
```
Optional: `start_all.bat --test --no-browser` to leave the repo proven green (30 passed, 0 failed).

---

## Appendix A — Copy-paste requests (Postman / curl)

**1) Login (session cookie)**
```
POST http://localhost:3000/api/auth/demo-login
Content-Type: application/json

{ "email": "demo@reachinbox.ai", "name": "Demo Engineer" }
```

**2) Schedule a campaign**
```
POST http://localhost:3000/api/emails/schedule
Content-Type: application/json
Cookie: reachinbox_uid=<value from login>

{
  "subject": "Scene 4 — API-created campaign",
  "body": "<p>Scheduled through the documented REST contract.</p>",
  "leads": [
    "ada.api@example.com", "bravo.api@example.com",
    "cleo.api@example.com", "dario.api@example.com"
  ],
  "startTime": "<ISO now+30s>",
  "delaySeconds": 5,
  "hourlyLimit": 100,
  "senderEmail": "api-demo@reachinbox.test"
}
```
**201 response (verified):**
```json
{ "success": true, "campaignId": "cmp_1791445010400_stnn", "totalScheduled": 4,
  "startTime": "...", "delaySeconds": 5, "hourlyLimit": 100 }
```

**3) Read the tables**
```
GET http://localhost:3000/api/emails/scheduled?page=1&limit=20   → { data, total, page, limit }
GET http://localhost:3000/api/emails/sent?page=1&limit=20        → same shape, status "sent"
GET http://localhost:3000/api/admin/queues                       → stats + logs + alerts
```

**curl variant (Windows, cookie jar):**
```bat
curl -s -c cookies.txt -X POST http://localhost:3000/api/auth/demo-login -H "Content-Type: application/json" -d "{\"email\":\"demo@reachinbox.ai\",\"name\":\"Demo Engineer\"}"
curl -s -b cookies.txt -X POST http://localhost:3000/api/emails/schedule -H "Content-Type: application/json" -d "{\"subject\":\"API campaign\",\"body\":\"Hello from curl\",\"leads\":[\"a@example.com\",\"b@example.com\"],\"startTime\":\"2026-10-08T12:00:00.000Z\",\"delaySeconds\":5,\"hourlyLimit\":100}"
```

**One-shot Postman-free alternative:** the **Queue** tab also has **Seed Demo (10 Leads)** — a single click that schedules a realistic campaign.

---

## Appendix B — Gotchas (learned during rehearsal)

| Trap | What happens | Fix |
|---|---|---|
| Health probe on `localhost` | resolves to `::1` first → ~2.2 s stall → 2 s timeout → launcher kills a *healthy* server | probe `127.0.0.1` (already done in `start_all.bat`) |
| `curl` without login | `401 {"error":"Unauthorized"}` on every emails endpoint | login first, pass the cookie (`-b cookies.txt`) |
| Where is the `[Recovery]` line? | **not** in `logs\server.log` — it is a DB-backed queue log | show the **Queue → Live Queue Event Stream** panel |
| Old backlog in the dashboard | confusing rows during recording | pre-flight reset (§1) |
| Rate-limited jobs "never" send | they are deferred to the **next hour** (+2 s) by design | show the deferral message; don't wait |
| Rate-limit dedupe | one Slack alert per **user + sender + hour**; a second run within the hour shows "duplicate suppressed" in logs | expected — mention it |
| Slack/Google buttons | real OAuth code paths, but fall back to simulated flow without credentials | state it as a documented fallback (`ASSUMPTIONS.md`) |
| Restart timing | keep downtime ≈10 s so post-restart sends stay visibly staggered | Scene 6 timing |
| Preview URL truncated when copy-pasting | 404 on Ethereal | copy the full `etherealPreviewUrl` from the Sent row |

---

## Appendix C — Timing budget (keep yourself honest)

| Scene | Budget | Notes |
|---|---|---|
| 1 Boot | 0:30 | start_all takes ~15–20 s of it |
| 2 Login | 0:25 | |
| 3 Compose | 1:00 | longest scene — don't retype the body |
| 4 API | 0:30 | pick ONE of Postman/curl |
| 5 Scheduled+Sent+Ethereal | 0:55 | allow ~15 s for rows to flip |
| 6 Restart | 1:00 | stop after 1st send, downtime ~10 s |
| 7 Rate limit | 0:30 | button + badges + counter + alert |
| 8 Wrap | 0:05 | |
| **Total** | **4:55** | **≤ 5:00 required** |
