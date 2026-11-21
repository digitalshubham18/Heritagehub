import { z } from "zod";
import { handle, ok, ApiError } from "@/lib/api";
import { canAccessDestination, requireUser, scopeIds } from "@/lib/auth";
import { Announcement, Destination } from "@/models";
import { audit } from "@/lib/audit";

const create = z.object({
  title: z.string().trim().min(3).max(120), body: z.string().trim().max(800).default(""), severity: z.enum(["info", "warning", "critical"]).default("info"),
  audience: z.enum(["visitors", "staff", "all"]).default("all"), destinationIds: z.array(z.string()).default([]), endsAt: z.string().datetime().optional().or(z.literal("")),
});
const own = async (me: any, a: any) => {
  if (me.role === "admin") return true;
  return !!a.operator && String(a.operator) === String(me.operator);
};

export const GET = handle(async () => {
  const me = await requireUser(["admin", "operator"]);
  const f: any = me.role === "admin" ? {} : { operator: me.operator };
  return ok({ items: await Announcement.find(f).sort({ createdAt: -1 }).limit(100).populate("destinations", "name").lean() });
});

/** Managers publish notices for visitors and/or staff: closures, delays, events, safety messages. */
export const POST = handle(async (req) => {
  const me = await requireUser(["admin", "operator"]);
  const b = create.parse(await req.json());
  for (const id of b.destinationIds) if (!canAccessDestination(me, id)) throw new ApiError(403, "Not your destination");
  const scope = scopeIds(me);
  if (scope && b.destinationIds.length === 0) b.destinationIds = []; // empty = every site of the operator (enforced through the operator link)
  let operator = me.role === "operator" ? me.operator : undefined;
  if (me.role === "admin" && b.destinationIds.length) { const d: any = await Destination.findById(b.destinationIds[0]).select("operator").lean(); operator = d?.operator; }
  const a = await Announcement.create({ operator, destinations: b.destinationIds, title: b.title, body: b.body, severity: b.severity, audience: b.audience, endsAt: b.endsAt ? new Date(b.endsAt) : undefined, createdBy: me._id });
  await audit(me, "announcement.create", "Announcement", a._id, `Published "${b.title}"`);
  return ok({ announcement: a }, 201);
});

export const PATCH = handle(async (req) => {
  const me = await requireUser(["admin", "operator"]);
  const { id, active } = await req.json();
  const a: any = await Announcement.findById(id).lean();
  if (!a || !(await own(me, a))) throw new ApiError(404, "Announcement not found");
  await Announcement.updateOne({ _id: id }, { active: !!active });
  return ok({ ok: true });
});
export const DELETE = handle(async (req) => {
  const me = await requireUser(["admin", "operator"]);
  const id = req.nextUrl.searchParams.get("id");
  const a: any = await Announcement.findById(id).lean();
  if (!a || !(await own(me, a))) throw new ApiError(404, "Announcement not found");
  await Announcement.deleteOne({ _id: id });
  await audit(me, "announcement.delete", "Announcement", id, `Deleted "${a.title}"`);
  return ok({ ok: true });
});
export const dynamic = "force-dynamic";
