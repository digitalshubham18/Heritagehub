import { handle, ok, ApiError } from "@/lib/api";
import { canAccessDestination, requireUser } from "@/lib/auth";
import { Booking, Destination, Operator, ParkingPass, ParkingReservation, ParkingTicket } from "@/models";
import { platformInfo } from "@/lib/invoice";
import { VLABEL, POOL_LABEL, poolOf } from "@/lib/parking";

/**
 * Invoice data for a parking stay (?ref=PK-...) or a monthly pass (?ref=PP-...). Seller is the operator (legal name and GSTIN) when set, else the platform.
 * Visible to staff of the site, managers in scope, and the visitor who owns the pass or the reservation or booking the stay came from.
 */
export const GET = handle(async (req) => {
  const me = await requireUser();
  const ref = (req.nextUrl.searchParams.get("ref") || "").toUpperCase().trim();
  const isPass = ref.startsWith("PP-");
  const doc: any = isPass ? await ParkingPass.findOne({ reference: ref }).lean() : await ParkingTicket.findOne({ ticketNo: ref }).lean();
  if (!doc) throw new ApiError(404, "Invoice not found");
  let allowed = me.role === "tourist" ? false : canAccessDestination(me, doc.destination);
  if (me.role === "tourist") {
    if (isPass) allowed = String(doc.user) === String(me._id);
    else {
      const r: any = doc.reservation ? await ParkingReservation.findById(doc.reservation).select("user").lean() : null;
      const b: any = doc.booking ? await Booking.findById(doc.booking).select("user").lean() : null;
      allowed = (r && String(r.user) === String(me._id)) || (b && String(b.user) === String(me._id));
    }
  }
  if (!allowed) throw new ApiError(404, "Invoice not found");
  if (!doc.invoiceNo) throw new ApiError(409, isPass ? "No invoice for this pass yet" : doc.status === "parked" ? "The invoice is issued when the vehicle checks out" : "No charge was made for this stay, so there is no invoice");
  const dest: any = await Destination.findById(doc.destination).select("name city operator").lean();
  const op: any = dest?.operator ? await Operator.findById(dest.operator).select("legalName gstin address name").lean() : null;
  const seller = op?.legalName ? { legalName: op.legalName, gstin: op.gstin || "", address: op.address || "" } : { legalName: platformInfo().legalName, gstin: platformInfo().gstin, address: platformInfo().address };
  const lines = isPass
    ? [{ description: `Monthly parking pass: ${VLABEL[doc.vehicleType as keyof typeof VLABEL]} ${doc.vehicleNumber}, ${doc.validFrom} to ${doc.validTo}`, amountMinor: doc.priceMinor }]
    : [
        { description: `Parking: ${POOL_LABEL[poolOf(doc.vehicleType, doc.bay)]} ${doc.vehicleNumber}, ${new Date(doc.entryAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })} to ${new Date(doc.exitAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}`, amountMinor: doc.feeMinor || 0 },
        ...(doc.penaltyMinor ? [{ description: "Lost-ticket charge", amountMinor: doc.penaltyMinor }] : []),
      ];
  const total = lines.reduce((a, l) => a + l.amountMinor, 0);
  const creditNote = isPass && doc.creditNoteNo ? { no: doc.creditNoteNo, at: doc.creditNoteAt, refundMinor: doc.refundMinor || 0, gstMinor: doc.creditNoteGstMinor || 0, reason: doc.cancelReason, method: doc.refundMethod } : null;
  return ok({ creditNote, kind: isPass ? "pass" : "stay", invoiceNo: doc.invoiceNo, invoiceAt: doc.invoiceAt, seller, site: { name: dest?.name, city: dest?.city }, buyer: isPass ? doc.holderName : doc.driverName || "Visitor", vehicleNumber: doc.vehicleNumber, lines, totalMinor: total, gstPct: doc.gstPct || 0, gstMinor: doc.gstMinor || 0, taxableMinor: total - (doc.gstMinor || 0), paidMinor: isPass ? doc.priceMinor : (doc.paidMinor || 0) + (doc.prepaidMinor || 0), prepaidMinor: isPass ? 0 : doc.prepaidMinor || 0, method: doc.method, ref });
});
export const dynamic = "force-dynamic";
