import { Destination, HeadcountEvent, Notification } from "@/models";
import { getOccupancy } from "./booking";
import { ApiError } from "./api";
import { startOfDayIST, todayIST } from "./utils";

/** Largest single report we accept, so a faulty sensor cannot flood the count. */
export const MAX_PER_REPORT = 5000;

/**
 * People inside right now, counted independently of tickets: the latest absolute "set" reading today (if any) plus every
 * sensor/clicker delta recorded after it. `hasData` is false until anything has been reported today.
 */
export async function headcountToday(destId: any) {
  const since = startOfDayIST();
  const base: any = await HeadcountEvent.findOne({ destination: destId, kind: "set", at: { $gte: since } }).sort({ at: -1 }).select("at inside").lean();
  const from = base?.at || since;
  const [sums, last] = await Promise.all([
    HeadcountEvent.aggregate([{ $match: { destination: destId, kind: "delta", at: { $gt: from } } }, { $group: { _id: null, i: { $sum: "$in" }, o: { $sum: "$out" } } }]),
    HeadcountEvent.findOne({ destination: destId, at: { $gte: since } }).sort({ at: -1 }).select("at").lean() as Promise<any>,
  ]);
  const count = Math.max(0, (base?.inside ?? 0) + (sums[0]?.i || 0) - (sums[0]?.o || 0));
  return { hasData: !!last, count, lastAt: (last?.at as Date) || null };
}

/** In/out counted in the last `minutes`, for the trend arrow and "last 15 min" line. */
export async function headcountFlow(destId: any, minutes: number) {
  const r = await HeadcountEvent.aggregate([{ $match: { destination: destId, kind: "delta", at: { $gte: new Date(Date.now() - minutes * 60000) } } }, { $group: { _id: null, i: { $sum: "$in" }, o: { $sum: "$out" } } }]);
  return { entries: r[0]?.i || 0, exits: r[0]?.o || 0 };
}

/** The number everything should show: the real headcount when it is being reported, otherwise ticket check-ins. */
export async function liveOccupancy(destId: any) {
  const [hc, tickets] = await Promise.all([headcountToday(destId), getOccupancy(destId)]);
  return { occupancy: hc.hasData ? hc.count : tickets, source: (hc.hasData ? "headcount" : "tickets") as "headcount" | "tickets", ticketOccupancy: tickets, headcount: hc.hasData ? hc.count : null, lastAt: hc.lastAt };
}

type Report = { in?: number; out?: number; inside?: number; source: "sensor" | "manual"; deviceId?: any; userId?: any; gate?: string };
export async function recordHeadcount(destId: any, r: Report) {
  const n = (v: any) => (v == null ? 0 : Math.round(Number(v)));
  const inn = n(r.in), out = n(r.out);
  if (r.inside != null) {
    if (!Number.isFinite(Number(r.inside)) || r.inside < 0 || r.inside > 200000) throw new ApiError(400, "Count must be between 0 and 200000");
    await HeadcountEvent.create({ destination: destId, kind: "set", inside: Math.round(r.inside), source: r.source, device: r.deviceId, by: r.userId, gate: r.gate });
  } else {
    if (!(inn > 0 || out > 0)) throw new ApiError(400, "Send in, out, or inside");
    if (inn < 0 || out < 0 || inn > MAX_PER_REPORT || out > MAX_PER_REPORT) throw new ApiError(400, `in/out must be between 0 and ${MAX_PER_REPORT}`);
    await HeadcountEvent.create({ destination: destId, kind: "delta", in: inn, out, source: r.source, device: r.deviceId, by: r.userId, gate: r.gate });
  }
  const { clearLiveCache } = await import("./live");
  clearLiveCache();
  const occ = await liveOccupancy(destId);
  const dest: any = await Destination.findById(destId).select("name occupancyLimit alertThresholdPct").lean();
  const limit = dest?.occupancyLimit || 3000;
  if (dest && (occ.occupancy / limit) * 100 >= (dest.alertThresholdPct ?? 85)) {
    const key = `occ:${destId}:${todayIST()}:${Math.floor(Date.now() / 3600000)}`;
    await Notification.updateOne({ key }, { $setOnInsert: { destination: destId, type: "occupancy_alert", severity: occ.occupancy >= limit ? "critical" : "warning", message: `${dest.name}: ${occ.occupancy} people inside of ${limit} (${Math.round((occ.occupancy / limit) * 100)}%), counted live`, key } }, { upsert: true });
  }
  return { ...occ, limit };
}
