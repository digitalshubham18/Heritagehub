import { handle, ok, ApiError } from "@/lib/api";
import { canAccessDestination, requireUser } from "@/lib/auth";
import { entrySchema } from "@/lib/validators";
import { Destination, EntryRecord, Notification } from "@/models";
import { liveOccupancy } from "@/lib/headcount";
import { recordAny } from "@/lib/scan";
import { startOfDayIST } from "@/lib/utils";
import { limit } from "@/lib/ratelimit";

export const POST = handle(async (req) => {
  const me = await requireUser(["staff", "admin", "operator"]);
  await limit("scan", [String(me._id)], 240, 60);
  const { code, action, quantity, destinationId } = entrySchema.parse(await req.json());
  const r = await recordAny(me, code, action, { quantity, destinationId });
  return ok({ ok: true, action, kind: r.kind, reference: r.reference, quantity: r.quantity, occupancy: r.occupancy, limit: r.limit, holderName: (r as any).holderName });
});

/** Live occupancy for one destination (or all accessible ones). Polled by staff/admin screens. */
export const GET = handle(async (req) => {
  const me = await requireUser(["staff", "admin", "operator"]);
  const one = req.nextUrl.searchParams.get("destination");
  if (one && !canAccessDestination(me, one)) throw new ApiError(403, "Not assigned to this destination");
  const filter: any = one ? { _id: one } : me.role === "admin" ? { active: true } : { _id: { $in: me.assignedDestinations || [] } };
  const dests: any[] = await Destination.find(filter).select("name slug occupancyLimit alertThresholdPct entryPaused entryPausedReason").lean();
  const since = startOfDayIST();
  const items = await Promise.all(dests.map(async (d) => {
    const lo = await liveOccupancy(d._id), occupancy = lo.occupancy;
    const [recent, inToday, alerts] = await Promise.all([
      EntryRecord.find({ destination: d._id, at: { $gte: since } }).sort({ at: -1 }).limit(15).populate("booking", "reference").lean(),
      EntryRecord.aggregate([{ $match: { destination: d._id, type: "in", at: { $gte: since } } }, { $group: { _id: null, n: { $sum: "$quantity" } } }]),
      Notification.find({ destination: d._id, type: { $in: ["occupancy_alert", "crowd_alert"] }, createdAt: { $gte: since } }).sort({ createdAt: -1 }).limit(5).lean(),
    ]);
    const pct = Math.round((occupancy / d.occupancyLimit) * 100);
    return { id: d._id, name: d.name, slug: d.slug, occupancy, source: lo.source, ticketOccupancy: lo.ticketOccupancy, limit: d.occupancyLimit, pct, overThreshold: pct >= d.alertThresholdPct, entryPaused: !!d.entryPaused, entryPausedReason: d.entryPausedReason, checkedInToday: inToday[0]?.n || 0,
      recent: recent.map((r: any) => ({ id: r._id, type: r.type, quantity: r.quantity, at: r.at, reference: r.booking?.reference })), alerts };
  }));
  return ok({ items, at: new Date() });
});

export const dynamic = "force-dynamic";
