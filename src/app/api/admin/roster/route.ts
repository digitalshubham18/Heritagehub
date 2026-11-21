import { z } from "zod";
import { handle, ok, ApiError } from "@/lib/api";
import { requireUser, scopeIds } from "@/lib/auth";
import { Destination, RosterShift, User } from "@/models";
import { audit } from "@/lib/audit";
import { conflictsFor, createShift, shiftHours } from "@/lib/roster";
import { addDays, todayIST } from "@/lib/utils";

const hhmm = z.string().regex(/^\d{2}:\d{2}$/);
const create = z.object({ destinationId: z.string().min(1), userId: z.string().min(1), date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), start: hhmm, end: hhmm, position: z.enum(["gate", "counter", "parking", "floor", "supervisor"]).default("gate"), notes: z.string().trim().max(200).optional(),
  repeatDays: z.number().int().min(1).max(14).optional() });

/** A week of shifts (from ?from=YYYY-MM-DD, default this Monday) for the manager's sites, plus the staff you can roster and who has overlapping shifts. */
export const GET = handle(async (req) => {
  const me = await requireUser(["admin", "operator"]);
  const sc = scopeIds(me), sp = req.nextUrl.searchParams;
  const today = todayIST(), dow = new Date(today + "T00:00:00Z").getUTCDay(), monday = addDays(today, -((dow + 6) % 7));
  const from = /^\d{4}-\d{2}-\d{2}$/.test(sp.get("from") || "") ? sp.get("from")! : monday, to = addDays(from, 6);
  const f: any = { date: { $gte: from, $lte: to } }; if (sc) f.destination = { $in: sc }; if (sp.get("destination")) f.destination = sp.get("destination");
  const [shifts, staff, dests]: any[] = await Promise.all([
    RosterShift.find(f).sort({ date: 1, start: 1 }).lean(), User.find({ role: "staff", active: true, ...(me.role === "operator" ? { operator: me.operator } : {}) }).select("name assignedDestinations").sort({ name: 1 }).lean(),
    Destination.find({ active: true, ...(sc ? { _id: { $in: sc } } : {}) }).select("name").sort({ name: 1 }).lean(),
  ]);
  const conflicts = shifts.filter((s: any) => conflictsFor(s, shifts).length).map((s: any) => String(s._id));
  const hours: Record<string, number> = {}; for (const s of shifts) hours[String(s.user)] = (hours[String(s.user)] || 0) + shiftHours(s);
  return ok({ from, to, shifts, staff, destinations: dests, conflicts, hoursByUser: hours });
});

export const POST = handle(async (req) => {
  const me = await requireUser(["admin", "operator"]);
  const b = create.parse(await req.json()), sc = scopeIds(me), made: any[] = [];
  for (let i = 0; i < (b.repeatDays || 1); i++) {
    try { made.push(await createShift(me, { ...b, date: addDays(b.date, i) }, sc)); }
    catch (e: any) { if (i === 0) throw e; if (!(e instanceof ApiError) || e.status !== 409) throw e; } // a repeat that clashes is skipped, the rest are kept
  }
  await audit(me, "roster.create", "RosterShift", made[0]._id, `${made.length} shift(s) from ${b.date}`);
  return ok({ shifts: made, skipped: (b.repeatDays || 1) - made.length }, 201);
});
export const DELETE = handle(async (req) => {
  const me = await requireUser(["admin", "operator"]);
  const id = req.nextUrl.searchParams.get("id"), sc = scopeIds(me);
  const s: any = id ? await RosterShift.findById(id).lean() : null;
  if (!s || (sc && !sc.includes(String(s.destination)))) throw new ApiError(404, "Shift not found");
  await RosterShift.deleteOne({ _id: s._id });
  return ok({ ok: true });
});
export const dynamic = "force-dynamic";
