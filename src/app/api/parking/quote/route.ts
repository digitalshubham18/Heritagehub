import { handle, ok, ApiError } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { upiQr, upiStatus } from "@/lib/collect";
import { quoteExit } from "@/lib/parking";
import { limit } from "@/lib/ratelimit";

/**
 * Fixes the amount due for a parked vehicle for 5 minutes and returns a signed quote token.
 * With ?method=upi it also returns a UPI QR whose amount is exactly the amount due (ticket number as the payment reference).
 */
export const GET = handle(async (req) => {
  const me = await requireUser(["staff", "admin", "operator"]);
  await limit("parking", [String(me._id)], 240, 60);
  const sp = req.nextUrl.searchParams;
  const q = await quoteExit(me, { ticketNo: sp.get("ticketNo") || undefined, vehicleNumber: sp.get("vehicleNumber") || undefined, destinationId: sp.get("destination") || undefined, lost: sp.get("lost") === "1" });
  let upi: any = null, upiBlocked = false;
  if (sp.get("method") === "upi") {
    if (q.dueMinor <= 0) throw new ApiError(409, "Nothing is due, so no payment QR is needed");
    if ((await upiStatus(q.ticket.destination)).blocked) upiBlocked = true;
    else upi = await upiQr(q.ticket.destination, q.dueMinor, `Parking ${q.ticket.ticketNo}`, q.ticket.ticketNo);
  }
  return ok({ ticketNo: q.ticket.ticketNo, vehicleNumber: q.ticket.vehicleNumber, vehicleType: q.ticket.vehicleType, minutes: q.minutes, feeMinor: q.feeMinor, penaltyMinor: q.penaltyMinor, passRef: q.ticket.passRef, upiBlocked, prepaidMinor: q.prepaidMinor, dueMinor: q.dueMinor, quote: q.quote, expiresAt: q.expiresAt, upi });
});
export const dynamic = "force-dynamic";
