import QRCode from "qrcode";
import { z } from "zod";
import { Destination, Operator } from "@/models";
import { ApiError } from "./api";

/**
 * Taking payments at the gate (parking exit, counter sales).
 * IMPORTANT: this app records how a payment was taken; it does not process it. UPI is paid by the visitor scanning a QR
 * with their own app, and staff confirm that the money arrived (SMS, soundbox or UPI app). Card payments are taken on the
 * operator's own POS terminal; staff record the slip details. We never ask for a full card number, expiry or CVV.
 */
export const PAY_METHODS = ["cash", "upi", "card"] as const;
export type PayMethod = (typeof PAY_METHODS)[number];

export const cardSchema = z.object({
  network: z.enum(["visa", "mastercard", "rupay", "amex", "other"]),
  type: z.enum(["credit", "debit"]),
  last4: z.string().regex(/^\d{4}$/, "Enter the last 4 digits of the card"),
  authCode: z.string().trim().toUpperCase().regex(/^[A-Z0-9]{4,12}$/, "Enter the approval code printed on the POS slip"),
  rrn: z.string().trim().regex(/^\d{6,14}$/, "RRN is 6 to 14 digits").optional().or(z.literal("")),
});
/** What the client sends alongside a payment method. */
export const payDetailsSchema = z.object({
  upiRef: z.string().trim().toUpperCase().regex(/^[A-Z0-9]{4,22}$/, "UPI reference is 4 to 22 letters or digits").optional().or(z.literal("")),
  card: cardSchema.optional(),
  tenderedMinor: z.number().int().min(0).max(100000000).optional(),
});
export type PayDetails = z.infer<typeof payDetailsSchema>;

/** Validates the method-specific details and returns the object stored with the payment. Throws 400 with a clear message. */
export function buildPaymentDetails(method: PayMethod, d: PayDetails | undefined, dueMinor: number) {
  const out: Record<string, unknown> = { method };
  if (dueMinor <= 0) return out;
  if (method === "card") {
    if (!d?.card) throw new ApiError(400, "Enter the card payment details from the POS slip (network, type, last 4 digits, approval code)");
    out.card = { ...d.card, rrn: d.card.rrn || undefined };
  } else if (method === "upi") {
    if (d?.upiRef) out.upiRef = d.upiRef;
  } else if (method === "cash") {
    if (d?.tenderedMinor != null) {
      if (d.tenderedMinor < dueMinor) throw new ApiError(400, "Cash received is less than the amount due");
      out.tenderedMinor = d.tenderedMinor; out.changeMinor = d.tenderedMinor - dueMinor;
    }
  }
  return out;
}

/** Cash tender helper shared by UI and tests. */
export const changeDue = (tenderedMinor: number, dueMinor: number) => Math.max(0, tenderedMinor - dueMinor);

/** Standard UPI deep link. The amount is fixed to two decimals so the payer's app pre-fills the exact sum. */
export function upiUri(o: { vpa: string; name: string; amountMinor: number; note?: string; ref?: string }) {
  if (!Number.isInteger(o.amountMinor) || o.amountMinor <= 0) throw new ApiError(400, "Nothing to collect");
  const q = new URLSearchParams();
  q.set("pa", o.vpa); q.set("pn", o.name.slice(0, 40)); q.set("am", (o.amountMinor / 100).toFixed(2)); q.set("cu", "INR");
  if (o.note) q.set("tn", o.note.slice(0, 40));
  if (o.ref) q.set("tr", o.ref.replace(/[^A-Za-z0-9]/g, "").slice(0, 35));
  return `upi://pay?${q.toString().replace(/\+/g, "%20")}`;
}

/** The payee for a destination: its operator's UPI ID, else the platform's, else a clearly flagged demo ID. */
export async function upiPayee(destinationId: any) {
  const d: any = await Destination.findById(destinationId).select("operator name").lean();
  if (!d) throw new ApiError(404, "Destination not found");
  const op: any = d.operator ? await Operator.findById(d.operator).select("upiId upiName name").lean() : null;
  if (op?.upiId) return { vpa: op.upiId as string, name: (op.upiName || op.name || "HeritageHub") as string, demo: false };
  if (process.env.PLATFORM_UPI_ID) return { vpa: process.env.PLATFORM_UPI_ID, name: process.env.PLATFORM_UPI_NAME || "HeritageHub", demo: false };
  return { vpa: "heritagehub.demo@upi", name: "HeritageHub (demo)", demo: true };
}

/** Whether this site is still on the demo QR, and whether its operator has chosen to refuse UPI until a real UPI ID is set. */
export async function upiStatus(destinationId: any) {
  const p = await upiPayee(destinationId);
  const d: any = await Destination.findById(destinationId).select("operator").lean();
  const op: any = d?.operator ? await Operator.findById(d.operator).select("blockDemoUpi").lean() : null;
  return { demo: p.demo, blocked: p.demo && !!op?.blockDemoUpi };
}
const UPI_BLOCKED_MSG = "UPI isn't set up for this site yet, so it can't be used. Take cash or card, or ask your manager to set the UPI ID.";
export async function assertUpiAllowed(destinationId: any, method?: string) {
  if (method === "upi" && (await upiStatus(destinationId)).blocked) throw new ApiError(409, UPI_BLOCKED_MSG);
}

export async function upiQr(destinationId: any, amountMinor: number, note: string, ref?: string) {
  await assertUpiAllowed(destinationId, "upi");
  const payee = await upiPayee(destinationId);
  const uri = upiUri({ vpa: payee.vpa, name: payee.name, amountMinor, note, ref });
  const qr = await QRCode.toDataURL(uri, { margin: 1, width: 320, errorCorrectionLevel: "M" });
  return { uri, qr, payee: { vpa: payee.vpa, name: payee.name }, demo: payee.demo, amountMinor };
}
