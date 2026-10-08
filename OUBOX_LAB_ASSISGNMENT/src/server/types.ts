export interface User {
  id: string;
  google_id: string;
  email: string;
  name: string;
  avatar_url?: string | null;
  slack_access_token?: string | null;
  slack_team_id?: string | null;
  slack_channel_id?: string | null;
  slack_webhook_url?: string | null;
  created_at: string;
}

export type CampaignStatus = 'pending' | 'in_progress' | 'done';

export interface EmailCampaign {
  id: string;
  user_id: string;
  subject: string;
  body: string;
  sender_email: string;
  start_time: string;
  delay_seconds: number;
  hourly_limit: number;
  total_leads: number;
  status: CampaignStatus;
  created_at: string;
}

export type JobStatus = 'scheduled' | 'sent' | 'failed' | 'rate_limited';

export interface EmailJob {
  id: string;
  campaign_id: string;
  recipient_email: string;
  bullmq_job_id: string;
  idempotency_key: string;
  status: JobStatus;
  scheduled_at: string;
  sent_at: string | null;
  ethereal_preview_url: string | null;
  error_message: string | null;
  created_at: string;
}

export interface SlackAlert {
  id: string;
  user_id?: string;
  sender_email: string;
  hourly_limit: number;
  message: string;
  triggered_at: string;
  success: boolean;
  channel?: string;
}

export interface QueueLog {
  id: string;
  timestamp: string;
  level: 'info' | 'warn' | 'error' | 'success';
  message: string;
  details?: Record<string, unknown>;
}

export interface EmailJobPayload {
  emailJobId: string;
  campaignId: string;
  recipientEmail: string;
  subject: string;
  body: string;
  senderEmail: string;
  idempotencyKey: string;
  hourlyLimit: number;
  delaySeconds: number;
}
