"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { api, useApi } from "./hooks";

/**
 * Offline outbox for the parking and counter pages. Actions taken without a connection are stored on this device, in order, and replayed when the
 * connection returns. Replays are safe: counter sales carry an idempotency key, parking entries reject a vehicle that is already parked, and exits reject
 * a vehicle already checked out. A replay the server refuses (for example the car park turned out to be full) is kept as a CONFLICT for a person to resolve, never dropped.
 */
export type OutboxItem = { id: string; kind: "counter_sale" | "parking_entry" | "parking_exit" | "parking_pass"; url: string; body: any; at: string; label: string; error?: string; status: "pending" | "conflict" };
const KEY = (scope: string) => `hh_outbox_v1:${scope}`;
const load = (scope: string): OutboxItem[] => { try { return JSON.parse(localStorage.getItem(KEY(scope)) || "[]"); } catch { return []; } };
const save = (scope: string, v: OutboxItem[]) => { try { localStorage.setItem(KEY(scope), JSON.stringify(v)); } catch { /* storage full or blocked */ } };
/** A fetch that never reached the server has no HTTP status. */
export const isNetworkError = (e: any) => e && e.status === undefined;
export const newId = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`);

export function cacheSet(key: string, data: unknown) { try { localStorage.setItem(`hh_cache_v1:${key}`, JSON.stringify({ at: Date.now(), data })); } catch { /* ignore */ } }
export function cacheGet<T = any>(key: string): { at: number; data: T } | null { try { const v = localStorage.getItem(`hh_cache_v1:${key}`); return v ? JSON.parse(v) : null; } catch { return null; } }

export function useOnline() {
  const [on, setOn] = useState(true);
  useEffect(() => {
    setOn(navigator.onLine);
    const a = () => setOn(true), b = () => setOn(false);
    window.addEventListener("online", a); window.addEventListener("offline", b);
    return () => { window.removeEventListener("online", a); window.removeEventListener("offline", b); };
  }, []);
  return on;
}

export function useOutbox(scope: string, onSynced?: (item: OutboxItem, result: any) => void) {
  const [items, setItems] = useState<OutboxItem[]>([]);
  const busy = useRef(false), cb = useRef(onSynced);
  cb.current = onSynced;
  useEffect(() => { setItems(load(scope)); }, [scope]);
  const persist = useCallback((next: OutboxItem[]) => { save(scope, next); setItems(next); }, [scope]);
  const enqueue = useCallback((i: Omit<OutboxItem, "id" | "status" | "at"> & { at?: string }) => {
    const item: OutboxItem = { id: newId(), status: "pending", at: new Date().toISOString(), ...i };
    persist([...load(scope), item]); return item;
  }, [persist, scope]);
  const flush = useCallback(async () => {
    if (busy.current) return; busy.current = true;
    try {
      for (const it of load(scope).filter((x) => x.status === "pending")) {
        try {
          const r = await api(it.url, { body: it.body, method: it.kind === "parking_pass" ? "POST" : undefined });
          persist(load(scope).filter((x) => x.id !== it.id)); cb.current?.(it, r);
        } catch (e: any) {
          if (isNetworkError(e)) break; // still offline: stop, keep order, try again later
          persist(load(scope).map((x) => (x.id === it.id ? { ...x, status: "conflict" as const, error: e.message } : x))); // the server said no: keep it for a person
        }
      }
    } finally { busy.current = false; }
  }, [persist, scope]);
  useEffect(() => {
    const t = setInterval(() => { if (navigator.onLine && load(scope).some((x) => x.status === "pending")) flush(); }, 15000);
    const on = () => { setTimeout(flush, 800); };
    window.addEventListener("online", on); if (navigator.onLine) flush();
    return () => { clearInterval(t); window.removeEventListener("online", on); };
  }, [flush, scope]);
  const discard = useCallback((id: string) => persist(load(scope).filter((x) => x.id !== id)), [persist, scope]);
  const retry = useCallback((id: string) => { persist(load(scope).map((x) => (x.id === id ? { ...x, status: "pending" as const, error: undefined } : x))); setTimeout(flush, 100); }, [persist, scope, flush]);
  return { items, pending: items.filter((x) => x.status === "pending").length, conflicts: items.filter((x) => x.status === "conflict"), enqueue, flush, discard, retry };
}

/** Like useApi, but remembers the last good answer on this device and serves it when the network is down, so offline-capable pages can still open. */
export function useCachedApi<T = any>(url: string | null, key: string, opts: { poll?: number } = {}) {
  const r = useApi<T>(url, opts);
  const [cached, setCached] = useState<T | null>(null);
  useEffect(() => { setCached(url ? (cacheGet<T>(key)?.data ?? null) : null); }, [url, key]);
  useEffect(() => { if (r.data) cacheSet(key, r.data); }, [r.data, key]);
  const data = r.data || cached;
  return { ...r, data, loading: r.loading && !cached, error: data ? null : r.error, stale: !r.data && !!cached };
}
