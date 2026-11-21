import { z } from "zod";
import { handle, ok, ApiError } from "@/lib/api";
import { canAccessDestination, requireUser } from "@/lib/auth";
import { Destination, PassType } from "@/models";
import { audit } from "@/lib/audit";

const schema = z.object({ name: z.string().trim().min(2), description: z.string().max(400).optional(), destinations: z.array(z.string()).min(1, "Choose at least one destination"), validityDays: z.number().int().min(1).max(3660), priceMinor: z.number().int().min(0), maxEntriesPerDay: z.number().int().min(1).max(20).default(1), active: z.boolean().optional(), operatorId: z.string().optional() });

export const GET = handle(async () => {
  const me = await requireUser(["admin", "operator"]);
  const f: any = me.role === "operator" ? { operator: me.operator } : {};
  const items: any[] = await PassType.find(f).sort({ createdAt: -1 }).lean();
  const destinations = await Destination.find(me.role === "operator" ? { operator: me.operator } : {}).select("name").lean();
  return ok({ items, destinations });
});
export const POST = handle(async (req) => {
  const me = await requireUser(["admin", "operator"]);
  const b = schema.parse(await req.json());
  if (b.destinations.some((d) => !canAccessDestination(me, d))) throw new ApiError(403, "A pass can only cover your own destinations");
  const dest: any = await Destination.findById(b.destinations[0]).select("operator").lean();
  const { operatorId, ...rest } = b;
  const t: any = await PassType.create({ ...rest, operator: me.role === "operator" ? me.operator : operatorId || dest?.operator });
  await audit(me, "pass.create", "PassType", t._id, `Created pass type ${t.name}`);
  return ok({ passType: t }, 201);
});
export const PATCH = handle(async (req) => {
  const me = await requireUser(["admin", "operator"]);
  const { id, ...rest } = await req.json();
  const cur: any = await PassType.findById(id).lean();
  if (!cur) throw new ApiError(404, "Pass type not found");
  if (me.role === "operator" && String(cur.operator) !== String(me.operator)) throw new ApiError(403, "Not your pass");
  const b = schema.partial().parse(rest);
  if (b.destinations?.some((d) => !canAccessDestination(me, d))) throw new ApiError(403, "A pass can only cover your own destinations");
  await PassType.updateOne({ _id: id }, { $set: b });
  await audit(me, "pass.update", "PassType", id, `Updated pass type ${cur.name}`);
  return ok({ ok: true });
});
export const dynamic = "force-dynamic";
