import { z } from "zod";
import { handle, ok } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { payDetailsSchema } from "@/lib/collect";
import { exitVehicle } from "@/lib/parking";
import { limit } from "@/lib/ratelimit";

const schema = z.object({
  ticketNo: z.string().optional(), vehicleNumber: z.string().optional(), destinationId: z.string().optional(),
  method: z.enum(["cash", "upi", "card"]).optional(), details: payDetailsSchema.optional(), quote: z.string().max(400).optional(), expectedDueMinor: z.number().int().min(0).optional(),
  lost: z.object({ note: z.string().trim().max(200), idChecked: z.boolean() }).optional(), at: z.string().max(40).optional(), collectedMinor: z.number().int().min(0).max(100000000).optional(), offlineId: z.string().max(60).optional(),
});
export const POST = handle(async (req) => {
  const me = await requireUser(["staff", "admin", "operator"]);
  await limit("parking", [String(me._id)], 240, 60);
  const r = await exitVehicle(me, schema.parse(await req.json()));
  return ok({ ticket: r.ticket, minutes: r.minutes, feeMinor: r.feeMinor, penaltyMinor: r.penaltyMinor, prepaidMinor: r.prepaidMinor, dueMinor: r.dueMinor, collectedMinor: r.collectedMinor });
});
export const dynamic = "force-dynamic";
