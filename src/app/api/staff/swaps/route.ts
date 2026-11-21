import { z } from "zod";
import { handle, ok, ApiError } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { RosterShift, SwapRequest, User } from "@/models";
import { cancelSwap, requestSwap, respondSwap } from "@/lib/attendance";
import { limit } from "@/lib/ratelimit";
import { todayIST } from "@/lib/utils";

/** Requests asking me to cover a shift, requests I've made, and colleagues I could ask for each of my upcoming shifts' site. */
export const GET = handle(async () => {
  const me = await requireUser(["staff"]);
  const pop = (q: any) => q.sort({ createdAt: -1 }).limit(30).populate("shift", "date start end position").populate("destination", "name").lean();
  const [incoming, outgoing, colleagues, mine]: any[] = await Promise.all([
    pop(SwapRequest.find({ to: me._id, status: { $in: ["pending_colleague", "pending_manager"] } })), pop(SwapRequest.find({ from: me._id })),
    User.find({ role: "staff", active: true, _id: { $ne: me._id }, assignedDestinations: { $in: me.assignedDestinations || [] } }).select("name assignedDestinations").sort({ name: 1 }).lean(),
    RosterShift.find({ user: me._id, date: { $gte: todayIST() } }).select("_id").lean(),
  ]);
  return ok({ incoming, outgoing, colleagues, openShiftIds: mine.map((s: any) => String(s._id)) });
});
const create = z.object({ shiftId: z.string().min(1), toUserId: z.string().min(1), note: z.string().trim().max(200).optional() });
const act = z.object({ id: z.string().min(1), action: z.enum(["accept", "decline", "cancel"]) });
export const POST = handle(async (req) => {
  const me = await requireUser(["staff"]);
  await limit("swap", [String(me._id)], 20, 3600);
  return ok({ request: await requestSwap(me, create.parse(await req.json())) }, 201);
});
export const PATCH = handle(async (req) => {
  const me = await requireUser(["staff"]);
  const b = act.parse(await req.json());
  return ok({ request: b.action === "cancel" ? await cancelSwap(me, b.id) : await respondSwap(me, b.id, b.action === "accept") });
});
export const dynamic = "force-dynamic";
