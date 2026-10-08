import { apiRequest } from './client.ts';
import { QueueStats, QueueLog, SlackAlert } from '../types/index.ts';

export interface AdminQueuesResponse {
  stats: QueueStats;
  logs: QueueLog[];
  alerts: SlackAlert[];
  workers: Array<{ id: string; status: string; processedCount: number }>;
}

export const getQueueAdminData = () => apiRequest<AdminQueuesResponse>('/api/admin/queues');

export const pauseQueue = () =>
  apiRequest<{ success: boolean; isPaused: boolean }>('/api/admin/queues/pause', {
    method: 'POST',
  });

export const resumeQueue = () =>
  apiRequest<{ success: boolean; isPaused: boolean }>('/api/admin/queues/resume', {
    method: 'POST',
  });

export const seedDemoCampaign = () =>
  apiRequest<{ success: boolean; message: string; campaignId: string }>(
    '/api/admin/queues/seed-demo',
    { method: 'POST' }
  );

export const simulateRateLimitTest = () =>
  apiRequest<{ success: boolean; message: string; campaignId: string }>(
    '/api/admin/queues/simulate-rate-limit',
    { method: 'POST' }
  );

export const resetQueues = () =>
  apiRequest<{ success: boolean; message: string }>('/api/admin/queues/reset', {
    method: 'POST',
  });
