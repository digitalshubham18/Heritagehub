import { Booking, TicketTransfer, User } from "@/models";
import { ApiError } from "./api";
import { makeRef } from "./booking";
import { sendEmail, sendSms } from "./notify";
import { fmtDate, fmtTime } from "./utils";

export const TRANSFER_HOLD_HOURS = 48;
export const MIN_HOURS_BEFORE_SLOT = 2;
export const MAX_TRANSFERS = 2;
const hoursToSlot = (b: any, now = Date.now()) => (new Date(`${b.date}T${b.start}:00+05:30`).getTime() - now) / 3600000;

/** Pure rules for whether a booking can be offered to someone else. */
export function transferProblem(b: any, now = Date.now()): string | null {
  if (!b) return "Booking not found";
  if (b.status !== "confirmed") return "Only confirmed tickets can be transferred";
  if (b.channel && b.channel !== "online") return "Counter and group tickets can't be transferred";
  if ((b.checkedInCount || 0) > 0) return "This ticket has already been used";
  if ((b.transferCount || 0) >= MAX_TRANSFERS) return `A ticket can be transferred at most ${MAX_TRANSFERS} times`;
  if (hoursToSlot(b, now) < MIN_HOURS_BEFORE_SLOT) return `Transfers close ${MIN_HOURS_BEFORE_SLOT} hours before the slot`;
  return null;
}

export async function expireTransfers() {
  const stale: any[] = await TicketTransfer.find({ status: "pending", expiresAt: { $lt: new Date() } }).limit(100).lean();
  for (const t of stale) await TicketTransfer.updateOne({ _id: t._id, status: "pending" }, { status: "expired", decidedAt: new Date(), pendingKey: `done:${t._id}` });
}

export async function offerTransfer(me: any, i: { bookingId: string; toEmail: string; visitors: { name: string; age?: number }[]; message?: string }) {
  await expireTransfers();
  const b: any = await Booking.findOne({ _id: i.bookingId, user: me._id }).lean();
  const problem = transferProblem(b);
  if (problem) throw new ApiError(b ? 409 : 404, problem);
  const email = i.toEmail.trim().toLowerCase();
  if (email === String(me.email).toLowerCase()) throw new ApiError(400, "That's your own account");
  const to: any = await User.findOne({ email, role: "tourist", active: true }).select("name email phone").lean();
  if (!to) throw new ApiError(404, "No HeritageHub visitor account uses that email. Ask them to register first, then try again.");
  if (i.visitors.length !== b.quantity) throw new ApiError(400, `Enter ${b.quantity} visitor name${b.quantity > 1 ? "s" : ""}: the ticket is checked against photo ID at the gate`);
  try {
    const t = await TicketTransfer.create({ booking: b._id, from: me._id, to: to._id, toEmail: email, fromName: me.name, toName: to.name, visitors: i.visitors, message: i.message, expiresAt: new Date(Date.now() + TRANSFER_HOLD_HOURS * 3600000), pendingKey: String(b._id) });
    const dest: any = await (await import("@/models")).Destination.findById(b.destination).select("name").lean();
    await sendEmail({ to: to.email, subject: `${me.name} sent you tickets for ${dest?.name}`, html: `<p>${me.name} wants to transfer ${b.quantity} ticket(s) for <strong>${dest?.name}</strong> on ${fmtDate(b.date)}, ${fmtTime(b.start)} to you.</p><p>Sign in to HeritageHub and open <em>My tickets</em> to accept within ${TRANSFER_HOLD_HOURS} hours.</p>` }).catch(() => {});
    await sendSms(to.phone, `HeritageHub: ${me.name} sent you tickets for ${dest?.name} on ${b.date}. Open My tickets to accept within ${TRANSFER_HOLD_HOURS}h.`).catch(() => {});
    return t.toObject();
  } catch (e: any) { if (e?.code === 11000) throw new ApiError(409, "This ticket already has a transfer waiting for an answer. Cancel it first."); throw e; }
}

/**
 * The recipient accepts. The booking is re-checked and changed in ONE conditional update (still confirmed, unused, still the sender's), and it gets a NEW
 * reference so the sender's old QR code stops working. Transferred tickets are non-refundable for the new holder.
 */
export async function acceptTransfer(me: any, id: string) {
  await expireTransfers();
  const t: any = await TicketTransfer.findOne({ _id: id, to: me._id }).lean();
  if (!t) throw new ApiError(404, "Transfer not found");
  if (t.status !== "pending") throw new ApiError(409, `This transfer is already ${t.status}`);
  const claimed = await TicketTransfer.findOneAndUpdate({ _id: t._id, status: "pending", expiresAt: { $gt: new Date() } }, { status: "accepted", decidedAt: new Date(), pendingKey: `done:${t._id}` }, { new: true }).lean();
  if (!claimed) throw new ApiError(409, "This transfer is no longer available");
  const b: any = await Booking.findById(t.booking).lean();
  const problem = transferProblem(b);
  const fail = async (msg: string) => { await TicketTransfer.updateOne({ _id: t._id }, { status: "failed", failReason: msg }); throw new ApiError(409, msg); };
  if (problem || String(b.user) !== String(t.from)) return fail(problem || "The ticket changed hands before you accepted");
  const ref = makeRef();
  const upd: any = await Booking.findOneAndUpdate(
    { _id: b._id, user: t.from, status: "confirmed", checkedInCount: 0, transferCount: b.transferCount || 0 },
    { user: me._id, originalUser: b.originalUser || t.from, reference: ref, visitors: t.visitors, contact: { name: me.name, email: me.email, phone: me.phone || "" }, $inc: { transferCount: 1 }, $push: { history: { at: new Date(), event: "transferred", by: String(t.from), note: `To ${me.email}; reference ${b.reference} replaced by ${ref}` } } }, { new: true }).lean();
  if (!upd) return fail("The ticket was changed or used before you accepted");
  return { transfer: claimed, booking: upd };
}
export async function declineTransfer(me: any, id: string, as: "to" | "from") {
  const upd = await TicketTransfer.findOneAndUpdate({ _id: id, [as]: me._id, status: "pending" }, { status: as === "to" ? "declined" : "cancelled", decidedAt: new Date(), pendingKey: `done:${id}` }, { new: true }).lean();
  if (!upd) throw new ApiError(404, "No waiting transfer with that id");
  return upd;
}
