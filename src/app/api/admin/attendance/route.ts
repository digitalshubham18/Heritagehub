import { handle, ok, ApiError } from "@/lib/api";
import { canAccessDestination, requireUser, scopeIds } from "@/lib/auth";
import { attendanceReport } from "@/lib/attendance";
import { csvResponse } from "@/lib/csv";
import { addDays, todayIST } from "@/lib/utils";

/** Rostered versus actual hours, lateness, no-shows and counter sales outside rostered shifts, for the manager's sites. ?from=&to=&destination=&format=csv */
export const GET = handle(async (req) => {
  const me = await requireUser(["admin", "operator"]);
  const sp = req.nextUrl.searchParams, today = todayIST();
  const to = /^\d{4}-\d{2}-\d{2}$/.test(sp.get("to") || "") ? sp.get("to")! : today, from = /^\d{4}-\d{2}-\d{2}$/.test(sp.get("from") || "") ? sp.get("from")! : addDays(to, -6);
  if (from > to) throw new ApiError(400, "The start date is after the end date");
  if (Math.abs((new Date(to).getTime() - new Date(from).getTime()) / 86400000) > 92) throw new ApiError(400, "Pick a range of up to 92 days");
  const dest = sp.get("destination") || undefined;
  if (dest && !canAccessDestination(me, dest)) throw new ApiError(403, "Not your destination");
  const r = await attendanceReport(scopeIds(me), from, to, dest);
  if (sp.get("format") === "csv") {
    const cols = ["staff", "shifts", "rostered_hours", "worked_hours", "no_shows", "late_arrivals", "late_minutes", "unrostered_clock_ins", "auto_closed", "counter_sales", "sales_outside_shift"];
    return csvResponse(`heritagehub-attendance-${from}-to-${to}.csv`, r.rows.map((x) => ({ staff: x.name, shifts: x.shifts, rostered_hours: x.rosteredHours, worked_hours: x.workedHours, no_shows: x.noShows, late_arrivals: x.lateCount, late_minutes: x.lateMinutes, unrostered_clock_ins: x.unrostered, auto_closed: x.autoClosed, counter_sales: x.counterSales, sales_outside_shift: x.outsideShiftSales })), cols);
  }
  return ok({ from: r.from, to: r.to, rows: r.rows, recent: r.attendance.slice(0, 40) });
});
export const dynamic = "force-dynamic";
