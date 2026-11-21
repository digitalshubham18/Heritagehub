import { z } from "zod";
import { handle, ok, ApiError } from "@/lib/api";
import { canAccessDestination, requireUser } from "@/lib/auth";
import { loadDestination } from "@/lib/destinations";
import { recordHeadcount } from "@/lib/headcount";
import { limit } from "@/lib/ratelimit";

const schema = z.object({
  destinationId: z.string(),
  in: z.number().int().min(0).max(5000).optional(),
  out: z.number().int().min(0).max(5000).optional(),
  inside: z.number().int().min(0).max(200000).optional(),
  gate: z.string().max(40).optional(),
});

/** Staff/manager headcount: tap +/- counts from a clicker, or set the number inside after a walk-round count. */
export const POST = handle(async (req) => {
  const me = await requireUser(["staff", "admin", "operator"]);
  await limit("headcount", [String(me._id)], 120, 60);
  const b = schema.parse(await req.json());
  const dest = await loadDestination(b.destinationId, true);
  if (!canAccessDestination(me, dest._id)) throw new ApiError(403, "Not assigned to this destination");
  const r = await recordHeadcount(dest._id, { in: b.in, out: b.out, inside: b.inside, source: "manual", userId: me._id, gate: b.gate });
  return ok({ ok: true, ...r });
});
export const dynamic = "force-dynamic";
