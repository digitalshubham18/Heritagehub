import { handle, ok } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { createBookingSchema } from "@/lib/validators";
import { Booking, Destination } from "@/models";
import { createBooking, releaseExpired } from "@/lib/booking";
import { escapeRe } from "@/lib/utils";
import { limit } from "@/lib/ratelimit";

export const GET = handle(async (req) => {
  const me = await requireUser();
  await releaseExpired();
  const sp = req.nextUrl.searchParams;
  const f: any = {};
  if (me.role === "tourist") f.user = me._id;
  else if (me.role === "staff" || me.role === "operator") f.destination = { $in: me.assignedDestinations || [] };
  if (sp.get("status")) f.status = sp.get("status");
  if (sp.get("date")) f.date = sp.get("date");
  if (sp.get("destination") && me.role !== "tourist" && (me.role === "admin" || (me.assignedDestinations || []).some((x: any) => String(x) === sp.get("destination")))) f.destination = sp.get("destination");
  if (sp.get("q") && me.role !== "tourist") f.$or = [{ reference: { $regex: escapeRe(sp.get("q")!), $options: "i" } }, { "contact.email": { $regex: escapeRe(sp.get("q")!), $options: "i" } }, { "contact.name": { $regex: escapeRe(sp.get("q")!), $options: "i" } }];
  const items: any[] = await Booking.find(f).sort({ createdAt: -1 }).limit(200).lean();
  const dests: any[] = await Destination.find({ _id: { $in: items.map((i) => i.destination) } }).select("name slug cancellationPolicy images").lean();
  return ok({ items: items.map((b) => ({ ...b, destinationInfo: dests.find((d) => String(d._id) === String(b.destination)) })) });
});

export const POST = handle(async (req) => {
  const me = await requireUser(["tourist", "admin", "operator", "staff"]);
  await limit("booking", [String(me._id)], 12, 600);
  const body = createBookingSchema.parse(await req.json());
  const booking = await createBooking(me, body);
  return ok({ booking }, 201);
});

export const dynamic = "force-dynamic";
