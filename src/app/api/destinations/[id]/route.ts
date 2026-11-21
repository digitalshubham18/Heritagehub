import { handle, ok } from "@/lib/api";
import { canAccessDestination, currentUser, requireUser } from "@/lib/auth";
import { ApiError } from "@/lib/api";
import { Operator } from "@/models";
import { destinationPatchSchema } from "@/lib/validators";
import { Destination, TicketCategory } from "@/models";
import { loadDestination, syncCategories } from "@/lib/destinations";
import { audit } from "@/lib/audit";

export const GET = handle(async (req, { params }) => {
  const me: any = await currentUser();
  let d = await loadDestination(params.id, false).catch(() => null as any);
  if (!d && me && (me.role === "admin" || me.role === "operator")) { d = await loadDestination(params.id, true); if (!canAccessDestination(me, d._id)) throw new ApiError(404, "Destination not found"); }
  if (!d) throw new ApiError(404, "Destination not found");
  const op: any = d.operator ? await Operator.findById(d.operator).select("name").lean() : null;
  const categories = await TicketCategory.find({ destination: d._id, active: true }).sort({ sortOrder: 1 }).lean();
  return ok({ destination: { ...d, operatorName: op?.name }, categories });
});

export const PATCH = handle(async (req, { params }) => {
  const me = await requireUser(["admin", "operator"]);
  const d = await loadDestination(params.id, true);
  if (!canAccessDestination(me, d._id)) throw new ApiError(403, "This destination belongs to another operator");
  const { categories, operatorId, ...data } = destinationPatchSchema.parse(await req.json());
  const set: any = { ...data }; if (me.role === "admin" && operatorId) set.operator = operatorId;
  await Destination.updateOne({ _id: d._id }, { $set: set });
  if (categories) await syncCategories(d._id, categories);
  await audit(me, "destination.update", "Destination", d._id, `Updated ${d.name}: ${Object.keys(data).join(", ") || "categories"}`);
  return ok({ ok: true });
});

/** "Deleting" deactivates: bookings and history are preserved. */
export const DELETE = handle(async (req, { params }) => {
  const me = await requireUser(["admin", "operator"]);
  const d = await loadDestination(params.id, true);
  if (!canAccessDestination(me, d._id)) throw new ApiError(403, "This destination belongs to another operator");
  await Destination.updateOne({ _id: d._id }, { active: false });
  await audit(me, "destination.deactivate", "Destination", d._id, `Deactivated ${d.name}`);
  return ok({ ok: true });
});

export const dynamic = "force-dynamic";
