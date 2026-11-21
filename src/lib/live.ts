import { Destination, EntryRecord, ParkingLot, PassEntry } from "@/models";
import { getOccupancy } from "./booking";
import { headcountFlow, headcountToday } from "./headcount";
import { waitMinutes } from "./crowd";
import { heldToday, availability } from "./parking";
import { classify, DEFAULT_THRESHOLDS, istParts, toMin, type Level } from "./utils";

export type Trend = "rising" | "steady" | "easing";
/** Minutes of flow used for the trend, and how long without any gate activity before we call the live reading quiet. */
export const FLOW_WINDOW_MIN = 15;
export const QUIET_AFTER_MIN = 45;

export function isOpenNow(dest: any, now = istParts()) {
  const dow = new Date(now.date + "T00:00:00Z").getUTCDay();
  if ((dest.hours?.closedDays || []).includes(dow)) return false;
  if ((dest.closures || []).some((c: any) => c.date === now.date)) return false;
  return now.minutes >= toMin(dest.hours.open) && now.minutes < toMin(dest.hours.close);
}

/** Net flow over the window decides the trend. The dead band scales with the site's limit so small sites aren't noisy. */
export function flowTrend(inCount: number, outCount: number, limit: number): Trend {
  const net = inCount - outCount, band = Math.max(5, Math.round(limit * 0.005));
  return net > band ? "rising" : net < -band ? "easing" : "steady";
}

const cache = new Map<string, { at: number; v: any }>();
const TTL = 5000; // protects the database when many visitors poll the same site

/**
 * Live crowd for one site. Uses the real headcount (people-counter sensors and staff counts) when it is reporting today,
 * otherwise falls back to staff-recorded gate check-ins and exits (bookings and season passes). Parking is included.
 * It is "live" in the sense that every scan updates it within seconds, not a sensor feed. When the gates have been
 * quiet, `quiet` is true so screens can fall back to the forecast instead of presenting an empty room as certainty.
 */
export async function liveSnapshot(dest: any, opts: { forecastLevel?: Level; forecastPct?: number } = {}) {
  const ck = String(dest._id);
  const hit = cache.get(ck);
  if (hit && Date.now() - hit.at < TTL) return hit.v;
  const now = istParts(), open = isOpenNow(dest, now);
  const since = new Date(Date.now() - FLOW_WINDOW_MIN * 60000);
  const [ticketOcc, hc, hcFlow, flow, passFlow, last, lot] = await Promise.all([
    getOccupancy(dest._id), headcountToday(dest._id), headcountFlow(dest._id, FLOW_WINDOW_MIN),
    EntryRecord.aggregate([{ $match: { destination: dest._id, at: { $gte: since } } }, { $group: { _id: "$type", n: { $sum: "$quantity" } } }]),
    PassEntry.aggregate([{ $match: { destination: dest._id, at: { $gte: since } } }, { $group: { _id: "$type", n: { $sum: 1 } } }]),
    EntryRecord.findOne({ destination: dest._id }).sort({ at: -1 }).select("at").lean() as Promise<any>,
    ParkingLot.findOne({ destination: dest._id, active: true }).lean() as Promise<any>,
  ]);
  const sum = (rows: any[], t: string) => rows.find((r) => r._id === t)?.n || 0;
  // A real headcount (sensor / staff count) wins over ticket scans: tickets miss free entry, children and unscanned walk-ins.
  const source = hc.hasData ? "headcount" : "tickets", occupancy = hc.hasData ? hc.count : ticketOcc;
  const entries = hc.hasData ? hcFlow.entries : sum(flow, "in") + sum(passFlow, "in"), exits = hc.hasData ? hcFlow.exits : sum(flow, "out") + sum(passFlow, "out");
  const limit = dest.occupancyLimit || 3000;
  const pct = Math.round((occupancy / limit) * 100);
  const lastTicket: Date | null = last?.at || null;
  const lastAt: Date | null = [lastTicket, hc.hasData ? hc.lastAt : null].filter(Boolean).sort((a: any, b: any) => +new Date(b) - +new Date(a))[0] as any || null;
  const quiet = open && (!lastAt || Date.now() - new Date(lastAt).getTime() > QUIET_AFTER_MIN * 60000);
  const level = classify(pct, dest.crowdThresholds || DEFAULT_THRESHOLDS);
  const parking = lot ? availability(lot, await heldToday(lot._id)).map((x) => ({ type: x.type, label: x.label, capacity: x.capacity, available: x.available })) : null;
  const v = {
    id: String(dest._id), slug: dest.slug, name: dest.name, open, paused: !!dest.entryPaused, pausedReason: dest.entryPaused ? dest.entryPausedReason || "Entry is temporarily paused" : undefined,
    occupancy, limit, pct, level, source, ticketOccupancy: ticketOcc, headcount: hc.hasData ? hc.count : null, waitMin: open ? waitMinutes(pct) : 0, trend: flowTrend(entries, exits, limit), entriesLast15: entries, exitsLast15: exits,
    lastActivityAt: lastAt, quiet, forecastLevel: opts.forecastLevel, forecastPct: opts.forecastPct, parking, updatedAt: new Date().toISOString(),
    basis: hc.hasData ? "Real headcount from people-counters and staff counts." : "Staff-recorded gate entries and exits (tickets and season passes) only. No people-counter is reporting.",
  };
  cache.set(ck, { at: Date.now(), v });
  return v;
}

export const clearLiveCache = () => cache.clear();

export async function liveForAll(filter: any = { active: true }) {
  const dests: any[] = await Destination.find(filter).sort({ popularity: -1 }).lean();
  return Promise.all(dests.map((d) => liveSnapshot(d)));
}
