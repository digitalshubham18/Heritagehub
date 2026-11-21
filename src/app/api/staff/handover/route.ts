import { z } from "zod";
import { handle, ok, ApiError } from "@/lib/api";
import { canAccessDestination, requireUser, scopeIds } from "@/lib/auth";
import { ShiftHandover, User } from "@/models";
import { acceptHandover, cancelHandover, createHandover } from "@/lib/shift";

/** ?destination= : colleagues you can hand over to, handovers waiting for you, ones you sent, and recent history. Managers see their scope's handovers. */
export const GET = handle(async (req) => {
  const me = await requireUser(["staff", "admin", "operator"]);
  const dest = req.nextUrl.searchParams.get("destination");
  if (me.role !== "staff") {
    const sc = scopeIds(me);
    return ok({ items: await ShiftHandover.find(sc ? { destination: { $in: sc } } : {}).sort({ createdAt: -1 }).limit(100).populate("destination", "name").lean() });
  }
  if (!dest) throw new ApiError(400, "destination is required");
  if (!canAccessDestination(me, dest)) throw new ApiError(403, "Not assigned to this destination");
  const [colleagues, incoming, outgoing, recent] = await Promise.all([
    User.find({ role: "staff", active: true, assignedDestinations: dest, _id: { $ne: me._id } }).select("name").sort({ name: 1 }).lean(),
    ShiftHandover.find({ destination: dest, to: me._id, status: "pending" }).sort({ createdAt: -1 }).lean(),
    ShiftHandover.find({ destination: dest, from: me._id, status: "pending" }).sort({ createdAt: -1 }).lean(),
    ShiftHandover.find({ destination: dest, $or: [{ from: me._id }, { to: me._id }], status: { $ne: "pending" } }).sort({ createdAt: -1 }).limit(10).lean(),
  ]);
  return ok({ colleagues, incoming, outgoing, recent });
});

const create = z.object({ destinationId: z.string().min(1), toUserId: z.string().min(1), countedCashMinor: z.number().int().min(0).max(1000000000), notes: z.string().trim().max(600).optional() });
const patch = z.object({ id: z.string().min(1), action: z.enum(["accept", "cancel"]), receivedCashMinor: z.number().int().min(0).max(1000000000).optional(), notes: z.string().trim().max(400).optional() });
export const POST = handle(async (req) => {
  const me = await requireUser(["staff"]);
  return ok({ handover: await createHandover(me, create.parse(await req.json())) }, 201);
});
export const PATCH = handle(async (req) => {
  const me = await requireUser(["staff"]);
  const b = patch.parse(await req.json());
  if (b.action === "cancel") return ok({ handover: await cancelHandover(me, b.id) });
  if (b.receivedCashMinor == null) throw new ApiError(400, "Enter the cash you counted");
  return ok({ handover: await acceptHandover(me, b.id, b.receivedCashMinor, b.notes) });
});
export const dynamic = "force-dynamic";
