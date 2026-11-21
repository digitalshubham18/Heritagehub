"use client";
import { useCallback, useEffect, useState } from "react";
import { clearApiCache, dedupe, peek, put } from "./api-cache";

export async function api<T = any>(url: string, opts: { method?: string; body?: unknown } = {}): Promise<T> {
  const method = opts.method || (opts.body !== undefined ? "POST" : "GET");
  if (method === "GET") return dedupe(url, () => request<T>(url, opts));
  try { return await request<T>(url, opts); } finally { clearApiCache(); } // any write (including login/logout) invalidates every cached read
}

async function request<T>(url: string, opts: { method?: string; body?: unknown }): Promise<T> {
  const r = await fetch(url, {
    method: opts.method || (opts.body !== undefined ? "POST" : "GET"),
    headers: opts.body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined, cache: "no-store",
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) { const e: any = new Error(j.error || "Request failed"); e.status = r.status; e.issues = j.issues; e.data = j; throw e; }
  return j;
}

/**
 * Fetches `url` (null = idle). Data, error and loading are always tied to the *current* url, so there is never a
 * render where a new url reports "not loading" with no data, and a url change never shows the previous url's data.
 * `poll` refetches silently (no loading flash); `reload()` does the same on demand.
 */
export function useApi<T = any>(url: string | null, { poll = 0 }: { poll?: number } = {}) {
  const [st, setSt] = useState<{ url: string | null; data: T | null; error: string | null }>({ url: null, data: null, error: null });
  const load = useCallback(async () => {
    if (!url) return;
    try { const d = await api<T>(url); put(url, d); setSt({ url, data: d, error: null }); }
    catch (e: any) { setSt((p) => ({ url, data: p.url === url ? p.data : null, error: e.message })); }
  }, [url]);
  useEffect(() => {
    load();
    if (!poll || !url) return;
    const t = setInterval(load, poll);
    return () => clearInterval(t);
  }, [load, poll, url]);
  const fresh = st.url === url;
  // A previously fetched copy of this URL is shown instantly while the refetch above runs (stale-while-revalidate).
  const pk = !fresh ? peek<T>(url) : null, cached = pk && pk.fresh ? pk : null; // only copies still inside their time limit
  return {
    data: fresh ? st.data : cached ? cached.data : null,
    error: fresh ? st.error : null,
    loading: !!url && !fresh && !cached,
    reload: load,
    setData: (d: T | null) => setSt((p) => ({ ...p, data: d })),
  };
}

export type SessionUser = { id: string; name: string; email: string; role: "tourist" | "staff" | "admin" | "operator"; phone?: string; nationality?: string; favorites: string[]; assignedDestinations: string[] };
export function useUser() {
  const r = useApi<{ user: SessionUser | null }>("/api/auth/me");
  return { user: r.data?.user ?? null, loading: r.loading, reload: r.reload };
}
