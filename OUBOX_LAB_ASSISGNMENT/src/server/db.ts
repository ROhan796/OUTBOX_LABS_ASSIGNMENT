import fs from 'fs';
import path from 'path';
import { User, EmailCampaign, EmailJob, SlackAlert, QueueLog } from './types.ts';

interface DatabaseSchema {
  users: User[];
  campaigns: EmailCampaign[];
  jobs: EmailJob[];
  slackAlerts: SlackAlert[];
  logs: QueueLog[];
  rateLimits: Record<string, number>; // key: "senderEmail:YYYY-MM-DD-HH" -> count
}

// Where the JSON store lives. Defaults to ./data next to the app; set DATA_DIR
// to point it at a persistent disk on a hosting platform (see DEPLOY.md §7).
const DATA_DIR = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : path.resolve(process.cwd(), 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');

// Default initial user
const DEFAULT_USER: User = {
  id: 'usr_reachinbox_default',
  google_id: 'google_oauth_reachinbox_101',
  email: 'mukeshkumarmandal799736372@gmail.com',
  name: 'Mukesh Mandal',
  avatar_url: '/src/assets/images/avatar_executive_user_1791228537474.jpg',
  slack_access_token: null,
  slack_team_id: null,
  slack_channel_id: '#email-alerts',
  slack_webhook_url: null,
  created_at: new Date(Date.now() - 86400000 * 7).toISOString(),
};

class Database {
  private data: DatabaseSchema;
  private saveTimeout: NodeJS.Timeout | null = null;

  constructor() {
    this.data = this.load();
  }

  private load(): DatabaseSchema {
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }
      if (fs.existsSync(DB_FILE)) {
        const raw = fs.readFileSync(DB_FILE, 'utf-8');
        const parsed = JSON.parse(raw);
        return {
          users: parsed.users || [DEFAULT_USER],
          campaigns: parsed.campaigns || [],
          jobs: parsed.jobs || [],
          slackAlerts: parsed.slackAlerts || [],
          logs: parsed.logs || [],
          rateLimits: parsed.rateLimits || {},
        };
      }
    } catch (err) {
      console.error('[DB] Failed to load data from disk, creating default store:', err);
    }

    const initial: DatabaseSchema = {
      users: [DEFAULT_USER],
      campaigns: [],
      jobs: [],
      slackAlerts: [],
      logs: [],
      rateLimits: {},
    };
    this.persistSync(initial);
    return initial;
  }

  private scheduleSave() {
    if (this.saveTimeout) clearTimeout(this.saveTimeout);
    this.saveTimeout = setTimeout(() => {
      this.persistSync(this.data);
    }, 150);
  }

  private persistSync(dataToSave: DatabaseSchema) {
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }
      const tmpFile = `${DB_FILE}.tmp`;
      fs.writeFileSync(tmpFile, JSON.stringify(dataToSave, null, 2), 'utf-8');
      fs.renameSync(tmpFile, DB_FILE);
    } catch (err) {
      console.error('[DB] Error persisting data to disk:', err);
    }
  }

  // User operations
  getUser(id: string): User | undefined {
    return this.data.users.find((u) => u.id === id);
  }

  getUserByGoogleId(googleId: string): User | undefined {
    return this.data.users.find((u) => u.google_id === googleId);
  }

  getUserByEmail(email: string): User | undefined {
    return this.data.users.find((u) => u.email.toLowerCase() === email.toLowerCase());
  }

  getDefaultUser(): User {
    if (this.data.users.length === 0) {
      this.data.users.push(DEFAULT_USER);
      this.scheduleSave();
    }
    return this.data.users[0];
  }

  upsertUser(user: Partial<User> & { email: string }): User {
    const existingIndex = this.data.users.findIndex(
      (u) => u.email.toLowerCase() === user.email.toLowerCase() || (user.google_id && u.google_id === user.google_id)
    );

    if (existingIndex >= 0) {
      this.data.users[existingIndex] = {
        ...this.data.users[existingIndex],
        ...user,
      };
      this.scheduleSave();
      return this.data.users[existingIndex];
    }

    const newUser: User = {
      id: user.id || `usr_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      google_id: user.google_id || `google_${Date.now()}`,
      email: user.email,
      name: user.name || user.email.split('@')[0],
      avatar_url: user.avatar_url || '/src/assets/images/avatar_executive_user_1791228537474.jpg',
      slack_access_token: user.slack_access_token || null,
      slack_team_id: user.slack_team_id || null,
      slack_channel_id: user.slack_channel_id || '#email-alerts',
      slack_webhook_url: user.slack_webhook_url || null,
      created_at: new Date().toISOString(),
    };
    this.data.users.push(newUser);
    this.scheduleSave();
    return newUser;
  }

  updateUserSlack(userId: string, slackData: {
    slack_access_token?: string | null;
    slack_team_id?: string | null;
    slack_channel_id?: string | null;
    slack_webhook_url?: string | null;
  }): User | null {
    const user = this.getUser(userId);
    if (!user) return null;
    Object.assign(user, slackData);
    this.scheduleSave();
    return user;
  }

  // Campaign operations
  createCampaign(campaign: EmailCampaign): EmailCampaign {
    this.data.campaigns.unshift(campaign);
    this.scheduleSave();
    return campaign;
  }

  getCampaign(id: string): EmailCampaign | undefined {
    return this.data.campaigns.find((c) => c.id === id);
  }

  listCampaigns(userId?: string): EmailCampaign[] {
    if (userId) {
      return this.data.campaigns.filter((c) => c.user_id === userId);
    }
    return this.data.campaigns;
  }

  updateCampaignStatus(id: string, status: EmailCampaign['status']): void {
    const campaign = this.getCampaign(id);
    if (campaign) {
      campaign.status = status;
      this.scheduleSave();
    }
  }

  // Job operations
  createEmailJob(job: EmailJob): EmailJob {
    this.data.jobs.unshift(job);
    this.scheduleSave();
    return job;
  }

  getEmailJob(id: string): EmailJob | undefined {
    return this.data.jobs.find((j) => j.id === id);
  }

  getJobByIdempotencyKey(key: string): EmailJob | undefined {
    return this.data.jobs.find((j) => j.idempotency_key === key);
  }

  updateEmailJob(id: string, partial: Partial<EmailJob>): EmailJob | null {
    const job = this.getEmailJob(id);
    if (!job) return null;
    Object.assign(job, partial);
    this.scheduleSave();
    return job;
  }

  listEmailJobs(filter?: {
    status?: EmailJob['status'] | EmailJob['status'][];
    campaign_id?: string;
  }): EmailJob[] {
    return this.data.jobs.filter((j) => {
      if (filter?.status) {
        if (Array.isArray(filter.status)) {
          if (!filter.status.includes(j.status)) return false;
        } else if (j.status !== filter.status) {
          return false;
        }
      }
      if (filter?.campaign_id && j.campaign_id !== filter.campaign_id) {
        return false;
      }
      return true;
    });
  }

  getAllJobs(): EmailJob[] {
    return this.data.jobs;
  }

  // Slack alerts
  addSlackAlert(alert: SlackAlert): SlackAlert {
    this.data.slackAlerts.unshift(alert);
    if (this.data.slackAlerts.length > 200) {
      this.data.slackAlerts = this.data.slackAlerts.slice(0, 200);
    }
    this.scheduleSave();
    return alert;
  }

  listSlackAlerts(): SlackAlert[] {
    return this.data.slackAlerts;
  }

  // Queue logs
  addLog(log: Omit<QueueLog, 'id' | 'timestamp'>): QueueLog {
    const entry: QueueLog = {
      id: `log_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      timestamp: new Date().toISOString(),
      ...log,
    };
    this.data.logs.unshift(entry);
    if (this.data.logs.length > 500) {
      this.data.logs = this.data.logs.slice(0, 500);
    }
    this.scheduleSave();
    return entry;
  }

  listLogs(limit = 100): QueueLog[] {
    return this.data.logs.slice(0, limit);
  }

  // Rate limit counters (atomic per-sender per-hour)
  getRateLimitKey(senderEmail: string, date: Date = new Date()): string {
    const pad = (n: number) => n.toString().padStart(2, '0');
    const y = date.getUTCFullYear();
    const m = pad(date.getUTCMonth() + 1);
    const d = pad(date.getUTCDate());
    const h = pad(date.getUTCHours());
    return `rate_limit:${senderEmail.toLowerCase()}:${y}-${m}-${d}-${h}`;
  }

  getHourlyCount(senderEmail: string, date?: Date): number {
    const key = this.getRateLimitKey(senderEmail, date);
    return this.data.rateLimits[key] || 0;
  }

  incrementHourlyCount(senderEmail: string, date?: Date): number {
    const key = this.getRateLimitKey(senderEmail, date);
    const current = this.data.rateLimits[key] || 0;
    const next = current + 1;
    this.data.rateLimits[key] = next;
    this.scheduleSave();
    return next;
  }

  decrementHourlyCount(senderEmail: string, date?: Date): number {
    const key = this.getRateLimitKey(senderEmail, date);
    const current = this.data.rateLimits[key] || 0;
    const next = Math.max(0, current - 1);
    this.data.rateLimits[key] = next;
    this.scheduleSave();
    return next;
  }

  getAllRateLimitCounters(): Record<string, number> {
    return { ...this.data.rateLimits };
  }

  resetAllData(): void {
    this.data.campaigns = [];
    this.data.jobs = [];
    this.data.slackAlerts = [];
    this.data.logs = [];
    this.data.rateLimits = {};
    this.scheduleSave();
  }
}

export const db = new Database();
