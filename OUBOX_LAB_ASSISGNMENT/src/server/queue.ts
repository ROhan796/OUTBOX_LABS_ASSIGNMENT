import { db } from './db.ts';
import { etherealService } from './ethereal.ts';
import { slackService } from './slack.ts';
import { searchService } from './search.ts';
import { EmailJob, EmailJobPayload, EmailCampaign } from './types.ts';

interface EnqueuedJob {
  id: string;
  payload: EmailJobPayload;
  executeAt: number; // timestamp ms
  addedAt: number;
  attempts: number;
}

class QueueSchedulerService {
  private delayedQueue: EnqueuedJob[] = [];
  private activeJobs: Set<string> = new Set();
  private isPaused = false;
  private dispatchWindow: number[] = [];
  private timer: NodeJS.Timeout | null = null;
  private sweeperTimer: NodeJS.Timeout | null = null;
  private isProcessing = false;

  // Queue settings
  public concurrency = parseInt(process.env.WORKER_CONCURRENCY || '5', 10);
  public jobsPerInterval = parseInt(process.env.JOBS_PER_INTERVAL || '10', 10);
  public limiterIntervalMs = parseInt(process.env.LIMITER_INTERVAL_MS || '1000', 10);
  public delayBetweenEmailsMs = parseInt(process.env.DELAY_BETWEEN_EMAILS_MS || '2000', 10);
  // BullMQ-style automatic retries: attempts: 3 with exponential backoff
  public maxAttempts = parseInt(process.env.JOB_MAX_ATTEMPTS || '3', 10);
  public backoffBaseMs = parseInt(process.env.JOB_BACKOFF_MS || '2000', 10);

  constructor() {
    this.startWorkerLoop();
    this.startSweeper();
  }

  private startWorkerLoop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = setInterval(() => {
      this.tick();
    }, 250);
  }

  /**
   * Self-healing sweep (the "no cron" safety net from SYSTEM_DESIGN.md §8).
   * Every 60s, any DB job that is still pending but missing from the in-memory
   * delayed queue (crash, eviction, manual DB edit) is re-enqueued.
   */
  private startSweeper() {
    if (this.sweeperTimer) clearInterval(this.sweeperTimer);
    this.sweeperTimer = setInterval(() => {
      this.sweepOrphanedJobs().catch((err) => {
        db.addLog({ level: 'error', message: `[Sweeper] Error: ${err.message}` });
      });
    }, 60_000);
  }

  private queuedIds(): Set<string> {
    return new Set(this.delayedQueue.map((j) => j.payload.idempotencyKey));
  }

  async sweepOrphanedJobs(): Promise<number> {
    const queued = this.queuedIds();
    const active = new Set(
      [...this.activeJobs].map((id) => id.replace(/^bull_/, ''))
    );

    const pending = db
      .getAllJobs()
      .filter((j) => j.status === 'scheduled' || j.status === 'rate_limited')
      .filter((j) => !j.sent_at)
      .filter((j) => !queued.has(j.idempotency_key) && !active.has(j.idempotency_key));

    if (pending.length === 0) return 0;

    let recovered = 0;
    const now = Date.now();

    for (const job of pending) {
      const campaign = db.getCampaign(job.campaign_id);
      if (!campaign) continue;

      const remainingDelay = Math.max(
        0,
        new Date(job.scheduled_at).getTime() - now
      );
      const payload: EmailJobPayload = {
        emailJobId: job.id,
        campaignId: job.campaign_id,
        recipientEmail: job.recipient_email,
        subject: campaign.subject,
        body: campaign.body,
        senderEmail: campaign.sender_email,
        idempotencyKey: job.idempotency_key,
        hourlyLimit: campaign.hourly_limit,
        delaySeconds: campaign.delay_seconds,
      };

      await this.addJob(payload, remainingDelay);
      recovered++;
    }

    if (recovered > 0) {
      db.addLog({
        level: 'warn',
        message: `[Sweeper] Re-enqueued ${recovered} orphaned pending job(s) found in DB but missing from the queue.`,
      });
    }
    return recovered;
  }

  // Enqueue a job with delay
  async addJob(payload: EmailJobPayload, delayMs: number, attempts = 0): Promise<string> {
    const executeAt = Date.now() + Math.max(0, delayMs);
    const existingIndex = this.delayedQueue.findIndex(
      (j) => j.payload.idempotencyKey === payload.idempotencyKey
    );

    if (existingIndex >= 0) {
      // BullMQ deduplication semantics: if already scheduled, update execution time
      this.delayedQueue[existingIndex].executeAt = executeAt;
      return this.delayedQueue[existingIndex].id;
    }

    const job: EnqueuedJob = {
      id: `bull_${payload.idempotencyKey}`,
      payload,
      executeAt,
      addedAt: Date.now(),
      attempts,
    };

    this.delayedQueue.push(job);
    // Sort queue by execution time ascending
    this.delayedQueue.sort((a, b) => a.executeAt - b.executeAt);

    return job.id;
  }

  // Main processing tick
  private async tick() {
    if (this.isPaused || this.isProcessing) return;
    if (this.activeJobs.size >= this.concurrency) return;

    const now = Date.now();
    // Grab jobs whose executeAt has arrived
    const readyJobs = this.delayedQueue.filter(
      (job) => job.executeAt <= now && !this.activeJobs.has(job.id)
    );

    if (readyJobs.length === 0) return;

    // Pick up to available concurrency slots
    const availableSlots = this.concurrency - this.activeJobs.size;
    const allowed = this.applyThroughputLimiter(availableSlots);
    if (allowed === 0) return;
    const batch = readyJobs.slice(0, allowed);

    for (const job of batch) {
      this.activeJobs.add(job.id);
      // Remove from delayed queue
      const idx = this.delayedQueue.findIndex((j) => j.id === job.id);
      if (idx !== -1) {
        this.delayedQueue.splice(idx, 1);
      }

      // Process asynchronously
      this.processJob(job).finally(() => {
        this.activeJobs.delete(job.id);
      });
    }
  }

  /**
   * Global throughput limiter (the BullMQ `limiter: { max, duration }`
   * equivalent from SYSTEM_DESIGN.md §6.3): at most `jobsPerInterval`
   * dispatches per `limiterIntervalMs` window, on top of the per-sender
   * hourly cap. Jobs not allowed this window stay in the delayed queue and
   * are picked up by a later tick (250 ms).
   */
  private applyThroughputLimiter(want: number): number {
    if (this.jobsPerInterval <= 0) return want;
    const now = Date.now();
    this.dispatchWindow = this.dispatchWindow.filter(
      (t) => now - t < this.limiterIntervalMs
    );
    const allowed = Math.max(
      0,
      Math.min(want, this.jobsPerInterval - this.dispatchWindow.length)
    );
    for (let i = 0; i < allowed; i++) this.dispatchWindow.push(now);
    return allowed;
  }

  // Job processor with Rate Limit check and SMTP delivery
  private async processJob(job: EnqueuedJob): Promise<void> {
    const { payload } = job;
    job.attempts += 1;

    // 1. Idempotency Check: if already sent in DB, mark complete and exit
    const dbJob = db.getEmailJob(payload.emailJobId);
    if (!dbJob) {
      db.addLog({
        level: 'warn',
        message: `Job ${payload.emailJobId} not found in database. Skipping.`,
      });
      return;
    }

    if (dbJob.status === 'sent') {
      db.addLog({
        level: 'info',
        message: `Idempotency guard: ${payload.recipientEmail} already received email. Skipping duplicate send.`,
      });
      return;
    }

    // 2. Per-Sender Hourly Rate Limiting (atomic check)
    const currentHourCount = db.incrementHourlyCount(payload.senderEmail);
    const hourlyLimit = payload.hourlyLimit || 100;

    if (currentHourCount > hourlyLimit) {
      // Counter exceeded! Rollback increment
      db.decrementHourlyCount(payload.senderEmail);

      // Compute exact remaining ms to the next hour window
      const now = new Date();
      const nextHour = new Date(
        Date.UTC(
          now.getUTCFullYear(),
          now.getUTCMonth(),
          now.getUTCDate(),
          now.getUTCHours() + 1,
          0,
          2, // 2 seconds past the hour mark
          0
        )
      );
      const deferDelayMs = Math.max(3000, nextHour.getTime() - now.getTime());

      // Update DB status to 'rate_limited'
      db.updateEmailJob(payload.emailJobId, {
        status: 'rate_limited',
        error_message: `Hourly rate limit (${hourlyLimit}/hr) reached for ${payload.senderEmail}. Deferred until ${nextHour.toISOString()}`,
      });

      // Re-enqueue job for the next hour window
      await this.addJob(payload, deferDelayMs);

      // Send Slack Alert
      const campaign = db.getCampaign(payload.campaignId);
      await slackService.notifyRateLimit({
        userId: campaign?.user_id,
        senderEmail: payload.senderEmail,
        hourlyLimit,
        deferredUntil: nextHour.toISOString(),
      });

      db.addLog({
        level: 'warn',
        message: `[RateLimit] Sender ${payload.senderEmail} exceeded limit (${hourlyLimit}/hr). Deferred job to ${nextHour.toLocaleTimeString()}.`,
        details: {
          recipient: payload.recipientEmail,
          delaySeconds: Math.round(deferDelayMs / 1000),
        },
      });

      return;
    }

    // 3. Rate limit OK! Deliver via Ethereal SMTP
    try {
      db.addLog({
        level: 'info',
        message: `[SMTP Worker] Dispatching email to ${payload.recipientEmail} via Ethereal SMTP...`,
      });

      const sendResult = await etherealService.sendMail({
        from: payload.senderEmail,
        to: payload.recipientEmail,
        subject: payload.subject,
        html: payload.body,
      });

      if (sendResult.success) {
        const updated = db.updateEmailJob(payload.emailJobId, {
          status: 'sent',
          sent_at: new Date().toISOString(),
          ethereal_preview_url: sendResult.previewUrl,
          error_message: null,
        });

        if (updated) {
          searchService.indexJob(updated);
        }

        db.addLog({
          level: 'success',
          message: `[SMTP Worker] Email delivered to ${payload.recipientEmail}. Ethereal Preview URL generated.`,
          details: {
            previewUrl: sendResult.previewUrl,
            messageId: sendResult.messageId,
          },
        });

        // Check if all campaign jobs are completed
        this.checkCampaignCompletion(payload.campaignId);
      } else {
        // A failed send must not consume hourly quota
        db.decrementHourlyCount(payload.senderEmail);
        db.addLog({
          level: 'error',
          message: `[SMTP Worker] Failed to send email to ${payload.recipientEmail}: ${sendResult.error}`,
        });
        await this.handleRetryableFailure(job, sendResult.error || 'SMTP delivery failed');
      }
    } catch (err: any) {
      db.decrementHourlyCount(payload.senderEmail);
      db.addLog({
        level: 'error',
        message: `[Worker Exception] ${payload.recipientEmail}: ${err.message}`,
      });
      await this.handleRetryableFailure(job, err.message || 'Worker runtime error');
    }
  }

  /**
   * BullMQ-style automatic retries (BACKEND.md §7.1):
   * up to `maxAttempts` attempts with exponential backoff
   * (backoffBaseMs * 2^(attempt-1)). Only after the final attempt does the
   * job become `failed` and the campaign completion check run.
   */
  private async handleRetryableFailure(job: EnqueuedJob, errorMessage: string): Promise<void> {
    const { payload } = job;
    const attempt = job.attempts;

    if (attempt < this.maxAttempts) {
      const backoffMs = this.backoffBaseMs * Math.pow(2, attempt - 1);
      const backoffSeconds = Math.max(1, Math.round(backoffMs / 1000));

      db.updateEmailJob(payload.emailJobId, {
        status: 'scheduled',
        error_message: `Attempt ${attempt}/${this.maxAttempts} failed (${errorMessage}). Automatic retry in ${backoffSeconds}s.`,
      });

      await this.addJob(payload, backoffMs, attempt);

      db.addLog({
        level: 'warn',
        message: `[Retry] Attempt ${attempt}/${this.maxAttempts} failed for ${payload.recipientEmail}. Re-enqueued with ${backoffSeconds}s exponential backoff.`,
        details: { nextAttemptIn: `${backoffSeconds}s`, lastError: errorMessage },
      });
      return;
    }

    db.updateEmailJob(payload.emailJobId, {
      status: 'failed',
      error_message: `${errorMessage} (gave up after ${attempt} attempts)`,
    });

    db.addLog({
      level: 'error',
      message: `[Worker] Job permanently failed for ${payload.recipientEmail} after ${attempt} attempts.`,
      details: { finalError: errorMessage },
    });

    this.checkCampaignCompletion(payload.campaignId);
  }

  // Campaign scheduler endpoint service
  async scheduleCampaign(params: {
    userId: string;
    subject: string;
    body: string;
    senderEmail?: string;
    leads: string[];
    startTime: string; // ISO string
    delaySeconds: number;
    hourlyLimit: number;
  }): Promise<{ campaign: EmailCampaign; totalScheduled: number }> {
    const sender = params.senderEmail || 'outreach@reachinbox.test';
    const startTimestamp = new Date(params.startTime).getTime();
    const now = Date.now();
    const initialDelay = Math.max(0, startTimestamp - now);
    const delayStepMs = Math.max(1, params.delaySeconds) * 1000;

    // 1. Create Campaign
    const campaign: EmailCampaign = {
      id: `cmp_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      user_id: params.userId,
      subject: params.subject,
      body: params.body,
      sender_email: sender,
      start_time: params.startTime,
      delay_seconds: params.delaySeconds,
      hourly_limit: params.hourlyLimit,
      total_leads: params.leads.length,
      status: 'in_progress',
      created_at: new Date().toISOString(),
    };
    db.createCampaign(campaign);

    // 2. Create Jobs with sequential delays
    let scheduledCount = 0;
    for (let i = 0; i < params.leads.length; i++) {
      const recipientEmail = params.leads[i].trim().toLowerCase();
      if (!recipientEmail) continue;

      const jobScheduledAtMs = startTimestamp + i * delayStepMs;
      const idempotencyKey = `${campaign.id}:${recipientEmail}`;
      const emailJobId = `job_${Date.now()}_${i}_${Math.random().toString(36).slice(2, 5)}`;
      const bullJobId = `bull_${idempotencyKey}`;

      const emailJob: EmailJob = {
        id: emailJobId,
        campaign_id: campaign.id,
        recipient_email: recipientEmail,
        bullmq_job_id: bullJobId,
        idempotency_key: idempotencyKey,
        status: 'scheduled',
        scheduled_at: new Date(jobScheduledAtMs).toISOString(),
        sent_at: null,
        ethereal_preview_url: null,
        error_message: null,
        created_at: new Date().toISOString(),
      };
      db.createEmailJob(emailJob);
      searchService.indexJob(emailJob);

      // Add to delayed queue
      const payload: EmailJobPayload = {
        emailJobId,
        campaignId: campaign.id,
        recipientEmail,
        subject: params.subject,
        body: params.body,
        senderEmail: sender,
        idempotencyKey,
        hourlyLimit: params.hourlyLimit,
        delaySeconds: params.delaySeconds,
      };

      const jobDelay = Math.max(0, jobScheduledAtMs - now);
      await this.addJob(payload, jobDelay);
      scheduledCount++;
    }

    db.addLog({
      level: 'info',
      message: `Scheduled campaign "${params.subject}" with ${scheduledCount} leads (${params.delaySeconds}s delay, ${params.hourlyLimit}/hr limit).`,
      details: {
        campaignId: campaign.id,
        sender,
        totalLeads: scheduledCount,
      },
    });

    return { campaign, totalScheduled: scheduledCount };
  }

  private checkCampaignCompletion(campaignId: string): void {
    const jobs = db.listEmailJobs({ campaign_id: campaignId });
    const allFinished = jobs.every((j) => j.status === 'sent' || j.status === 'failed');
    if (allFinished && jobs.length > 0) {
      db.updateCampaignStatus(campaignId, 'done');
      db.addLog({
        level: 'info',
        message: `Campaign ${campaignId} finished all deliveries.`,
      });
    }
  }

  // Boot-time Job Recovery (Restarts Survival)
  async recoverPendingJobs(): Promise<number> {
    db.addLog({
      level: 'info',
      message: '[Recovery] Starting boot-time job recovery scan...',
    });

    const pendingJobs = db
      .getAllJobs()
      .filter((j) => (j.status === 'scheduled' || j.status === 'rate_limited') && !j.sent_at);

    let recovered = 0;
    const now = Date.now();

    for (const job of pendingJobs) {
      const campaign = db.getCampaign(job.campaign_id);
      if (!campaign) continue;

      const scheduledAtMs = new Date(job.scheduled_at).getTime();
      const now = Date.now();
      let remainingDelay = Math.max(0, scheduledAtMs - now);

      // Rate-limited jobs remember their next-hour window — honour it on boot
      // instead of slamming the limiter (and Slack) again immediately.
      if (job.status === 'rate_limited' && job.error_message) {
        const match = job.error_message.match(/Deferred until (.+)$/);
        if (match) {
          const deferredMs = new Date(match[1]).getTime();
          if (!isNaN(deferredMs)) {
            remainingDelay = Math.max(0, deferredMs - now);
          }
        }
      }

      const payload: EmailJobPayload = {
        emailJobId: job.id,
        campaignId: job.campaign_id,
        recipientEmail: job.recipient_email,
        subject: campaign.subject,
        body: campaign.body,
        senderEmail: campaign.sender_email,
        idempotencyKey: job.idempotency_key,
        hourlyLimit: campaign.hourly_limit,
        delaySeconds: campaign.delay_seconds,
      };

      await this.addJob(payload, remainingDelay);
      recovered++;
    }

    db.addLog({
      level: 'info',
      message: `[Recovery] Restored ${recovered} pending jobs from persistent database into the queue.`,
    });

    return recovered;
  }

  // Queue Admin Inspection
  getStats() {
    const allJobs = db.getAllJobs();
    const scheduled = allJobs.filter((j) => j.status === 'scheduled').length;
    const sent = allJobs.filter((j) => j.status === 'sent').length;
    const failed = allJobs.filter((j) => j.status === 'failed').length;
    const rateLimited = allJobs.filter((j) => j.status === 'rate_limited').length;

    return {
      isPaused: this.isPaused,
      concurrency: this.concurrency,
      jobsPerInterval: this.jobsPerInterval,
      limiterIntervalMs: this.limiterIntervalMs,
      maxAttempts: this.maxAttempts,
      backoffBaseMs: this.backoffBaseMs,
      queueDepth: this.delayedQueue.length,
      activeWorkers: this.activeJobs.size,
      counts: {
        total: allJobs.length,
        scheduled,
        sent,
        failed,
        rateLimited,
        inMemoryDelayed: this.delayedQueue.length,
      },
      rateLimitCounters: db.getAllRateLimitCounters(),
    };
  }

  pauseQueue(): boolean {
    this.isPaused = true;
    db.addLog({ level: 'warn', message: 'Queue processing paused by operator.' });
    return true;
  }

  resumeQueue(): boolean {
    this.isPaused = false;
    db.addLog({ level: 'info', message: 'Queue processing resumed by operator.' });
    return false;
  }

  async retryJob(jobId: string): Promise<boolean> {
    const job = db.getEmailJob(jobId);
    if (!job) return false;

    const campaign = db.getCampaign(job.campaign_id);
    if (!campaign) return false;

    db.updateEmailJob(job.id, {
      status: 'scheduled',
      error_message: null,
      scheduled_at: new Date().toISOString(),
    });

    const payload: EmailJobPayload = {
      emailJobId: job.id,
      campaignId: job.campaign_id,
      recipientEmail: job.recipient_email,
      subject: campaign.subject,
      body: campaign.body,
      senderEmail: campaign.sender_email,
      idempotencyKey: job.idempotency_key,
      hourlyLimit: campaign.hourly_limit,
      delaySeconds: campaign.delay_seconds,
    };

    await this.addJob(payload, 0);
    db.addLog({
      level: 'info',
      message: `Manually retrying email job ${job.id} to ${job.recipient_email}`,
    });
    return true;
  }
}

export const queueService = new QueueSchedulerService();
