import { Booking, Destination, GroupRequest, TicketCategory, TimeSlot, User } from "@/models";
import { ApiError } from "./api";
import { canAccessDestination } from "./auth";
import { createBooking } from "./booking";
import { notifyGroupDecision } from "./notify";
import { ensureSlots } from "./slots";
import { istParts, inr } from "./utils";

/** Manager approves a group request: picks a slot, applies a concession, and a pending booking holds the seats for the group. */
export async function approveGroup(manager: any, req: any, input: { slotId?: string; start?: string; discountPct: number; holdHours: number; note?: string }) {
  if (!canAccessDestination(manager, req.destination)) throw new ApiError(403, "Not your destination");
  if (req.status !== "requested") throw new ApiError(409, `This request is already ${req.status}`);
  const dest: any = await Destination.findById(req.destination).lean();
  let slotId = input.slotId;
  if (!slotId) {
    const slots = await ensureSlots(dest, req.date);
    const want = input.start || req.preferredStart;
    const fits = slots.filter((x) => !x.closed && x.capacity - x.booked >= req.size);
    const mins = (hhmm: string) => { const [h, m] = hhmm.split(":").map(Number); return h * 60 + m; };
    // The preferred time if the whole group fits there, otherwise the nearest slot that can hold everyone.
    const pick = want ? [...fits].sort((x, y) => Math.abs(mins(x.start) - mins(want)) - Math.abs(mins(y.start) - mins(want)))[0] : fits[0];
    if (!pick?._id) throw new ApiError(409, "No slot on that date can hold the whole group. Choose another slot or date.");
    slotId = pick._id;
  }
  const requester: any = await User.findById(req.user).lean();
  const booking: any = await createBooking({ _id: req.user }, {
    destinationId: String(req.destination), slotId, items: [{ categoryId: String(req.category), quantity: req.size }],
    visitors: Array.from({ length: req.size }, (_, i) => ({ name: i === 0 ? req.contact?.name || "Group leader" : `${req.organisation} member ${i + 1}` })),
    contact: { name: req.contact?.name || requester?.name, email: req.contact?.email || requester?.email, phone: req.contact?.phone || requester?.phone || "0000000" },
  }, { channel: "group", discountPct: input.discountPct, holdHours: input.holdHours, groupName: req.organisation });
  const upd: any = await GroupRequest.findOneAndUpdate({ _id: req._id, status: "requested" }, { status: "approved", booking: booking._id, discountPct: input.discountPct, managerNote: input.note, decidedBy: manager._id, decidedAt: new Date() }, { new: true }).lean();
  if (!upd) throw new ApiError(409, "This request was just decided by someone else");
  await notifyGroupDecision(upd, requester, dest, { approved: true, bookingId: String(booking._id), note: input.note, total: inr(booking.totalMinor), holdHours: input.holdHours });
  return { request: upd, booking };
}

export async function rejectGroup(manager: any, req: any, note?: string) {
  if (!canAccessDestination(manager, req.destination)) throw new ApiError(403, "Not your destination");
  const upd: any = await GroupRequest.findOneAndUpdate({ _id: req._id, status: "requested" }, { status: "rejected", managerNote: note, decidedBy: manager._id, decidedAt: new Date() }, { new: true }).lean();
  if (!upd) throw new ApiError(409, `This request is already ${req.status}`);
  const [requester, dest]: any[] = await Promise.all([User.findById(req.user).lean(), Destination.findById(req.destination).lean()]);
  await notifyGroupDecision(upd, requester, dest, { approved: false, note });
  return upd;
}

/** Derived display status: a request's real state follows its booking (paid / expired / cancelled). */
export async function decorateRequests(items: any[]) {
  const bookings: any[] = await Booking.find({ _id: { $in: items.map((i) => i.booking).filter(Boolean) } }).select("status totalMinor discountMinor holdExpiresAt date start end reference paymentStatus").lean();
  const byId = new Map(bookings.map((b) => [String(b._id), b]));
  return items.map((i) => {
    const b = i.booking ? byId.get(String(i.booking)) : null;
    let status = i.status as string;
    if (i.status === "approved" && b) status = b.status === "confirmed" || b.status === "completed" ? "paid" : b.status === "pending" ? "awaiting_payment" : b.status === "expired" ? "expired" : "cancelled";
    return { ...i, displayStatus: status, bookingInfo: b || null };
  });
}
export { TicketCategory, TimeSlot, istParts };
