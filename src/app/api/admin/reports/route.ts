import { NextResponse } from "next/server";
import { handle, ok } from "@/lib/api";
import { requireUser, scopeIds } from "@/lib/auth";
import { ApiError } from "@/lib/api";
import { Booking, CrowdObservation, Destination, Notification, Payment, TimeSlot } from "@/models";
import { addDays, istParts, startOfDayIST, todayIST, toMin } from "@/lib/utils";
import { getOccupancy } from "@/lib/booking";
import { readSlots } from "@/lib/slots";
import { baselineDaily, crowdSummary, getCalibration, predictDay } from "@/lib/crowd";
import { slotTemplate } from "@/lib/slots";

const csv = (rows: Record<string, any>[]) => {
  if (!rows.length) return "";
  const keys = Object.keys(rows[0]);
  const esc = (v: any) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  return [keys.join(","), ...rows.map((r) => keys.map((k) => esc(r[k])).join(","))].join("\n");
};

export const GET = handle(async (req) => {
  const me = await requireUser(["admin", "operator"]);
  const allowed = scopeIds(me);
  const sp = req.nextUrl.searchParams;
  const range = Math.min(180, Math.max(1, Number(sp.get("range") || 30)));
  const destId = sp.get("destination") || null;
  const today = todayIST(), from = addDays(today, -range + 1);
  if (destId && allowed && !allowed.includes(destId)) throw new ApiError(403, "Not your destination");
  const dFilter: any = destId ? { destination: destId } : allowed ? { destination: { $in: allowed } } : {};
  const dests: any[] = await Destination.find(destId ? { _id: destId } : allowed ? { _id: { $in: allowed } } : {}).lean();
  const nameOf = (id: any) => dests.find((d) => String(d._id) === String(id))?.name || "—";

  const bookings: any[] = await Booking.find({ ...dFilter, date: { $gte: from, $lte: addDays(today, 30) }, status: { $in: ["confirmed", "completed", "cancelled"] } }).lean();

  // ---------- CSV exports ----------
  if (sp.get("format") === "csv") {
    const kind = sp.get("kind") || "bookings";
    let rows: Record<string, any>[] = [];
    if (kind === "bookings") rows = bookings.map((b) => ({ reference: b.reference, destination: nameOf(b.destination), visit_date: b.date, slot: `${b.start}-${b.end}`, tickets: b.quantity, status: b.status, payment: b.paymentStatus, total_inr: b.totalMinor / 100, refund_inr: (b.refundMinor || 0) / 100, contact: b.contact?.email, created: b.createdAt?.toISOString?.() }));
    if (kind === "daily") { const m = new Map<string, any>(); for (const b of bookings) { const k = b.date; const r = m.get(k) || { date: k, bookings: 0, visitors: 0, cancelled: 0, revenue_inr: 0 }; if (b.status === "cancelled") r.cancelled++; else { r.bookings++; r.visitors += b.quantity; } if (b.paymentStatus !== "unpaid") r.revenue_inr += (b.totalMinor - (b.refundMinor || 0)) / 100; m.set(k, r); } rows = [...m.values()].sort((a, b) => a.date.localeCompare(b.date)); }
    if (kind === "slots") { const s: any[] = await TimeSlot.find({ ...dFilter, date: { $gte: from, $lte: today } }).lean(); rows = s.map((x) => ({ destination: nameOf(x.destination), date: x.date, start: x.start, end: x.end, capacity: x.capacity, booked: x.booked, utilization_pct: x.capacity ? Math.round((x.booked / x.capacity) * 100) : 0, closed: x.closed })); }
    return new NextResponse(csv(rows), { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="heritagehub-${kind}-${today}.csv"` } });
  }

  // ---------- Overview ----------
  const todays = bookings.filter((b) => b.date === today);
  const confirmedToday = todays.filter((b) => b.status !== "cancelled");
  let checkedIn = 0, available = 0;
  const { minutes } = istParts();
  const busy: any[] = [];
  for (const d of dests.filter((x) => x.active)) {
    checkedIn += await getOccupancy(d._id);
    const slots = await readSlots(d, today);
    available += slots.filter((s) => !s.closed && toMin(s.end) > minutes).reduce((a, s) => a + Math.max(0, s.capacity - s.booked), 0);
    for (const day of [today, addDays(today, 1)]) {
      const preds = predictDay(d, day, await readSlots(d, day), await getCalibration(d));
      for (const p of preds) if (day !== today || toMin(p.end) > minutes) busy.push({ destination: d.name, date: day, start: p.start, densityPct: p.densityPct, level: p.level, booked: p.booked, capacity: p.capacity });
    }
  }
  const pays: any[] = await Payment.find({ createdAt: { $gte: startOfDayIST(from) }, status: "succeeded" }).lean();
  const bIds = new Set(bookings.map((b) => String(b._id)));
  const rel = pays.filter((p) => bIds.has(String(p.booking)));
  const gross = rel.filter((p) => p.type === "charge").reduce((s, p) => s + p.amountMinor, 0);
  const refunds = rel.filter((p) => p.type === "refund").reduce((s, p) => s + p.amountMinor, 0);
  const past = bookings.filter((b) => b.date <= today);
  const cancelled = past.filter((b) => b.status === "cancelled").length;
  const overview = {
    destinations: await Destination.countDocuments({ active: true, ...(allowed ? { _id: { $in: allowed } } : {}) }),
    visitsToday: confirmedToday.length, visitorsToday: confirmedToday.reduce((s, b) => s + b.quantity, 0),
    checkedIn, availableCapacity: available,
    revenueMinor: gross - refunds, grossMinor: gross, refundsMinor: refunds,
    cancellationRatePct: past.length ? Math.round((cancelled / past.length) * 1000) / 10 : 0,
    alerts: await Notification.find({ type: { $in: ["crowd_alert", "occupancy_alert", "issue"] }, read: false, ...(allowed ? { destination: { $in: allowed } } : {}) }).sort({ createdAt: -1 }).limit(8).populate("destination", "name").lean(),
    busySlots: busy.sort((a, b) => b.densityPct - a.densityPct).slice(0, 6),
  };

  // ---------- Analytics ----------
  const daily = new Map<string, any>();
  for (let i = 0; i < range; i++) daily.set(addDays(from, i), { date: addDays(from, i), bookings: 0, visitors: 0, cancelled: 0, revenueMinor: 0 });
  for (const b of bookings) {
    const r = daily.get(b.date); if (!r) continue;
    if (b.status === "cancelled") r.cancelled++; else { r.bookings++; r.visitors += b.quantity; }
    if (b.paymentStatus !== "unpaid" && b.paymentStatus !== "failed") r.revenueMinor += b.totalMinor - (b.refundMinor || 0);
  }
  const obs: any[] = await CrowdObservation.find({ ...dFilter, date: { $gte: from, $lte: today } }).lean();
  const byHour = Array.from({ length: 24 }, (_, h) => ({ hour: h, visitors: 0, days: new Set<string>() }));
  const actualByDate = new Map<string, number>();
  const pref = new Map<string, Map<number, any>>();
  for (const o of obs) { byHour[o.hour].visitors += o.visitors; byHour[o.hour].days.add(o.date); const k = `${o.destination}|${o.date}|${o.hour}`; const e = pref.get(k) || new Map(); e.set(o.source === "recorded" ? 1 : 0, o.visitors); pref.set(k, e); }
  for (const [k, m] of pref) { const date = k.split("|")[1]; actualByDate.set(date, (actualByDate.get(date) || 0) + (m.get(1) ?? m.get(0))); }
  const hourly = byHour.filter((h) => h.days.size).map((h) => ({ hour: h.hour, avgVisitors: Math.round(h.visitors / h.days.size) }));
  const slotDocs: any[] = await TimeSlot.find({ ...dFilter, date: { $gte: from, $lte: today }, capacity: { $gt: 0 } }).select("start booked capacity").lean();
  const util = new Map<string, { b: number; c: number }>();
  for (const s of slotDocs) { const u = util.get(s.start) || { b: 0, c: 0 }; u.b += s.booked; u.c += s.capacity; util.set(s.start, u); }
  const predVsActual: any[] = [];
  const checkDays = Array.from({ length: Math.min(range, 14) }, (_, i) => addDays(today, -i - 1)).reverse();
  for (const date of checkDays) {
    let predicted = 0;
    for (const d of dests.filter((x) => x.active)) predicted += predictDay(d, date, slotTemplate(d, date).map((t) => ({ _id: null, ...t, capacity: d.defaultSlotCapacity, booked: 0, closed: false })), await getCalibration(d), true).reduce((s, p) => s + p.expected, 0);
    if (actualByDate.has(date)) predVsActual.push({ date, predicted, actual: actualByDate.get(date) });
  }
  const week = new Map<string, number>(), month = new Map<string, number>();
  for (const r of daily.values()) {
    const d = new Date(r.date + "T00:00:00Z"); const mon = new Date(d); mon.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
    const wk = mon.toISOString().slice(0, 10); week.set(wk, (week.get(wk) || 0) + r.visitors); month.set(r.date.slice(0, 7), (month.get(r.date.slice(0, 7)) || 0) + r.visitors);
  }
  const analytics = {
    range, from, to: today, daily: [...daily.values()],
    weekly: [...week.entries()].map(([week, visitors]) => ({ week, visitors })), monthly: [...month.entries()].map(([month, visitors]) => ({ month, visitors })),
    hourly, peakHours: [...hourly].sort((a, b) => b.avgVisitors - a.avgVisitors).slice(0, 3),
    slotUtilization: [...util.entries()].sort().map(([start, u]) => ({ start, pct: Math.round((u.b / u.c) * 100) })),
    predVsActual, dataNote: "Actuals combine recorded check-ins (preferred) with simulated sample history. Predictions use the baseline model without bookings.",
  };
  return ok({ overview, analytics });
});

export const dynamic = "force-dynamic";
