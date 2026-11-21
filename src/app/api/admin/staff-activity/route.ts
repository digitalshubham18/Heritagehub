import { handle, ok } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { EntryRecord, ParkingTicket, Payment, ShiftReport, User } from "@/models";
import { addDays, startOfDayIST, todayIST } from "@/lib/utils";
import { csvResponse } from "@/lib/csv";

/** Who did what: per staff member counter sales, gate scans, parking handled and cash-count differences (?range=1|7|30 days). */
export const GET = handle(async (req) => {
  const me = await requireUser(["admin", "operator"]);
  const days = Math.min(90, Math.max(1, Number(req.nextUrl.searchParams.get("range")) || 1));
  const from = startOfDayIST(addDays(todayIST(), -(days - 1)));
  const staff: any[] = await User.find({ role: "staff", ...(me.role === "operator" ? { operator: me.operator } : {}) }).select("name email active assignedDestinations").lean();
  const ids = staff.map((s) => s._id);
  const [pays, scans, admitted, exited, shifts] = await Promise.all([
    Payment.aggregate([{ $match: { provider: "counter", user: { $in: ids }, createdAt: { $gte: from }, status: "succeeded", type: "charge" } }, { $group: { _id: { u: "$user", m: "$method" }, n: { $sum: 1 }, amt: { $sum: "$amountMinor" } } }]),
    EntryRecord.aggregate([{ $match: { by: { $in: ids }, at: { $gte: from } } }, { $group: { _id: { u: "$by", t: "$type" }, n: { $sum: "$quantity" } } }]),
    ParkingTicket.aggregate([{ $match: { by: { $in: ids }, entryAt: { $gte: from } } }, { $group: { _id: "$by", n: { $sum: 1 } } }]),
    ParkingTicket.aggregate([{ $match: { exitBy: { $in: ids }, exitAt: { $gte: from } } }, { $group: { _id: "$exitBy", n: { $sum: 1 }, amt: { $sum: "$paidMinor" } } }]),
    ShiftReport.find({ user: { $in: ids }, createdAt: { $gte: from } }).lean() as Promise<any[]>,
  ]);
  const items = staff.map((s) => {
    const id = String(s._id), pm = pays.filter((p) => String(p._id.u) === id);
    const sc = (t: string) => scans.find((x) => String(x._id.u) === id && x._id.t === t)?.n || 0;
    const sh = shifts.filter((x) => String(x.user) === id);
    return {
      id, name: s.name, email: s.email, active: s.active,
      counterSales: pm.reduce((a, p) => a + p.n, 0), counterMinor: pm.reduce((a, p) => a + p.amt, 0), cashMinor: pm.find((p) => p._id.m === "cash")?.amt || 0,
      checkedIn: sc("in"), checkedOut: sc("out"), parkingAdmitted: admitted.find((x) => String(x._id) === id)?.n || 0, parkingExited: exited.find((x) => String(x._id) === id)?.n || 0, parkingCollectedMinor: exited.find((x) => String(x._id) === id)?.amt || 0,
      shifts: sh.length, varianceMinor: sh.reduce((a, x) => a + (x.varianceMinor || 0), 0), shortCounts: sh.filter((x) => (x.varianceMinor || 0) < 0).length,
    };
  });
  if (req.nextUrl.searchParams.get("format") === "csv") return csvResponse(`heritagehub-staff-activity-${days}d-${todayIST()}.csv`, items.map((i) => ({ staff: i.name, email: i.email, active: i.active ? "yes" : "no", counter_sales: i.counterSales, counter_inr: i.counterMinor / 100, cash_inr: i.cashMinor / 100, checked_in: i.checkedIn, checked_out: i.checkedOut, parking_admitted: i.parkingAdmitted, parking_exited: i.parkingExited, parking_collected_inr: i.parkingCollectedMinor / 100, cash_counts: i.shifts, short_counts: i.shortCounts, cash_variance_inr: i.varianceMinor / 100 })), ["staff", "email", "active", "counter_sales", "counter_inr", "cash_inr", "checked_in", "checked_out", "parking_admitted", "parking_exited", "parking_collected_inr", "cash_counts", "short_counts", "cash_variance_inr"]);
  return ok({ range: days, items, recentShifts: shifts.sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt)).slice(0, 12) });
});
export const dynamic = "force-dynamic";
