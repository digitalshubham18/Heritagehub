import { z } from "zod";
import { handle, ok } from "@/lib/api";
import { currentUser, requireUser } from "@/lib/auth";
import { Destination, Operator, Pass, PassType } from "@/models";
import { purchasePass } from "@/lib/passes";
import { limit } from "@/lib/ratelimit";

const buy = z.object({ passTypeId: z.string(), holderName: z.string().trim().min(2).max(100), startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), idempotencyKey: z.string().min(8).max(80), simulateFailure: z.boolean().optional() });

/** Public: purchasable pass types. With ?mine=1: the signed-in user's passes. */
export const GET = handle(async (req) => {
  if (req.nextUrl.searchParams.get("mine") === "1") {
    const me = await requireUser();
    return ok({ items: await Pass.find({ user: me._id, status: "active" }).sort({ createdAt: -1 }).limit(100).lean() });
  }
  const types: any[] = await PassType.find({ active: true }).sort({ priceMinor: 1 }).lean();
  const dests: any[] = await Destination.find({ _id: { $in: types.flatMap((t) => t.destinations) }, active: true }).select("name slug type city").lean();
  const ops: any[] = await Operator.find({ _id: { $in: types.map((t) => t.operator).filter(Boolean) } }).select("name").lean();
  await currentUser();
  return ok({ items: types.map((t) => ({ ...t, operatorName: ops.find((o) => String(o._id) === String(t.operator))?.name, destinationInfo: dests.filter((d) => t.destinations.some((x: any) => String(x) === String(d._id))) })) });
});

export const POST = handle(async (req) => {
  const me = await requireUser(["tourist", "admin", "operator", "staff"]);
  await limit("pass-buy", [String(me._id)], 10, 600);
  const pass = await purchasePass(me, buy.parse(await req.json()));
  return ok({ pass }, 201);
});
export const dynamic = "force-dynamic";
