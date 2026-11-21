import { z } from "zod";
import { handle, ok, ApiError } from "@/lib/api";
import { canAccessDestination, requireUser } from "@/lib/auth";
import { Destination, Operator } from "@/models";
import { audit } from "@/lib/audit";
import { upiStatus } from "@/lib/collect";

const schema = z.object({
  destinationId: z.string().min(1),
  upiId: z.string().trim().toLowerCase().regex(/^[a-z0-9._-]{2,}@[a-z][a-z0-9]{1,}$/, "Enter a valid UPI ID, for example name@bank").or(z.literal("")),
  upiName: z.string().trim().max(40).optional(),
  blockDemoUpi: z.boolean().optional(),
});
/** The UPI payee shown in the QR that gate staff display (parking exit, counter sales). One per operator. */
export const GET = handle(async (req) => {
  const me = await requireUser(["admin", "operator"]);
  const id = req.nextUrl.searchParams.get("destination");
  if (!id || !canAccessDestination(me, id)) throw new ApiError(403, "Not your destination");
  const d: any = await Destination.findById(id).select("operator").lean();
  const op: any = d?.operator ? await Operator.findById(d.operator).select("name upiId upiName blockDemoUpi").lean() : null;
  const st = await upiStatus(id);
  return ok({ operatorName: op?.name, upiId: op?.upiId || "", upiName: op?.upiName || "", configured: !!op?.upiId, demo: st.demo, blockDemoUpi: !!op?.blockDemoUpi, usingPlatformFallback: !op?.upiId && !st.demo });
});
export const PUT = handle(async (req) => {
  const me = await requireUser(["admin", "operator"]);
  const b = schema.parse(await req.json());
  if (!canAccessDestination(me, b.destinationId)) throw new ApiError(403, "Not your destination");
  const d: any = await Destination.findById(b.destinationId).select("operator").lean();
  if (!d?.operator) throw new ApiError(409, "This site has no operator yet");
  await Operator.updateOne({ _id: d.operator }, { $set: { upiId: b.upiId || undefined, upiName: b.upiName || undefined, ...(b.blockDemoUpi !== undefined ? { blockDemoUpi: b.blockDemoUpi } : {}) } });
  await audit(me, "operator.upi", "Operator", d.operator, `Set UPI payee to ${b.upiId || "(none)"}${b.blockDemoUpi !== undefined ? `; refuse UPI until set: ${b.blockDemoUpi ? "on" : "off"}` : ""}`);
  return ok({ ok: true });
});
export const dynamic = "force-dynamic";
