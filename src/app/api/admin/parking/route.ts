import { z } from "zod";
import { handle, ok, ApiError } from "@/lib/api";
import { canAccessDestination, requireUser } from "@/lib/auth";
import { ParkingLot } from "@/models";
import { audit } from "@/lib/audit";

const rate = z.object({ capacity: z.number().int().min(0).max(100000), freeMinutes: z.number().int().min(0).max(600), firstHourMinor: z.number().int().min(0), extraHourMinor: z.number().int().min(0), dailyMaxMinor: z.number().int().min(0) });
const mp = z.object({ car: z.number().int().min(0), two_wheeler: z.number().int().min(0), bus: z.number().int().min(0), maxPerType: z.number().int().min(0).max(100000) });
const schema = z.object({ destinationId: z.string(), name: z.string().max(80).optional(), active: z.boolean().optional(), reservablePct: z.number().int().min(0).max(100).optional(), car: rate, two_wheeler: rate, bus: rate, ev: rate.optional(), accessible: rate.optional(),
  lostTicketFeeMinor: z.number().int().min(0).max(10000000).optional(), gstPct: z.number().min(0).max(40).optional(), monthlyPass: mp.optional() });

export const GET = handle(async (req) => {
  const me = await requireUser(["admin", "operator"]);
  const id = req.nextUrl.searchParams.get("destination");
  if (!id) throw new ApiError(400, "destination is required");
  if (!canAccessDestination(me, id)) throw new ApiError(403, "Not your destination");
  return ok({ lot: await ParkingLot.findOne({ destination: id }).lean() });
});

/** Creates or updates a lot. Capacity can't be set below vehicles currently parked. */
export const PUT = handle(async (req) => {
  const me = await requireUser(["admin", "operator"]);
  const b = schema.parse(await req.json());
  if (!canAccessDestination(me, b.destinationId)) throw new ApiError(403, "Not your destination");
  const cur: any = await ParkingLot.findOne({ destination: b.destinationId }).lean();
  for (const t of ["car", "two_wheeler", "bus", "ev", "accessible"] as const) if (cur && b[t] && b[t]!.capacity < (cur[t]?.occupied || 0)) throw new ApiError(409, `${t.replace("_", "-")} capacity can't be below the ${cur[t].occupied} vehicles parked now`);
  const set: any = { name: b.name || "Visitor parking", active: b.active ?? true, ...(b.reservablePct != null ? { reservablePct: b.reservablePct } : {}) };
  for (const t of ["car", "two_wheeler", "bus", "ev", "accessible"] as const) if (b[t]) for (const k of Object.keys(b[t]!) as (keyof typeof b.car)[]) set[`${t}.${k}`] = b[t]![k];
  if (b.lostTicketFeeMinor != null) set.lostTicketFeeMinor = b.lostTicketFeeMinor;
  if (b.gstPct != null) set.gstPct = b.gstPct;
  if (b.monthlyPass) for (const k of Object.keys(b.monthlyPass) as (keyof typeof b.monthlyPass)[]) set[`monthlyPass.${k}`] = b.monthlyPass[k];
  const lot = await ParkingLot.findOneAndUpdate({ destination: b.destinationId }, { $set: set }, { upsert: true, new: true }).lean();
  await audit(me, "parking.update", "ParkingLot", (lot as any)._id, "Updated parking capacity and rates");
  return ok({ lot });
});
export const dynamic = "force-dynamic";
