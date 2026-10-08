# ReachInbox Email Job Scheduler — System Design

## Table of Contents
1. [Project Overview](#1-project-overview)
2. [High-Level Architecture](#2-high-level-architecture)
3. [Tech Stack](#3-tech-stack)
4. [Component Breakdown](#4-component-breakdown)
5. [Database Schema](#5-database-schema)
6. [Queue Architecture (BullMQ + Redis)](#6-queue-architecture-bullmq--redis)
7. [Rate Limiting Strategy](#7-rate-limiting-strategy)
8. [Persistence & Restart Survival](#8-persistence--restart-survival)
9. [Idempotency](#9-idempotency)
10. [Slack OAuth Integration](#10-slack-oauth-integration)
11. [Google OAuth Integration](#11-google-oauth-integration)
12. [Elasticsearch Integration](#12-elasticsearch-integration)
13. [API Contract Overview](#13-api-contract-overview)
14. [Folder Structure](#14-folder-structure)
15. [Environment Variables Reference](#15-environment-variables-reference)
16. [Data Flow Diagrams](#16-data-flow-diagrams)
17. [Assumptions & Trade-offs](#17-assumptions--trade-offs)

---

## 1. Project Overview

ReachInbox Email Job Scheduler is a **production-grade, full-stack** system that:
- Accepts bulk email scheduling requests via REST APIs
- Persists jobs in **NeonDB (PostgreSQL)** and schedules them with **BullMQ + Redis**
- Sends emails through **Ethereal Email** (fake SMTP)
- Enforces **per-sender hourly rate limits** backed by Redis counters
- Notifies connected Slack workspaces when a rate limit is hit
- Exposes a **React.js dashboard** for scheduling, viewing, and monitoring emails
- Survives server restarts — jobs are never lost or re-queued from scratch

---

## 2. High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                        CLIENT (React.js)                            │
│   Google OAuth Login │ Dashboard │ Compose Modal │ Email Tables     │
└──────────────────────────────┬──────────────────────────────────────┘
                               │ HTTPS / REST
┌──────────────────────────────▼──────────────────────────────────────┐
│                     BACKEND (Express.js + TypeScript)               │
│                                                                     │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────────┐  │
│  │  Auth Router │  │ Email Router │  │  Slack OAuth Router      │  │
│  │ (Google OAuth│  │ (Schedule /  │  │  (Connect / Callback /   │  │
│  │  + Sessions) │  │  List / Send)│  │   Disconnect)            │  │
│  └──────┬───────┘  └──────┬───────┘  └──────────────────────────┘  │
│         │                 │                                         │
│  ┌──────▼─────────────────▼───────────────────────────────────────┐ │
│  │               Service Layer                                     │ │
│  │  EmailService │ SchedulerService │ RateLimitService             │ │
│  │  SlackService │ ElasticsearchService                            │ │
│  └──────┬────────────────────┬──────────────────────┬─────────────┘ │
│         │                    │                      │               │
│  ┌──────▼──────┐   ┌─────────▼────────┐   ┌────────▼────────────┐  │
│  │  NeonDB     │   │  BullMQ Queues   │   │  Elasticsearch      │  │
│  │ (PostgreSQL)│   │  + Redis         │   │  (Search Index)     │  │
│  └─────────────┘   └─────────┬────────┘   └─────────────────────┘  │
│                               │                                     │
│                    ┌──────────▼──────────┐                          │
│                    │   BullMQ Worker(s)  │                          │
│                    │  (Email Processor)  │                          │
│                    └──────────┬──────────┘                          │
│                               │                                     │
│                    ┌──────────▼──────────┐                          │
│                    │  Ethereal SMTP      │                          │
│                    │  (Nodemailer)       │                          │
│                    └─────────────────────┘                          │
└─────────────────────────────────────────────────────────────────────┘
                               │
                    ┌──────────▼──────────┐
                    │   Slack API         │
                    │  (Rate Limit Alerts)│
                    └─────────────────────┘
```

---

## 3. Tech Stack

| Layer | Technology | Reason |
|---|---|---|
| **Frontend** | React.js (Vite) + TypeScript | Fast dev, component reuse |
| **Styling** | Tailwind CSS | Rapid UI, utility-first |
| **Backend** | Express.js + TypeScript | Lightweight, well-known |
| **Database** | NeonDB (PostgreSQL via `pg` + Drizzle ORM) | Serverless Postgres, free tier, persistent |
| **Queue** | BullMQ | Redis-backed, delayed jobs, no cron |
| **Cache / Queue Store** | Redis (Upstash or Docker) | BullMQ requires Redis; also used for rate limit counters |
| **SMTP** | Ethereal Email + Nodemailer | Fake SMTP, no real sending |
| **Search** | Elasticsearch (Docker) | Searchable email index |
| **Auth** | Google OAuth 2.0 (Passport.js) | Required by assignment |
| **Slack** | Slack OAuth + Web API | Real OAuth, live notifications |
| **Queue Dashboard** | BullMQ Board (bull-board) | Real-time queue visibility |
| **Session** | express-session + Redis store | Persistent sessions across restarts |

---

## 4. Component Breakdown

### 4.1 Frontend Components

```
App
├── AuthProvider (Google OAuth context)
├── ProtectedRoute
├── LoginPage
│   └── GoogleOAuthButton
└── Dashboard (/)
    ├── Header (UserAvatar, Name, Email, Logout)
    ├── TabBar (Scheduled | Sent)
    ├── ComposeButton → ComposeModal
    │   ├── SubjectInput
    │   ├── BodyInput
    │   ├── CSVUploader (parse leads count)
    │   ├── ScheduleTimePicker
    │   ├── DelayBetweenEmailsInput
    │   ├── HourlyLimitInput
    │   └── ScheduleButton
    ├── ScheduledEmailsTab
    │   └── EmailTable (loading | empty | rows)
    └── SentEmailsTab
        └── EmailTable (loading | empty | rows)
```

### 4.2 Backend Modules

| Module | Responsibility |
|---|---|
| `routes/auth` | Google OAuth login, callback, session, logout |
| `routes/emails` | Schedule, list scheduled, list sent |
| `routes/slack` | OAuth connect, callback, disconnect |
| `services/EmailService` | Create DB record, enqueue BullMQ job |
| `services/SchedulerService` | Enqueue delayed BullMQ job, recover on restart |
| `services/RateLimitService` | Redis counter per sender per hour window |
| `services/SlackService` | Send Slack message via stored webhook/token |
| `workers/emailWorker` | Process job: check rate limit → send SMTP → update DB → index ES |
| `jobs/recoverPendingJobs` | On startup: re-enqueue jobs that are pending but not yet in Redis |
| `config/bullmq` | Queue, Worker, QueueScheduler setup |
| `config/db` | Drizzle + NeonDB connection |
| `config/redis` | IORedis client instance |
| `config/elasticsearch` | ES client |

---

## 5. Database Schema

### 5.1 `users`
```sql
CREATE TABLE users (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  google_id    VARCHAR(255) UNIQUE NOT NULL,
  email        VARCHAR(255) UNIQUE NOT NULL,
  name         VARCHAR(255),
  avatar_url   TEXT,
  slack_access_token  TEXT,            -- stored after Slack OAuth
  slack_team_id       VARCHAR(255),
  slack_channel_id    VARCHAR(255),
  created_at   TIMESTAMPTZ DEFAULT NOW()
);
```

### 5.2 `email_campaigns`
```sql
CREATE TABLE email_campaigns (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID REFERENCES users(id) ON DELETE CASCADE,
  subject         TEXT NOT NULL,
  body            TEXT NOT NULL,
  sender_email    VARCHAR(255) NOT NULL,   -- Ethereal sender
  start_time      TIMESTAMPTZ NOT NULL,
  delay_seconds   INTEGER NOT NULL DEFAULT 2,
  hourly_limit    INTEGER NOT NULL DEFAULT 100,
  total_leads     INTEGER NOT NULL,
  status          VARCHAR(50) DEFAULT 'pending', -- pending | in_progress | done
  created_at      TIMESTAMPTZ DEFAULT NOW()
);
```

### 5.3 `email_jobs`
```sql
CREATE TABLE email_jobs (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id         UUID REFERENCES email_campaigns(id) ON DELETE CASCADE,
  recipient_email     VARCHAR(255) NOT NULL,
  bullmq_job_id       VARCHAR(255),          -- BullMQ job ID for dedup
  idempotency_key     VARCHAR(512) UNIQUE NOT NULL,  -- campaign_id:recipient_email
  status              VARCHAR(50) DEFAULT 'scheduled', -- scheduled | sent | failed | rate_limited
  scheduled_at        TIMESTAMPTZ NOT NULL,
  sent_at             TIMESTAMPTZ,
  ethereal_preview_url TEXT,
  error_message       TEXT,
  created_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_email_jobs_campaign ON email_jobs(campaign_id);
CREATE INDEX idx_email_jobs_status ON email_jobs(status);
CREATE INDEX idx_email_jobs_scheduled_at ON email_jobs(scheduled_at);
```

---

## 6. Queue Architecture (BullMQ + Redis)

### 6.1 Queue Design

```
emailQueue (BullMQ)
  ├── Delayed Jobs  → jobs scheduled for future timestamps
  ├── Active Jobs   → currently being processed by worker(s)
  ├── Completed     → successfully sent
  └── Failed        → SMTP error or permanent failure
```

### 6.2 Job Payload
```typescript
interface EmailJobPayload {
  emailJobId: string;       // UUID from email_jobs table
  campaignId: string;
  recipientEmail: string;
  subject: string;
  body: string;
  senderEmail: string;
  idempotencyKey: string;
  hourlyLimit: number;
  delaySeconds: number;
}
```

### 6.3 Worker Concurrency
```typescript
const worker = new Worker('emailQueue', processor, {
  connection: redisClient,
  concurrency: parseInt(process.env.WORKER_CONCURRENCY || '5'),
  limiter: {
    max: parseInt(process.env.JOBS_PER_INTERVAL || '10'),
    duration: parseInt(process.env.LIMITER_INTERVAL_MS || '1000'),
  }
});
```

- **Concurrency** is configurable via `WORKER_CONCURRENCY` env var.
- **BullMQ limiter** enforces a max number of jobs per time interval (acts as throttle between sends).
- Default: `5` concurrent workers, `10` jobs per second max.

### 6.4 Scheduling a Campaign
When a user submits a campaign with N leads:
1. Parse CSV → extract N email addresses
2. Create `email_campaign` DB record
3. For each email address:
   - Calculate `scheduledAt = start_time + (index * delaySeconds * 1000)`
   - Create `email_job` DB record with `status = scheduled`
   - Enqueue BullMQ delayed job: `{ delay: scheduledAt - now }`
   - Store `bullmq_job_id` back in DB

### 6.5 Delay Between Emails
Each job is enqueued with an incrementing delay:
```
Job[0] → delay = 0ms (send at start_time)
Job[1] → delay = delaySeconds * 1000 ms
Job[2] → delay = delaySeconds * 2000 ms
...
```
Minimum delay configured: **2 seconds** (via `DELAY_BETWEEN_EMAILS_MS` env).

---

## 7. Rate Limiting Strategy

### 7.1 Per-Sender Hourly Counter (Redis)

Rate limiting is enforced **inside the BullMQ worker**, using Redis atomic counters:

```
Redis Key: rate_limit:{senderEmail}:{YYYY-MM-DD-HH}
Type: String (integer counter)
TTL: 3600 seconds (auto-expires at end of hour window)
```

**Worker logic per job:**
```
1. INCR rate_limit:{sender}:{current_hour}
2. EXPIRE key 3600 (only if not already set — use SET NX)
3. If counter > hourly_limit:
   a. DECR the counter (undo the increment)
   b. Calculate delay until next hour window
   c. Re-queue the job with that delay (move to delayed)
   d. Update DB status → 'rate_limited'
   e. Trigger Slack notification (if token stored)
4. Else: proceed to send email
```

This is **safe across multiple workers** because `INCR` is atomic in Redis.

### 7.2 Behavior When 1000+ Emails Hit at Once
- All 1000 jobs are enqueued with sequential delays (2s apart).
- Hourly limit is checked per job atomically.
- When limit is hit, remaining jobs are bumped to next-hour window.
- Order is preserved because jobs are re-queued with their original order index as a secondary sort key.
- No jobs are dropped — only delayed.

### 7.3 Why Not BullMQ Limiter Alone?
BullMQ's built-in limiter caps total queue throughput but is not per-sender. Using Redis counters keyed by sender email allows proper **per-sender enforcement** and works correctly even with multiple worker instances.

---

## 8. Persistence & Restart Survival

### 8.1 Problem
BullMQ stores jobs in Redis. If Redis is persistent (AOF/RDB enabled), jobs survive. But if Redis is flushed or a job was enqueued before a crash, we must recover.

### 8.2 Recovery Strategy (Boot-time Job Recovery)

On every server startup, `recoverPendingJobs` runs:

```typescript
async function recoverPendingJobs() {
  const pendingJobs = await db
    .select()
    .from(emailJobs)
    .where(
      and(
        eq(emailJobs.status, 'scheduled'),
        isNull(emailJobs.bullmqJobId)   // OR: not found in queue
      )
    );

  for (const job of pendingJobs) {
    const delay = Math.max(0, new Date(job.scheduledAt).getTime() - Date.now());
    const bullJob = await emailQueue.add('send-email', payload, {
      delay,
      jobId: job.idempotencyKey,   // prevents BullMQ from adding duplicate
      removeOnComplete: false,
    });
    await db.update(emailJobs)
      .set({ bullmqJobId: bullJob.id })
      .where(eq(emailJobs.id, job.id));
  }
}
```

### 8.3 Guarantees
- Jobs already in Redis (survived restart): not re-added because `jobId` is the idempotency key — BullMQ silently ignores duplicates.
- Jobs that fell out of Redis (flush/crash): recovered from DB and re-enqueued with correct remaining delay.
- Jobs that were sent before restart: `status = 'sent'` in DB, skipped by recovery query.

---

## 9. Idempotency

Every `email_job` has an `idempotency_key`:
```
Format: {campaignId}:{recipientEmail}
```

This key is used as the **BullMQ `jobId`**. BullMQ will silently skip adding a job if the same `jobId` already exists in the queue. Combined with the DB unique constraint on `idempotency_key`, this guarantees:

- Each recipient in a campaign is emailed **exactly once**
- Server restarts or duplicate API calls do not cause double-sends
- At the SMTP layer, we also check `status !== 'sent'` before sending

---

## 10. Slack OAuth Integration

### 10.1 Flow
```
User clicks "Connect Slack"
  → GET /api/slack/authorize
  → Redirect to Slack OAuth (scopes: incoming-webhook, chat:write)
  → Slack redirects back to /api/slack/callback?code=...
  → Exchange code for access_token + webhook_url
  → Store in users table (slack_access_token, slack_channel_id)
  → Redirect to dashboard with success toast
```

### 10.2 Notification on Rate Limit
```typescript
async function notifySlack(userId: string, message: string) {
  const user = await db.select().from(users).where(eq(users.id, userId));
  if (!user.slack_access_token) return; // no crash, just skip
  
  await slackClient.chat.postMessage({
    token: user.slack_access_token,
    channel: user.slack_channel_id,
    text: message,
  });
}
```

### 10.3 Disconnect
`DELETE /api/slack/disconnect` → clears token fields in DB. Subsequent rate limit hits skip notification silently.

---

## 11. Google OAuth Integration

### 11.1 Flow
```
User visits /login
  → Click "Sign in with Google"
  → GET /api/auth/google → Passport.js GoogleStrategy
  → Google redirects to /api/auth/google/callback
  → Upsert user in DB (google_id, email, name, avatar)
  → Create express-session (stored in Redis)
  → Redirect to /dashboard
```

### 11.2 Session Persistence
Sessions are stored in **Redis** (`connect-redis`). So sessions survive server restarts as long as Redis is running.

---

## 12. Elasticsearch Integration

### 12.1 Indexing
After each successful email send, index into ES:

```typescript
await esClient.index({
  index: 'emails',
  id: emailJob.idempotencyKey,
  document: {
    jobId: emailJob.id,
    campaignId: emailJob.campaignId,
    recipientEmail: emailJob.recipientEmail,
    subject: campaign.subject,
    senderEmail: campaign.senderEmail,
    status: 'sent',
    sentAt: new Date().toISOString(),
  }
});
```

### 12.2 Search API
`GET /api/emails/search?q=<query>` — full-text search across subject, body, sender, recipient.

### 12.3 Bull-Board Dashboard
Mounted at `/api/admin/queues`:
```typescript
import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { ExpressAdapter } from '@bull-board/express';

const serverAdapter = new ExpressAdapter();
createBullBoard({ queues: [new BullMQAdapter(emailQueue)], serverAdapter });
app.use('/api/admin/queues', serverAdapter.getRouter());
```

---

## 13. API Contract Overview

### Auth
| Method | Path | Description |
|---|---|---|
| GET | `/api/auth/google` | Initiate Google OAuth |
| GET | `/api/auth/google/callback` | Google OAuth callback |
| GET | `/api/auth/me` | Get current user |
| POST | `/api/auth/logout` | Clear session |

### Emails
| Method | Path | Description |
|---|---|---|
| POST | `/api/emails/schedule` | Schedule a campaign |
| GET | `/api/emails/scheduled` | List scheduled jobs |
| GET | `/api/emails/sent` | List sent jobs |
| GET | `/api/emails/search?q=` | Full-text ES search |

### Slack
| Method | Path | Description |
|---|---|---|
| GET | `/api/slack/authorize` | Start Slack OAuth |
| GET | `/api/slack/callback` | Slack OAuth callback |
| DELETE | `/api/slack/disconnect` | Remove Slack token |

### Admin
| Method | Path | Description |
|---|---|---|
| GET | `/api/admin/queues` | Bull-board UI |

---

## 14. Folder Structure

```
reachinbox-scheduler/
├── frontend/                        # React.js + Vite + TypeScript
│   ├── src/
│   │   ├── api/                     # Axios API calls
│   │   ├── components/              # Reusable UI components
│   │   │   ├── ui/                  # Button, Input, Table, Modal, Badge
│   │   │   └── layout/              # Header, Sidebar
│   │   ├── pages/
│   │   │   ├── LoginPage.tsx
│   │   │   └── DashboardPage.tsx
│   │   ├── features/
│   │   │   ├── compose/             # ComposeModal, CSVUploader
│   │   │   ├── scheduled/           # ScheduledEmailsTab
│   │   │   └── sent/                # SentEmailsTab
│   │   ├── hooks/                   # useAuth, useEmails
│   │   ├── types/                   # API response interfaces
│   │   ├── context/                 # AuthContext
│   │   └── App.tsx
│   ├── tailwind.config.ts
│   └── package.json
│
├── backend/                         # Express.js + TypeScript
│   ├── src/
│   │   ├── config/
│   │   │   ├── db.ts                # Drizzle + NeonDB
│   │   │   ├── redis.ts             # IORedis client
│   │   │   ├── bullmq.ts            # Queue + Worker setup
│   │   │   └── elasticsearch.ts     # ES client
│   │   ├── db/
│   │   │   ├── schema.ts            # Drizzle schema
│   │   │   └── migrations/
│   │   ├── routes/
│   │   │   ├── auth.ts
│   │   │   ├── emails.ts
│   │   │   └── slack.ts
│   │   ├── services/
│   │   │   ├── EmailService.ts
│   │   │   ├── SchedulerService.ts
│   │   │   ├── RateLimitService.ts
│   │   │   ├── SlackService.ts
│   │   │   └── ElasticsearchService.ts
│   │   ├── workers/
│   │   │   └── emailWorker.ts
│   │   ├── jobs/
│   │   │   └── recoverPendingJobs.ts
│   │   ├── middleware/
│   │   │   ├── auth.ts              # Session guard
│   │   │   └── errorHandler.ts
│   │   ├── utils/
│   │   │   ├── ethereal.ts          # Nodemailer transport setup
│   │   │   └── csvParser.ts
│   │   └── app.ts                   # Express app entry
│   ├── tsconfig.json
│   └── package.json
│
├── docker-compose.yml               # Redis + Elasticsearch
└── README.md
```

---

## 15. Environment Variables Reference

### Backend `.env`
```env
# Server
PORT=4000
NODE_ENV=development

# NeonDB (PostgreSQL)
DATABASE_URL=postgresql://user:pass@neon.tech/reachinbox

# Redis (Upstash or Docker)
REDIS_URL=redis://localhost:6379

# Google OAuth
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_CALLBACK_URL=http://localhost:4000/api/auth/google/callback

# Session
SESSION_SECRET=super-secret-key

# Slack OAuth
SLACK_CLIENT_ID=
SLACK_CLIENT_SECRET=
SLACK_REDIRECT_URI=http://localhost:4000/api/slack/callback

# Ethereal (auto-created or use fixed test account)
ETHEREAL_USER=
ETHEREAL_PASS=

# Elasticsearch
ELASTICSEARCH_URL=http://localhost:9200

# BullMQ Worker
WORKER_CONCURRENCY=5
JOBS_PER_INTERVAL=10
LIMITER_INTERVAL_MS=1000
DELAY_BETWEEN_EMAILS_MS=2000

# Rate Limiting
DEFAULT_HOURLY_LIMIT=100

# Frontend URL (CORS)
FRONTEND_URL=http://localhost:5173
```

### Frontend `.env`
```env
VITE_API_URL=http://localhost:4000
VITE_GOOGLE_CLIENT_ID=
```

---

## 16. Data Flow Diagrams

### 16.1 Scheduling Flow
```
Frontend                Backend               Redis/DB
   │                       │                      │
   │── POST /emails/schedule ──►                  │
   │     { subject, body,   │                     │
   │       leads[], startTime,│                   │
   │       delay, hourlyLimit }│                  │
   │                       │── INSERT campaign ──►│
   │                       │── INSERT N jobs ────►│
   │                       │── ZADD bullmq:delayed ►│
   │◄── 200 { campaignId } ─│                     │
```

### 16.2 Job Processing Flow
```
BullMQ (delayed queue)
   │ [job becomes ready]
   ▼
emailWorker.process(job)
   │── INCR rate_limit:{sender}:{hour} (Redis)
   │   ├── if > limit:
   │   │    ├── DECR counter
   │   │    ├── re-queue with next-hour delay
   │   │    ├── update DB: rate_limited
   │   │    └── notify Slack (if token exists)
   │   └── if OK:
   │        ├── send via Nodemailer (Ethereal)
   │        ├── update DB: sent + ethereal_preview_url
   │        ├── index in Elasticsearch
   │        └── job complete ✓
```

### 16.3 Restart Recovery Flow
```
Server starts
   │
   ├── Connect Redis
   ├── Connect NeonDB
   ├── Run recoverPendingJobs()
   │    ├── SELECT email_jobs WHERE status='scheduled'
   │    └── For each:
   │         ├── compute remaining delay
   │         └── queue.add(..., { jobId: idempotencyKey, delay })
   │              └── BullMQ: skips if jobId already exists in Redis
   └── Start Express + Worker
```

---

## 17. Assumptions & Trade-offs

| Decision | Reason |
|---|---|
| NeonDB (serverless Postgres) | Free tier, no local DB setup, works from any environment |
| Drizzle ORM | Lightweight, TypeScript-native, no heavy abstraction |
| Redis for rate-limit counters | Atomic INCR is race-condition safe across multiple workers |
| `jobId = idempotencyKey` in BullMQ | Prevents duplicates on re-enqueue without extra lookup |
| Recovery on boot (not cron) | Satisfies "no cron" constraint while still being safe on restart |
| BullMQ limiter + Redis counter | BullMQ limiter = global throughput cap; Redis counter = per-sender hourly cap |
| Upstash Redis (or Docker) | Both work; Upstash is free and persistent; Docker is simpler locally |
| Ethereal per-campaign | Each campaign uses one Ethereal transport; multi-sender is supported by creating multiple Ethereal accounts |
| Session in Redis | Sessions survive backend restarts automatically |
| ES via Docker | Simple local setup; can swap to Elastic Cloud for production |
| No actual bulk SMTP sending | Assignment only requires Ethereal fake SMTP |