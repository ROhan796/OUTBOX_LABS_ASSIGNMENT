import { apiRequest } from './client.ts';
import { SlackAlert } from '../types/index.ts';

export interface SlackStatus {
  connected: boolean;
  channel: string;
  team: string;
  webhookConfigured: boolean;
  webhookUrl: string | null;
}

export const getSlackStatus = () => apiRequest<SlackStatus>('/api/slack/status');

export const disconnectSlack = () =>
  apiRequest<{ success: boolean; message: string }>('/api/slack/disconnect', {
    method: 'DELETE',
  });

export const configureSlackWebhook = (webhookUrl: string, channel: string) =>
  apiRequest<{ success: boolean; message: string }>('/api/slack/webhook-config', {
    method: 'POST',
    body: JSON.stringify({ webhookUrl, channel }),
  });

export const sendTestSlackAlert = (message?: string) =>
  apiRequest<{ success: boolean; message: string }>('/api/slack/test-alert', {
    method: 'POST',
    body: JSON.stringify({ message }),
  });

export const getSlackAlerts = () => apiRequest<SlackAlert[]>('/api/slack/alerts');
