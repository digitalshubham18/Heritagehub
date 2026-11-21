import { handle, ok, ApiError } from "@/lib/api";
import { canAccessDestination, requireUser, scopeIds } from "@/lib/auth";
import { Destination, ParkingPass, ParkingReservation, ParkingTicket } from "@/models";
import { csvResponse } from "@/lib/csv";
import { addDays, istParts, startOfDayIST, todayIST } from "@/lib/utils";

/** Parking analytics for a site (or all sites in scope): daily revenue by payment method, stays, busiest hours, reservations. */
export const GET = handle(async (req) => {
  const me = await requireUser(["admin", "operator"]);
  const sp = req.nextUrl.searchParams, dest = sp.get("destination");
  const days = Math.min(60, Math.max(1, Number(sp.get("range")) || 14));
  if (dest && !canAccessDestination(me, dest)) throw new ApiError(403, "Not your destination");
  const scope = scopeIds(me);
  const dq: any = dest ? dest : scope ? { $in: scope } : undefined;
  const today = todayIST(), first = addDays(today, -(days - 1)), from = startOfDayIST(first);
  const f = dq ? { destination: dq } : {};
  const [tickets, reservations, passRows] = await Promise.all([
    ParkingTicket.find({ ...f, entryAt: { $gte: from } }).select("entryAt exitAt status feeMinor paidMinor prepaidMinor method source vehicleType prepaidMethod penaltyMinor lostTicket lostNote gstMinor invoiceNo ticketNo vehicleNumber bay destination passRef offline").limit(50000).lean() as Promise<any[]>,
    ParkingReservation.find({ ...f, date: { $gte: first } }).select("date status prepaidMinor refundMinor reference vehicleNumber vehicleType bay destination").limit(20000).lean() as Promise<any[]>,
    ParkingPass.find({ ...f, createdAt: { $gte: from } }).select("reference vehicleNumber vehicleType holderName validFrom validTo priceMinor gstMinor method invoiceNo channel status createdAt destination").limit(20000).lean() as Promise<any[]>,
  ]);
  const day = new Map<string, any>();
  for (let i = 0; i < days; i++) { const d = addDays(first, i); day.set(d, { date: d, entered: 0, revenueMinor: 0, cash: 0, upi: 0, card: 0, prepaidCredit: 0, reservations: 0, lostTickets: 0, penaltiesMinor: 0, gstMinor: 0, passMinor: 0 }); }
  const hours = Array(24).fill(0), byType: Record<string, number> = { car: 0, two_wheeler: 0, bus: 0 }; let stays = 0, stayMin = 0, overstays = 0;
  for (const t of tickets) {
    const ed = istParts(new Date(t.entryAt)).date, row = day.get(ed);
    if (row) { row.entered++; if (t.source === "reservation") row.reservations++; }
    hours[Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", hour: "2-digit", hour12: false }).format(new Date(t.entryAt)))]++;
    byType[t.vehicleType] = (byType[t.vehicleType] || 0) + 1;
    if (t.status === "exited" && t.exitAt) {
      const xr = day.get(istParts(new Date(t.exitAt)).date);
      const mins = (new Date(t.exitAt).getTime() - new Date(t.entryAt).getTime()) / 60000;
      stays++; stayMin += mins; if (mins >= 480) overstays++;
      if (xr) { xr.revenueMinor += (t.feeMinor || 0) + (t.penaltyMinor || 0); xr.penaltiesMinor += t.penaltyMinor || 0; xr.gstMinor += t.gstMinor || 0; if (t.lostTicket) xr.lostTickets++; xr.prepaidCredit += t.prepaidMinor || 0; if (t.paidMinor > 0 && xr[t.method] !== undefined) xr[t.method] += t.paidMinor; }
    }
  }
  const rs: Record<string, number> = { reserved: 0, arrived: 0, cancelled: 0, expired: 0 }; let resPaid = 0, resRefunded = 0;
  for (const r of reservations) { rs[r.status] = (rs[r.status] || 0) + 1; resPaid += r.prepaidMinor || 0; resRefunded += r.refundMinor || 0; }
  for (const x of passRows) { const row = day.get(istParts(new Date(x.createdAt)).date); if (row) { row.passMinor += x.priceMinor || 0; row.gstMinor += x.gstMinor || 0; } }
  const daily = [...day.values()];
  if (sp.get("format") === "csv") {
    const kind = sp.get("kind") || "daily", dn = new Map((await Destination.find(dq ? { _id: dq } : {}).select("name").lean() as any[]).map((d) => [String(d._id), d.name]));
    const ist = (d: any) => (d ? new Date(d).toLocaleString("en-CA", { timeZone: "Asia/Kolkata", hour12: false }) : "");
    const rows: Record<string, unknown>[] =
      kind === "hours" ? hours.map((n, h) => ({ hour: `${String(h).padStart(2, "0")}:00`, entries: n }))
      : kind === "reservations" ? reservations.map((r) => ({ reference: r.reference, site: dn.get(String(r.destination)), date: r.date, vehicle: r.vehicleNumber, type: r.vehicleType, bay: r.bay || "standard", status: r.status, prepaid_inr: (r.prepaidMinor || 0) / 100, refunded_inr: (r.refundMinor || 0) / 100 }))
      : kind === "passes" ? passRows.map((x) => ({ reference: x.reference, site: dn.get(String(x.destination)), vehicle: x.vehicleNumber, type: x.vehicleType, holder: x.holderName, valid_from: x.validFrom, valid_to: x.validTo, price_inr: (x.priceMinor || 0) / 100, gst_inr: (x.gstMinor || 0) / 100, method: x.method, channel: x.channel, status: x.status, invoice: x.invoiceNo, sold_at: ist(x.createdAt) }))
      : kind === "lost" ? tickets.filter((t) => t.lostTicket).map((t) => ({ ticket: t.ticketNo, site: dn.get(String(t.destination)), vehicle: t.vehicleNumber, entered: ist(t.entryAt), exited: ist(t.exitAt), fee_inr: (t.feeMinor || 0) / 100, lost_ticket_charge_inr: (t.penaltyMinor || 0) / 100, verification: t.lostNote, invoice: t.invoiceNo }))
      : kind === "stays" ? tickets.map((t) => ({ ticket: t.ticketNo, site: dn.get(String(t.destination)), vehicle: t.vehicleNumber, type: t.vehicleType, bay: t.bay || "standard", source: t.source, pass: t.passRef, entered: ist(t.entryAt), exited: ist(t.exitAt), fee_inr: (t.feeMinor || 0) / 100, lost_ticket_charge_inr: (t.penaltyMinor || 0) / 100, gst_inr: (t.gstMinor || 0) / 100, prepaid_inr: (t.prepaidMinor || 0) / 100, paid_at_exit_inr: (t.paidMinor || 0) / 100, method: t.method, invoice: t.invoiceNo, offline: t.offline ? "yes" : "", offline_mismatch_inr: (t.offline?.mismatchMinor || 0) / 100 }))
      : daily.map((d) => ({ date: d.date, vehicles_entered: d.entered, prebooked_arrivals: d.reservations, revenue_inr: d.revenueMinor / 100, cash_inr: d.cash / 100, upi_inr: d.upi / 100, card_inr: d.card / 100, prepaid_credit_inr: d.prepaidCredit / 100, lost_tickets: d.lostTickets, lost_ticket_charges_inr: d.penaltiesMinor / 100, pass_sales_inr: d.passMinor / 100, gst_inr: d.gstMinor / 100 }));
    return csvResponse(`heritagehub-parking-${kind}-${today}.csv`, rows, kind === "hours" ? ["hour", "entries"] : undefined);
  }
  return ok({
    range: days, daily, hours: hours.map((n, h) => ({ hour: h, entries: n })), byType,
    totals: { entered: daily.reduce((a, d) => a + d.entered, 0), revenueMinor: daily.reduce((a, d) => a + d.revenueMinor, 0), cash: daily.reduce((a, d) => a + d.cash, 0), upi: daily.reduce((a, d) => a + d.upi, 0), card: daily.reduce((a, d) => a + d.card, 0), avgStayMin: stays ? Math.round(stayMin / stays) : 0, overstays, lostTickets: daily.reduce((a, d) => a + d.lostTickets, 0), penaltiesMinor: daily.reduce((a, d) => a + d.penaltiesMinor, 0), gstMinor: daily.reduce((a, d) => a + d.gstMinor, 0), passMinor: daily.reduce((a, d) => a + d.passMinor, 0), passesSold: passRows.length },
    reservations: { ...rs, prepaidMinor: resPaid, refundedMinor: resRefunded, noShowRatePct: rs.arrived + rs.expired ? Math.round((rs.expired / (rs.arrived + rs.expired)) * 100) : 0 },
  });
});
export const dynamic = "force-dynamic";
