# UNIFICATION.md — Frontend ↔ Backend Contract

> This is the **single source of truth** for how the frontend and backend communicate.
> Any change to an API shape, auth flow, or data contract must be updated here first.

## Table of Contents
1. [Project Layout (Monorepo)](#1-project-layout-monorepo)
2. [Running Everything Together](#2-running-everything-together)
3. [Auth Contract](#3-auth-contract)
4. [API Contract — Every Endpoint](#4-api-contract--every-endpoint)
5. [Cookie & Session Flow](#5-cookie--session-flow)
6. [CORS Config](#6-cors-config)
7. [Shared Types Reference](#7-shared-types-reference)
8. [Error Shape Contract](#8-error-shape-contract)
9. [OAuth Redirect Flow (End-to-End)](#9-oauth-redirect-flow-end-to-end)
10. [Frontend → Backend Data Flow Per Feature](#10-frontend--backend-data-flow-per-feature)
11. [Environment Variable Pairing](#11-environment-variable-pairing)
12. [Docker Compose (Full Stack)](#12-docker-compose-full-stack)
13. [Common Integration Pitfalls](#13-common-integration-pitfalls)
14. [Development Checklist](#14-development-checklist)

---

## 1. Project Layout (Monorepo)

```
reachinbox-scheduler/
├── frontend/          ← React.js + Vite + TypeScript
├── backend/           ← Express.js + TypeScript
├── docker-compose.yml ← Redis + Elasticsearch
└── README.md
```

Both `frontend/` and `backend/` are independent Node.js packages with their own `package.json`. They share no code directly — communication is **exclusively via HTTP REST APIs**.

---

## 2. Running Everything Together

### Step 1 — Start infrastructure
```bash
docker-compose up -d    # starts Redis (:6379) + Elasticsearch (:9200)
```

### Step 2 — Start backend
```bash
cd backend
cp .env.example .env    # fill in all values
npm install
npm run db:migrate      # creates tables in NeonDB
npm run dev             # starts on :4000
```

### Step 3 — Start frontend
```bash
cd frontend
cp .env.example .env    # VITE_API_URL=http://localhost:4000
npm install
npm run dev             # starts on :5173
```

### Step 4 — Open
```
http://localhost:5173   ← React app
http://localhost:4000/api/admin/queues  ← BullMQ dashboard
```

---

## 3. Auth Contract

### How auth works end-to-end:

```
Browser                  Frontend (React)          Backend (Express)
   │                          │                          │
   │ opens :5173/login        │                          │
   │─────────────────────────►│                          │
   │                          │                          │
   │ clicks "Sign in"         │                          │
   │─────────────────────────►│                          │
   │ redirect to              │                          │
   │ :4000/api/auth/google ───────────────────────────► │
   │                                                     │ Passport → Google
   │◄────────────────────────────────────────────────────│ callback
   │ cookie: connect.sid set                             │
   │ redirect to :5173/       │                          │
   │─────────────────────────►│                          │
   │                          │ GET /api/auth/me ───────►│
   │                          │◄─────────── { user } ───│
   │                          │ render dashboard         │
```

### Key points:
- Auth is **cookie-based** (`connect.sid` session cookie), NOT JWT
- Frontend uses `withCredentials: true` on every Axios request
- `GET /api/auth/me` is called on every app load to check session status
- On 401 from any endpoint → frontend redirects to `/login`
- Google OAuth is a **full-page redirect**, not a popup or fetch

---

## 4. API Contract — Every Endpoint

All endpoints:
- Base URL: `http://localhost:4000` (dev) / `https://your-domain.com` (prod)
- All request bodies: `Content-Type: application/json`
- All responses: `Content-Type: application/json`
- Auth required unless noted

---

### 4.1 `GET /api/auth/google`
**Auth:** No  
**Description:** Initiates Google OAuth. Browser is redirected to Google.  
**Frontend calls:** `window.location.href = \`${VITE_API_URL}/api/auth/google\``  

---

### 4.2 `GET /api/auth/google/callback`
**Auth:** No (handled by Passport)  
**Description:** Google redirects here after approval.  
**Backend behavior:** Upserts user → sets session → redirects to `${FRONTEND_URL}/`  
**Frontend:** Never calls this directly. Just receives the redirect.  

---

### 4.3 `GET /api/auth/me`
**Auth:** Required (session cookie)  
**Response 200:**
```json
{
  "id": "uuid",
  "email": "user@gmail.com",
  "name": "John Doe",
  "avatarUrl": "https://lh3.googleusercontent.com/...",
  "slackConnected": false
}
```
**Response 401:** `{ "error": "Unauthorized" }`  
**Frontend usage:** Called in `AuthContext` on mount.  

---

### 4.4 `POST /api/auth/logout`
**Auth:** Required  
**Body:** None  
**Response 200:** `{ "ok": true }`  
**Frontend:** Clears AuthContext user → redirects to `/login`  

---

### 4.5 `POST /api/emails/schedule`
**Auth:** Required  
**Request Body:**
```json
{
  "subject":      "string (min 3)",
  "body":         "string (min 10)",
  "leads":        ["email@example.com", "..."],
  "startTime":    "2024-10-10T14:00:00.000Z",
  "delaySeconds": 2,
  "hourlyLimit":  100
}
```
**Response 201:**
```json
{
  "campaignId":     "550e8400-e29b-41d4-a716-446655440000",
  "totalScheduled": 143
}
```
**Response 400 (validation fail):**
```json
{
  "error": {
    "fieldErrors": {
      "subject": ["Required"],
      "leads":   ["Must have at least 1 valid email"]
    }
  }
}
```
**Frontend behavior on success:** Close modal + `toast.success('143 emails scheduled!')` + refetch scheduled table.  

---

### 4.6 `GET /api/emails/scheduled`
**Auth:** Required  
**Query params:** `?page=1&limit=20`  
**Response 200:**
```json
{
  "data": [
    {
      "id":                 "uuid",
      "campaignId":         "uuid",
      "recipientEmail":     "lead@example.com",
      "subject":            "Q4 Outreach",
      "senderEmail":        "test@ethereal.email",
      "status":             "scheduled",
      "scheduledAt":        "2024-10-10T14:00:00.000Z",
      "sentAt":             null,
      "etherealPreviewUrl": null
    }
  ],
  "total":  143,
  "page":   1,
  "limit":  20
}
```
**Frontend:** Displayed in "Scheduled Emails" tab. Polls every 10 seconds.  

---

### 4.7 `GET /api/emails/sent`
**Auth:** Required  
**Query params:** `?page=1&limit=20`  
**Response 200:** Same shape as scheduled but `status = 'sent'` and `sentAt` is populated.  
**Frontend:** Displayed in "Sent Emails" tab.  

---

### 4.8 `GET /api/emails/search`
**Auth:** Required  
**Query params:** `?q=outreach`  
**Response 200:**
```json
[
  {
    "jobId":          "uuid",
    "recipientEmail": "lead@example.com",
    "subject":        "Q4 Outreach",
    "senderEmail":    "sender@ethereal.email",
    "status":         "sent",
    "sentAt":         "2024-10-10T14:00:00.000Z"
  }
]
```

---

### 4.9 `GET /api/slack/status`
**Auth:** Required  
**Response 200:** `{ "connected": true }`  

---

### 4.10 `GET /api/slack/authorize`
**Auth:** Required  
**Description:** Redirects browser to Slack OAuth consent screen.  
**Frontend calls:** `window.location.href = \`${VITE_API_URL}/api/slack/authorize\``  

---

### 4.11 `GET /api/slack/callback`
**Auth:** No (Slack redirects here)  
**Query:** `?code=...&state=userId`  
**Backend:** Exchanges code for token → stores in DB → redirects to `${FRONTEND_URL}/?slack_connected=true`  
**Frontend:** Listens for `?slack_connected=true` query param on mount → shows success toast → refetches user.  

---

### 4.12 `DELETE /api/slack/disconnect`
**Auth:** Required  
**Response 200:** `{ "ok": true }`  
**Frontend:** Refetches `/api/auth/me` to update `slackConnected` flag.  

---

## 5. Cookie & Session Flow

```
Backend sets:
  Set-Cookie: connect.sid=s%3A...; Path=/; HttpOnly; SameSite=Lax

Frontend must:
  axios.defaults.withCredentials = true
  (or per-request: { withCredentials: true })

For production (different domains):
  Cookie: SameSite=None; Secure
  CORS: credentials: true + explicit origin
```

**express-session config:**
```ts
cookie: {
  secure:   process.env.NODE_ENV === 'production',  // HTTPS only in prod
  httpOnly: true,
  sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
  maxAge:   7 * 24 * 60 * 60 * 1000,
}
```

---

## 6. CORS Config

```ts
// backend/src/app.ts
import cors from 'cors'

app.use(cors({
  origin:      env.FRONTEND_URL,    // 'http://localhost:5173' in dev
  credentials: true,                // REQUIRED for cookies
  methods:     ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}))
```

**Frontend `.env`:**
```env
VITE_API_URL=http://localhost:4000
```

**If they run on the same domain in production**, set:
```ts
origin: 'https://your-production-domain.com'
```

---

## 7. Shared Types Reference

These types are used identically on both sides. Frontend imports from `src/types/index.ts`, backend from `src/types/index.ts`. They are NOT shared via a package — just kept in sync manually.

```ts
// Shared type definitions (keep in sync):

interface User {
  id: string
  email: string
  name: string
  avatarUrl: string | null
  slackConnected: boolean
}

interface EmailJob {
  id: string
  campaignId: string
  recipientEmail: string
  subject: string
  senderEmail: string
  status: 'scheduled' | 'sent' | 'failed' | 'rate_limited'
  scheduledAt: string        // ISO 8601
  sentAt: string | null
  etherealPreviewUrl: string | null
}

interface PaginatedResponse<T> {
  data: T[]
  total: number
  page: number
  limit: number
}

interface SchedulePayload {
  subject: string
  body: string
  leads: string[]
  startTime: string          // ISO 8601
  delaySeconds: number
  hourlyLimit: number
}

interface ScheduleResponse {
  campaignId: string
  totalScheduled: number
}
```

---

## 8. Error Shape Contract

All API errors return this shape:
```json
{
  "error": "Human-readable message"
}
```

Validation errors (400):
```json
{
  "error": {
    "fieldErrors": { "fieldName": ["message"] },
    "formErrors":  []
  }
}
```

**Frontend handles errors like this:**
```ts
try {
  await scheduleEmails(payload)
  toast.success('Campaign scheduled!')
} catch (err) {
  if (axios.isAxiosError(err)) {
    const msg = err.response?.data?.error
    if (typeof msg === 'string') {
      toast.error(msg)
    } else {
      toast.error('Something went wrong. Please try again.')
    }
  }
}
```

---

## 9. OAuth Redirect Flow (End-to-End)

### Google OAuth

```
1. User on /login clicks "Sign in with Google"
   → window.location.href = 'http://localhost:4000/api/auth/google'

2. Passport redirects to:
   https://accounts.google.com/o/oauth2/auth?client_id=...

3. User approves → Google redirects to:
   http://localhost:4000/api/auth/google/callback?code=...

4. Backend: exchanges code, upserts user, sets session cookie
   → res.redirect('http://localhost:5173/')

5. React app loads, AuthContext calls GET /api/auth/me
   → returns user → renders dashboard
```

### Slack OAuth

```
1. User clicks "Connect Slack" in header
   → window.location.href = 'http://localhost:4000/api/slack/authorize'

2. Backend redirects to:
   https://slack.com/oauth/v2/authorize?client_id=...&state=userId

3. User approves → Slack redirects to:
   http://localhost:4000/api/slack/callback?code=...&state=userId

4. Backend: exchanges code → stores token → redirect to:
   http://localhost:5173/?slack_connected=true

5. React app detects ?slack_connected=true in URL
   → shows toast "Slack connected!"
   → refetches /api/auth/me → slackConnected: true
   → clears query param from URL
```

---

## 10. Frontend → Backend Data Flow Per Feature

### Feature: Schedule a Campaign

```
1. User fills ComposeModal
2. CSVUploader parses file → array of email strings
3. Form validation (zod) passes
4. onClick "Schedule Campaign":
   a. setIsSubmitting(true)
   b. POST /api/emails/schedule { subject, body, leads, startTime, delaySeconds, hourlyLimit }
   c. Response: { campaignId, totalScheduled }
   d. toast.success(`${totalScheduled} emails scheduled!`)
   e. onClose() — closes modal
   f. queryClient.invalidateQueries(['emails', 'scheduled'])
   g. setIsSubmitting(false)
```

### Feature: View Scheduled Emails

```
1. User opens dashboard / switches to "Scheduled" tab
2. useScheduledEmails(page=1) hook fires
3. GET /api/emails/scheduled?page=1&limit=20
4. Loading state: show 5 skeleton rows
5. Data arrives: render table rows with status badges
6. Auto-refetch every 10 seconds (TanStack Query refetchInterval)
7. Status badge updates in real time as worker processes jobs
```

### Feature: View Sent Emails

```
1. User clicks "Sent" tab
2. useSentEmails(page=1) fires
3. GET /api/emails/sent?page=1&limit=20
4. Same loading/empty states
5. "Preview" column shows link to ethereal.email preview URL
```

### Feature: Slack Rate Limit Notification

```
1. BullMQ worker hits rate limit for a sender
2. RateLimitService.checkAndIncrement() returns { allowed: false }
3. Worker calls SlackService.notifyRateLimitHit(userId, senderEmail)
4. SlackService looks up user's slackAccessToken + slackChannelId from DB
5. If token exists: sends message to Slack channel
6. If no token: silently returns (no error)
7. User receives Slack message:
   "⚠️ Rate limit hit for sender test@ethereal.email.
    Emails are being delayed to the next hour window."
```

---

## 11. Environment Variable Pairing

Every variable that must match between frontend and backend:

| Backend `.env` | Frontend `.env` | Purpose |
|---|---|---|
| `PORT=4000` | `VITE_API_URL=http://localhost:4000` | Frontend must know backend port |
| `FRONTEND_URL=http://localhost:5173` | *(used only in backend)* | Backend redirects to this after OAuth |
| `GOOGLE_CALLBACK_URL=http://localhost:4000/api/auth/google/callback` | `VITE_GOOGLE_CLIENT_ID=...` | Must match Google Console |
| `SLACK_REDIRECT_URI=http://localhost:4000/api/slack/callback` | *(backend only)* | Must match Slack App config |

**Google Console setup:**
- Authorized JavaScript origins: `http://localhost:5173`
- Authorized redirect URIs: `http://localhost:4000/api/auth/google/callback`

**Slack App setup:**
- Redirect URL: `http://localhost:4000/api/slack/callback`
- Bot Token Scopes: `chat:write`, `incoming-webhook`

---

## 12. Docker Compose (Full Stack)

```yaml
# docker-compose.yml
version: '3.9'

services:
  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    command: redis-server --appendonly yes
    volumes:
      - redis_data:/data

  elasticsearch:
    image: docker.elastic.co/elasticsearch/elasticsearch:8.12.0
    environment:
      - discovery.type=single-node
      - xpack.security.enabled=false
      - "ES_JAVA_OPTS=-Xms512m -Xmx512m"
    ports:
      - "9200:9200"
    volumes:
      - es_data:/usr/share/elasticsearch/data

volumes:
  redis_data:
  es_data:
```

**NeonDB** runs in the cloud — no Docker needed for it. Just set `DATABASE_URL` in `.env`.

---

## 13. Common Integration Pitfalls

| Problem | Cause | Fix |
|---|---|---|
| `401 Unauthorized` on every request after login | Missing `withCredentials: true` on Axios | Set globally: `axios.defaults.withCredentials = true` |
| CORS error on preflight | Backend CORS missing `credentials: true` or wrong `origin` | Set `credentials: true` + exact `origin` in backend CORS config |
| Google OAuth redirects to blank page | `FRONTEND_URL` in backend `.env` wrong | Set to `http://localhost:5173` exactly |
| Session lost on backend restart | Session store is in-memory (default) | Use `connect-redis` so sessions survive restarts |
| `SameSite` cookie blocked | Default `SameSite=Strict` blocks cross-origin cookie | Set `sameSite: 'lax'` in dev, `'none'` + `secure: true` in prod |
| BullMQ jobs duplicated after restart | Not using `jobId` in queue.add | Always pass `jobId: idempotencyKey` |
| Slack notification crashes app | Token not stored but code tries to use it | Check `if (!user.slackAccessToken) return` before sending |
| `leads` array is empty despite CSV upload | CSV parsing returns empty | Use PapaParse with `header: false`, flatten all values, filter valid emails with regex |
| Scheduled time in the past | User selected past date in `datetime-local` | Frontend validates: `startTime > Date.now()` |
| Rate limit counter wrong across workers | In-memory counter | Always use Redis `INCR` — never in-memory for rate limits |

---

## 14. Development Checklist

### Backend
- [ ] `npm run db:migrate` ran successfully → tables exist in NeonDB
- [ ] Redis container is running (`docker-compose up redis`)
- [ ] `GET /api/auth/me` returns 401 (not 500) when not logged in
- [ ] Google OAuth `.env` values match Google Console exactly
- [ ] `POST /api/emails/schedule` returns 201 with campaignId
- [ ] BullMQ Bull-Board visible at `/api/admin/queues`
- [ ] Worker sends email and updates DB status to 'sent'
- [ ] Ethereal preview URL stored in DB after send
- [ ] Rate limit Redis key visible: `redis-cli KEYS "rate_limit:*"`
- [ ] Restart server → pending jobs still fire at correct time
- [ ] Slack connect flow completes and token stored in DB
- [ ] Slack notification fires on rate limit hit

### Frontend
- [ ] `VITE_API_URL` set to `http://localhost:4000`
- [ ] Login page renders at `/login` — no flash of dashboard
- [ ] Google OAuth button does full-page redirect (not fetch)
- [ ] After OAuth, `GET /api/auth/me` returns user
- [ ] User name, email, avatar shown in header
- [ ] Logout clears session and redirects to `/login`
- [ ] Compose modal opens/closes correctly
- [ ] CSV upload shows correct lead count
- [ ] Submit schedules campaign and shows success toast
- [ ] Scheduled table populates after scheduling
- [ ] Status badges update as worker sends emails
- [ ] Sent table shows sent emails with preview links
- [ ] Slack "Connect" button redirects to Slack OAuth
- [ ] `?slack_connected=true` shows success toast on return
- [ ] All API errors show user-facing toast message
- [ ] Empty states shown when no data
- [ ] Loading skeletons shown while fetching