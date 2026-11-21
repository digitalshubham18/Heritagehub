import { z } from "zod";
import { handle, ok } from "@/lib/api";
import { canAccessDestination, requireUser } from "@/lib/auth";
import { ApiError } from "@/lib/api";
import { upiQr } from "@/lib/collect";
import { limit } from "@/lib/ratelimit";

const schema = z.object({ destinationId: z.string().min(1), amountMinor: z.number().int().min(100).max(10000000), note: z.string().max(40).optional(), ref: z.string().max(40).optional() });
/** Staff: a UPI QR for an exact amount (counter sales). The amount is whatever the screen shows; nothing is charged by creating a QR. */
export const POST = handle(async (req) => {
  const me = await requireUser(["staff", "admin", "operator"]);
  await limit("upiqr", [String(me._id)], 120, 60);
  const b = schema.parse(await req.json());
  if (!canAccessDestination(me, b.destinationId)) throw new ApiError(403, "You are not assigned to this destination");
  return ok(await upiQr(b.destinationId, b.amountMinor, b.note || "HeritageHub", b.ref));
});
export const dynamic = "force-dynamic";
