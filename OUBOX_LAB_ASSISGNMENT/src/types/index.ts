export interface User {
  id: string;
  email: string;
  name: string;
  avatarUrl: string | null;
  slackConnected: boolean;
  slackChannel?: string | null;
}

export type JobStatus = 'scheduled' | 'sent' | 'failed' | 'rate_limited';

export interface EmailJob {
  id: string;
  campaignId: string;
  campaignTitle: string;
  recipientEmail: string;
  senderEmail: string;
  subject: string;
  status: JobStatus;
  scheduledAt: string; // ISO string
  sentAt: string | null;
  etherealPreviewUrl: string | null;
  errorMessage: string | null;
  createdAt: string;
  matchReason?: string;
}

export interface Campaign {
  id: string;
  subject: string;
  body: string;
  senderEmail: string;
  startTime: string;
  delaySeconds: number;
  hourlyLimit: number;
  totalLeads: number;
  status: 'pending' | 'in_progress' | 'done';
  createdAt: string;
}

export interface SchedulePayload {
  subject: string;
  body: string;
  leads: string[]; // array of emails
  startTime: string; // ISO string
  delaySeconds: number;
  hourlyLimit: number;
  senderEmail?: string;
}

export interface ScheduleResponse {
  success: boolean;
  campaignId: string;
  totalScheduled: number;
  startTime: string;
  delaySeconds: number;
  hourlyLimit: number;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
}

export interface QueueStats {
  isPaused: boolean;
  concurrency: number;
  jobsPerInterval: number;
  limiterIntervalMs: number;
  queueDepth: number;
  activeWorkers: number;
  counts: {
    total: number;
    scheduled: number;
    sent: number;
    failed: number;
    rateLimited: number;
    inMemoryDelayed: number;
  };
  rateLimitCounters: Record<string, number>;
}

export interface QueueLog {
  id: string;
  timestamp: string;
  level: 'info' | 'warn' | 'error' | 'success';
  message: string;
  details?: Record<string, unknown>;
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
