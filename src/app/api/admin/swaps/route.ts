import { z } from "zod";
import { handle, ok } from "@/lib/api";
import { requireUser, scopeIds } from "@/lib/auth";
import { SwapRequest } from "@/models";
import { audit } from "@/lib/audit";
import { decideSwap } from "@/lib/attendance";

/** Swaps waiting for a manager (the colleague has already agreed), then recent decisions. */
export const GET = handle(async () => {
  const me = await requireUser(["admin", "operator"]);
  const sc = scopeIds(me), f: any = sc ? { destination: { $in: sc } } : {};
  const pop = (q: any) => q.sort({ createdAt: -1 }).limit(40).populate("shift", "date start end position").populate("destination", "name").lean();
  const [pending, recent] = await Promise.all([pop(SwapRequest.find({ ...f, status: "pending_manager" })), pop(SwapRequest.find({ ...f, status: { $in: ["approved", "declined", "failed"] } }))]);
  return ok({ pending, recent: recent.slice(0, 10) });
});
const schema = z.object({ id: z.string().min(1), approve: z.boolean(), reason: z.string().trim().max(200).optional() });
export const PATCH = handle(async (req) => {
  const me = await requireUser(["admin", "operator"]);
  const b = schema.parse(await req.json());
  const r = await decideSwap(me, b.id, b.approve, b.reason);
  await audit(me, b.approve ? "roster.swap.approve" : "roster.swap.decline", "SwapRequest", b.id, `${r.fromName} → ${r.toName}${b.reason ? `: ${b.reason}` : ""}`);
  return ok({ request: r });
});
export const dynamic = "force-dynamic";
