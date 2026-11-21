import { NextResponse } from "next/server";
import { handle, ok } from "@/lib/api";
import { confirmRazorpayPayment } from "@/lib/booking";
import { verifyWebhook } from "@/lib/razorpay";

/**
 * Razorpay webhook (payment.captured / order.paid). Covers users who close the tab after paying.
 * Configure the URL https://<your-domain>/api/payments/webhook and set RAZORPAY_WEBHOOK_SECRET.
 */
export const POST = handle(async (req) => {
  const raw = await req.text();
  if (!verifyWebhook(raw, req.headers.get("x-razorpay-signature") || "")) return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  const evt = JSON.parse(raw);
  if (evt.event === "payment.captured" || evt.event === "order.paid") {
    const pay = evt.payload?.payment?.entity;
    if (pay?.order_id && pay?.id) {
      try { await confirmRazorpayPayment(null, { orderId: pay.order_id, paymentId: pay.id }, "webhook"); }
      catch (e: any) { if (e?.status !== 409 && e?.status !== 404) throw e; } // 409: auto-refunded; 404: not ours. Acknowledge so Razorpay doesn't retry.
    }
  }
  return ok({ received: true });
});

export const dynamic = "force-dynamic";
