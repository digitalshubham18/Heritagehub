import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export const cn = (...i: ClassValue[]) => twMerge(clsx(i));

/** Money is stored in paise (integer minor units). */
export const inr = (minor: number) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: minor % 100 === 0 ? 0 : 2 }).format(minor / 100);

export const TZ = "Asia/Kolkata";
export function istParts(d = new Date()) {
  const f = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false });
  const p = Object.fromEntries(f.formatToParts(d).map((x) => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, minutes: (Number(p.hour) % 24) * 60 + Number(p.minute) };
}
export const todayIST = () => istParts().date;
export function addDays(date: string, n: number) {
  const d = new Date(date + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
export const daysBetween = (a: string, b: string) => Math.round((Date.parse(b + "T00:00:00Z") - Date.parse(a + "T00:00:00Z")) / 86400000);
export const dow = (date: string) => new Date(date + "T00:00:00Z").getUTCDay();
export const toMin = (hhmm: string) => { const [h, m] = hhmm.split(":").map(Number); return h * 60 + m; };
export const toHHMM = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
export const fmtTime = (hhmm: string) => { const [h, m] = hhmm.split(":").map(Number); return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`; };
export const fmtDate = (date: string) => new Date(date + "T00:00:00Z").toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
export const startOfDayIST = (date = todayIST()) => new Date(date + "T00:00:00+05:30");
export const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export type Level = "low" | "moderate" | "high" | "very_high";
export const LEVEL_LABEL: Record<Level, string> = { low: "Low", moderate: "Moderate", high: "High", very_high: "Very High" };
export type Thresholds = { moderate: number; high: number; veryHigh: number };
export const DEFAULT_THRESHOLDS: Thresholds = { moderate: 40, high: 70, veryHigh: 90 };
export const classify = (pct: number, t: Thresholds = DEFAULT_THRESHOLDS): Level =>
  pct >= t.veryHigh ? "very_high" : pct >= t.high ? "high" : pct >= t.moderate ? "moderate" : "low";
