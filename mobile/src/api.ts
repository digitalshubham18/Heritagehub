import * as SecureStore from "expo-secure-store";

/** Point the app at your deployment: EXPO_PUBLIC_API_URL=https://your-domain (Android emulator reaches the host at 10.0.2.2). */
export const BASE = (process.env.EXPO_PUBLIC_API_URL || "http://10.0.2.2:3000").replace(/\/$/, "");
const KEY = "hh_token";
let token: string | null = null;

export async function loadToken() { token = await SecureStore.getItemAsync(KEY); return token; }
export async function setToken(t: string | null) { token = t; if (t) await SecureStore.setItemAsync(KEY, t); else await SecureStore.deleteItemAsync(KEY); }

export class ApiError extends Error { constructor(message: string, public status: number, public data?: any) { super(message); } }

export async function api<T = any>(path: string, opts: { method?: string; body?: unknown } = {}): Promise<T> {
  let r: Response;
  try {
    r = await fetch(BASE + path, { method: opts.method || (opts.body !== undefined ? "POST" : "GET"), headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined });
  } catch { throw new ApiError("Can't reach HeritageHub. Check your connection.", 0); }
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new ApiError(j.error || "Something went wrong", r.status, j);
  return j as T;
}
export const inr = (minor: number) => "₹" + (minor / 100).toLocaleString("en-IN", { maximumFractionDigits: minor % 100 === 0 ? 0 : 2 });
export const fmtTime = (hhmm: string) => { const [h, m] = hhmm.split(":").map(Number); return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`; };
export const istDate = (offset = 0) => { const d = new Date(Date.now() + offset * 86400000); return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(d); };
export const fmtDay = (iso: string) => new Date(iso + "T00:00:00Z").toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
