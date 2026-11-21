import { handle, ok, ApiError } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { Destination, TimeSlot, Waitlist } from "@/models";
import { closeWaitlist } from "@/lib/waitlist";
import { limit } from "@/lib/ratelimit";
import { istParts, toMin } from "@/lib/utils";

export const GET = handle(async () => {
  const me = await requireUser();
  const items: any[] = await Waitlist.find({ user: me._id, status: { $in: ["waiting", "notified"] } }).sort({ createdAt: -1 }).lean();
  const dests: any[] = await Destination.find({ _id: { $in: items.map((i) => i.destination) } }).select("name slug").lean();
  const slots: any[] = await TimeSlot.find({ _id: { $in: items.map((i) => i.slot) } }).select("start end").lean();
  return ok({ items: items.map((i) => ({ ...i, destinationInfo: dests.find((d) => String(d._id) === String(i.destination)), slotInfo: slots.find((s) => String(s._id) === String(i.slot)) })) });
});

export const POST = handle(async (req) => {
  const me = await requireUser(["tourist", "admin", "operator", "staff"]);
  await limit("waitlist", [String(me._id)], 20, 3600);
  const { slotId, quantity } = await req.json();
  const qty = Number(quantity);
  if (!Number.isInteger(qty) || qty < 1 || qty > 20) throw new ApiError(400, "Choose between 1 and 20 tickets");
  const slot: any = await TimeSlot.findById(slotId).lean();
  if (!slot) throw new ApiError(404, "Slot not found");
  const { date, minutes } = istParts();
  if (slot.date < date || (slot.date === date && toMin(slot.end) <= minutes)) throw new ApiError(400, "This slot has already ended");
  if (slot.closed) throw new ApiError(400, "This slot is closed");
  if (slot.capacity - slot.booked >= qty) throw new ApiError(400, "Seats are available right now. You can book directly.");
  try {
    await Waitlist.create({ user: me._id, destination: slot.destination, slot: slot._id, date: slot.date, quantity: qty, slotKey: `${me._id}:${slot._id}` });
  } catch (e: any) { if (e?.code === 11000) throw new ApiError(409, "You're already on the waitlist for this slot"); throw e; }
  return ok({ ok: true }, 201);
});

export const DELETE = handle(async (req) => {
  const me = await requireUser();
  const id = req.nextUrl.searchParams.get("id");
  await closeWaitlist({ _id: id, user: me._id, status: { $in: ["waiting", "notified"] } }, "cancelled");
  return ok({ ok: true });
});

export const dynamic = "force-dynamic";
