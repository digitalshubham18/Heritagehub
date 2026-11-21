import { NextResponse } from "next/server";
import { handle, ok } from "@/lib/api";
import { requireUser, scopeIds } from "@/lib/auth";
import { ApiError } from "@/lib/api";
import { Booking, Destination, Operator, ParkingTicket, Pass, Payment } from "@/models";
import { addDays, todayIST } from "@/lib/utils";

const blank = () => ({ bookingsOnline: 0, bookingsCounter: 0, onlineTicketMinor: 0, onlineFeesMinor: 0, onlineGstMinor: 0, onlineRefundTicketMinor: 0, onlineRefundFeesMinor: 0, onlineRefundGstMinor: 0, counterCashMinor: 0, counterUpiMinor: 0, counterCardMinor: 0, counterRefundsMinor: 0 });
type Row = ReturnType<typeof blank>;

/**
 * Money settlement per destination for a period, based on payments created in that period (IST dates, inclusive).
 *  - Online: HeritageHub collects ticket value + convenience fee + GST on the fee. Ticket value is payable to the operator,
 *    the fee is platform revenue, GST is a tax liability. A full refund returns all three; a partial (late) refund returns ticket value only.
 *  - Counter: cash/UPI/card taken by the operator directly. Reported for reconciliation, never "payable".
 */
export const GET = handle(async (req) => {
  const me = await requireUser(["admin", "operator"]);
  const allowed = scopeIds(me);
  const sp = req.nextUrl.searchParams;
  const to = sp.get("to") || todayIST(), from = sp.get("from") || addDays(to, -29);
  const start = new Date(`${from}T00:00:00+05:30`), end = new Date(`${addDays(to, 1)}T00:00:00+05:30`);
  const destFilter = sp.get("destination");
  if (destFilter && allowed && !allowed.includes(destFilter)) throw new ApiError(403, "Not your destination");
  const destQuery: any = destFilter ? destFilter : allowed ? { $in: allowed } : null;
  const pays: any[] = await Payment.find({ status: "succeeded", createdAt: { $gte: start, $lt: end } }).lean();
  const bookings: any[] = await Booking.find({ _id: { $in: pays.map((p) => p.booking) }, ...(destQuery ? { destination: destQuery } : {}) }).select("destination subtotalMinor feesMinor taxMinor totalMinor channel").lean();
  const bById = new Map(bookings.map((b) => [String(b._id), b]));
  const dests: any[] = await Destination.find(allowed ? { _id: { $in: allowed } } : {}).select("name operator").lean();
  const ops: any[] = await Operator.find({}).select("name commissionPct").lean();
  const rows = new Map<string, Row>();
  const row = (id: string) => { let r = rows.get(id); if (!r) { r = blank(); rows.set(id, r); } return r; };
  for (const p of pays) {
    const b = bById.get(String(p.booking)); if (!b) continue;
    const r = row(String(b.destination));
    if (p.type === "charge") {
      if (p.provider === "counter") { r.bookingsCounter++; const k = p.method === "cash" ? "counterCashMinor" : p.method === "card" ? "counterCardMinor" : "counterUpiMinor"; r[k] += p.amountMinor; }
      else { r.bookingsOnline++; r.onlineTicketMinor += b.subtotalMinor; r.onlineFeesMinor += b.feesMinor; r.onlineGstMinor += b.taxMinor; }
    } else if (p.provider === "counter") r.counterRefundsMinor += p.amountMinor;
    else if (p.amountMinor >= b.totalMinor) { r.onlineRefundTicketMinor += b.subtotalMinor; r.onlineRefundFeesMinor += b.feesMinor; r.onlineRefundGstMinor += b.taxMinor; }
    else r.onlineRefundTicketMinor += p.amountMinor;
  }
  const items = [...rows.entries()].map(([id, r]) => ({
    destinationId: id, destination: dests.find((d) => String(d._id) === id)?.name || "Unknown", ...r,
    netPayableToOperatorMinor: r.onlineTicketMinor - r.onlineRefundTicketMinor,
    platformFeeNetMinor: r.onlineFeesMinor - r.onlineRefundFeesMinor,
    gstNetMinor: r.onlineGstMinor - r.onlineRefundGstMinor,
  })).sort((a, b) => a.destination.localeCompare(b.destination));
  const parkRows: any[] = await ParkingTicket.find({ status: "exited", exitAt: { $gte: start, $lt: end }, ...(destQuery ? { destination: destQuery } : {}) }).select("destination feeMinor").lean();
  for (const it of items as any[]) {
    const dd = dests.find((d) => String(d._id) === it.destinationId); const op = ops.find((o) => String(o._id) === String(dd?.operator));
    it.operatorName = op?.name || "Unassigned"; it.commissionPct = op?.commissionPct || 0;
    it.commissionMinor = Math.max(0, Math.round((it.netPayableToOperatorMinor * it.commissionPct) / 100));
    it.payoutMinor = it.netPayableToOperatorMinor - it.commissionMinor;
    it.parkingCollectedMinor = parkRows.filter((p) => String(p.destination) === it.destinationId).reduce((a, p) => a + p.feeMinor, 0);
  }
  const passRows: any[] = await Pass.find({ status: "active", createdAt: { $gte: start, $lt: end }, ...(me.role === "operator" ? { operator: me.operator } : {}) }).select("operator subtotalMinor feesMinor taxMinor").lean();
  const passes = [...new Set(passRows.map((p) => String(p.operator)))].map((id) => { const rs = passRows.filter((p) => String(p.operator) === id); return { operatorName: ops.find((o) => String(o._id) === id)?.name || "Unassigned", count: rs.length, valueMinor: rs.reduce((a, p) => a + p.subtotalMinor, 0), feesMinor: rs.reduce((a, p) => a + p.feesMinor, 0), gstMinor: rs.reduce((a, p) => a + p.taxMinor, 0) }; });
  const totals = items.reduce((t: any, i: any) => { for (const k of Object.keys(i)) if (typeof i[k] === "number") t[k] = (t[k] || 0) + i[k]; return t; }, {});
  const failedRefunds = await Payment.countDocuments({ type: "refund", status: "failed", createdAt: { $gte: start, $lt: end } });

  if (sp.get("format") === "csv") {
    const inr = (m: number) => (m / 100).toFixed(2);
    const head = ["destination", "online_bookings", "online_ticket_value", "online_refunds_ticket", "NET_PAYABLE_TO_OPERATOR", "platform_commission", "PAYOUT_AFTER_COMMISSION", "parking_collected", "convenience_fees", "fee_refunds", "NET_PLATFORM_FEE", "gst_on_fees", "gst_refunded", "NET_GST", "counter_bookings", "counter_cash", "counter_upi", "counter_card", "counter_refunds"];
    const line = (i: any) => [`"${i.destination.replace(/"/g, '""')}"`, i.bookingsOnline, inr(i.onlineTicketMinor), inr(i.onlineRefundTicketMinor), inr(i.netPayableToOperatorMinor), inr(i.commissionMinor || 0), inr(i.payoutMinor ?? i.netPayableToOperatorMinor), inr(i.parkingCollectedMinor || 0), inr(i.onlineFeesMinor), inr(i.onlineRefundFeesMinor), inr(i.platformFeeNetMinor), inr(i.onlineGstMinor), inr(i.onlineRefundGstMinor), inr(i.gstNetMinor), i.bookingsCounter, inr(i.counterCashMinor), inr(i.counterUpiMinor), inr(i.counterCardMinor), inr(i.counterRefundsMinor)].join(",");
    const csv = [head.join(","), ...items.map(line), line({ ...totals, destination: "TOTAL" })].join("\n");
    return new NextResponse(csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="settlement-${from}-to-${to}.csv"` } });
  }
  return ok({ from, to, items, totals, passes, failedRefunds });
});

export const dynamic = "force-dynamic";
