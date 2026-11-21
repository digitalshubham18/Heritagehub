import { handle, ok, ApiError } from "@/lib/api";
import { canAccessDestination, requireUser } from "@/lib/auth";
import { CrowdObservation, Destination } from "@/models";
import { loadDestination } from "@/lib/destinations";
import { crowdSummary, getCalibration, predictDay, predictForDestination } from "@/lib/crowd";
import { getOccupancy } from "@/lib/booking";
import { addDays, istParts, todayIST, toMin } from "@/lib/utils";
import { readSlots } from "@/lib/slots";

export const GET = handle(async (req) => {
  const sp = req.nextUrl.searchParams;
  const date = sp.get("date") || todayIST();
  if (!sp.get("destination")) {
    const dests: any[] = await Destination.find({ active: true }).sort({ popularity: -1 }).lean();
    const items = await Promise.all(dests.map(async (d) => ({ id: d._id, slug: d.slug, name: d.name, city: d.city, hours: d.hours, crowd: await crowdSummary(d, date) })));
    return ok({ date, items, note: "Predictions are model estimates from seeded sample history, day of week, season, holidays and current bookings. Live headcount is reported separately by /api/crowd/live." });
  }
  const dest = await loadDestination(sp.get("destination")!);
  if (sp.get("week") === "1") {
    const calib = await getCalibration(dest);
    const days = await Promise.all(Array.from({ length: 7 }, async (_, i) => {
      const day = addDays(date, i);
      const p = predictDay(dest, day, await readSlots(dest, day), calib);
      return { date: day, closed: p.length === 0, slots: p.map((x) => ({ start: x.start, densityPct: x.densityPct, level: x.level })) };
    }));
    return ok({ destination: { id: dest._id, name: dest.name }, days });
  }
  const preds = await predictForDestination(dest, date, true);
  const obs: any[] = await CrowdObservation.find({ destination: dest._id, date }).lean();
  const hourMap = new Map<number, any>();
  for (const p of preds) { const h = Math.floor(toMin(p.start) / 60); const e = hourMap.get(h) || { hour: h, predicted: 0, capacity: 0, recorded: 0, simulated: 0 }; e.predicted += p.expected; e.capacity += p.capacity; hourMap.set(h, e); }
  for (const o of obs) { const e = hourMap.get(o.hour) || { hour: o.hour, predicted: 0, capacity: 0, recorded: 0, simulated: 0 }; e[o.source] += o.visitors; hourMap.set(o.hour, e); }
  const { date: today, minutes } = istParts();
  const upcoming = date === today ? preds.filter((p) => toMin(p.end) > minutes) : preds;
  const recommended = [...upcoming].filter((p) => !p.closed).sort((a, b) => a.densityPct - b.densityPct).slice(0, 3).sort((a, b) => a.start.localeCompare(b.start));
  const out: any = {
    date, destination: { id: dest._id, name: dest.name, thresholds: dest.crowdThresholds },
    slots: preds.map((p) => ({ start: p.start, end: p.end, expected: p.expected, capacity: p.capacity, booked: p.booked, densityPct: p.densityPct, level: p.level, waitMin: p.waitMin })),
    hourly: [...hourMap.values()].sort((a, b) => a.hour - b.hour), recommended,
    occupancyNow: date === today ? await getOccupancy(dest._id) : null, calibration: await getCalibration(dest),
    labels: { predicted: "Model prediction", recorded: "Recorded staff check-ins", simulated: "Simulated sample data" },
  };
  if (sp.get("trends") === "1") {
    const rows: any[] = await CrowdObservation.find({ destination: dest._id }).select("date hour visitors source").lean();
    const byDate = new Map<string, number>();
    for (const r of rows) byDate.set(r.date, (byDate.get(r.date) || 0) + r.visitors);
    const dowSum = Array(7).fill(0), dowN = Array(7).fill(0), month = new Map<string, number>();
    for (const [d, v] of byDate) { const w = new Date(d + "T00:00:00Z").getUTCDay(); dowSum[w] += v; dowN[w]++; month.set(d.slice(0, 7), (month.get(d.slice(0, 7)) || 0) + v); }
    out.trends = {
      byDow: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((n, i) => ({ day: n, avg: dowN[i] ? Math.round(dowSum[i] / dowN[i]) : 0 })),
      byMonth: [...month.entries()].sort().map(([m, v]) => ({ month: m, visitors: v })),
      daily: [...byDate.entries()].sort().slice(-30).map(([d, v]) => ({ date: d, visitors: v })),
      note: "Historical values are simulated sample data unless marked recorded.",
    };
  }
  return ok(out);
});

/** Admin: generate simulated hourly counts for today up to the current hour (demo only). */
export const POST = handle(async (req) => {
  const me = await requireUser(["admin", "operator"]);
  const { destinationId } = await req.json();
  const dest = await loadDestination(destinationId);
  if (!canAccessDestination(me, dest._id)) throw new ApiError(403, "Not your destination");
  const { date, minutes } = istParts();
  const preds = await predictForDestination(dest, date);
  const byHour = new Map<number, number>();
  for (const p of preds) {
    if (toMin(p.end) > minutes) continue;
    const h = Math.floor(toMin(p.start) / 60);
    byHour.set(h, (byHour.get(h) || 0) + Math.round(p.baseline * (0.85 + Math.random() * 0.3)));
  }
  let n = 0;
  for (const [hour, v] of byHour) { await CrowdObservation.updateOne({ destination: dest._id, date, hour, source: "simulated" }, { $set: { visitors: v } }, { upsert: true }); n++; }
  if (!n) throw new ApiError(400, "No completed hours yet today");
  return ok({ generated: n });
});

export const dynamic = "force-dynamic";
