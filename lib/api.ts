'use client';
import useSWR, { mutate } from 'swr';

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string,
  ) {
    super(message);
  }
}

/** Call the server. Throws ApiError with the server's plain-English message. */
export async function api<T = any>(path: string, method = 'GET', body?: any): Promise<T> {
  const init: RequestInit = { method, credentials: 'same-origin' };
  if (body instanceof FormData) init.body = body;
  else if (body !== undefined) {
    init.headers = { 'content-type': 'application/json' };
    init.body = JSON.stringify(body);
  }
  const res = await fetch('/api/' + path, init);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, data.error || 'Request failed', data.code);
  return data;
}

const fetcher = (p: string) => api(p);

/** Read data and keep it fresh (refetches on focus, optionally every `poll` ms). */
export function useApi<T = any>(path: string | null, poll = 0) {
  return useSWR<T>(path, fetcher, {
    refreshInterval: poll,
    revalidateOnFocus: true,
    shouldRetryOnError: false,
  });
}
export const refreshAll = () => mutate(() => true);

export const money = (minor: number | string | null | undefined) =>
  'Nu. ' +
  (Number(minor || 0) / 100).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
export const fmtDate = (d: string | Date | null | undefined) =>
  d ? new Date(d).toISOString().slice(0, 10) : '—';
export const fmtTime = (d: string | Date) =>
  new Date(d).toISOString().slice(0, 16).replace('T', ' ');
export const fmtSize = (b: number) =>
  b > 1048576 ? (b / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(b / 1024)) + ' KB';
export const ago = (at: string | Date) => {
  const s = (Date.now() - new Date(at).getTime()) / 1000;
  if (s < 60) return 'just now';
  if (s < 3600) return Math.floor(s / 60) + ' min ago';
  if (s < 86400) return Math.floor(s / 3600) + ' h ago';
  return Math.floor(s / 86400) + ' d ago';
};

/** The signed-in person: name, role, permissions, unread count. Refreshed every few seconds. */
export const useMe = () =>
  useSWR<any, ApiError>('me', fetcher, { refreshInterval: 5000, shouldRetryOnError: false });
