/**
 * CROWD PREDICTION: transparent, rule-based model (documented in README "Crowd prediction algorithm").
 *
 *  baselineDaily = avgDailyVisitors × seasonality[month] × dayOfWeek[dow] × holiday × calibration
 *  baselineSlot  = baselineDaily × hourShare(slot)            (shares sum to 1 over the day)
 *  projection    = booked / bookedFraction(daysAhead)         (how many bookings are usually in by then)
 *  w             = booked>0 ? 0.6 × bookedFraction : 0       (trust bookings more as the date nears)
 *  expected      = max(booked, (1−w)·baselineSlot + w·projection)
 *  densityPct    = expected / slotCapacity × 100  →  Low / Moderate / High / Very High (per-site thresholds)
 *  waitMin       = 0 below 60% density, then rises quadratically to ~60 min at 100% (and beyond)
 *
 * calibration = Σ(actual last 28 days) / Σ(model last 28 days), clamped 0.5–1.5. Values are PREDICTIONS.
 * Seeded history is labelled "simulated"; check-ins recorded by staff are labelled "recorded".
 */
import { CrowdObservation, CrowdPrediction } from "@/models";
import { addDays, classify, daysBetween, dow, istParts, todayIST, toMin, Level } from "./utils";
import { readSlots, SlotView } from "./slots";

export const DOW_FACTOR = [1.25, 0.85, 0.8, 0.8, 0.85, 1.0, 1.4]; // Sun..Sat
const SEASON_RAW = [1.2, 1.1, 0.9, 0.7, 0.55, 0.5, 0.55, 0.6, 0.7, 1.0, 1.3, 1.35]; // Jan..Dec (north-India tourist season)
const SEASON_MEAN = SEASON_RAW.reduce((a, b) => a + b, 0) / 12;
export const SEASON = SEASON_RAW.map((s) => s / SEASON_MEAN);
const HOUR_PROFILE: Record<number, number> = { 6: 0.6, 7: 1.0, 8: 1.1, 9: 1.0, 10: 1.1, 11: 1.2, 12: 1.1, 13: 1.0, 14: 0.9, 15: 0.9, 16: 0.7, 17: 0.5, 18: 0.3, 19: 0.15 };
const HOLIDAYS = ["01-01", "01-26", "08-15", "10-02", "12-25"];
const hw = (h: number) => HOUR_PROFILE[h] ?? 0.3;

export function baselineDaily(dest: any, date: string, calib = 1) {
  const month = Number(date.slice(5, 7)) - 1;
  const holiday = HOLIDAYS.includes(date.slice(5)) ? 1.35 : 1;
  return dest.avgDailyVisitors * SEASON[month] * DOW_FACTOR[dow(date)] * holiday * calib;
}
export const bookedFraction = (daysAhead: number) => (daysAhead <= 0 ? 1 : daysAhead === 1 ? 0.8 : daysAhead <= 3 ? 0.55 : daysAhead <= 7 ? 0.35 : 0.2);
export const waitMinutes = (density: number) => (density < 60 ? 0 : Math.min(120, Math.round(Math.pow((density - 60) / 40, 2) * 60)));

/** Share of the day's visitors arriving in each slot, from the hourly profile. */
function slotShares(slots: { start: string; end: string }[]) {
  const raw = slots.map((s) => { let w = 0; for (let m = toMin(s.start); m < toMin(s.end); m += 60) w += hw(Math.floor(m / 60)); return Math.max(w, 0.05); });
  const sum = raw.reduce((a, b) => a + b, 0) || 1;
  return raw.map((r) => r / sum);
}

const calibCache = new Map<string, { at: number; v: number }>();
export async function getCalibration(dest: any) {
  const key = String(dest._id), hit = calibCache.get(key);
  if (hit && Date.now() - hit.at < 300000) return hit.v;
  const today = todayIST();
  const rows = await CrowdObservation.aggregate([
    { $match: { destination: dest._id, date: { $gte: addDays(today, -28), $lt: today } } },
    { $group: { _id: "$date", total: { $sum: "$visitors" } } },
  ]);
  let v = 1;
  if (rows.length >= 7) {
    const actual = rows.reduce((s: number, r: any) => s + r.total, 0);
    const model = rows.reduce((s: number, r: any) => s + baselineDaily(dest, r._id), 0);
    if (model > 0) v = Math.min(1.5, Math.max(0.5, actual / model));
  }
  calibCache.set(key, { at: Date.now(), v });
  return v;
}

export type SlotPrediction = SlotView & { expected: number; densityPct: number; level: Level; waitMin: number; baseline: number };
export function predictDay(dest: any, date: string, slots: SlotView[], calib = 1, ignoreBookings = false): SlotPrediction[] {
  const daily = baselineDaily(dest, date, calib);
  const shares = slotShares(slots);
  const ahead = Math.max(0, daysBetween(todayIST(), date));
  const frac = bookedFraction(ahead);
  return slots.map((s, i) => {
    const baseline = daily * shares[i];
    const booked = ignoreBookings ? 0 : s.booked;
    const w = booked > 0 ? 0.6 * frac : 0;
    const expected = Math.round(Math.max(booked, (1 - w) * baseline + w * (booked / frac)));
    const densityPct = s.capacity > 0 ? Math.round((expected / s.capacity) * 100) : 0;
    return { ...s, baseline: Math.round(baseline), expected, densityPct, level: classify(densityPct, dest.crowdThresholds), waitMin: waitMinutes(densityPct) };
  });
}

export async function predictForDestination(dest: any, date: string, persist = false) {
  const slots = await readSlots(dest, date);
  const preds = predictDay(dest, date, slots, await getCalibration(dest));
  if (persist && preds.length) {
    await CrowdPrediction.bulkWrite(preds.map((p) => ({
      updateOne: {
        filter: { destination: dest._id, date, start: p.start },
        update: { $set: { expected: p.expected, capacity: p.capacity, densityPct: p.densityPct, level: p.level, waitMin: p.waitMin, booked: p.booked, generatedAt: new Date() } },
        upsert: true,
      },
    })));
  }
  return preds;
}

/** Compact summary for lists: current (today) or peak (other dates) level, plus best upcoming windows. */
export async function crowdSummary(dest: any, date: string) {
  const preds = await predictForDestination(dest, date);
  if (!preds.length) return { closed: true as const, date };
  const { date: today, minutes } = istParts();
  const isToday = date === today;
  const upcoming = isToday ? preds.filter((p) => toMin(p.end) > minutes) : preds;
  const pool = upcoming.length ? upcoming : preds;
  const current = isToday ? pool[0] : preds.reduce((a, b) => (b.densityPct > a.densityPct ? b : a));
  const best = [...pool].sort((a, b) => a.densityPct - b.densityPct).slice(0, 3).sort((a, b) => a.start.localeCompare(b.start));
  const peak = preds.reduce((a, b) => (b.densityPct > a.densityPct ? b : a));
  return {
    closed: false as const, date,
    level: current.level, densityPct: current.densityPct, waitMin: current.waitMin, expected: current.expected,
    best: best.map((b) => ({ start: b.start, end: b.end, level: b.level })),
    peak: { start: peak.start, level: peak.level },
    totalExpected: preds.reduce((s, p) => s + p.expected, 0),
  };
}
