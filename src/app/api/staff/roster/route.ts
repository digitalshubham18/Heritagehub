import { handle, ok } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { RosterShift } from "@/models";
import { addDays, istParts, todayIST } from "@/lib/utils";
import { toMin } from "@/lib/utils";

/** My shifts for the next 14 days, who else is on at my sites today, and whether I'm on duty right now. */
export const GET = handle(async () => {
  const me = await requireUser(["staff"]);
  const today = todayIST(), { minutes } = istParts();
  const mine: any[] = await RosterShift.find({ user: me._id, date: { $gte: today, $lte: addDays(today, 13) } }).sort({ date: 1, start: 1 }).populate("destination", "name").lean();
  const team: any[] = await RosterShift.find({ destination: { $in: me.assignedDestinations || [] }, date: today }).sort({ start: 1 }).populate("destination", "name").lean();
  const onNow = mine.find((s) => s.date === today && toMin(s.start) <= minutes && minutes < toMin(s.end));
  return ok({ mine, team, onNow: onNow || null });
});
export const dynamic = "force-dynamic";
