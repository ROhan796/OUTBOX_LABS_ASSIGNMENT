import axios, { AxiosError, AxiosRequestConfig, Method } from 'axios';

interface RequestOptions {
  method?: string;
  body?: string;
  headers?: Record<string, string>;
  params?: Record<string, string | number | boolean | undefined>;
  credentials?: RequestCredentials;
  [key: string]: unknown;
}

/**
 * Shared axios instance (FRONTEND.MD §8.2):
 *  - `withCredentials` on every request = the spec's `credentials: 'include'`
 *  - response interceptor unwraps `response.data` and normalises error bodies
 *    to `new Error('{error}')`, which is what all callers already expect
 *  - `baseURL` pairs with the documented `VITE_API_URL` env var (UNIFY.MD §11);
 *    left empty when the UI and API share one origin
 */
export const http = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '',
  withCredentials: true,
  headers: { 'Content-Type': 'application/json' },
});

http.interceptors.response.use(
  (response) => response.data,
  (error: AxiosError<{ error?: string; message?: string }>) => {
    const payload = error.response?.data;
    const message =
      payload?.error ||
      payload?.message ||
      `HTTP Error ${error.response?.status ?? 0}`;
    return Promise.reject(new Error(message));
  }
);

export async function apiRequest<T = any>(
  endpoint: string,
  options: RequestOptions = {}
): Promise<T> {
  const { params, body, headers, method = 'GET', ...rest } = options;

  const config: AxiosRequestConfig = {
    url: endpoint,
    method: method as Method,
    params,
    data: body,
    headers: { 'Content-Type': 'application/json', ...(headers || {}) },
    ...rest,
  };

  return (await http.request(config)) as T;
}
