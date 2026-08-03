type CacheEntry = { value: unknown; at: number };

const memory = new Map<string, CacheEntry>();
const inFlight = new Map<string, Promise<unknown>>();
const STORAGE_KEY = "zepto-client-cache-v1";
const DEFAULT_TTL_MS = 5 * 60 * 1000;

function readStorage(): Record<string, CacheEntry> {
  try {
    return JSON.parse(sessionStorage.getItem(STORAGE_KEY) ?? "{}") as Record<string, CacheEntry>;
  } catch {
    return {};
  }
}

function writeStorage(key: string, entry: CacheEntry): void {
  try {
    const all = readStorage();
    all[key] = entry;
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(all));
  } catch {
    // storage quota or privacy mode: memory cache still works
  }
}

function isFresh(entry: CacheEntry, ttlMs: number): boolean {
  return Date.now() - entry.at < ttlMs;
}

/**
 * Client-side GET helper with in-memory + session-scoped caching so pages
 * never refetch the same read-only endpoint while it is still fresh. Returns
 * the parsed JSON body. Throws when the request fails.
 */
export async function cachedJson<T>(path: string, options?: { ttlMs?: number; force?: boolean }): Promise<T> {
  const ttlMs = options?.ttlMs ?? DEFAULT_TTL_MS;
  const force = options?.force ?? false;
  const now = Date.now();

  if (!force) {
    const mem = memory.get(path);
    if (mem && isFresh(mem, ttlMs)) return mem.value as T;
    const stored = readStorage()[path];
    if (stored && isFresh(stored, ttlMs)) {
      memory.set(path, stored);
      return stored.value as T;
    }
  }

  const pending = inFlight.get(path);
  if (pending) return pending as Promise<T>;

  const request = (async () => {
    const response = await fetch(path, { cache: "no-store" });
    if (!response.ok) throw new Error(`Request failed with HTTP ${response.status}.`);
    const value: unknown = await response.json();
    const entry: CacheEntry = { value, at: Date.now() };
    memory.set(path, entry);
    writeStorage(path, entry);
    return value;
  })();
  inFlight.set(path, request);
  try {
    return (await request) as T;
  } finally {
    inFlight.delete(path);
  }
}

/** Removes a cached entry (or everything) so the next read refetches. */
export function clearCached(path?: string): void {
  if (path) {
    memory.delete(path);
    const all = readStorage();
    delete all[path];
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(all));
    } catch {
      // ignore
    }
    return;
  }
  memory.clear();
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}
