import { handle, ok } from "@/lib/api";
import { requireUser, scopeIds } from "@/lib/auth";
import { Destination, Device, EntryRecord, Incident, ParkingLot, ParkingReservation, ParkingTicket } from "@/models";
import { liveSnapshot } from "@/lib/live";
import { deviceOnline } from "@/lib/devices";
import { heldToday, POOLS } from "@/lib/parking";
import { maybeEscalate } from "@/lib/escalation";
import { startOfDayIST, todayIST } from "@/lib/utils";

/** One call for the live command centre: every site's crowd, parking, gate devices and open incidents. */
export const GET = handle(async () => {
  const me = await requireUser(["admin", "operator"]);
  await maybeEscalate();
  const scope = scopeIds(me), since = startOfDayIST();
  const dests: any[] = await Destination.find({ active: true, ...(scope ? { _id: { $in: scope } } : {}) }).sort({ popularity: -1 }).lean();
  const ids = dests.map((d) => d._id);
  const [devices, lots, parkRows, resRows, incidents, feed] = await Promise.all([
    Device.find({ destination: { $in: ids }, active: true }).select("destination lastSeenAt name").lean() as Promise<any[]>,
    ParkingLot.find({ destination: { $in: ids } }).lean() as Promise<any[]>,
    ParkingTicket.find({ destination: { $in: ids }, $or: [{ status: "exited", exitAt: { $gte: since } }, { entryAt: { $gte: since } }] }).select("destination status paidMinor prepaidMinor source prepaidMethod").lean() as Promise<any[]>,
    ParkingReservation.countDocuments({ destination: { $in: ids }, date: todayIST(), status: "reserved" }),
    Incident.find({ destination: { $in: ids }, status: { $in: ["open", "acknowledged"] } }).sort({ severity: 1, createdAt: -1 }).limit(8).populate("destination", "name").lean() as Promise<any[]>,
    EntryRecord.find({ destination: { $in: ids }, at: { $gte: since } }).sort({ at: -1 }).limit(14).populate("destination", "name").populate("booking", "reference").lean() as Promise<any[]>,
  ]);
  const sites = await Promise.all(dests.map(async (d) => {
    const live = await liveSnapshot(d);
    const lot = lots.find((l) => String(l.destination) === String(d._id));
    const held = lot ? await heldToday(lot._id) : {};
    const park = lot ? { capacity: POOLS.reduce((a, t) => a + (lot[t]?.capacity || 0), 0), occupied: POOLS.reduce((a, t) => a + (lot[t]?.occupied || 0), 0), held: Object.values(held).reduce((a: number, b: any) => a + b, 0) } : null;
    const mine = parkRows.filter((t) => String(t.destination) === String(d._id));
    const collected = mine.reduce((a, t) => a + (t.status === "exited" ? t.paidMinor || 0 : 0) + (t.source === "counter" && t.prepaidMethod ? t.prepaidMinor || 0 : 0), 0);
    const dv = devices.filter((x) => String(x.destination) === String(d._id));
    return { ...live, parking: park, parkingCollectedMinor: collected, devices: { total: dv.length, online: dv.filter(deviceOnline).length }, openIncidents: incidents.filter((i) => String(i.destination?._id) === String(d._id)).length };
  }));
  return ok({
    at: new Date().toISOString(), sites, incidents, reservationsToday: resRows,
    totals: { occupancy: sites.reduce((a, s) => a + s.occupancy, 0), parkingCollectedMinor: sites.reduce((a, s) => a + s.parkingCollectedMinor, 0), devicesOnline: sites.reduce((a, s) => a + s.devices.online, 0), devicesTotal: sites.reduce((a, s) => a + s.devices.total, 0), paused: sites.filter((s) => s.paused).length },
    feed: feed.map((f) => ({ id: f._id, type: f.type, quantity: f.quantity, at: f.at, destination: f.destination?.name, reference: f.booking?.reference, viaDevice: !!f.device })),
  });
});
export const dynamic = "force-dynamic";
