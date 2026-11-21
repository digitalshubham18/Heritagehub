/**
 * Razorpay integration (Orders API + signature verification + refunds), via fetch: no SDK needed.
 * Enable with PAYMENT_PROVIDER=razorpay, RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET (and RAZORPAY_WEBHOOK_SECRET for webhooks).
 * Without these the app uses the simulated gateway.
 */
import crypto from "crypto";

export const razorpayEnabled = () => process.env.PAYMENT_PROVIDER === "razorpay" && !!process.env.RAZORPAY_KEY_ID && !!process.env.RAZORPAY_KEY_SECRET;
export const razorpayKeyId = () => process.env.RAZORPAY_KEY_ID || "";
const auth = () => "Basic " + Buffer.from(`${process.env.RAZORPAY_KEY_ID}:${process.env.RAZORPAY_KEY_SECRET}`).toString("base64");

async function rz(path: string, body: unknown) {
  const r = await fetch(`https://api.razorpay.com/v1${path}`, { method: "POST", headers: { Authorization: auth(), "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`Razorpay ${r.status}: ${j?.error?.description || "request failed"}`);
  return j;
}
export const createOrder = (amountMinor: number, receipt: string, notes: Record<string, string>) => rz("/orders", { amount: amountMinor, currency: "INR", receipt, notes });
export const refundPayment = (paymentId: string, amountMinor: number) => rz(`/payments/${paymentId}/refund`, { amount: amountMinor });

const safeEq = (a: string, b: string) => { const x = Buffer.from(a), y = Buffer.from(b); return x.length === y.length && crypto.timingSafeEqual(x, y); };
/** Checkout callback signature: HMAC_SHA256(order_id|payment_id, key_secret). */
export function verifySignature(orderId: string, paymentId: string, signature: string, secret = process.env.RAZORPAY_KEY_SECRET || "") {
  if (!secret || !signature) return false;
  return safeEq(crypto.createHmac("sha256", secret).update(`${orderId}|${paymentId}`).digest("hex"), signature);
}
/** Webhook signature: HMAC_SHA256(raw body, webhook_secret). */
export function verifyWebhook(rawBody: string, signature: string, secret = process.env.RAZORPAY_WEBHOOK_SECRET || "") {
  if (!secret || !signature) return false;
  return safeEq(crypto.createHmac("sha256", secret).update(rawBody).digest("hex"), signature);
}
