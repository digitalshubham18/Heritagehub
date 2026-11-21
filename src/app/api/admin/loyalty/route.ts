import { z } from "zod";
import { handle, ok, ApiError } from "@/lib/api";
import { requireUser, scopeIds } from "@/lib/auth";
import { Booking, User } from "@/models";
import { audit } from "@/lib/audit";
import { adjustPoints, loyaltySummary } from "@/lib/loyalty";
import { MAX_ADJUST_POINTS } from "@/lib/loyalty-core";
import { limit } from "@/lib/ratelimit";

/** Platform admins can look up any visitor. An operator can only see and adjust visitors who have booked at one of their sites. */
async function visitorFor(me: any, q: { email?: string; id?: string }) {
  const f: any = q.id ? { _id: q.id } : { email: String(q.email || "").trim().toLowerCase() };
  if (!q.id && !f.email) throw new ApiError(400, "Enter the visitor's email");
  const u: any = await User.findOne({ ...f, active: true }).select("name email role").lean();
  if (!u) throw new ApiError(404, "No account with that email");
  const sc = scopeIds(me);
  if (sc && !(await Booking.exists({ user: u._id, destination: { $in: sc } }))) throw new ApiError(404, "No visitor with that email has booked at your sites");
  return u;
}
export const GET = handle(async (req) => {
  const me = await requireUser(["admin", "operator"]);
  const u = await visitorFor(me, { email: req.nextUrl.searchParams.get("email") || "" });
  return ok({ user: { id: u._id, name: u.name, email: u.email }, summary: await loyaltySummary(u._id), maxAdjust: MAX_ADJUST_POINTS });
});
const schema = z.object({ userId: z.string().min(1), points: z.number().int().refine((n) => n !== 0, "Enter a number of points above or below zero").refine((n) => Math.abs(n) <= MAX_ADJUST_POINTS, `At most ${MAX_ADJUST_POINTS} points at a time`), reason: z.string().trim().min(5, "Give a reason (at least 5 characters)").max(160) });
export const POST = handle(async (req) => {
  const me = await requireUser(["admin", "operator"]);
  await limit("loyalty-adjust", [String(me._id)], 30, 3600);
  const b = schema.parse(await req.json());
  const u = await visitorFor(me, { id: b.userId });
  await adjustPoints(me, u._id, b.points, b.reason);
  await audit(me, "loyalty.adjust", "User", u._id, `${b.points > 0 ? "+" : ""}${b.points} points for ${u.email}: ${b.reason}`);
  return ok({ summary: await loyaltySummary(u._id) });
});
export const dynamic = "force-dynamic";
