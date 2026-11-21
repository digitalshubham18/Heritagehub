import QRCode from "qrcode";
import { handle, ok, ApiError } from "@/lib/api";
import { canAccessDestination, requireUser } from "@/lib/auth";
import { Booking, Destination, Payment } from "@/models";
import { cancelBooking, ticketCode } from "@/lib/booking";
import { cancellationInfo } from "@/lib/pricing";
import { audit } from "@/lib/audit";
import { platformInfo } from "@/lib/invoice";

async function load(id: string, me: any) {
  const b: any = await Booking.findById(id).lean();
  if (!b) throw new ApiError(404, "Booking not found");
  const mine = String(b.user) === String(me._id);
  if (!mine && !canAccessDestination(me, b.destination)) throw new ApiError(404, "Booking not found"); // don't leak existence
  return { b, mine };
}

export const GET = handle(async (_req, { params }) => {
  const me = await requireUser();
  const { b } = await load(params.id, me);
  const dest: any = await Destination.findById(b.destination).select("name slug type city images location hours cancellationPolicy guidelines").lean();
  const payments = await Payment.find({ booking: b._id }).sort({ createdAt: 1 }).lean();
  const qr = b.status === "confirmed" || b.status === "completed"
    ? await QRCode.toDataURL(ticketCode(b.reference), { margin: 1, width: 360, color: { dark: "#173B2C", light: "#FFFFFF" } }) : null;
  return ok({ booking: b, destination: dest, payments, qr, code: qr ? ticketCode(b.reference) : null, platform: platformInfo(), cancellation: cancellationInfo(b, dest.cancellationPolicy) });
});

export const DELETE = handle(async (req, { params }) => {
  const me = await requireUser();
  const { b, mine } = await load(params.id, me);
  if (!mine && me.role !== "admin" && me.role !== "operator") throw new ApiError(403, "Only the booking owner or a site manager can cancel");
  const force = (me.role === "admin" || me.role === "operator") && !mine;
  const updated = await cancelBooking(b, me, force ? "Cancelled by administrator" : "Cancelled by visitor", force);
  if (force) await audit(me, "booking.cancel", "Booking", b._id, `Manager cancelled ${b.reference} with full refund`);
  return ok({ booking: updated });
});

export const dynamic = "force-dynamic";
