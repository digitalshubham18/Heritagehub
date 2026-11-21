import { handle, ok } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { Announcement, Booking, Destination, ParkingReservation, Waitlist } from "@/models";
import { liveSnapshot } from "@/lib/live";
import { addDays, fmtTime, todayIST } from "@/lib/utils";

type Alert = { id: string; kind: string; severity: "info" | "warning" | "critical"; title: string; body: string; href?: string };
const RANK = { critical: 0, warning: 1, info: 2 } as const;

/** What a visitor should know right now: live gate conditions for today's visit, reminders, parking, notices for the sites they are visiting. */
export const GET = handle(async () => {
  const me = await requireUser();
  const today = todayIST(), soon = addDays(today, 3), alerts: Alert[] = [];
  const [bookings, reservations, waits] = await Promise.all([
    Booking.find({ user: me._id, status: "confirmed", date: { $gte: today, $lte: soon } }).sort({ date: 1, start: 1 }).limit(10).lean() as Promise<any[]>,
    ParkingReservation.find({ user: me._id, status: "reserved", date: { $gte: today, $lte: soon } }).limit(10).lean() as Promise<any[]>,
    Waitlist.find({ user: me._id, status: "notified" }).limit(5).lean() as Promise<any[]>,
  ]);
  const ids = [...new Set([...bookings, ...reservations, ...waits].map((x) => String(x.destination)))];
  const dests: any[] = await Destination.find({ _id: { $in: ids } }).select("name slug operator hours occupancyLimit crowdThresholds entryPaused entryPausedReason closures").lean();
  const byId = new Map(dests.map((d) => [String(d._id), d]));
  for (const b of bookings) {
    const d = byId.get(String(b.destination)); if (!d) continue;
    if (b.date === today) {
      const live: any = await liveSnapshot(d);
      if (live.paused) alerts.push({ id: `p:${b._id}`, kind: "paused", severity: "critical", title: `Entry is paused at ${d.name}`, body: `${live.pausedReason}. Your ticket stays valid; staff will resume entry shortly.`, href: "/dashboard/tickets" });
      else if (!live.quiet && (live.level === "high" || live.level === "very_high")) alerts.push({ id: `c:${b._id}`, kind: "crowd", severity: "warning", title: `${d.name} is busy right now`, body: `${live.pct}% full${live.waitMin ? `, expect about ${live.waitMin} minutes at the gate` : ""}. Your slot is ${fmtTime(b.start)} to ${fmtTime(b.end)}.`, href: `/destinations/${d.slug}` });
      else if (!live.quiet) alerts.push({ id: `c:${b._id}`, kind: "crowd", severity: "info", title: `${d.name} is ${live.level.replace("_", " ")} right now`, body: `${live.pct}% full. Your slot is ${fmtTime(b.start)} to ${fmtTime(b.end)}.`, href: `/destinations/${d.slug}` });
      alerts.push({ id: `t:${b._id}`, kind: "today", severity: "info", title: `Your visit to ${d.name} is today`, body: `Slot ${fmtTime(b.start)} to ${fmtTime(b.end)}. Carry a valid photo ID and have your QR ready.`, href: "/dashboard/tickets" });
    } else if (b.date === addDays(today, 1)) alerts.push({ id: `r:${b._id}`, kind: "tomorrow", severity: "info", title: `Tomorrow: ${d.name}`, body: `${fmtTime(b.start)} to ${fmtTime(b.end)}. Check the live crowd in the morning and consider reserving parking.`, href: `/destinations/${d.slug}` });
  }
  for (const r of reservations) { const d = byId.get(String(r.destination)); if (d) alerts.push({ id: `k:${r._id}`, kind: "parking", severity: "info", title: `Parking reserved at ${d.name}`, body: `${r.date === today ? "Today" : r.date}, code ${r.reference}, vehicle ${r.vehicleNumber}. Show the code at the car park gate.`, href: "/dashboard/parking" }); }
  for (const w of waits) { const d = byId.get(String(w.destination)); if (d) alerts.push({ id: `w:${w._id}`, kind: "waitlist", severity: "warning", title: `Seats opened at ${d.name}`, body: `Seats you waited for may be available on ${w.date}. First to book gets them.`, href: `/destinations/${d.slug}?date=${w.date}` }); }
  const now = new Date();
  const notices: any[] = ids.length ? await Announcement.find({ active: true, audience: { $in: ["visitors", "all"] }, startsAt: { $lte: now }, $or: [{ endsAt: null }, { endsAt: { $gt: now } }] }).sort({ createdAt: -1 }).limit(20).lean() : [];
  for (const a of notices) {
    const hit = dests.find((d) => (!a.operator || String(a.operator) === String(d.operator)) && (!a.destinations?.length || a.destinations.some((x: any) => String(x) === String(d._id))));
    if (hit) alerts.push({ id: `a:${a._id}`, kind: "notice", severity: a.severity, title: a.title, body: a.body || `Notice for ${hit.name}`, href: `/destinations/${hit.slug}` });
  }
  alerts.sort((a, b) => RANK[a.severity] - RANK[b.severity]);
  return ok({ items: alerts, at: now.toISOString() });
});
export const dynamic = "force-dynamic";
