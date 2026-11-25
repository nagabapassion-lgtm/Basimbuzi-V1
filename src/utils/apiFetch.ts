// Central API fetch helpers.
//
// MIGRATION NOTE (Supabase backend): the browser talks ONLY to the same-origin
// /api/* functions, which are backed by the central Supabase database. The old
// silent fallback to static /data/*.json snapshots has been REMOVED — those
// snapshots were the reason two deployments (Vercel vs AI Studio) could show
// different dashboard amounts. Failures are now reported honestly.

export const AUTH_TOKEN_STORAGE_KEY = 'sc_basimbuzi_auth_token_v2';

const readAuthToken = (): string => {
  try {
    return window.localStorage.getItem(AUTH_TOKEN_STORAGE_KEY) || '';
  } catch {
    return '';
  }
};

const withAuthHeaders = (url: string, options?: RequestInit): RequestInit => {
  if (!url.startsWith('/api/')) return options || {};
  const token = readAuthToken();
  if (!token) return options || {};
  const headers: Record<string, string> = {
    ...((options?.headers as Record<string, string>) || {})
  };
  if (!headers['Authorization']) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return { ...options, headers };
};

const isHtmlBody = (text: string): boolean =>
  text.startsWith('<!DOCTYPE') || text.startsWith('<html') || text.startsWith('<div');

export async function safeFetchJson<T>(url: string, options?: RequestInit): Promise<T | null> {
  try {
    const fetchOpts: RequestInit = url.startsWith('/api/')
      ? { cache: 'no-store', ...withAuthHeaders(url, options) }
      : (options || {});
    const res = await fetch(url, fetchOpts);
    const text = await res.text();
    const trimmed = text.trim();
    if (!res.ok || isHtmlBody(trimmed)) {
      // Honest failure: no more fake "success" from stale static snapshots.
      return { success: false, error: `Request failed (HTTP ${res.status})` } as unknown as T;
    }
    return JSON.parse(trimmed) as T;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { success: false, error: msg || 'Network communication error.' } as unknown as T;
  }
}

export async function safeFetchMutation(url: string, options?: RequestInit): Promise<any> {
  try {
    const res = await fetch(url, withAuthHeaders(url, options));
    const text = await res.text();
    const trimmed = text.trim();
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      try {
        return JSON.parse(trimmed);
      } catch {}
    }
    if (!res.ok || isHtmlBody(trimmed)) {
      return { success: false, error: `Server error (${res.status}): ${res.statusText || 'Request failed'}` };
    }
    // 2xx but unexpected body shape
    return { success: false, error: 'Unexpected server response.' };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { success: false, error: msg || 'Network communication error.' };
  }
}
