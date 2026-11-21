import { Attendance, Booking, Destination, RosterShift, SwapRequest, User } from "@/models";
import { ApiError } from "./api";
import { canAccessDestination } from "./auth";
import { sendEmail } from "./notify";
import { conflictsFor, shiftHours } from "./roster";
import { addDays, istParts, todayIST, toMin } from "./utils";

export const EARLY_CLOCK_IN_MIN = 30;   // may clock in this long before the shift starts
export const LATE_GRACE_MIN = 5;        // arriving up to this much after the start is not "late"
export const STALE_OPEN_HOURS = 16;     // a clock-in left open this long is closed automatically and flagged

const hm = (d: Date) => { const p = istParts(d); return { date: p.date, minutes: p.minutes }; };

/** Pure: which of a person's shifts that day a clock-in at `minutes` belongs to, and how late it is. The shift whose window [start-30, end] contains the time wins; otherwise nothing matches. */
export function matchShift<T extends { start: string; end: string }>(shifts: T[], minutes: number) {
  const ok = shifts.filter((s) => minutes >= toMin(s.start) - EARLY_CLOCK_IN_MIN && minutes <= toMin(s.end)).sort((a, b) => toMin(a.start) - toMin(b.start));
  const s = ok[0];
  if (!s) return { shift: null as T | null, lateMin: 0 };
  const diff = minutes - toMin(s.start);
  return { shift: s, lateMin: diff > LATE_GRACE_MIN ? diff : 0 };
}

/** Closes clock-ins that were never closed (phone died, forgot to clock out). The end is capped at the shift end (or 8 hours) and the record is flagged. */
export async function closeStale(now = new Date()) {
  const stale: any[] = await Attendance.find({ outAt: { $exists: false }, inAt: { $lt: new Date(now.getTime() - STALE_OPEN_HOURS * 3600000) } }).limit(100).lean();
  for (const a of stale) {
    const sh: any = a.shift ? await RosterShift.findById(a.shift).lean() : null;
    const cap = sh ? new Date(`${sh.date}T${sh.end}:00+05:30`) : new Date(new Date(a.inAt).getTime() + 8 * 3600000);
    await Attendance.updateOne({ _id: a._id, outAt: { $exists: false } }, { outAt: cap > a.inAt ? cap : new Date(a.inAt), autoClosed: true, openKey: `done:${a._id}` });
  }
}

export async function attendanceStatus(me: any) {
  await closeStale();
  const today = todayIST();
  const [open, shifts]: any[] = await Promise.all([Attendance.findOne({ user: me._id, outAt: { $exists: false } }).populate("destination", "name").lean(), RosterShift.find({ user: me._id, date: today }).sort({ start: 1 }).populate("destination", "name").lean()]);
  return { open, shiftsToday: shifts };
}

export async function clockIn(me: any, destinationId: string) {
  if (!canAccessDestination(me, destinationId)) throw new ApiError(403, "Not assigned to this destination");
  await closeStale();
  const now = new Date(), { date, minutes } = hm(now);
  const mine: any[] = await RosterShift.find({ user: me._id, destination: destinationId, date }).lean();
  const m = matchShift(mine, minutes);
  const d: any = await Destination.findById(destinationId).select("operator").lean();
  try {
    const a = await Attendance.create({ user: me._id, userName: me.name, destination: destinationId, operator: d?.operator, date, shift: m.shift?._id, inAt: now, lateMin: m.lateMin, unrostered: !m.shift, openKey: String(me._id) });
    return { attendance: a.toObject(), shift: m.shift, lateMin: m.lateMin, unrostered: !m.shift };
  } catch (e: any) {
    if (e?.code === 11000) { const cur: any = await Attendance.findOne({ user: me._id, outAt: { $exists: false } }).populate("destination", "name").lean(); throw new ApiError(409, `You are already clocked in${cur?.destination?.name ? ` at ${cur.destination.name}` : ""}. Clock out first.`); }
    throw e;
  }
}
export async function clockOut(me: any) {
  const cur: any = await Attendance.findOne({ user: me._id, outAt: { $exists: false } }).lean();
  if (!cur) throw new ApiError(409, "You're not clocked in");
  const upd = await Attendance.findOneAndUpdate({ _id: cur._id, outAt: { $exists: false } }, { outAt: new Date(), openKey: `done:${cur._id}` }, { new: true }).lean();
  if (!upd) throw new ApiError(409, "You were just clocked out");
  return upd as any;
}

/* ---------------- Report: rostered vs actual ---------------- */
export type StaffRow = { userId: string; name: string; shifts: number; rosteredHours: number; workedHours: number; noShows: number; lateCount: number; lateMinutes: number; unrostered: number; autoClosed: number; counterSales: number; outsideShiftSales: number };
/** Pure: sales (with an IST date and minutes-of-day) that fall outside every rostered shift of the seller at that site that day. Only meaningful when the seller has a roster at all. */
export function outsideShift(sales: { date: string; minutes: number; destination: string }[], shifts: { date: string; start: string; end: string; destination: string }[]) {
  if (!shifts.length) return 0;
  return sales.filter((s) => !shifts.some((x) => x.date === s.date && String(x.destination) === String(s.destination) && s.minutes >= toMin(x.start) && s.minutes <= toMin(x.end))).length;
}
export async function attendanceReport(scope: string[] | null, from: string, to: string, destination?: string) {
  await closeStale();
  const today = todayIST(), nowMin = istParts().minutes, sf: any = { date: { $gte: from, $lte: to > today ? today : to } };
  const dest = destination ? [destination] : scope;
  if (dest) sf.destination = { $in: dest };
  const [shifts, atts]: any[] = await Promise.all([RosterShift.find(sf).lean(), Attendance.find({ ...(dest ? { destination: { $in: dest } } : {}), date: { $gte: from, $lte: to } }).sort({ inAt: -1 }).lean()]);
  const users: any[] = await User.find({ _id: { $in: [...new Set([...shifts.map((s: any) => String(s.user)), ...atts.map((a: any) => String(a.user))])] } }).select("name").lean();
  const names = new Map(users.map((u) => [String(u._id), u.name]));
  const sales: any[] = await Booking.find({ channel: "counter", soldBy: { $in: users.map((u) => u._id) }, ...(dest ? { destination: { $in: dest } } : {}), createdAt: { $gte: new Date(`${from}T00:00:00+05:30`), $lt: new Date(`${addDays(to, 1)}T00:00:00+05:30`) } }).select("soldBy destination createdAt").lean();
  const rows = new Map<string, StaffRow>();
  const row = (id: string): StaffRow => { if (!rows.has(id)) rows.set(id, { userId: id, name: names.get(id) || "Unknown", shifts: 0, rosteredHours: 0, workedHours: 0, noShows: 0, lateCount: 0, lateMinutes: 0, unrostered: 0, autoClosed: 0, counterSales: 0, outsideShiftSales: 0 }); return rows.get(id)!; };
  const attByShift = new Set(atts.filter((a: any) => a.shift).map((a: any) => String(a.shift)));
  for (const s of shifts) {
    const r = row(String(s.user)); r.shifts++; r.rosteredHours += shiftHours(s);
    const over = s.date < today || (s.date === today && nowMin > toMin(s.end));
    if (over && !attByShift.has(String(s._id))) r.noShows++;
  }
  for (const a of atts) {
    const r = row(String(a.user)); r.workedHours += ((a.outAt ? new Date(a.outAt).getTime() : Date.now()) - new Date(a.inAt).getTime()) / 3600000;
    if (a.lateMin > 0) { r.lateCount++; r.lateMinutes += a.lateMin; } if (a.unrostered) r.unrostered++; if (a.autoClosed) r.autoClosed++;
  }
  for (const [id, r] of rows) {
    const mine = sales.filter((x) => String(x.soldBy) === id).map((x) => { const p = istParts(new Date(x.createdAt)); return { date: p.date, minutes: p.minutes, destination: String(x.destination) }; });
    r.counterSales = mine.length; r.outsideShiftSales = outsideShift(mine, shifts.filter((s: any) => String(s.user) === id));
    r.rosteredHours = Math.round(r.rosteredHours * 10) / 10; r.workedHours = Math.round(r.workedHours * 10) / 10;
  }
  return { from, to, rows: [...rows.values()].sort((a, b) => a.name.localeCompare(b.name)), attendance: atts };
}

/* ---------------- Shift swaps ---------------- */
const shiftStart = (s: any) => new Date(`${s.date}T${s.start}:00+05:30`).getTime();
export async function requestSwap(me: any, i: { shiftId: string; toUserId: string; note?: string }) {
  const sh: any = await RosterShift.findOne({ _id: i.shiftId, user: me._id }).lean();
  if (!sh) throw new ApiError(404, "That isn't one of your shifts");
  if (shiftStart(sh) < Date.now() + 3600000) throw new ApiError(409, "A shift can't be handed on within an hour of starting. Ask your manager.");
  if (String(i.toUserId) === String(me._id)) throw new ApiError(400, "Choose a colleague");
  const to: any = await User.findOne({ _id: i.toUserId, role: "staff", active: true }).select("name email assignedDestinations").lean();
  if (!to || !(to.assignedDestinations || []).some((d: any) => String(d) === String(sh.destination))) throw new ApiError(404, "That colleague isn't on staff at this site");
  const theirs: any[] = await RosterShift.find({ user: to._id, date: sh.date }).lean();
  if (conflictsFor({ ...sh, user: to._id }, theirs).length) throw new ApiError(409, `${to.name} already has a shift that overlaps on that day`);
  try {
    const r = await SwapRequest.create({ shift: sh._id, destination: sh.destination, operator: sh.operator, from: me._id, fromName: me.name, to: to._id, toName: to.name, note: i.note, openKey: String(sh._id) });
    if (to.email) await sendEmail({ to: to.email, subject: `${me.name} asked you to cover a shift`, html: `<p>${me.name} asked you to cover <strong>${sh.date} ${sh.start} to ${sh.end}</strong>. Open Staff → Roster to accept or decline. Your manager approves it last.</p>` }).catch(() => {});
    return r.toObject();
  } catch (e: any) { if (e?.code === 11000) throw new ApiError(409, "This shift already has a swap request waiting. Cancel it first."); throw e; }
}
export async function respondSwap(me: any, id: string, accept: boolean) {
  const r: any = await SwapRequest.findOne({ _id: id, to: me._id }).lean();
  if (!r) throw new ApiError(404, "Swap request not found");
  const upd = await SwapRequest.findOneAndUpdate({ _id: r._id, status: "pending_colleague" }, accept ? { status: "pending_manager" } : { status: "declined", decidedAt: new Date(), reason: "Declined by colleague", openKey: `done:${r._id}` }, { new: true }).lean();
  if (!upd) throw new ApiError(409, "This request was just changed");
  return upd as any;
}
export async function cancelSwap(me: any, id: string) {
  const upd = await SwapRequest.findOneAndUpdate({ _id: id, from: me._id, status: { $in: ["pending_colleague", "pending_manager"] } }, { status: "cancelled", decidedAt: new Date(), openKey: `done:${id}` }, { new: true }).lean();
  if (!upd) throw new ApiError(404, "No open swap request of yours with that id");
  return upd as any;
}
/** A manager approves or declines. Approval re-checks everything and moves the shift to the colleague in one conditional update. */
export async function decideSwap(manager: any, id: string, approve: boolean, reason?: string) {
  const r: any = await SwapRequest.findById(id).lean();
  if (!r || !canAccessDestination(manager, r.destination)) throw new ApiError(404, "Swap request not found");
  if (r.status !== "pending_manager") throw new ApiError(409, `This request is ${r.status.replace("_", " ")}`);
  const close = (status: string, why?: string) => SwapRequest.findOneAndUpdate({ _id: r._id, status: "pending_manager" }, { status, decidedBy: manager._id, decidedAt: new Date(), reason: why, openKey: `done:${r._id}` }, { new: true }).lean();
  if (!approve) return (await close("declined", reason || "Declined by manager")) as any;
  const sh: any = await RosterShift.findById(r.shift).lean();
  const fail = async (why: string) => { await close("failed", why); throw new ApiError(409, why); };
  if (!sh || String(sh.user) !== String(r.from)) return fail("The shift has changed since the request was made");
  if (shiftStart(sh) < Date.now()) return fail("That shift has already started");
  if (conflictsFor({ ...sh, user: r.to }, await RosterShift.find({ user: r.to, date: sh.date }).lean() as any[]).length) return fail(`${r.toName} now has an overlapping shift`);
  const moved = await RosterShift.findOneAndUpdate({ _id: sh._id, user: r.from }, { user: r.to, userName: r.toName, notes: `${sh.notes ? sh.notes + "; " : ""}Covered for ${r.fromName}` }, { new: true }).lean();
  if (!moved) return fail("The shift has changed since the request was made");
  return (await close("approved", reason)) as any;
}
