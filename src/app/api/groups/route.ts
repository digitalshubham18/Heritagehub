import { z } from "zod";
import { handle, ok, ApiError } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { Destination, GroupRequest, TicketCategory, User } from "@/models";
import { decorateRequests } from "@/lib/groups";
import { limit } from "@/lib/ratelimit";
import { addDays, todayIST } from "@/lib/utils";

const schema = z.object({
  destinationId: z.string(), organisation: z.string().trim().min(2).max(120), orgType: z.enum(["school", "tour_operator", "corporate", "other"]),
  size: z.number().int().min(10, "Group requests start at 10 people").max(1000), categoryId: z.string(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), preferredStart: z.string().regex(/^\d{2}:\d{2}$/).optional(), notes: z.string().max(600).optional(),
  contact: z.object({ name: z.string().trim().min(2), email: z.string().email(), phone: z.string().trim().min(7).max(20) }),
});

/** Tourists see their own requests; managers see the queue for their destinations. */
export const GET = handle(async (req) => {
  const me = await requireUser();
  const f: any = {};
  if (me.role === "tourist") f.user = me._id;
  else if (me.role !== "admin") f.destination = { $in: me.assignedDestinations || [] };
  const st = req.nextUrl.searchParams.get("status"); if (st) f.status = st;
  const items: any[] = await GroupRequest.find(f).sort({ createdAt: -1 }).limit(200).lean();
  const [dests, cats, users]: any[][] = await Promise.all([Destination.find({ _id: { $in: items.map((i) => i.destination) } }).select("name slug type").lean(), TicketCategory.find({ _id: { $in: items.map((i) => i.category) } }).select("name priceMinor feeMinor").lean(), User.find({ _id: { $in: items.map((i) => i.user) } }).select("name email").lean()]);
  const deco = await decorateRequests(items);
  return ok({ items: deco.map((i: any) => ({ ...i, destinationInfo: dests.find((d) => String(d._id) === String(i.destination)), categoryInfo: cats.find((c) => String(c._id) === String(i.category)), requester: me.role === "tourist" ? undefined : users.find((u) => String(u._id) === String(i.user)) })) });
});

export const POST = handle(async (req) => {
  const me = await requireUser(["tourist", "admin"]);
  await limit("group-request", [String(me._id)], 10, 3600);
  const b = schema.parse(await req.json());
  const dest: any = await Destination.findOne({ _id: b.destinationId, active: true }).lean();
  if (!dest) throw new ApiError(404, "Destination not found");
  if (b.date < addDays(todayIST(), 3)) throw new ApiError(400, "Group requests need at least 3 days' notice");
  if (b.date > addDays(todayIST(), 180)) throw new ApiError(400, "Group requests open up to 180 days ahead");
  const cat = await TicketCategory.findOne({ _id: b.categoryId, destination: dest._id, active: true }).lean();
  if (!cat) throw new ApiError(400, "Choose a ticket category for the group");
  const r: any = await GroupRequest.create({ user: me._id, destination: dest._id, organisation: b.organisation, orgType: b.orgType, size: b.size, category: b.categoryId, date: b.date, preferredStart: b.preferredStart, notes: b.notes, contact: b.contact });
  return ok({ request: r }, 201);
});
export const dynamic = "force-dynamic";
