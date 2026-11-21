import { z } from "zod";
import { handle, ok } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { confirmRazorpayPayment } from "@/lib/booking";

const schema = z.object({ razorpay_order_id: z.string(), razorpay_payment_id: z.string(), razorpay_signature: z.string() });
/** Browser callback after Razorpay Checkout. The HMAC signature is verified server-side with the key secret. */
export const POST = handle(async (req) => {
  const me = await requireUser(["tourist", "admin", "operator", "staff"]);
  const b = schema.parse(await req.json());
  const r = await confirmRazorpayPayment(me._id, { orderId: b.razorpay_order_id, paymentId: b.razorpay_payment_id, signature: b.razorpay_signature }, "client");
  return ok({ ok: true, booking: r.booking, replayed: r.replayed });
});

export const dynamic = "force-dynamic";
