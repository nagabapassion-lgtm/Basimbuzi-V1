export async function safeFetchJson<T>(url: string, options?: RequestInit): Promise<T | null> {
  try {
    const res = await fetch(url, options);
    const text = await res.text();
    const trimmed = text.trim();
    if (!res.ok || trimmed.startsWith('<!DOCTYPE') || trimmed.startsWith('<html') || trimmed.startsWith('<div')) {
      return null;
    }
    return JSON.parse(trimmed) as T;
  } catch {
    return null;
  }
}

export async function safeFetchMutation(url: string, options?: RequestInit): Promise<any> {
  try {
    const res = await fetch(url, options);
    const text = await res.text();
    const trimmed = text.trim();
    if (!res.ok || trimmed.startsWith('<!DOCTYPE') || trimmed.startsWith('<html') || trimmed.startsWith('<div')) {
      return { success: false, error: 'Backend API service unavailable (static hosting mode).' };
    }
    return JSON.parse(trimmed);
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : 'Network communication error' };
  }
}
