import { Router, Request, Response } from 'express';
import { db } from '../db.ts';
import { queueService } from '../queue.ts';
import { searchService } from '../search.ts';
import { requireAuth, getSessionUserId } from './auth.ts';

export const emailRouter = Router();

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Every email endpoint requires a session (UNIFY.md §4)
emailRouter.use(requireAuth);

/** A job is visible only to the user who owns its campaign. */
function visibleJob(jobId: string, userId: string) {
  const job = db.getEmailJob(jobId);
  if (!job) return null;
  const campaign = db.getCampaign(job.campaign_id);
  if (!campaign || campaign.user_id !== userId) return null;
  return { job, campaign };
}

function enrich(job: ReturnType<typeof db.getEmailJob>, userId: string) {
  if (!job) return null;
  const campaign = db.getCampaign(job.campaign_id);
  if (!campaign || campaign.user_id !== userId) return null;
  return {
    id: job.id,
    campaignId: job.campaign_id,
    campaignTitle: campaign.subject || 'Campaign',
    recipientEmail: job.recipient_email,
    senderEmail: campaign.sender_email,
    subject: campaign.subject,
    status: job.status,
    scheduledAt: job.scheduled_at,
    sentAt: job.sent_at,
    etherealPreviewUrl: job.ethereal_preview_url,
    errorMessage: job.error_message,
    createdAt: job.created_at,
    matchReason: (job as any).matchReason,
  };
}

// POST /api/emails/schedule
emailRouter.post('/schedule', async (req: Request, res: Response) => {
  try {
    const userId = getSessionUserId(req)!;
    const {
      subject,
      body,
      leads,
      startTime,
      delaySeconds = 2,
      hourlyLimit = 100,
      senderEmail,
    } = req.body;

    if (!subject || typeof subject !== 'string' || subject.trim().length < 3) {
      return res.status(400).json({ error: 'Subject is required (minimum 3 characters)' });
    }

    if (!body || typeof body !== 'string' || body.trim().length < 5) {
      return res.status(400).json({ error: 'Body is required (minimum 5 characters)' });
    }

    if (!Array.isArray(leads) || leads.length === 0) {
      return res.status(400).json({ error: 'At least one recipient email lead is required' });
    }

    // Clean, validate and de-duplicate (idempotency key is campaign:recipient)
    const validEmails = Array.from(
      new Set(
        leads
          .map((e: unknown) => (typeof e === 'string' ? e.trim().toLowerCase() : ''))
          .filter((e: string) => EMAIL_REGEX.test(e))
      )
    );

    if (validEmails.length === 0) {
      return res
        .status(400)
        .json({ error: 'No valid email addresses found in the provided lead list' });
    }

    if (validEmails.length > 5000) {
      return res.status(400).json({ error: 'Lead list too large — maximum 5000 recipients per campaign' });
    }

    // Calculate start time (past start times are clamped to "now")
    let parsedStartTime = startTime;
    if (!parsedStartTime || isNaN(new Date(parsedStartTime).getTime())) {
      parsedStartTime = new Date().toISOString();
    }

    const delay = Math.max(1, Number(delaySeconds) || 2);
    const limit = Math.min(10000, Math.max(1, Number(hourlyLimit) || 100));

    const result = await queueService.scheduleCampaign({
      userId,
      subject: subject.trim(),
      body: body.trim(),
      senderEmail: senderEmail || 'outreach@reachinbox.test',
      leads: validEmails,
      startTime: parsedStartTime,
      delaySeconds: delay,
      hourlyLimit: limit,
    });

    res.status(201).json({
      success: true,
      campaignId: result.campaign.id,
      totalScheduled: result.totalScheduled,
      startTime: result.campaign.start_time,
      delaySeconds: result.campaign.delay_seconds,
      hourlyLimit: result.campaign.hourly_limit,
    });
  } catch (err: any) {
    console.error('[Emails Router] Error scheduling campaign:', err);
    res.status(500).json({ error: err.message || 'Failed to schedule campaign' });
  }
});

// GET /api/emails/scheduled
emailRouter.get('/scheduled', (req: Request, res: Response) => {
  const userId = getSessionUserId(req)!;
  const page = Math.max(1, parseInt(req.query.page as string, 10) || 1);
  const limit = Math.max(1, Math.min(100, parseInt(req.query.limit as string, 10) || 20));

  const scheduledJobs = db
    .listEmailJobs({ status: ['scheduled', 'rate_limited'] })
    .filter((j) => db.getCampaign(j.campaign_id)?.user_id === userId);

  scheduledJobs.sort((a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime());

  const total = scheduledJobs.length;
  const start = (page - 1) * limit;
  const paged = scheduledJobs.slice(start, start + limit);

  res.json({
    data: paged.map((j) => enrich(j, userId)),
    total,
    page,
    limit,
  });
});

// GET /api/emails/sent
emailRouter.get('/sent', (req: Request, res: Response) => {
  const userId = getSessionUserId(req)!;
  const page = Math.max(1, parseInt(req.query.page as string, 10) || 1);
  const limit = Math.max(1, Math.min(100, parseInt(req.query.limit as string, 10) || 20));

  const sentJobs = db
    .listEmailJobs({ status: ['sent', 'failed'] })
    .filter((j) => db.getCampaign(j.campaign_id)?.user_id === userId);

  sentJobs.sort((a, b) => {
    const tA = a.sent_at ? new Date(a.sent_at).getTime() : 0;
    const tB = b.sent_at ? new Date(b.sent_at).getTime() : 0;
    return tB - tA;
  });

  const total = sentJobs.length;
  const start = (page - 1) * limit;
  const paged = sentJobs.slice(start, start + limit);

  res.json({
    data: paged.map((j) => enrich(j, userId)),
    total,
    page,
    limit,
  });
});

// GET /api/emails/search
emailRouter.get('/search', async (req: Request, res: Response) => {
  const userId = getSessionUserId(req)!;
  const query = (req.query.q as string) || '';
  const matched = await searchService.search(query);

  res.json(matched.map((j) => enrich(j, userId)).filter(Boolean));
});

// POST /api/emails/:id/retry
emailRouter.post('/:id/retry', async (req: Request, res: Response) => {
  const userId = getSessionUserId(req)!;
  const found = visibleJob(req.params.id, userId);
  if (!found) {
    return res.status(404).json({ error: 'Job not found or could not be retried' });
  }

  const success = await queueService.retryJob(req.params.id);
  if (!success) {
    return res.status(404).json({ error: 'Job not found or could not be retried' });
  }
  res.json({ success: true, message: 'Job re-enqueued for immediate delivery' });
});

// GET /api/emails/:id
emailRouter.get('/:id', (req: Request, res: Response) => {
  const userId = getSessionUserId(req)!;
  const found = visibleJob(req.params.id, userId);
  if (!found) {
    return res.status(404).json({ error: 'Job not found' });
  }
  res.json({ ...found.job, campaign: found.campaign });
});
