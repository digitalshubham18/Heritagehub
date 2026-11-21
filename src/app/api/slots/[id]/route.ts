import { handle, ok, ApiError } from "@/lib/api";
import { canAccessDestination, requireUser } from "@/lib/auth";
import { slotPatchSchema } from "@/lib/validators";
import { TimeSlot } from "@/models";
import { processWaitlist } from "@/lib/waitlist";
import { audit } from "@/lib/audit";

/** Capacity can never drop below confirmed/held seats; closing a slot only blocks NEW bookings. */
export const PATCH = handle(async (req, { params }) => {
  const me = await requireUser(["admin", "operator"]);
  const b = slotPatchSchema.parse(await req.json());
  const cur: any = await TimeSlot.findById(params.id).select("destination").lean();
  if (!cur) throw new ApiError(404, "Slot not found");
  if (!canAccessDestination(me, cur.destination)) throw new ApiError(403, "Not your destination");
  const filter: any = { _id: params.id };
  if (b.capacity !== undefined) filter.booked = { $lte: b.capacity };
  const upd: any = await TimeSlot.findOneAndUpdate(filter, { $set: b }, { new: true }).lean();
  if (!upd) {
    const exists = await TimeSlot.exists({ _id: params.id });
    throw new ApiError(exists ? 409 : 404, exists ? "Capacity cannot be lower than seats already booked" : "Slot not found");
  }
  await audit(me, "slot.update", "TimeSlot", params.id, `Slot ${upd.date} ${upd.start}: ${JSON.stringify(b)}`);
  if (b.capacity !== undefined || b.closed === false) await processWaitlist(params.id).catch(() => {});
  return ok({ slot: upd });
});

export const dynamic = "force-dynamic";
