import { z } from "zod";
import { handle, ok, ApiError } from "@/lib/api";
import { canAccessDestination, requireUser } from "@/lib/auth";
import { ParkingDay, ParkingLot, ParkingOverride } from "@/models";
import { audit } from "@/lib/audit";
import { POOLS } from "@/lib/parking";
import { addDays, todayIST } from "@/lib/utils";

const schema = z.object({ destinationId: z.string().min(1), date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), pool: z.enum(["car", "two_wheeler", "bus", "ev", "accessible"]), capacity: z.number().int().min(0).max(100000), reason: z.string().trim().max(200).optional() });

/** Upcoming per-date capacity overrides for a site (festival crowds, events, closures of part of the lot). */
export const GET = handle(async (req) => {
  const me = await requireUser(["admin", "operator"]);
  const d = req.nextUrl.searchParams.get("destination");
  if (!d) throw new ApiError(400, "destination is required");
  if (!canAccessDestination(me, d)) throw new ApiError(403, "Not your destination");
  const items = await ParkingOverride.find({ destination: d, date: { $gte: todayIST() } }).sort({ date: 1, pool: 1 }).limit(200).lean();
  return ok({ items, pools: POOLS });
});

/** Sets the capacity of one pool on one date. It can't drop below vehicles parked now (today) or spaces already pre-booked for that date. */
export const PUT = handle(async (req) => {
  const me = await requireUser(["admin", "operator"]);
  const b = schema.parse(await req.json());
  if (!canAccessDestination(me, b.destinationId)) throw new ApiError(403, "Not your destination");
  const today = todayIST();
  if (b.date < today) throw new ApiError(400, "Pick today or a later date");
  if (b.date > addDays(today, 180)) throw new ApiError(400, "Overrides can be set up to 180 days ahead");
  const lot: any = await ParkingLot.findOne({ destination: b.destinationId }).lean();
  if (!lot) throw new ApiError(404, "Set up parking for this site first");
  if (b.date === today && b.capacity < (lot[b.pool]?.occupied || 0)) throw new ApiError(409, `${lot[b.pool].occupied} vehicles are parked now, so today's capacity can't be lower than that`);
  const day: any = await ParkingDay.findOne({ key: `${lot._id}:${b.date}:${b.pool}` }).lean();
  if ((day?.reserved || 0) > b.capacity) throw new ApiError(409, `${day.reserved} spaces are already pre-booked for that date. Cancel some reservations first.`);
  const key = `${lot._id}:${b.date}:${b.pool}`;
  const row = await ParkingOverride.findOneAndUpdate({ key }, { $set: { lot: lot._id, destination: b.destinationId, date: b.date, pool: b.pool, capacity: b.capacity, reason: b.reason, by: me._id }, $setOnInsert: { key } }, { upsert: true, new: true }).lean();
  await audit(me, "parking.override", "ParkingOverride", (row as any)._id, `${b.pool} capacity ${b.capacity} on ${b.date}${b.reason ? ` (${b.reason})` : ""}`);
  return ok({ override: row });
});

export const DELETE = handle(async (req) => {
  const me = await requireUser(["admin", "operator"]);
  const id = req.nextUrl.searchParams.get("id");
  if (!id) throw new ApiError(400, "id is required");
  const o: any = await ParkingOverride.findById(id).lean();
  if (!o || !canAccessDestination(me, o.destination)) throw new ApiError(404, "Override not found");
  await ParkingOverride.deleteOne({ _id: o._id });
  await audit(me, "parking.override.remove", "ParkingOverride", o._id, `Removed ${o.pool} override for ${o.date}`);
  return ok({ ok: true });
});
export const dynamic = "force-dynamic";
