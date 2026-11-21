import { handle, ok } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { paySchema } from "@/lib/validators";
import { payBooking } from "@/lib/booking";
import { razorpayEnabled } from "@/lib/razorpay";
import { limit } from "@/lib/ratelimit";

/** Tells the checkout page which gateway is active. */
export const GET = handle(async () => ok({ provider: razorpayEnabled() ? "razorpay" : "simulated" }));

/**
 * Simulated gateway: confirms immediately. Razorpay: creates an order and returns it so the browser can open Checkout;
 * the booking is only confirmed after /api/payments/verify (signature) or the webhook.
 */
export const POST = handle(async (req) => {
  const me = await requireUser(["tourist", "admin", "operator", "staff"]);
  await limit("payment", [String(me._id)], 15, 600);
  const body = paySchema.parse(await req.json());
  const r: any = await payBooking(me, body);
  if (r.order) return ok({ requiresAction: true, order: r.order, bookingId: String(r.booking._id) });
  return ok({ payment: { id: r.payment._id, status: r.payment.status, failureReason: r.payment.failureReason, providerRef: r.payment.providerRef }, booking: r.booking, replayed: r.replayed }, r.payment.status === "failed" ? 402 : 200);
});

export const dynamic = "force-dynamic";
