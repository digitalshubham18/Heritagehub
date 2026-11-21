import { z } from "zod";
import { handle, ok } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { counterRefund } from "@/lib/booking";
import { limit } from "@/lib/ratelimit";
import { audit } from "@/lib/audit";

const schema = z.object({ reference: z.string().trim().min(4).max(120), reason: z.string().trim().min(3, "Give a short reason").max(200), method: z.enum(["cash", "upi", "card"]).optional() });
/** Cancel a confirmed, unused booking at the counter and refund it. Every refund is audited, whoever does it. */
export const POST = handle(async (req) => {
  const me = await requireUser(["staff", "admin", "operator"]);
  await limit("counter-refund", [String(me._id)], 30, 3600);
  const b = schema.parse(await req.json());
  const r = await counterRefund(me, b);
  await audit(me, "counter.refund", "Booking", r.booking._id, `Refund ${r.booking.reference}: ₹${(r.refundMinor / 100).toFixed(2)} (${r.paidBack}). ${b.reason}`);
  return ok({ booking: r.booking, refundMinor: r.refundMinor, paidBack: r.paidBack, parkingWarning: r.parkingWarning });
});
export const dynamic = "force-dynamic";
