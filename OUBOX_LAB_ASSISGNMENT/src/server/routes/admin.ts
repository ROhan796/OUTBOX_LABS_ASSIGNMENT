import { Router, Request, Response } from 'express';
import { db } from '../db.ts';
import { queueService } from '../queue.ts';
import { getSessionUserId, requireAuth } from './auth.ts';

export const adminRouter = Router();

adminRouter.use(requireAuth);

// GET /api/admin/queues
adminRouter.get('/queues', (req: Request, res: Response) => {
  const stats = queueService.getStats();
  const logs = db.listLogs(50);
  const alerts = db.listSlackAlerts();

  res.json({
    stats,
    logs,
    alerts: alerts.slice(0, 20),
    workers: [
      { id: 'worker-1', status: 'idle', processedCount: stats.counts.sent },
      { id: 'worker-2', status: 'idle', processedCount: 0 },
      { id: 'worker-3', status: 'idle', processedCount: 0 },
      { id: 'worker-4', status: 'idle', processedCount: 0 },
      { id: 'worker-5', status: 'idle', processedCount: 0 },
    ],
  });
});

// POST /api/admin/queues/pause
adminRouter.post('/queues/pause', (req: Request, res: Response) => {
  queueService.pauseQueue();
  res.json({ success: true, isPaused: true });
});

// POST /api/admin/queues/resume
adminRouter.post('/queues/resume', (req: Request, res: Response) => {
  queueService.resumeQueue();
  res.json({ success: true, isPaused: false });
});

// POST /api/admin/queues/seed-demo
adminRouter.post('/queues/seed-demo', async (req: Request, res: Response) => {
  const userId = getSessionUserId(req)!;
  const sampleLeads = [
    'alex.rivera@techpulse.io',
    'sarah.chen@cloudscale.co',
    'marcus.vance@enterprisegrowth.org',
    'priya.patel@saasscale.com',
    'elena.rostova@datadriven.net',
    'david.kim@fintechflow.ai',
    'jordan.lee@venturegrowth.io',
    'claire.dupont@globalreach.org',
    'nathan.brooks@aeroforce.tech',
    'zack.morris@b2boutreach.co',
  ];

  const result = await queueService.scheduleCampaign({
    userId,
    subject: 'Q4 Enterprise Acceleration & Partnership Preview',
    body: `<h3>Hi {{firstName}},</h3>
<p>I noticed your recent updates in cold email automation. We're rolling out ReachInbox's new scheduled delivery engine with per-sender rate limiting and BullMQ queue architecture.</p>
<p>Would you have 10 minutes this Thursday to walk through how this prevents spam classification and guarantees 99.9% delivery?</p>
<br/>
<p>Best regards,<br/><strong>Mukesh Mandal</strong><br/>ReachInbox Solutions</p>`,
    senderEmail: 'outreach@reachinbox.test',
    leads: sampleLeads,
    startTime: new Date().toISOString(),
    delaySeconds: 2,
    hourlyLimit: 50,
  });

  res.json({
    success: true,
    message: `Created demo campaign with ${result.totalScheduled} leads.`,
    campaignId: result.campaign.id,
  });
});

// POST /api/admin/queues/simulate-rate-limit
adminRouter.post('/queues/simulate-rate-limit', async (req: Request, res: Response) => {
  const userId = getSessionUserId(req)!;
  const sampleLeads = [
    'lead1.ratelimit@example.com',
    'lead2.ratelimit@example.com',
    'lead3.ratelimit@example.com',
    'lead4.ratelimit@example.com',
    'lead5.ratelimit@example.com',
    'lead6.ratelimit@example.com',
  ];

  // Set hourly limit to 2 so after 2 emails, 3rd, 4th, etc. hit rate limit!
  const result = await queueService.scheduleCampaign({
    userId,
    subject: '[Rate Limit Stress Test] Urgent Update on Q4 Deliveries',
    body: `<p>This is an automated test job to verify per-sender hourly rate limiting and Slack alerting.</p>`,
    senderEmail: 'stress-test@reachinbox.test',
    leads: sampleLeads,
    startTime: new Date().toISOString(),
    delaySeconds: 1,
    hourlyLimit: 2, // low limit triggers after 2 emails!
  });

  res.json({
    success: true,
    message: `Scheduled 6 leads with a strict 2/hr limit. Rate limit will trigger on lead 3 and alert Slack!`,
    campaignId: result.campaign.id,
  });
});

// POST /api/admin/queues/reset
adminRouter.post('/queues/reset', (req: Request, res: Response) => {
  db.resetAllData();
  res.json({ success: true, message: 'All queues and jobs reset.' });
});
