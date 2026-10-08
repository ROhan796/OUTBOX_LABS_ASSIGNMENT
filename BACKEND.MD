# BACKEND.md — ReachInbox Email Scheduler

## Table of Contents
1. [Overview](#1-overview)
2. [Folder Structure](#2-folder-structure)
3. [Setup & Installation](#3-setup--installation)
4. [Configuration (env vars)](#4-configuration-env-vars)
5. [Database — NeonDB + Drizzle ORM](#5-database--neondb--drizzle-orm)
6. [Redis Setup](#6-redis-setup)
7. [BullMQ — Queue & Worker](#7-bullmq--queue--worker)
8. [Email Worker Logic](#8-email-worker-logic)
9. [Rate Limiting (Redis counters)](#9-rate-limiting-redis-counters)
10. [Persistence — Boot-time Recovery](#10-persistence--boot-time-recovery)
11. [Idempotency](#11-idempotency)
12. [Ethereal SMTP (Nodemailer)](#12-ethereal-smtp-nodemailer)
13. [Elasticsearch](#13-elasticsearch)
14. [Bull-Board Dashboard](#14-bull-board-dashboard)
15. [Google OAuth (Passport.js)](#15-google-oauth-passportjs)
16. [Slack OAuth + Notifications](#16-slack-oauth--notifications)
17. [REST API Routes — Full Spec](#17-rest-api-routes--full-spec)
18. [Middleware](#18-middleware)
19. [Error Handling](#19-error-handling)
20. [Service Layer](#20-service-layer)
21. [Dependencies](#21-dependencies)

---

## 1. Overview

The backend is a **Node.js + Express.js + TypeScript** server that:
- Authenticates users via Google OAuth
- Accepts campaign scheduling requests, persists to **NeonDB (PostgreSQL)**
- Enqueues emails as **BullMQ delayed jobs** backed by Redis
- Processes jobs in a worker: rate-check → SMTP send → DB update → ES index
- Notifies Slack on rate limit hit
- Exposes Bull-Board at `/api/admin/queues`
- Recovers pending jobs on boot (no cron)

---

## 2. Folder Structure

```
backend/
├── src/
│   ├── app.ts                    # Express app setup (no listen here)
│   ├── server.ts                 # HTTP listen + boot sequence
│   ├── config/
│   │   ├── db.ts                 # Drizzle + NeonDB pool
│   │   ├── redis.ts              # IORedis singleton
│   │   ├── bullmq.ts             # emailQueue + QueueEvents
│   │   ├── elasticsearch.ts      # ES client
│   │   └── env.ts                # Typed env with zod validation
│   ├── db/
│   │   ├── schema.ts             # Drizzle table definitions
│   │   ├── index.ts              # db export
│   │   └── migrations/           # Drizzle migration files
│   ├── routes/
│   │   ├── index.ts              # Mount all routers
│   │   ├── auth.route.ts
│   │   ├── emails.route.ts
│   │   └── slack.route.ts
│   ├── controllers/
│   │   ├── auth.controller.ts
│   │   ├── emails.controller.ts
│   │   └── slack.controller.ts
│   ├── services/
│   │   ├── EmailService.ts
│   │   ├── SchedulerService.ts
│   │   ├── RateLimitService.ts
│   │   ├── SlackService.ts
│   │   └── ElasticsearchService.ts
│   ├── workers/
│   │   └── emailWorker.ts        # BullMQ Worker definition
│   ├── jobs/
│   │   └── recoverPendingJobs.ts # Boot-time recovery
│   ├── middleware/
│   │   ├── requireAuth.ts        # Session guard
│   │   ├── errorHandler.ts       # Global error handler
│   │   └── validate.ts           # Zod req body validation
│   ├── utils/
│   │   ├── ethereal.ts           # Create Nodemailer transport
│   │   ├── csvParser.ts          # Parse email CSV/txt
│   │   ├── dateUtils.ts          # Delay calculation helpers
│   │   └── logger.ts             # Pino logger
│   └── types/
│       └── index.ts              # Shared TS types
├── drizzle.config.ts
├── tsconfig.json
├── package.json
└── .env
```

---

## 3. Setup & Installation

```bash
cd backend
npm install
cp .env.example .env     # fill in values

# Run DB migrations
npm run db:generate      # generates SQL from schema
npm run db:migrate       # applies to NeonDB

# Start dev server (ts-node-dev)
npm run dev

# Build + start production
npm run build
npm run start
```

**`package.json` scripts:**
```json
{
  "scripts": {
    "dev":          "ts-node-dev --respawn --transpile-only src/server.ts",
    "build":        "tsc -p tsconfig.json",
    "start":        "node dist/server.js",
    "db:generate":  "drizzle-kit generate:pg",
    "db:migrate":   "drizzle-kit push:pg"
  }
}
```

---

## 4. Configuration (env vars)

```ts
// src/config/env.ts
import { z } from 'zod'

const EnvSchema = z.object({
  PORT:                    z.string().default('4000'),
  NODE_ENV:                z.enum(['development', 'production', 'test']).default('development'),
  DATABASE_URL:            z.string(),
  REDIS_URL:               z.string().default('redis://localhost:6379'),
  GOOGLE_CLIENT_ID:        z.string(),
  GOOGLE_CLIENT_SECRET:    z.string(),
  GOOGLE_CALLBACK_URL:     z.string(),
  SESSION_SECRET:          z.string(),
  SLACK_CLIENT_ID:         z.string(),
  SLACK_CLIENT_SECRET:     z.string(),
  SLACK_REDIRECT_URI:      z.string(),
  ETHEREAL_USER:           z.string().optional(),
  ETHEREAL_PASS:           z.string().optional(),
  ELASTICSEARCH_URL:       z.string().default('http://localhost:9200'),
  WORKER_CONCURRENCY:      z.string().default('5'),
  JOBS_PER_INTERVAL:       z.string().default('10'),
  LIMITER_INTERVAL_MS:     z.string().default('1000'),
  DELAY_BETWEEN_EMAILS_MS: z.string().default('2000'),
  DEFAULT_HOURLY_LIMIT:    z.string().default('100'),
  FRONTEND_URL:            z.string().default('http://localhost:5173'),
})

export const env = EnvSchema.parse(process.env)
```

---

## 5. Database — NeonDB + Drizzle ORM

### 5.1 Connection
```ts
// src/config/db.ts
import { drizzle } from 'drizzle-orm/neon-http'
import { neon } from '@neondatabase/serverless'
import * as schema from '../db/schema'
import { env } from './env'

const sql = neon(env.DATABASE_URL)
export const db = drizzle(sql, { schema })
```

### 5.2 Schema
```ts
// src/db/schema.ts
import { pgTable, uuid, varchar, text, integer, timestamp, index } from 'drizzle-orm/pg-core'

export const users = pgTable('users', {
  id:               uuid('id').primaryKey().defaultRandom(),
  googleId:         varchar('google_id', { length: 255 }).unique().notNull(),
  email:            varchar('email', { length: 255 }).unique().notNull(),
  name:             varchar('name', { length: 255 }),
  avatarUrl:        text('avatar_url'),
  slackAccessToken: text('slack_access_token'),
  slackTeamId:      varchar('slack_team_id', { length: 255 }),
  slackChannelId:   varchar('slack_channel_id', { length: 255 }),
  createdAt:        timestamp('created_at').defaultNow(),
})

export const emailCampaigns = pgTable('email_campaigns', {
  id:           uuid('id').primaryKey().defaultRandom(),
  userId:       uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  subject:      text('subject').notNull(),
  body:         text('body').notNull(),
  senderEmail:  varchar('sender_email', { length: 255 }).notNull(),
  startTime:    timestamp('start_time').notNull(),
  delaySeconds: integer('delay_seconds').notNull().default(2),
  hourlyLimit:  integer('hourly_limit').notNull().default(100),
  totalLeads:   integer('total_leads').notNull(),
  status:       varchar('status', { length: 50 }).default('pending'),
  createdAt:    timestamp('created_at').defaultNow(),
})

export const emailJobs = pgTable('email_jobs', {
  id:                 uuid('id').primaryKey().defaultRandom(),
  campaignId:         uuid('campaign_id').references(() => emailCampaigns.id, { onDelete: 'cascade' }).notNull(),
  recipientEmail:     varchar('recipient_email', { length: 255 }).notNull(),
  bullmqJobId:        varchar('bullmq_job_id', { length: 255 }),
  idempotencyKey:     varchar('idempotency_key', { length: 512 }).unique().notNull(),
  status:             varchar('status', { length: 50 }).default('scheduled'),
  scheduledAt:        timestamp('scheduled_at').notNull(),
  sentAt:             timestamp('sent_at'),
  etherealPreviewUrl: text('ethereal_preview_url'),
  errorMessage:       text('error_message'),
  createdAt:          timestamp('created_at').defaultNow(),
}, (table) => ({
  campaignIdx:    index('idx_jobs_campaign').on(table.campaignId),
  statusIdx:      index('idx_jobs_status').on(table.status),
  scheduledAtIdx: index('idx_jobs_scheduled').on(table.scheduledAt),
}))
```

---

## 6. Redis Setup

```ts
// src/config/redis.ts
import IORedis from 'ioredis'
import { env } from './env'

export const redisClient = new IORedis(env.REDIS_URL, {
  maxRetriesPerRequest: null,   // required by BullMQ
  enableReadyCheck: false,
  lazyConnect: false,
})

redisClient.on('connect', () => console.log('[Redis] Connected'))
redisClient.on('error', (err) => console.error('[Redis] Error:', err))
```

**Docker for local Redis:**
```yaml
# docker-compose.yml
services:
  redis:
    image: redis:7-alpine
    ports: ["6379:6379"]
    command: redis-server --appendonly yes    # AOF persistence
    volumes:
      - redis_data:/data
```

For production: **Upstash Redis** (free, persistent, serverless).

---

## 7. BullMQ — Queue & Worker

### 7.1 Queue Setup
```ts
// src/config/bullmq.ts
import { Queue, QueueEvents } from 'bullmq'
import { redisClient } from './redis'

export const emailQueue = new Queue('emailQueue', {
  connection: redisClient,
  defaultJobOptions: {
    removeOnComplete: { count: 500 },   // keep last 500 completed
    removeOnFail:     { count: 200 },
    attempts: 3,
    backoff: { type: 'exponential', delay: 5000 },
  },
})

export const queueEvents = new QueueEvents('emailQueue', {
  connection: redisClient,
})
```

### 7.2 Enqueue a Job
```ts
// src/services/SchedulerService.ts
export async function enqueueEmailJob(
  job: EmailJobRow,
  campaign: CampaignRow,
  delayMs: number
) {
  const payload: EmailJobPayload = {
    emailJobId:     job.id,
    campaignId:     campaign.id,
    recipientEmail: job.recipientEmail,
    subject:        campaign.subject,
    body:           campaign.body,
    senderEmail:    campaign.senderEmail,
    idempotencyKey: job.idempotencyKey,
    hourlyLimit:    campaign.hourlyLimit,
    delaySeconds:   campaign.delaySeconds,
    userId:         campaign.userId,
  }

  const bullJob = await emailQueue.add('send-email', payload, {
    delay:  delayMs,
    jobId:  job.idempotencyKey,    // BullMQ dedup key
    removeOnComplete: false,
  })

  // Store BullMQ job ID back in DB
  await db.update(emailJobs)
    .set({ bullmqJobId: bullJob.id })
    .where(eq(emailJobs.id, job.id))
}
```

---

## 8. Email Worker Logic

```ts
// src/workers/emailWorker.ts
import { Worker, Job } from 'bullmq'
import { redisClient } from '../config/redis'
import { RateLimitService } from '../services/RateLimitService'
import { SlackService } from '../services/SlackService'
import { ElasticsearchService } from '../services/ElasticsearchService'
import { createTransport } from '../utils/ethereal'
import { db } from '../config/db'
import { emailJobs, emailCampaigns } from '../db/schema'
import { eq } from 'drizzle-orm'
import { env } from '../config/env'

async function processEmailJob(job: Job<EmailJobPayload>) {
  const {
    emailJobId, recipientEmail, subject, body,
    senderEmail, idempotencyKey, hourlyLimit, userId
  } = job.data

  // 1. Check idempotency — skip if already sent
  const [existingJob] = await db.select()
    .from(emailJobs)
    .where(eq(emailJobs.id, emailJobId))

  if (existingJob.status === 'sent') {
    console.log(`[Worker] Job ${emailJobId} already sent, skipping`)
    return
  }

  // 2. Rate limit check
  const rateLimitService = new RateLimitService(redisClient)
  const { allowed, retryAfterMs } = await rateLimitService.checkAndIncrement(
    senderEmail,
    hourlyLimit
  )

  if (!allowed) {
    // Re-queue into next hour window
    await job.moveToDelayed(Date.now() + retryAfterMs)

    await db.update(emailJobs)
      .set({ status: 'rate_limited' })
      .where(eq(emailJobs.id, emailJobId))

    // Notify Slack
    const slackService = new SlackService()
    await slackService.notifyRateLimitHit(userId, senderEmail)

    return
  }

  // 3. Send email via Ethereal SMTP
  try {
    const transport = await createTransport()
    const info = await transport.sendMail({
      from:    senderEmail,
      to:      recipientEmail,
      subject: subject,
      html:    body,
    })

    const previewUrl = `https://ethereal.email/message/${info.messageId}`

    // 4. Update DB → sent
    await db.update(emailJobs)
      .set({
        status:             'sent',
        sentAt:             new Date(),
        etherealPreviewUrl: previewUrl,
      })
      .where(eq(emailJobs.id, emailJobId))

    // 5. Index in Elasticsearch
    const esService = new ElasticsearchService()
    await esService.indexEmail({
      jobId:          emailJobId,
      recipientEmail,
      subject,
      senderEmail,
      status:         'sent',
      sentAt:         new Date().toISOString(),
    })

    console.log(`[Worker] Sent email to ${recipientEmail} — Preview: ${previewUrl}`)

  } catch (err) {
    await db.update(emailJobs)
      .set({ status: 'failed', errorMessage: String(err) })
      .where(eq(emailJobs.id, emailJobId))
    throw err   // BullMQ will retry per backoff config
  }
}

export const emailWorker = new Worker('emailQueue', processEmailJob, {
  connection: redisClient,
  concurrency: parseInt(env.WORKER_CONCURRENCY),
  limiter: {
    max:      parseInt(env.JOBS_PER_INTERVAL),
    duration: parseInt(env.LIMITER_INTERVAL_MS),
  },
})

emailWorker.on('completed', (job) => console.log(`[Worker] Job ${job.id} completed`))
emailWorker.on('failed', (job, err) => console.error(`[Worker] Job ${job?.id} failed:`, err))
```

---

## 9. Rate Limiting (Redis counters)

```ts
// src/services/RateLimitService.ts
import IORedis from 'ioredis'

export class RateLimitService {
  constructor(private redis: IORedis) {}

  /**
   * Returns { allowed: true } or { allowed: false, retryAfterMs }
   */
  async checkAndIncrement(
    senderEmail: string,
    limit: number
  ): Promise<{ allowed: boolean; retryAfterMs: number }> {
    const hourKey = this.getHourKey(senderEmail)

    // Atomic: increment + set TTL if first call in this window
    const pipeline = this.redis.pipeline()
    pipeline.incr(hourKey)
    pipeline.ttl(hourKey)
    const [[, count], [, ttl]] = await pipeline.exec() as any

    // Set expiry only on first increment
    if (ttl === -1) {
      await this.redis.expire(hourKey, 3600)
    }

    if (count > limit) {
      // Undo increment
      await this.redis.decr(hourKey)
      const retryAfterMs = this.msUntilNextHour()
      return { allowed: false, retryAfterMs }
    }

    return { allowed: true, retryAfterMs: 0 }
  }

  private getHourKey(senderEmail: string): string {
    const now = new Date()
    const windowId = `${now.getUTCFullYear()}-${now.getUTCMonth()}-${now.getUTCDate()}-${now.getUTCHours()}`
    return `rate_limit:${senderEmail}:${windowId}`
  }

  private msUntilNextHour(): number {
    const now = new Date()
    const nextHour = new Date(now)
    nextHour.setUTCHours(now.getUTCHours() + 1, 0, 0, 0)
    return nextHour.getTime() - now.getTime()
  }
}
```

**Why this is safe across multiple workers:**
- `INCR` is atomic — two workers hitting the same key simultaneously will never both read the same count
- Pipeline reads count + TTL in one round trip
- Decrement on overshoot is atomic and safe

---

## 10. Persistence — Boot-time Recovery

```ts
// src/jobs/recoverPendingJobs.ts
import { db } from '../config/db'
import { emailJobs, emailCampaigns } from '../db/schema'
import { eq, and, inArray, isNull } from 'drizzle-orm'
import { emailQueue } from '../config/bullmq'

export async function recoverPendingJobs() {
  console.log('[Recovery] Checking for unqueued pending jobs...')

  // Find jobs that are scheduled but have no BullMQ job ID (fell out of Redis)
  const pending = await db.select({
    job:      emailJobs,
    campaign: emailCampaigns,
  })
  .from(emailJobs)
  .innerJoin(emailCampaigns, eq(emailJobs.campaignId, emailCampaigns.id))
  .where(
    and(
      eq(emailJobs.status, 'scheduled'),
    )
  )

  let recovered = 0

  for (const { job, campaign } of pending) {
    const now = Date.now()
    const scheduledAt = new Date(job.scheduledAt).getTime()
    const delay = Math.max(0, scheduledAt - now)

    try {
      // jobId = idempotencyKey → BullMQ silently skips if already in queue
      await emailQueue.add('send-email', {
        emailJobId:     job.id,
        campaignId:     campaign.id,
        recipientEmail: job.recipientEmail,
        subject:        campaign.subject,
        body:           campaign.body,
        senderEmail:    campaign.senderEmail,
        idempotencyKey: job.idempotencyKey,
        hourlyLimit:    campaign.hourlyLimit,
        delaySeconds:   campaign.delaySeconds,
        userId:         campaign.userId,
      }, {
        delay,
        jobId: job.idempotencyKey,    // ← key dedup mechanism
      })
      recovered++
    } catch (err) {
      // Job already exists in queue — this is expected and fine
    }
  }

  console.log(`[Recovery] Recovered ${recovered} jobs`)
}
```

**Called in `server.ts` before the HTTP server starts:**
```ts
// src/server.ts
async function bootstrap() {
  await recoverPendingJobs()   // ← runs on every startup
  app.listen(env.PORT, () => console.log(`[Server] Listening on :${env.PORT}`))
}
bootstrap()
```

---

## 11. Idempotency

| Layer | Mechanism |
|---|---|
| DB | `idempotency_key` column has `UNIQUE` constraint — INSERT fails if duplicate |
| BullMQ | `jobId = idempotencyKey` — duplicate jobs silently ignored by BullMQ |
| Worker | First thing: `if (job.status === 'sent') return` — never re-sends |
| API | `POST /emails/schedule` is idempotent by campaign — re-scheduling same campaign skips already-queued jobs |

---

## 12. Ethereal SMTP (Nodemailer)

```ts
// src/utils/ethereal.ts
import nodemailer from 'nodemailer'
import { env } from '../config/env'

let _transport: nodemailer.Transporter | null = null

export async function createTransport(): Promise<nodemailer.Transporter> {
  if (_transport) return _transport

  let auth: { user: string; pass: string }

  if (env.ETHEREAL_USER && env.ETHEREAL_PASS) {
    auth = { user: env.ETHEREAL_USER, pass: env.ETHEREAL_PASS }
  } else {
    // Auto-create a new Ethereal test account
    const testAccount = await nodemailer.createTestAccount()
    auth = { user: testAccount.user, pass: testAccount.pass }
    console.log('[Ethereal] Test account created:', testAccount.user)
  }

  _transport = nodemailer.createTransport({
    host: 'smtp.ethereal.email',
    port: 587,
    secure: false,
    auth,
  })

  return _transport
}
```

After sending, preview URL is: `https://ethereal.email/message/${info.messageId}`

---

## 13. Elasticsearch

### 13.1 Client
```ts
// src/config/elasticsearch.ts
import { Client } from '@elastic/elasticsearch'
import { env } from './env'

export const esClient = new Client({ node: env.ELASTICSEARCH_URL })
```

### 13.2 Index Setup (run once on boot)
```ts
// src/services/ElasticsearchService.ts
const INDEX = 'emails'

export class ElasticsearchService {
  async ensureIndex() {
    const exists = await esClient.indices.exists({ index: INDEX })
    if (!exists) {
      await esClient.indices.create({
        index: INDEX,
        mappings: {
          properties: {
            jobId:          { type: 'keyword' },
            recipientEmail: { type: 'keyword' },
            subject:        { type: 'text' },
            senderEmail:    { type: 'keyword' },
            status:         { type: 'keyword' },
            sentAt:         { type: 'date' },
          }
        }
      })
    }
  }

  async indexEmail(doc: EmailIndexDoc) {
    await esClient.index({ index: INDEX, id: doc.jobId, document: doc })
  }

  async search(query: string): Promise<EmailIndexDoc[]> {
    const result = await esClient.search({
      index: INDEX,
      query: {
        multi_match: {
          query,
          fields: ['subject', 'recipientEmail', 'senderEmail'],
        }
      }
    })
    return result.hits.hits.map(h => h._source as EmailIndexDoc)
  }
}
```

**Docker for local ES:**
```yaml
elasticsearch:
  image: docker.elastic.co/elasticsearch/elasticsearch:8.12.0
  environment:
    - discovery.type=single-node
    - xpack.security.enabled=false
  ports: ["9200:9200"]
  volumes:
    - es_data:/usr/share/elasticsearch/data
```

---

## 14. Bull-Board Dashboard

```ts
// src/app.ts
import { createBullBoard } from '@bull-board/api'
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter'
import { ExpressAdapter } from '@bull-board/express'
import { emailQueue } from './config/bullmq'

const serverAdapter = new ExpressAdapter()
serverAdapter.setBasePath('/api/admin/queues')

createBullBoard({
  queues: [new BullMQAdapter(emailQueue)],
  serverAdapter,
})

app.use('/api/admin/queues', serverAdapter.getRouter())
```

Accessible at: `http://localhost:4000/api/admin/queues`

---

## 15. Google OAuth (Passport.js)

```ts
// src/config/passport.ts
import passport from 'passport'
import { Strategy as GoogleStrategy } from 'passport-google-oauth20'
import { db } from './db'
import { users } from '../db/schema'
import { eq } from 'drizzle-orm'
import { env } from './env'

passport.use(new GoogleStrategy({
  clientID:     env.GOOGLE_CLIENT_ID,
  clientSecret: env.GOOGLE_CLIENT_SECRET,
  callbackURL:  env.GOOGLE_CALLBACK_URL,
}, async (accessToken, refreshToken, profile, done) => {
  const googleId  = profile.id
  const email     = profile.emails?.[0]?.value || ''
  const name      = profile.displayName
  const avatarUrl = profile.photos?.[0]?.value || null

  // Upsert user
  const [existing] = await db.select().from(users).where(eq(users.googleId, googleId))

  if (existing) {
    done(null, existing)
  } else {
    const [newUser] = await db.insert(users)
      .values({ googleId, email, name, avatarUrl })
      .returning()
    done(null, newUser)
  }
}))

passport.serializeUser((user: any, done) => done(null, user.id))
passport.deserializeUser(async (id: string, done) => {
  const [user] = await db.select().from(users).where(eq(users.id, id))
  done(null, user || null)
})
```

**Session store (Redis):**
```ts
// src/app.ts
import session from 'express-session'
import RedisStore from 'connect-redis'
import { redisClient } from './config/redis'

app.use(session({
  store:  new RedisStore({ client: redisClient }),
  secret: env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure:   env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge:   7 * 24 * 60 * 60 * 1000,   // 7 days
  }
}))
```

**Auth Routes:**
```ts
// GET /api/auth/google
router.get('/google', passport.authenticate('google', { scope: ['profile', 'email'] }))

// GET /api/auth/google/callback
router.get('/google/callback',
  passport.authenticate('google', { failureRedirect: '/login' }),
  (req, res) => res.redirect(`${env.FRONTEND_URL}/`)
)

// GET /api/auth/me
router.get('/me', requireAuth, (req, res) => {
  res.json({
    id:             req.user.id,
    email:          req.user.email,
    name:           req.user.name,
    avatarUrl:      req.user.avatarUrl,
    slackConnected: !!req.user.slackAccessToken,
  })
})

// POST /api/auth/logout
router.post('/logout', (req, res) => {
  req.logout(() => res.json({ ok: true }))
})
```

---

## 16. Slack OAuth + Notifications

### 16.1 OAuth Flow
```ts
// GET /api/slack/authorize
router.get('/authorize', requireAuth, (req, res) => {
  const scopes = 'incoming-webhook,chat:write'
  const state  = req.user.id   // pass userId to callback
  const url    = `https://slack.com/oauth/v2/authorize?client_id=${env.SLACK_CLIENT_ID}&scope=${scopes}&redirect_uri=${env.SLACK_REDIRECT_URI}&state=${state}`
  res.redirect(url)
})

// GET /api/slack/callback
router.get('/callback', async (req, res) => {
  const { code, state: userId } = req.query

  const tokenRes = await fetch('https://slack.com/api/oauth.v2.access', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id:     env.SLACK_CLIENT_ID,
      client_secret: env.SLACK_CLIENT_SECRET,
      code:          String(code),
      redirect_uri:  env.SLACK_REDIRECT_URI,
    })
  })
  const data = await tokenRes.json()

  if (!data.ok) {
    return res.redirect(`${env.FRONTEND_URL}/?slack_error=true`)
  }

  await db.update(users).set({
    slackAccessToken: data.access_token,
    slackTeamId:      data.team.id,
    slackChannelId:   data.incoming_webhook?.channel_id,
  }).where(eq(users.id, String(userId)))

  res.redirect(`${env.FRONTEND_URL}/?slack_connected=true`)
})

// DELETE /api/slack/disconnect
router.delete('/disconnect', requireAuth, async (req, res) => {
  await db.update(users).set({
    slackAccessToken: null,
    slackTeamId:      null,
    slackChannelId:   null,
  }).where(eq(users.id, req.user.id))
  res.json({ ok: true })
})
```

### 16.2 Slack Notification Service
```ts
// src/services/SlackService.ts
import { WebClient } from '@slack/web-api'
import { db } from '../config/db'
import { users } from '../db/schema'
import { eq } from 'drizzle-orm'

export class SlackService {
  async notifyRateLimitHit(userId: string, senderEmail: string) {
    const [user] = await db.select().from(users).where(eq(users.id, userId))

    if (!user?.slackAccessToken || !user?.slackChannelId) {
      return   // Slack not connected — silently skip, no crash
    }

    const client = new WebClient(user.slackAccessToken)
    await client.chat.postMessage({
      channel: user.slackChannelId,
      text: `⚠️ Rate limit hit for sender *${senderEmail}*. Emails are being delayed to the next hour window.`,
    })
  }
}
```

---

## 17. REST API Routes — Full Spec

### POST `/api/emails/schedule`
**Auth:** Required  
**Body:**
```json
{
  "subject": "string",
  "body": "string",
  "leads": ["email1@x.com", "email2@x.com"],
  "startTime": "2024-10-10T14:00:00Z",
  "delaySeconds": 2,
  "hourlyLimit": 100
}
```
**Response 201:**
```json
{ "campaignId": "uuid", "totalScheduled": 143 }
```

**Logic:**
1. Validate with Zod
2. Create Ethereal transport (get sender email)
3. Insert `email_campaigns` row
4. For each lead: insert `email_jobs` row with `idempotency_key = campaignId:email`
5. For each job: enqueue BullMQ delayed job with `delay = (index * delaySeconds * 1000)`

---

### GET `/api/emails/scheduled`
**Auth:** Required  
**Query:** `?page=1&limit=20`  
**Response:**
```json
{
  "data": [{ EmailJob }],
  "total": 143,
  "page": 1,
  "limit": 20
}
```

---

### GET `/api/emails/sent`
**Auth:** Required  
**Query:** `?page=1&limit=20`  
Same shape as above, filtered to `status = 'sent'`.

---

### GET `/api/emails/search`
**Auth:** Required  
**Query:** `?q=outreach`  
**Response:** `EmailJob[]` from Elasticsearch.

---

### GET `/api/slack/status`
**Auth:** Required  
**Response:** `{ "connected": true/false }`

---

## 18. Middleware

### requireAuth
```ts
// src/middleware/requireAuth.ts
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.isAuthenticated()) {
    return res.status(401).json({ error: 'Unauthorized' })
  }
  next()
}
```

### validate (Zod)
```ts
// src/middleware/validate.ts
import { ZodSchema } from 'zod'

export const validate = (schema: ZodSchema) =>
  (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.body)
    if (!result.success) {
      return res.status(400).json({ error: result.error.flatten() })
    }
    req.body = result.data
    next()
  }
```

---

## 19. Error Handling

```ts
// src/middleware/errorHandler.ts
export function errorHandler(err: Error, req: Request, res: Response, next: NextFunction) {
  console.error('[Error]', err)
  res.status(500).json({
    error: err.message || 'Internal Server Error'
  })
}
// Mounted last in app.ts: app.use(errorHandler)
```

---

## 20. Service Layer

| Service | Key Methods |
|---|---|
| `EmailService` | `createCampaign()`, `getScheduledJobs()`, `getSentJobs()` |
| `SchedulerService` | `scheduleCampaign(payload)` — creates DB rows + enqueues jobs |
| `RateLimitService` | `checkAndIncrement(sender, limit)` |
| `SlackService` | `notifyRateLimitHit(userId, sender)` |
| `ElasticsearchService` | `ensureIndex()`, `indexEmail(doc)`, `search(query)` |

All services receive dependencies (db, redis, es client) via constructor — no global imports inside services.

---

## 21. Dependencies

```json
{
  "dependencies": {
    "express": "^4.18.0",
    "express-session": "^1.18.0",
    "connect-redis": "^7.1.0",
    "passport": "^0.7.0",
    "passport-google-oauth20": "^2.0.0",
    "bullmq": "^5.4.0",
    "ioredis": "^5.3.0",
    "drizzle-orm": "^0.30.0",
    "@neondatabase/serverless": "^0.9.0",
    "nodemailer": "^6.9.0",
    "@elastic/elasticsearch": "^8.12.0",
    "@slack/web-api": "^6.12.0",
    "@bull-board/api": "^5.13.0",
    "@bull-board/express": "^5.13.0",
    "zod": "^3.22.0",
    "cors": "^2.8.5",
    "helmet": "^7.1.0",
    "pino": "^8.19.0",
    "pino-http": "^9.0.0",
    "dotenv": "^16.4.0"
  },
  "devDependencies": {
    "typescript": "^5.4.0",
    "ts-node-dev": "^2.0.0",
    "@types/express": "^4.17.0",
    "@types/passport": "^1.0.0",
    "@types/passport-google-oauth20": "^2.0.0",
    "@types/nodemailer": "^6.4.0",
    "@types/express-session": "^1.17.0",
    "@types/cors": "^2.8.0",
    "drizzle-kit": "^0.20.0"
  }
}
```