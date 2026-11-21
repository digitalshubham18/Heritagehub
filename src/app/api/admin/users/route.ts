import bcrypt from "bcryptjs";
import { handle, ok, ApiError } from "@/lib/api";
import { requireUser, scopeIds } from "@/lib/auth";
import { userAdminSchema } from "@/lib/validators";
import { Destination, User } from "@/models";
import { audit } from "@/lib/audit";
import { requestPasswordReset } from "@/lib/account";

/** Platform admins manage everyone. Operator managers see and manage only the staff of their own operator. */
export const GET = handle(async (req) => {
  const me = await requireUser(["admin", "operator"]);
  const role = req.nextUrl.searchParams.get("role");
  const filter: any = me.role === "operator" ? { operator: me.operator, role: "staff" } : role ? { role } : {};
  const items = await User.find(filter).sort({ createdAt: -1 }).limit(200).lean();
  const destinations = await Destination.find(me.role === "operator" ? { _id: { $in: scopeIds(me) } } : {}).select("name").lean();
  return ok({ items: items.map((u: any) => ({ id: u._id, name: u.name, email: u.email, role: u.role, active: u.active, operator: u.operator, assignedDestinations: u.assignedDestinations })), destinations, canCreateRoles: me.role === "admin" ? ["staff", "operator", "admin", "tourist"] : ["staff"] });
});

export const POST = handle(async (req) => {
  const me = await requireUser(["admin", "operator"]);
  const b = userAdminSchema.parse(await req.json());
  if (me.role === "operator") {
    if (b.role !== "staff") throw new ApiError(403, "Operator managers can only create staff accounts");
    const own = scopeIds(me) || [];
    if (b.assignedDestinations.some((d) => !own.includes(d))) throw new ApiError(403, "You can only assign staff to your own destinations");
  }
  if (b.role === "operator" && !(b as any).operatorId) throw new ApiError(400, "Choose an operator for this manager");
  if (await User.exists({ email: b.email })) throw new ApiError(409, "Email already in use");
  const { operatorId, ...rest } = b as any;
  const u = await User.create({ ...rest, operator: me.role === "operator" ? me.operator : operatorId || undefined, passwordHash: await bcrypt.hash(b.password, 10) });
  await audit(me, "user.create", "User", u._id, `Created ${b.role} ${b.email}`);
  return ok({ id: u._id }, 201);
});

export const PATCH = handle(async (req) => {
  const me = await requireUser(["admin", "operator"]);
  const { id, role, active, assignedDestinations, resetTwoFactor, sendPasswordReset } = await req.json();
  if (String(me._id) === id && (active === false || (role && role !== me.role))) throw new ApiError(400, "You can't demote or deactivate your own account");
  const target: any = await User.findById(id).lean();
  if (!target) throw new ApiError(404, "User not found");
  const set: any = {};
  if (me.role === "operator") {
    if (target.role !== "staff" || String(target.operator) !== String(me.operator)) throw new ApiError(403, "Not your staff member");
    if (role && role !== "staff") throw new ApiError(403, "Operator managers cannot change roles");
    if (Array.isArray(assignedDestinations)) { const own = scopeIds(me) || []; if (assignedDestinations.some((d: string) => !own.includes(String(d)))) throw new ApiError(403, "You can only assign your own destinations"); set.assignedDestinations = assignedDestinations; }
    if (typeof active === "boolean") set.active = active;
  } else {
    if (role) set.role = role; if (typeof active === "boolean") set.active = active; if (Array.isArray(assignedDestinations)) set.assignedDestinations = assignedDestinations;
  }
  if (sendPasswordReset === true) { await requestPasswordReset(target.email); await audit(me, "user.password_reset_sent", "User", id, `Sent password reset link to ${target.email}`); }
  if (Object.keys(set).length === 0) return ok({ ok: true });
  await User.updateOne({ _id: id }, { $set: set });
  await audit(me, "user.update", "User", id, `Changed ${Object.keys(set).join(", ")}: ${JSON.stringify(set)}`);
  return ok({ ok: true });
});

export const dynamic = "force-dynamic";
