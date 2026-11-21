import { z } from "zod";
import { handle, ok } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { User } from "@/models";
import { normalizeVehicle } from "@/lib/parking";

const schema = z.object({
  vehicles: z.array(z.object({ label: z.string().trim().max(30).default(""), number: z.string().trim().min(4).max(20), type: z.enum(["car", "two_wheeler", "bus"]).default("car") })).max(8),
  savedVisitors: z.array(z.object({ name: z.string().trim().min(1).max(100), age: z.number().int().min(0).max(120).optional() })).max(12),
});
/** A visitor's saved vehicles (for parking) and frequent co-travellers (to fill in names quickly when booking). */
export const GET = handle(async () => {
  const me = await requireUser();
  const u: any = await User.findById(me._id).select("vehicles savedVisitors").lean();
  return ok({ vehicles: u?.vehicles || [], savedVisitors: u?.savedVisitors || [] });
});
export const PUT = handle(async (req) => {
  const me = await requireUser();
  const b = schema.parse(await req.json());
  const seen = new Set<string>();
  const vehicles = b.vehicles.map((v) => ({ ...v, number: normalizeVehicle(v.number) })).filter((v) => v.number.length >= 4 && !seen.has(v.number) && seen.add(v.number));
  await User.updateOne({ _id: me._id }, { vehicles, savedVisitors: b.savedVisitors });
  return ok({ vehicles, savedVisitors: b.savedVisitors });
});
export const dynamic = "force-dynamic";
