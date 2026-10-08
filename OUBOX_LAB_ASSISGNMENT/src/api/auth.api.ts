import { apiRequest } from './client.ts';
import { User } from '../types/index.ts';

export const getMe = () => apiRequest<User>('/api/auth/me');

export const logoutUser = () =>
  apiRequest<{ success: boolean }>('/api/auth/logout', { method: 'POST' });

export const demoLogin = (email: string, name: string) =>
  apiRequest<{ success: boolean; user: User }>('/api/auth/demo-login', {
    method: 'POST',
    body: JSON.stringify({ email, name }),
  });
