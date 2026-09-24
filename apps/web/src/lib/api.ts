import type { AuthResponse } from '@aischool/shared';
import { useAuthStore } from './auth-store';

export interface FieldError {
  path: string;
  message: string;
}

export class ApiError extends Error {
  readonly status: number;
  readonly errors: FieldError[];

  constructor(status: number, message: string, errors: FieldError[] = []) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.errors = errors;
  }
}

export function errorMessage(error: unknown, fallback = 'Something went wrong. Please try again.'): string {
  if (error instanceof ApiError || error instanceof Error) return error.message || fallback;
  return fallback;
}

type QueryValue = string | number | boolean | null | undefined;

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  query?: Record<string, QueryValue>;
  signal?: AbortSignal;
  /** Skip the refresh-and-retry dance (used by auth endpoints themselves). */
  noRefresh?: boolean;
}

const BASE = '/api';

function buildUrl(path: string, query?: Record<string, QueryValue>): string {
  const url = `${BASE}${path.startsWith('/') ? path : `/${path}`}`;
  if (!query) return url;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === '') continue;
    params.set(key, String(value));
  }
  const qs = params.toString();
  return qs ? `${url}?${qs}` : url;
}

async function send(path: string, opts: RequestOptions): Promise<Response> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  const token = useAuthStore.getState().accessToken;
  if (token) headers.Authorization = `Bearer ${token}`;
  let body: string | undefined;
  if (opts.body !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(opts.body);
  }
  return fetch(buildUrl(path, opts.query), {
    method: opts.method ?? 'GET',
    headers,
    body,
    credentials: 'include',
    signal: opts.signal,
  });
}

interface ErrorBody {
  statusCode?: number;
  message?: string | string[];
  errors?: FieldError[];
}

async function toApiError(res: Response): Promise<ApiError> {
  let data: ErrorBody | null = null;
  try {
    data = (await res.json()) as ErrorBody;
  } catch {
    /* not JSON */
  }
  const raw = data?.message;
  const message =
    (Array.isArray(raw) ? raw.join('. ') : raw) ||
    (res.status >= 500
      ? 'The server ran into a problem. Please try again shortly.'
      : res.status === 404
        ? 'Not found.'
        : res.statusText || 'Request failed');
  const errors = Array.isArray(data?.errors) ? data.errors : [];
  return new ApiError(res.status, message, errors);
}

async function parse<T>(res: Response): Promise<T> {
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

let refreshInFlight: Promise<AuthResponse | null> | null = null;

/**
 * Exchange the httpOnly refresh cookie for a new access token. Concurrent
 * callers share one request so the refresh token is never replayed.
 */
export function refreshSession(): Promise<AuthResponse | null> {
  if (!refreshInFlight) {
    refreshInFlight = (async () => {
      try {
        const res = await fetch(`${BASE}/auth/refresh`, {
          method: 'POST',
          credentials: 'include',
          headers: { Accept: 'application/json' },
        });
        if (!res.ok) return null;
        const session = await parse<AuthResponse>(res);
        if (!session?.accessToken) return null;
        useAuthStore.getState().setSession(session);
        return session;
      } catch {
        return null;
      } finally {
        refreshInFlight = null;
      }
    })();
  }
  return refreshInFlight;
}

export async function request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  let res: Response;
  try {
    res = await send(path, opts);
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') throw err;
    throw new ApiError(0, "Can't reach the server. Check your connection and try again.");
  }

  if (res.status === 401 && !opts.noRefresh) {
    const session = await refreshSession();
    if (!session) {
      useAuthStore.getState().clear();
      throw new ApiError(401, 'Your session has expired. Please sign in again.');
    }
    res = await send(path, opts);
    if (res.status === 401) {
      useAuthStore.getState().clear();
      throw new ApiError(401, 'Your session has expired. Please sign in again.');
    }
  }

  if (!res.ok) throw await toApiError(res);
  return parse<T>(res);
}

export const api = {
  get: <T>(path: string, query?: Record<string, QueryValue>, signal?: AbortSignal) =>
    request<T>(path, { query, signal }),
  post: <T>(path: string, body?: unknown, opts: Omit<RequestOptions, 'method' | 'body'> = {}) =>
    request<T>(path, { ...opts, method: 'POST', body }),
  patch: <T>(path: string, body?: unknown) => request<T>(path, { method: 'PATCH', body }),
  delete: <T = void>(path: string) => request<T>(path, { method: 'DELETE' }),
};
