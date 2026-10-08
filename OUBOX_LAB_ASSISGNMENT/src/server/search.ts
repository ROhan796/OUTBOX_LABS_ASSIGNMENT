import { db } from './db.ts';
import { EmailJob } from './types.ts';

interface SearchIndexDocument {
  jobId: string;
  campaignId: string;
  recipientEmail: string;
  senderEmail: string;
  subject: string;
  body: string;
  status: string;
  sentAt: string | null;
  scheduledAt: string;
}

interface EsHit {
  _id: string;
  _score: number;
  _source?: SearchIndexDocument;
}

/**
 * Optional Elasticsearch driver (SYSTEM_DESIGN.md §12).
 *
 * Activated by setting ELASTICSEARCH_URL (e.g. http://localhost:9200 from
 * `docker-compose.yml`). When it is absent or unreachable the service falls
 * back to the in-process weighted index below, so search always works.
 * No extra npm dependency is required — Elasticsearch's REST API is used
 * directly through the global fetch.
 */
const ES_URL = (process.env.ELASTICSEARCH_URL || '').replace(/\/+$/, '');
const ES_INDEX = process.env.ELASTICSEARCH_INDEX || 'emails';

class ElasticsearchDriver {
  public enabled = ES_URL.length > 0;
  public healthy = false;
  private warned = false;

  private log(level: 'info' | 'warn', message: string): void {
    db.addLog({ level, message: `[Elasticsearch] ${message}` });
  }

  private fail(message: string): void {
    this.healthy = false;
    if (!this.warned) {
      this.warned = true;
      this.log('warn', `${message} — falling back to in-process search.`);
    }
  }

  private async request(path: string, init?: RequestInit): Promise<any | null> {
    if (!this.enabled) return null;
    try {
      const res = await fetch(`${ES_URL}${path}`, {
        ...init,
        headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) },
      });
      if (!res.ok) {
        this.fail(`Request ${path} responded ${res.status}`);
        return null;
      }
      return await res.json();
    } catch (err: any) {
      this.fail(`Request ${path} failed (${err.message})`);
      return null;
    }
  }

  async init(): Promise<boolean> {
    if (!this.enabled) return false;

    const cluster = await this.request('/');
    if (!cluster) return false;

    this.healthy = true;
    this.warned = false;

    const created = await this.request(`/${ES_INDEX}`, {
      method: 'PUT',
      body: JSON.stringify({
        mappings: {
          properties: {
            jobId: { type: 'keyword' },
            campaignId: { type: 'keyword' },
            recipientEmail: { type: 'text', analyzer: 'standard', fields: { raw: { type: 'keyword' } } },
            senderEmail: { type: 'text', analyzer: 'standard', fields: { raw: { type: 'keyword' } } },
            subject: { type: 'text', analyzer: 'standard' },
            body: { type: 'text', analyzer: 'standard' },
            status: { type: 'keyword' },
            sentAt: { type: 'date' },
            scheduledAt: { type: 'date' },
          },
        },
      }),
    });

    // 200 (exists) or 400 index_already_exists are both fine
    void created;
    this.log('info', `Connected to ${ES_URL} — using index "${ES_INDEX}".`);
    return true;
  }

  async index(doc: SearchIndexDocument): Promise<void> {
    if (!this.enabled || !this.healthy) return;
    await this.request(`/${ES_INDEX}/_doc/${encodeURIComponent(doc.jobId)}?refresh=false`, {
      method: 'PUT',
      body: JSON.stringify(doc),
    });
  }

  async bulkIndex(docs: SearchIndexDocument[]): Promise<void> {
    if (!this.enabled || !this.healthy || docs.length === 0) return;
    const lines: string[] = [];
    for (const doc of docs) {
      lines.push(JSON.stringify({ index: { _index: ES_INDEX, _id: doc.jobId } }));
      lines.push(JSON.stringify(doc));
    }
    await this.request('/_bulk?refresh=false', {
      method: 'POST',
      body: lines.join('\n') + '\n',
    });
  }

  /** Returns null when ES cannot answer so the caller can fall back. */
  async search(query: string): Promise<{ jobId: string; score: number }[] | null> {
    if (!this.enabled || !this.healthy) return null;

    const body = await this.request(`/${ES_INDEX}/_search`, {
      method: 'POST',
      body: JSON.stringify({
        size: 50,
        query: {
          simple_query_string: {
            query,
            default_operator: 'and',
            fields: ['recipientEmail^10', 'subject^7', 'senderEmail^5', 'status^4', 'body^2'],
          },
        },
      }),
    });

    if (!body || !body.hits) {
      this.healthy = this.enabled && this.healthy;
      return null;
    }

    const hits: EsHit[] = body.hits.hits || [];
    return hits.map((h) => ({
      jobId: h._id,
      score: h._score || 0,
    }));
  }
}

class SearchService {
  private index: Map<string, SearchIndexDocument> = new Map();
  public es = new ElasticsearchDriver();

  constructor() {
    this.rebuildIndexFromDb();
    void this.initElasticsearch();
  }

  private async initElasticsearch(): Promise<void> {
    if (!this.es.enabled) return;
    const up = await this.es.init();
    if (up) {
      await this.es.bulkIndex([...this.index.values()]);
    }
  }

  private toDocument(job: EmailJob): SearchIndexDocument {
    const campaign = db.getCampaign(job.campaign_id);
    return {
      jobId: job.id,
      campaignId: job.campaign_id,
      recipientEmail: job.recipient_email,
      senderEmail: campaign?.sender_email || 'outreach@reachinbox.test',
      subject: campaign?.subject || '',
      body: campaign?.body || '',
      status: job.status,
      sentAt: job.sent_at,
      scheduledAt: job.scheduled_at,
    };
  }

  rebuildIndexFromDb(): void {
    const jobs = db.getAllJobs();
    for (const job of jobs) {
      this.index.set(job.id, this.toDocument(job));
    }
  }

  indexJob(job: EmailJob): void {
    const doc = this.toDocument(job);
    this.index.set(job.id, doc);
    void this.es.index(doc);
  }

  private scoreLocalJob(
    job: EmailJob,
    tokens: string[]
  ): { score: number; matchReason: string } | null {
    const campaign = db.getCampaign(job.campaign_id);
    const recipient = job.recipient_email.toLowerCase();
    const subject = (campaign?.subject || '').toLowerCase();
    const body = (campaign?.body || '').toLowerCase();
    const sender = (campaign?.sender_email || '').toLowerCase();
    const status = job.status.toLowerCase();

    let score = 0;
    const reasons: string[] = [];

    for (const token of tokens) {
      if (recipient.includes(token)) {
        score += 10;
        reasons.push(`recipient (${job.recipient_email})`);
      }
      if (subject.includes(token)) {
        score += 7;
        reasons.push('subject');
      }
      if (sender.includes(token)) {
        score += 5;
        reasons.push('sender');
      }
      if (status.includes(token)) {
        score += 4;
        reasons.push(`status (${job.status})`);
      }
      if (body.includes(token)) {
        score += 2;
        reasons.push('body text');
      }
    }

    if (score <= 0) return null;
    return { score, matchReason: reasons.slice(0, 2).join(', ') };
  }

  private localSearch(tokens: string[]): (EmailJob & { matchReason?: string })[] {
    const results: { job: EmailJob; score: number; matchReason: string }[] = [];

    for (const job of db.getAllJobs()) {
      const scored = this.scoreLocalJob(job, tokens);
      if (scored) {
        results.push({ job, score: scored.score, matchReason: scored.matchReason });
      }
    }

    results.sort((a, b) => b.score - a.score);
    return results.map((r) => ({ ...r.job, matchReason: r.matchReason }));
  }

  async search(query: string): Promise<(EmailJob & { matchReason?: string })[]> {
    const q = (query || '').trim().toLowerCase();
    if (!q) {
      return db.getAllJobs().slice(0, 50);
    }

    const tokens = q.split(/\s+/).filter(Boolean);

    // Elasticsearch path (SYSTEM_DESIGN.md §12) with graceful fallback
    const esHits = await this.es.search(query);
    if (esHits) {
      const results: (EmailJob & { matchReason?: string })[] = [];
      for (const hit of esHits) {
        const job = db.getEmailJob(hit.jobId);
        if (!job) continue;
        const campaign = db.getCampaign(job.campaign_id);
        const haystack = [
          job.recipient_email,
          campaign?.subject || '',
          campaign?.sender_email || '',
          job.status,
        ]
          .join(' ')
          .toLowerCase();
        const matched = tokens.filter((t) => haystack.includes(t));
        results.push({
          ...job,
          matchReason: matched.length
            ? `elastic (${matched.slice(0, 2).join(', ')})`
            : 'elastic match',
        });
      }
      if (results.length > 0) return results;
      // fall through to local scoring when ES returned nothing usable
    }

    return this.localSearch(tokens);
  }
}

export const searchService = new SearchService();
