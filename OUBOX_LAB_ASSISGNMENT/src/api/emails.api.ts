import { apiRequest } from './client.ts';
import {
  EmailJob,
  SchedulePayload,
  ScheduleResponse,
  PaginatedResponse,
} from '../types/index.ts';

export const scheduleEmails = (data: SchedulePayload) =>
  apiRequest<ScheduleResponse>('/api/emails/schedule', {
    method: 'POST',
    body: JSON.stringify(data),
  });

export const getScheduledEmails = (page = 1, limit = 20) =>
  apiRequest<PaginatedResponse<EmailJob>>('/api/emails/scheduled', {
    params: { page, limit },
  });

export const getSentEmails = (page = 1, limit = 20) =>
  apiRequest<PaginatedResponse<EmailJob>>('/api/emails/sent', {
    params: { page, limit },
  });

export const searchEmails = (q: string) =>
  apiRequest<EmailJob[]>('/api/emails/search', {
    params: { q },
  });

export const retryEmail = (jobId: string) =>
  apiRequest<{ success: boolean; message: string }>(`/api/emails/${jobId}/retry`, {
    method: 'POST',
  });
