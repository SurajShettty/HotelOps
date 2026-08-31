import { clearSession, getRefreshToken, getToken, setAccessToken } from './auth';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: string,
  ) {
    super(message);
  }
}

let refreshPromise: Promise<string> | null = null;

async function refreshAccessToken(): Promise<string> {
  if (!refreshPromise) {
    refreshPromise = (async () => {
      const refreshToken = getRefreshToken();
      if (!refreshToken) throw new Error('No refresh token available');

      const res = await fetch(`${API_BASE_URL}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error('Refresh failed');

      setAccessToken(body.data.accessToken);
      return body.data.accessToken as string;
    })().finally(() => {
      refreshPromise = null;
    });
  }
  return refreshPromise;
}

async function rawFetch(path: string, token: string | null, init?: RequestInit) {
  return fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init?.headers,
    },
  });
}

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const isAuthEndpoint = path === '/auth/login' || path === '/auth/refresh';
  let res = await rawFetch(path, getToken(), init);

  if (res.status === 401 && !isAuthEndpoint) {
    try {
      const newToken = await refreshAccessToken();
      res = await rawFetch(path, newToken, init);
    } catch {
      if (typeof window !== 'undefined') {
        clearSession();
        window.location.href = '/login';
      }
      throw new ApiError('Session expired', 401);
    }
  }

  const body = await res.json();

  if (!res.ok) {
    if (res.status === 401 && typeof window !== 'undefined' && !isAuthEndpoint) {
      clearSession();
      window.location.href = '/login';
    }
    throw new ApiError(body?.error?.message ?? `Request to ${path} failed with status ${res.status}`, res.status, body?.error?.code);
  }

  return body.data as T;
}
