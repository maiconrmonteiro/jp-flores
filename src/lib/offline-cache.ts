const CACHE_PREFIX = "offline_cache_";

export function getCachedData<T>(key: string): T | undefined {
  try {
    const raw = localStorage.getItem(CACHE_PREFIX + key);
    if (!raw) return undefined;
    const { data } = JSON.parse(raw);
    return data as T;
  } catch {
    return undefined;
  }
}

export function setCachedData<T>(key: string, data: T): void {
  try {
    localStorage.setItem(CACHE_PREFIX + key, JSON.stringify({ data, ts: Date.now() }));
  } catch {
    // localStorage full, ignore
  }
}
