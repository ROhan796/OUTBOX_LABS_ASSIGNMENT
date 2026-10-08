import { Router, Request, Response } from 'express';
import { db } from '../db.ts';
import { slackService } from '../slack.ts';
import { requireAuth, getSessionUserId } from './auth.ts';

export const slackRouter = Router();

function hasSlackOAuthConfigured(): boolean {
  const id = process.env.SLACK_CLIENT_ID;
  const secret = process.env.SLACK_CLIENT_SECRET;
  return !!(
    id &&
    secret &&
    !id.includes('your_slack_client_id') &&
    !secret.includes('your_slack_client_secret')
  );
}

function frontendUrl(query: string): string {
  const base = process.env.FRONTEND_URL || '/';
  return `${base}${query}`;
}

// GET /api/slack/status
slackRouter.get('/status', requireAuth, (req: Request, res: Response) => {
  const user = db.getUser(getSessionUserId(req)!)!;

  res.json({
    connected: !!(user.slack_access_token || user.slack_webhook_url),
    channel: user.slack_channel_id || '#email-alerts',
    team: user.slack_team_id || 'ReachInbox Workspace',
    webhookConfigured: !!user.slack_webhook_url,
    webhookUrl: user.slack_webhook_url
      ? `${user.slack_webhook_url.slice(0, 24)}...`
      : null,
  });
});

// GET /api/slack/authorize — redirects to Slack consent (state = userId, UNIFY.md §4.10)
slackRouter.get('/authorize', requireAuth, (req: Request, res: Response) => {
  const userId = getSessionUserId(req)!;
  const redirectUri = `${req.protocol}://${req.get('host')}/api/slack/callback`;

  if (hasSlackOAuthConfigured()) {
    const scopes = encodeURIComponent('incoming-webhook,chat:write');
    const authUrl =
      'https://slack.com/oauth/v2/authorize?' +
      `client_id=${encodeURIComponent(process.env.SLACK_CLIENT_ID!)}` +
      `&scope=${scopes}&redirect_uri=${encodeURIComponent(redirectUri)}` +
      `&state=${encodeURIComponent(userId)}`;
    return res.redirect(authUrl);
  }

  // Simulated connection when no Slack app is configured (dev/demo mode)
  db.updateUserSlack(userId, {
    slack_access_token: `xoxb-simulated-${Date.now()}`,
    slack_team_id: 'T08_REACHINBOX_CORP',
    slack_channel_id: '#rate-limit-alerts',
  });
  db.addLog({
    level: 'info',
    message: '[Slack] Simulated OAuth connect (SLACK_CLIENT_ID not configured).',
  });

  return res.redirect(frontendUrl('/?slack_connected=true'));
});

// GET /api/slack/callback — Slack redirects here with ?code=&state=<userId>
slackRouter.get('/callback', async (req: Request, res: Response) => {
  const code = typeof req.query.code === 'string' ? req.query.code : null;
  const stateUserId = typeof req.query.state === 'string' ? req.query.state : null;
  const sessionUserId = getSessionUserId(req);
  const userId = stateUserId || sessionUserId;

  if (!userId || !db.getUser(userId)) {
    return res.redirect(frontendUrl('/?slack_error=true'));
  }

  try {
    if (code && hasSlackOAuthConfigured()) {
      const tokenRes = await fetch('https://slack.com/api/oauth.v2.access', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: process.env.SLACK_CLIENT_ID!,
          client_secret: process.env.SLACK_CLIENT_SECRET!,
          code,
          redirect_uri: `${req.protocol}://${req.get('host')}/api/slack/callback`,
        }),
      });
      const data = (await tokenRes.json()) as {
        ok?: boolean;
        access_token?: string;
        team?: { id?: string };
        incoming_webhook?: { channel_id?: string; url?: string };
        error?: string;
      };

      if (!data.ok || !data.access_token) {
        db.addLog({
          level: 'error',
          message: `[Slack] OAuth exchange failed: ${data.error || 'unknown_error'}`,
        });
        return res.redirect(frontendUrl('/?slack_error=true'));
      }

      db.updateUserSlack(userId, {
        slack_access_token: data.access_token,
        slack_team_id: data.team?.id || null,
        slack_channel_id: data.incoming_webhook?.channel_id || '#rate-limit-alerts',
        slack_webhook_url: data.incoming_webhook?.url || null,
      });
      db.addLog({
        level: 'success',
        message: '[Slack] Workspace connected via OAuth. Rate limit alerts enabled.',
      });
      return res.redirect(frontendUrl('/?slack_connected=true'));
    }

    // No code / not configured — keep the simulated connection path working
    db.updateUserSlack(userId, {
      slack_access_token: `xoxb-oauth-${Date.now()}`,
      slack_team_id: 'T08_REACHINBOX_CORP',
      slack_channel_id: '#rate-limit-alerts',
    });
    return res.redirect(frontendUrl('/?slack_connected=true'));
  } catch (err: any) {
    db.addLog({ level: 'error', message: `[Slack] Callback error: ${err.message}` });
    return res.redirect(frontendUrl('/?slack_error=true'));
  }
});

// DELETE /api/slack/disconnect
slackRouter.delete('/disconnect', requireAuth, (req: Request, res: Response) => {
  const userId = getSessionUserId(req)!;
  db.updateUserSlack(userId, {
    slack_access_token: null,
    slack_team_id: null,
    slack_channel_id: '#email-alerts',
    slack_webhook_url: null,
  });

  db.addLog({ level: 'info', message: 'Slack workspace disconnected.' });

  res.json({ ok: true, success: true, message: 'Slack disconnected' });
});

// POST /api/slack/webhook-config
slackRouter.post('/webhook-config', requireAuth, (req: Request, res: Response) => {
  const userId = getSessionUserId(req)!;
  const { webhookUrl, channel } = req.body || {};

  if (webhookUrl && !/^https:\/\/hooks\.slack\.com\//.test(webhookUrl.trim())) {
    return res.status(400).json({ error: 'Webhook URL must be an https://hooks.slack.com/... address' });
  }

  db.updateUserSlack(userId, {
    slack_webhook_url: webhookUrl ? webhookUrl.trim() : null,
    slack_channel_id: channel ? channel.trim() : '#rate-limit-alerts',
  });

  db.addLog({
    level: 'info',
    message: webhookUrl
      ? `Configured Slack webhook for ${channel || '#rate-limit-alerts'}`
      : 'Removed Slack webhook configuration.',
  });

  res.json({ success: true, message: 'Slack configuration saved' });
});

// POST /api/slack/test-alert
slackRouter.post('/test-alert', requireAuth, async (req: Request, res: Response) => {
  const userId = getSessionUserId(req)!;
  const { message } = req.body || {};
  const result = await slackService.sendTestMessage(userId, message);
  res.json(result);
});

// GET /api/slack/alerts
slackRouter.get('/alerts', requireAuth, (req: Request, res: Response) => {
  const userId = getSessionUserId(req)!;
  res.json(
    db
      .listSlackAlerts()
      .filter((a) => !a.user_id || a.user_id === userId)
  );
});
