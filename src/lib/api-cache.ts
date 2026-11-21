/**
 * Tiny client-side GET cache used by useApi().
 *  - Instant repeat views: a recently fetched URL is shown immediately while a fresh copy loads in the background
 *    (stale-while-revalidate), so going back to a page, or clicking between pages that share data, no longer waits on the network.
 *  - De-duplication: if five components ask for /api/auth/me at once, only one request is sent.
 *  - Safety: any write (POST/PATCH/DELETE), including login and logout, clears the whole cache, so nobody ever sees
 *    another account's data or a stale copy of something they just changed.
 */
type Entry = { at: number; data: unknown };
const store = new Map<string, Entry>();
const inflight = new Map<string, Promise<unknown>>();
const MAX_ENTRIES = 200;

/** How long a cached copy may be shown instantly before it must be refetched first. Per-user and fast-moving data gets less. */
export function ttlFor(url: string): number {
  if (url.startsWith("/api/auth/me")) return 5 * 60_000;
  if (/^\/api\/(slots|crowd|parking|live|headcount|bookings|notifications)/.test(url)) return 15_000;
  return 60_000;
}

export function peek<T>(url: string | null): { data: T; fresh: boolean } | null {
  if (!url) return null;
  const e = store.get(url);
  if (!e) return null;
  return { data: e.data as T, fresh: Date.now() - e.at < ttlFor(url) };
}

export function put(url: string, data: unknown) {
  if (store.size >= MAX_ENTRIES) store.delete(store.keys().next().value as string); // drop the oldest
  store.delete(url); store.set(url, { at: Date.now(), data });
}

/** Runs `fetcher` once per URL at a time; concurrent callers share the same promise. */
export function dedupe<T>(url: string, fetcher: () => Promise<T>): Promise<T> {
  const p = inflight.get(url) as Promise<T> | undefined;
  if (p) return p;
  const n = fetcher().finally(() => inflight.delete(url));
  inflight.set(url, n);
  return n;
}

export function clearApiCache() { store.clear(); inflight.clear(); }
export const _size = () => store.size;
