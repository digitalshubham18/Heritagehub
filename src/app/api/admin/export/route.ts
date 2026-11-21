import { handle, ApiError } from "@/lib/api";
import { requireUser, scopeIds } from "@/lib/auth";
import { Destination, LostFoundItem, PricingRule, RosterShift, ShiftHandover, ShiftReport, SupportTicket } from "@/models";
import { csvResponse as rawCsv } from "@/lib/csv";
import { addDays, todayIST } from "@/lib/utils";

const HEAD: Record<string, string[]> = { "cash-counts": "counted_at,staff,site,tickets_sold,counter_cash_inr,parking_cash_inr,opening_float_inr,expected_inr,counted_inr,variance_inr,notes".split(","), "handovers": "created,site,from,to,status,handed_inr,expected_inr,outgoing_variance_inr,received_inr,receive_variance_inr,accepted,vehicles_parked,open_incidents,notes,receive_notes".split(","), "lost-and-found": "reference,logged,site,kind,category,description,location,status,contact,phone,returned_to,returned_at,logged_by".split(","), "roster": "date,site,staff,position,start,end,hours,notes".split(","), "support-tickets": "reference,opened,site,category,subject,status,visitor,email,booking,messages,last_message,last_from".split(","), "pricing-rules": "site,name,adjust_pct,days,date_from,date_to,time_from,time_to,min_booked_pct,audiences,active".split(",") };
const csvResponse = (file: string, rows: Record<string, unknown>[]) => rawCsv(file, rows, rows.length ? undefined : HEAD[file.replace(/^heritagehub-/, "").replace(/-\d{4}-\d{2}-\d{2}\.csv$/, "")]);
const ist = (d: any) => (d ? new Date(d).toLocaleString("en-CA", { timeZone: "Asia/Kolkata", hour12: false }) : "");
const inr = (m: any) => (m || 0) / 100;
/**
 * CSV exports for managers, scoped to their sites. ?report=shifts|handovers|lost-found|roster|support|pricing  &range=days (default 30)  &from=&to= for roster.
 * (Parking, incidents and staff activity export from their own endpoints with format=csv.)
 */
export const GET = handle(async (req) => {
  const me = await requireUser(["admin", "operator"]);
  const sp = req.nextUrl.searchParams, report = sp.get("report"), sc = scopeIds(me), today = todayIST();
  const days = Math.min(365, Math.max(1, Number(sp.get("range")) || 30)), since = new Date(Date.now() - days * 86400000);
  const dests: any[] = await Destination.find(sc ? { _id: { $in: sc } } : {}).select("name").lean();
  const dn = new Map(dests.map((d) => [String(d._id), d.name])), inScope = sc ? { destination: { $in: sc } } : {};
  const name = (k: string) => `heritagehub-${k}-${today}.csv`;
  switch (report) {
    case "shifts": return csvResponse(name("cash-counts"), ((await ShiftReport.find({ ...inScope, createdAt: { $gte: since } }).sort({ createdAt: -1 }).limit(10000).lean()) as any[]).map((r) => ({ counted_at: ist(r.createdAt), staff: r.userName, site: dn.get(String(r.destination)), tickets_sold: r.ticketsSold, counter_cash_inr: inr(r.counterCashMinor), parking_cash_inr: inr(r.parkingCashMinor), opening_float_inr: inr(r.openingFloatMinor), expected_inr: inr(r.expectedCashMinor), counted_inr: inr(r.countedCashMinor), variance_inr: inr(r.varianceMinor), notes: r.notes })));
    case "handovers": return csvResponse(name("handovers"), ((await ShiftHandover.find({ ...inScope, createdAt: { $gte: since } }).sort({ createdAt: -1 }).limit(10000).lean()) as any[]).map((h) => ({ created: ist(h.createdAt), site: dn.get(String(h.destination)), from: h.fromName, to: h.toName, status: h.status, handed_inr: inr(h.handedCashMinor), expected_inr: inr(h.expectedCashMinor), outgoing_variance_inr: inr(h.varianceMinor), received_inr: h.status === "accepted" ? inr(h.receivedCashMinor) : "", receive_variance_inr: h.status === "accepted" ? inr(h.receiveVarianceMinor) : "", accepted: ist(h.acceptedAt), vehicles_parked: h.snapshot?.vehiclesParked, open_incidents: h.snapshot?.openIncidents?.length || 0, notes: h.notes, receive_notes: h.receiveNotes })));
    case "lost-found": return csvResponse(name("lost-and-found"), ((await LostFoundItem.find({ ...inScope, createdAt: { $gte: since } }).sort({ createdAt: -1 }).limit(10000).lean()) as any[]).map((i) => ({ reference: i.reference, logged: ist(i.createdAt), site: dn.get(String(i.destination)), kind: i.kind, category: i.category, description: i.description, location: i.location, status: i.status, contact: i.contactName, phone: i.contactPhone, returned_to: i.returnedTo?.name, returned_at: ist(i.returnedTo?.at), logged_by: i.loggedByName })));
    case "roster": { const from = sp.get("from") || addDays(today, -7), to = sp.get("to") || addDays(today, 14); return csvResponse(name("roster"), ((await RosterShift.find({ ...inScope, date: { $gte: from, $lte: to } }).sort({ date: 1, start: 1 }).limit(20000).lean()) as any[]).map((r) => ({ date: r.date, site: dn.get(String(r.destination)), staff: r.userName, position: r.position, start: r.start, end: r.end, hours: (Number(r.end.slice(0, 2)) * 60 + Number(r.end.slice(3)) - Number(r.start.slice(0, 2)) * 60 - Number(r.start.slice(3))) / 60, notes: r.notes }))); }
    case "support": return csvResponse(name("support-tickets"), ((await SupportTicket.find({ ...(sc ? { destination: { $in: sc } } : {}), createdAt: { $gte: since } }).sort({ createdAt: -1 }).limit(10000).lean()) as any[]).map((t) => ({ reference: t.reference, opened: ist(t.createdAt), site: dn.get(String(t.destination)) || "", category: t.category, subject: t.subject, status: t.status, visitor: t.name, email: t.email, booking: t.bookingRef, messages: t.messages?.length, last_message: ist(t.lastMessageAt), last_from: t.lastFrom })));
    case "pricing": return csvResponse(name("pricing-rules"), ((await PricingRule.find(inScope).sort({ createdAt: -1 }).limit(2000).lean()) as any[]).map((r) => ({ site: dn.get(String(r.destination)), name: r.name, adjust_pct: r.adjustPct, days: (r.daysOfWeek || []).join(" "), date_from: r.dateFrom, date_to: r.dateTo, time_from: r.timeFrom, time_to: r.timeTo, min_booked_pct: r.minBookedPct, audiences: (r.audiences || []).join(" "), active: r.active ? "yes" : "no" })));
    default: throw new ApiError(400, "report must be shifts, handovers, lost-found, roster, support or pricing");
  }
});
export const dynamic = "force-dynamic";
