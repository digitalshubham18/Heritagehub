import { Destination, RosterShift, User } from "@/models";
import { ApiError } from "./api";
import { toMin } from "./utils";

export type ShiftLike = { _id?: any; user: any; destination: any; date: string; start: string; end: string };
export const overlaps = (a: Pick<ShiftLike, "date" | "start" | "end">, b: Pick<ShiftLike, "date" | "start" | "end">) => a.date === b.date && toMin(a.start) < toMin(b.end) && toMin(b.start) < toMin(a.end);
/** Shifts of the same person that overlap the candidate (at any site: nobody can be in two places). */
export const conflictsFor = (cand: ShiftLike, existing: ShiftLike[]) => existing.filter((e) => String(e._id) !== String(cand._id) && String(e.user) === String(cand.user) && overlaps(cand, e));
export const shiftHours = (s: Pick<ShiftLike, "start" | "end">) => (toMin(s.end) - toMin(s.start)) / 60;
export const MAX_SHIFT_HOURS = 12;

export async function createShift(me: any, i: { destinationId: string; userId: string; date: string; start: string; end: string; position?: string; notes?: string }, scope: string[] | null) {
  if (toMin(i.end) <= toMin(i.start)) throw new ApiError(400, "A shift must end after it starts (split overnight shifts into two)");
  if (shiftHours(i) > MAX_SHIFT_HOURS) throw new ApiError(400, `A single shift can't be longer than ${MAX_SHIFT_HOURS} hours`);
  if (scope && !scope.includes(String(i.destinationId))) throw new ApiError(403, "Not your destination");
  const dest: any = await Destination.findById(i.destinationId).select("operator name").lean();
  if (!dest) throw new ApiError(404, "Destination not found");
  const u: any = await User.findOne({ _id: i.userId, role: "staff", active: true }).select("name assignedDestinations operator").lean();
  if (!u || !(u.assignedDestinations || []).some((d: any) => String(d) === String(i.destinationId))) throw new ApiError(404, "That staff member isn't assigned to this site");
  const same: any[] = await RosterShift.find({ user: u._id, date: i.date }).lean();
  const clash = conflictsFor({ user: u._id, destination: i.destinationId, ...i }, same);
  if (clash.length) throw new ApiError(409, `${u.name} already has a shift ${clash[0].start} to ${clash[0].end} that day`);
  const s = await RosterShift.create({ operator: dest.operator, destination: i.destinationId, user: u._id, userName: u.name, date: i.date, start: i.start, end: i.end, position: i.position || "gate", notes: i.notes, createdBy: me._id });
  return s.toObject();
}
