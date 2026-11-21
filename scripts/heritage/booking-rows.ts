/** Turns one spreadsheet row (official hours and prices) plus a directory entry into a validated destination. Pure, so it is unit-tested. */
import { destinationSchema } from "../../src/lib/validators";

/** Minimal CSV reader: handles quoted fields, commas and newlines inside quotes, and "" escapes. */
export function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = []; let row: string[] = [], f = "", q = false;
  const t = text.replace(/^\uFEFF/, "");
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (q) { if (c === '"' && t[i + 1] === '"') { f += '"'; i++; } else if (c === '"') q = false; else f += c; }
    else if (c === '"') q = true;
    else if (c === ",") { row.push(f); f = ""; }
    else if (c === "\n" || c === "\r") { if (c === "\r" && t[i + 1] === "\n") i++; row.push(f); f = ""; if (row.some((x) => x.trim())) rows.push(row); row = []; }
    else f += c;
  }
  row.push(f); if (row.some((x) => x.trim())) rows.push(row);
  const [head, ...body] = rows; if (!head) return [];
  const keys = head.map((h) => h.trim().toLowerCase());
  return body.map((r) => Object.fromEntries(keys.map((k, i) => [k, (r[i] ?? "").trim()])));
}

const DAY = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
export function parseClosedDays(s: string): number[] | null {
  if (!s.trim() || /^(none|no|-)$/i.test(s.trim())) return [];
  const out: number[] = [];
  for (const part of s.split(/[\s,;/|]+/).filter(Boolean)) {
    const n = /^\d$/.test(part) ? +part : DAY.indexOf(part.slice(0, 3).toLowerCase());
    if (n < 0 || n > 6) return null; if (!out.includes(n)) out.push(n);
  }
  return out;
}
const time = (s: string) => { const m = s.trim().match(/^(\d{1,2}):(\d{2})$/); return m && +m[1] < 24 && +m[2] < 60 ? `${m[1].padStart(2, "0")}:${m[2]}` : null; };
const rupees = (s: string) => { if (!s.trim()) return undefined; const n = Number(s.replace(/[₹,\s]/g, "")); return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : NaN; };
const int = (s: string) => { const n = Number(s.replace(/[,\s]/g, "")); return Number.isInteger(n) && n > 0 ? n : null; };

export type RowResult = { ok: true; data: any } | { ok: false; error: string };

/** Required columns: slug, open, close, indian_price, capacity_per_slot. Everything else is optional. Nothing is defaulted for prices, hours or capacity. */
export function rowToDestination(r: Record<string, string>, site: any): RowResult {
  const err = (m: string): RowResult => ({ ok: false, error: m });
  const open = time(r.open || ""), close = time(r.close || "");
  if (!open || !close) return err("open and close must look like 09:00 and 17:30");
  if (open >= close) return err("close must be later than open");
  const closed = parseClosedDays(r.closed_days || ""); if (!closed) return err("closed_days must be day names like Fri or Mon;Tue (or blank)");
  const indian = rupees(r.indian_price || ""); if (indian === undefined || Number.isNaN(indian)) return err("indian_price is required (rupees, 0 if free)");
  const foreign = rupees(r.foreign_price || ""); if (Number.isNaN(foreign)) return err("foreign_price is not a number");
  const child = rupees(r.child_price || ""); if (Number.isNaN(child)) return err("child_price is not a number");
  const cap = int(r.capacity_per_slot || ""); if (!cap) return err("capacity_per_slot must be a whole number above 0");
  const daily = r.daily_visitors ? int(r.daily_visitors) : cap * 8; if (!daily) return err("daily_visitors must be a whole number");
  const lat = r.lat ? Number(r.lat) : site.location?.lat, lng = r.lng ? Number(r.lng) : site.location?.lng;
  if (lat == null || lng == null || !Number.isFinite(lat) || !Number.isFinite(lng)) return err("this site has no map position; add lat and lng columns");
  const categories: any[] = [{ name: "Indian citizen", audience: "indian", priceMinor: indian, feeMinor: 0 }];
  if (foreign !== undefined) categories.push({ name: "Foreign visitor", audience: "foreign", priceMinor: foreign, feeMinor: 0 });
  if (child !== undefined) categories.push({ name: "Child", audience: "child", priceMinor: child, feeMinor: 0 });
  const short = (site.summary || `${site.name} in ${site.city || site.state}.`).replace(/\s+/g, " ").slice(0, 297);
  const input = {
    name: site.name, slug: site.slug, city: site.city || site.state, state: site.state || "India", type: site.type,
    shortDescription: short.length >= 10 ? short : `${site.name}, ${site.state}.`, history: site.summary || "",
    images: (site.images || []).map((i: any) => i.thumbUrl || i.url),
    location: { lat, lng, address: r.address || [site.city, site.state].filter(Boolean).join(", ") },
    hours: { open, close, closedDays: closed }, slotDurationMin: 60, defaultSlotCapacity: cap, occupancyLimit: int(r.max_inside || "") || cap * 5, avgDailyVisitors: daily,
    crowdThresholds: { moderate: 40, high: 70, veryHigh: 90 }, alertThresholdPct: 85, categories, heritageSlug: site.slug,
  };
  const p = destinationSchema.safeParse(input);
  return p.success ? { ok: true, data: p.data } : err(p.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "));
}
