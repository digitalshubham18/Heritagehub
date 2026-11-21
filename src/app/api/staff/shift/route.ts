import { z } from "zod";
import { handle, ok, ApiError } from "@/lib/api";
import { canAccessDestination, requireUser, scopeIds } from "@/lib/auth";
import { ShiftReport } from "@/models";
import { closeShift, tally } from "@/lib/shift";

export const GET = handle(async (req) => {
  const me = await requireUser(["staff", "admin", "operator"]);
  const sp = req.nextUrl.searchParams, dest = sp.get("destination");
  if (sp.get("history") === "1") {
    const scope = scopeIds(me);
    const f: any = me.role === "staff" ? { user: me._id } : scope ? { destination: { $in: scope } } : {};
    return ok({ items: await ShiftReport.find(f).sort({ createdAt: -1 }).limit(30).populate("destination", "name").lean() });
  }
  if (!dest) throw new ApiError(400, "destination is required");
  if (!canAccessDestination(me, dest)) throw new ApiError(403, "Not assigned to this destination");
  return ok(await tally(me, dest));
});

const close = z.object({ destinationId: z.string().min(1), countedCashMinor: z.number().int().min(0).max(1000000000), notes: z.string().trim().max(500).optional() });
/** Close a cash count: records what the system expected, what was counted, and the difference. */
export const POST = handle(async (req) => {
  const me = await requireUser(["staff", "admin", "operator"]);
  const b = close.parse(await req.json());
  const r = await closeShift(me, b.destinationId, b.countedCashMinor, b.notes);
  return ok({ report: r.report }, 201);
});
export const dynamic = "force-dynamic";
