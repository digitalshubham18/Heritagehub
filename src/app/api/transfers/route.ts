import { z } from "zod";
import { handle, ok, ApiError } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { TicketTransfer } from "@/models";
import { acceptTransfer, declineTransfer, expireTransfers, offerTransfer, TRANSFER_HOLD_HOURS } from "@/lib/transfer";
import { limit } from "@/lib/ratelimit";

/** My transfers: offers waiting for me (incoming) and ones I sent. */
export const GET = handle(async () => {
  const me = await requireUser();
  await expireTransfers();
  const pop = (q: any) => q.sort({ createdAt: -1 }).limit(50).populate({ path: "booking", select: "reference date start end quantity destination", populate: { path: "destination", select: "name" } }).lean();
  const [incoming, outgoing] = await Promise.all([pop(TicketTransfer.find({ to: me._id })), pop(TicketTransfer.find({ from: me._id }))]);
  return ok({ incoming, outgoing, holdHours: TRANSFER_HOLD_HOURS });
});

const offer = z.object({ bookingId: z.string().min(1), toEmail: z.string().trim().email(), visitors: z.array(z.object({ name: z.string().trim().min(2).max(80), age: z.number().int().min(0).max(120).optional() })).min(1).max(20), message: z.string().trim().max(200).optional() });
export const POST = handle(async (req) => {
  const me = await requireUser();
  await limit("transfer", [String(me._id)], 10, 3600); // stops probing for which emails have accounts
  return ok({ transfer: await offerTransfer(me, offer.parse(await req.json())) }, 201);
});
const act = z.object({ id: z.string().min(1), action: z.enum(["accept", "decline", "cancel"]) });
export const PATCH = handle(async (req) => {
  const me = await requireUser();
  const b = act.parse(await req.json());
  if (b.action === "accept") { const r = await acceptTransfer(me, b.id); return ok({ transfer: r.transfer, reference: r.booking.reference, bookingId: r.booking._id }); }
  return ok({ transfer: await declineTransfer(me, b.id, b.action === "decline" ? "to" : "from") });
});
export const dynamic = "force-dynamic";
