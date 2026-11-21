import { handle, ok, ApiError } from "@/lib/api";
import { canAccessDestination, requireUser } from "@/lib/auth";
import { Notification } from "@/models";

export const GET = handle(async (req) => {
  const me = await requireUser(["staff", "admin", "operator"]);
  const f: any = me.role === "admin" ? {} : { destination: { $in: me.assignedDestinations || [] } };
  const items = await Notification.find(f).sort({ createdAt: -1 }).limit(50).populate("destination", "name").lean();
  return ok({ items });
});
/** Staff report an operational issue for an assigned site. */
export const POST = handle(async (req) => {
  const me = await requireUser(["staff", "admin", "operator"]);
  const { destinationId, message, severity } = await req.json();
  if (!message || String(message).trim().length < 5) throw new ApiError(400, "Describe the issue (at least 5 characters)");
  if (!canAccessDestination(me, destinationId)) throw new ApiError(403, "Not assigned to this destination");
  const n = await Notification.create({ destination: destinationId, user: me._id, type: "issue", severity: severity === "critical" ? "critical" : "warning", message: String(message).slice(0, 500) });
  return ok({ notification: n }, 201);
});
export const PATCH = handle(async (req) => {
  const me = await requireUser(["admin", "operator"]);
  const { id } = await req.json();
  const n: any = await Notification.findById(id).lean();
  if (n?.destination && !canAccessDestination(me, n.destination)) throw new ApiError(403, "Not your destination");
  await Notification.updateOne({ _id: id }, { read: true });
  return ok({ ok: true });
});

export const dynamic = "force-dynamic";
