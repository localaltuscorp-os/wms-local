import { firebaseAuth } from './firebase';

/**
 * Base URL of the Altus backend the app talks to. Defaults to the deployed
 * production app so it works from a real phone over the internet; override at
 * build time with EXPO_PUBLIC_API_BASE for staging/local.
 */
export const API_BASE = process.env.EXPO_PUBLIC_API_BASE ?? 'https://wms.mananvasa.com';

class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

/** Fetch with the current user's fresh Firebase ID token as a Bearer header. */
async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const user = firebaseAuth.currentUser;
  if (!user) throw new ApiError(401, 'not-authenticated');
  const token = await user.getIdToken();
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new ApiError(res.status, body.error ?? `HTTP ${res.status}`);
  }
  return (await res.json()) as T;
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, data?: unknown) =>
    request<T>(path, { method: 'POST', body: data ? JSON.stringify(data) : undefined }),
};

export { ApiError };
