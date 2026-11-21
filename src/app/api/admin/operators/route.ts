import bcrypt from "bcryptjs";
import { z } from "zod";
import { handle, ok, ApiError } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { Destination, Operator, User } from "@/models";
import { audit } from "@/lib/audit";
import { slugify } from "@/lib/destinations";

const schema = z.object({
  name: z.string().trim().min(2), legalName: z.string().optional(), gstin: z.string().max(20).optional(), address: z.string().optional(), contactEmail: z.string().email().optional().or(z.literal("")),
  commissionPct: z.number().min(0).max(100).default(0),
  manager: z.object({ name: z.string().trim().min(2), email: z.string().trim().toLowerCase().email(), password: z.string().min(8) }).optional(),
});

/** Platform-admin only: onboard and manage operators (the organisations that run one or more sites). */
export const GET = handle(async () => {
  await requireUser(["admin"]);
  const ops: any[] = await Operator.find({}).sort({ name: 1 }).lean();
  const [dests, users]: any[][] = await Promise.all([Destination.find({}).select("operator name active").lean(), User.find({ operator: { $ne: null } }).select("operator role").lean()]);
  return ok({ items: ops.map((o) => ({ ...o, destinations: dests.filter((d) => String(d.operator) === String(o._id)).map((d) => ({ _id: d._id, name: d.name, active: d.active })), managers: users.filter((u) => String(u.operator) === String(o._id) && u.role === "operator").length, staff: users.filter((u) => String(u.operator) === String(o._id) && u.role === "staff").length })) });
});

export const POST = handle(async (req) => {
  const me = await requireUser(["admin"]);
  const { manager, ...data } = schema.parse(await req.json());
  let slug = slugify(data.name); if (await Operator.exists({ slug })) slug += "-" + Math.random().toString(36).slice(2, 6);
  const op: any = await Operator.create({ ...data, slug });
  if (manager) {
    if (await User.exists({ email: manager.email })) throw new ApiError(409, "Manager email already in use");
    await User.create({ name: manager.name, email: manager.email, passwordHash: await bcrypt.hash(manager.password, 10), role: "operator", operator: op._id });
  }
  await audit(me, "operator.create", "Operator", op._id, `Onboarded ${op.name}`);
  return ok({ operator: op }, 201);
});

export const PATCH = handle(async (req) => {
  const me = await requireUser(["admin"]);
  const { id, ...rest } = await req.json();
  const body = schema.partial().omit({ manager: true }).extend({ active: z.boolean().optional() }).parse(rest);
  await Operator.updateOne({ _id: id }, { $set: body });
  await audit(me, "operator.update", "Operator", id, `Updated operator: ${Object.keys(body).join(", ")}`);
  return ok({ ok: true });
});
export const dynamic = "force-dynamic";
