import { db } from './db.ts';

interface RateLimitAlertParams {
  userId?: string;
  senderEmail: string;
  hourlyLimit: number;
  deferredUntil: string;
}

class SlackService {
  /**
   * De-duplicates alerts: one Slack notification per user per sender per hour
   * window. Without this, every deferred job in the same window would
   * re-notify. Scoped to the user because the alert feed shown in the UI is
   * per-user — one user's alert must never silence another user's.
   */
  private wasRecentlyNotified(
    userId: string | undefined,
    senderEmail: string,
    windowMs = 55 * 60 * 1000
  ): boolean {
    const cutoff = Date.now() - windowMs;
    return db
      .listSlackAlerts()
      .some(
        (a) =>
          a.sender_email === senderEmail &&
          a.user_id === userId &&
          new Date(a.triggered_at).getTime() > cutoff &&
          a.message.includes('Rate Limit')
      );
  }

  async notifyRateLimit(params: RateLimitAlertParams): Promise<boolean> {
    const user = params.userId ? db.getUser(params.userId) : db.getDefaultUser();
    const webhookUrl = user?.slack_webhook_url || process.env.SLACK_WEBHOOK_URL;
    const token = user?.slack_access_token || process.env.SLACK_ACCESS_TOKEN;
    const channel = user?.slack_channel_id || '#email-alerts';

    if (this.wasRecentlyNotified(user?.id, params.senderEmail)) {
      db.addLog({
        level: 'info',
        message: `[Slack] Alert for ${params.senderEmail} already dispatched this hour window — duplicate suppressed.`,
      });
      return false;
    }

    const message = `🚨 *ReachInbox Rate Limit Alert*
• *Sender:* \`${params.senderEmail}\`
• *Hourly Limit:* \`${params.hourlyLimit} emails/hour\`
• *Action Taken:* Threshold exceeded. Pending jobs deferred until \`${new Date(params.deferredUntil).toLocaleTimeString()}\`.
• *Timestamp:* ${new Date().toISOString()}`;

    let delivered = false;

    // If webhook is provided, POST payload
    if (webhookUrl) {
      try {
        const res = await fetch(webhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            text: message,
            blocks: [
              {
                type: 'header',
                text: {
                  type: 'plain_text',
                  text: '🚨 ReachInbox Rate Limit Triggered',
                  emoji: true,
                },
              },
              {
                type: 'section',
                fields: [
                  { type: 'mrkdwn', text: `*Sender:*\n\`${params.senderEmail}\`` },
                  { type: 'mrkdwn', text: `*Threshold:*\n${params.hourlyLimit} emails/hr` },
                  { type: 'mrkdwn', text: `*Status:*\nRate Limited & Deferred` },
                  { type: 'mrkdwn', text: `*Next Window:*\n${new Date(params.deferredUntil).toLocaleTimeString()}` },
                ],
              },
            ],
          }),
        });
        delivered = res.ok;
      } catch (err) {
        console.warn('[Slack] Failed to post to webhook:', err);
      }
    } else if (token) {
      // If Slack API token
      try {
        const res = await fetch('https://slack.com/api/chat.postMessage', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            channel,
            text: message,
          }),
        });
        const data = await res.json();
        delivered = !!data.ok;
      } catch (err) {
        console.warn('[Slack] Failed to post via Slack Web API:', err);
      }
    }

    // Always log to DB for tracking & visibility in UI
    db.addSlackAlert({
      id: `alert_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      user_id: user?.id,
      sender_email: params.senderEmail,
      hourly_limit: params.hourlyLimit,
      message,
      triggered_at: new Date().toISOString(),
      success: delivered,
      channel,
    });

    db.addLog({
      level: 'warn',
      message: `Slack notification triggered for ${params.senderEmail} (limit: ${params.hourlyLimit}/hr)`,
      details: {
        delivered,
        webhookConfigured: !!webhookUrl,
        tokenConfigured: !!token,
        channel,
      },
    });

    return delivered;
  }

  async sendTestMessage(userId: string, customText?: string): Promise<{ success: boolean; message: string }> {
    const user = db.getUser(userId) || db.getDefaultUser();
    const webhookUrl = user.slack_webhook_url || process.env.SLACK_WEBHOOK_URL;
    const token = user.slack_access_token || process.env.SLACK_ACCESS_TOKEN;
    const channel = user.slack_channel_id || '#email-alerts';

    const text = customText || `✅ *ReachInbox Test Notification*: Slack integration is active and listening for rate limit events on channel \`${channel}\`.`;

    let delivered = false;
    let errorDetail = '';

    if (webhookUrl) {
      try {
        const res = await fetch(webhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text }),
        });
        delivered = res.ok;
        if (!res.ok) errorDetail = `Webhook returned HTTP ${res.status}`;
      } catch (e: any) {
        errorDetail = e.message;
      }
    } else if (token) {
      try {
        const res = await fetch('https://slack.com/api/chat.postMessage', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ channel, text }),
        });
        const data = await res.json();
        delivered = !!data.ok;
        if (!data.ok) errorDetail = data.error || 'Slack API error';
      } catch (e: any) {
        errorDetail = e.message;
      }
    }

    db.addSlackAlert({
      id: `alert_test_${Date.now()}`,
      user_id: user.id,
      sender_email: 'system@reachinbox.ai',
      hourly_limit: 100,
      message: text,
      triggered_at: new Date().toISOString(),
      success: delivered,
      channel,
    });

    return {
      success: delivered,
      message: delivered
        ? 'Test message delivered to Slack successfully!'
        : webhookUrl || token
        ? `Delivered to local alert feed (Slack connection error: ${errorDetail})`
        : 'Saved alert to internal notification log. (Connect Slack or set Webhook URL for external delivery)',
    };
  }
}

export const slackService = new SlackService();
