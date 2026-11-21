import crypto from "crypto";
import { Types } from "mongoose";
import { Booking, Destination, Notification, Payment, TicketCategory, TimeSlot, CrowdObservation, EntryRecord, Pass, ParkingLot, ParkingTicket } from "@/models";
import { validBuyer } from "./einvoice";
import { ApiError } from "./api";
import { addDays, istParts, startOfDayIST, toMin, todayIST } from "./utils";
import { cancellationInfo, priceItems } from "./pricing";
import { canAccessDestination } from "./auth";
import { creditTaxShare, issueCreditNote } from "./invoice";
import { priceCategory, rulesFor } from "./dynamic-pricing";
import { awardForVisit, maxRedeemable, pointsValueMinor, restoreRedeemed, spendPoints, loyaltySummary } from "./loyalty";
import { assignInvoice } from "./invoice";
import { ensureSlots } from "./slots";
import { closeWaitlist, processWaitlist } from "./waitlist";
import { notifyBookingConfirmed, notifyCancelled } from "./notify";
import { assertUpiAllowed, buildPaymentDetails, type PayDetails } from "./collect";
import { capacityOn, enterVehicle, heldToday, normalizeVehicle, overridesFor, poolOf, POOL_LABEL, reservationFee, type Bay, type VType } from "./parking";
import { createOrder, razorpayEnabled, razorpayKeyId, refundPayment, verifySignature } from "./razorpay";

const rand = (n: number) => Array.from(crypto.randomBytes(n)).map((x) => "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"[x % 32]).join("");
export const makeRef = () => `HH-${rand(4)}-${rand(4)}`;
const tkey = () => process.env.TICKET_SECRET || process.env.AUTH_SECRET || "dev-ticket-secret";
const sig = (ref: string) => crypto.createHmac("sha256", tkey()).update(ref).digest("base64url").slice(0, 12);
export const ticketCode = (ref: string) => `HH1.${ref}.${sig(ref)}`;
export function parseCode(raw: string): { ref: string; signed: boolean } | null {
  const code = raw.trim();
  if (code.startsWith("HH1.")) {
    const [, ref, s] = code.split(".");
    if (!ref || !s) return null;
    const a = Buffer.from(s), b = Buffer.from(sig(ref));
    return a.length === b.length && crypto.timingSafeEqual(a, b) ? { ref, signed: true } : null;
  }
  return /^HH-[A-Z0-9]{4}-[A-Z0-9]{4}$/i.test(code) ? { ref: code.toUpperCase(), signed: false } : null;
}

const hist = (event: string, by: string, note?: string) => ({ at: new Date(), event, by, note });
const holdMinutes = () => Number(process.env.BOOKING_HOLD_MINUTES || 10);

async function releaseSeats(slotId: any, qty: number) {
  await TimeSlot.updateOne({ _id: slotId, booked: { $gte: qty } }, { $inc: { booked: -qty } });
  await processWaitlist(slotId).catch((e) => console.error("[waitlist]", e));
}
/** Atomically moves a pending booking to a terminal state and releases its seats exactly once. */
async function endPending(b: any, status: "expired" | "cancelled", note: string) {
  const r = await Booking.findOneAndUpdate({ _id: b._id, status: "pending" }, { status, $push: { history: hist(status, "system", note) } });
  if (r) { await releaseSeats(b.slot, b.quantity); await restoreRedeemed(b).catch((e) => console.error("[loyalty] restore failed", e)); }
  return !!r;
}
export async function releaseExpired() {
  const stale = await Booking.find({ status: "pending", holdExpiresAt: { $lt: new Date() } }).limit(200).lean();
  for (const b of stale) await endPending(b, "expired", "Payment hold expired");
}

export async function alertSlot(dest: any, slot: any) {
  const pct = slot.capacity > 0 ? (slot.booked / slot.capacity) * 100 : 0;
  if (pct < (dest.alertThresholdPct ?? 85)) return;
  await Notification.updateOne(
    { key: `slot:${slot._id}` },
    { $setOnInsert: { destination: dest._id, type: "crowd_alert", severity: pct >= 100 ? "critical" : "warning", key: `slot:${slot._id}`, message: `${dest.name}: ${slot.date} ${slot.start} slot is ${Math.round(pct)}% booked`, meta: { slot: slot._id } } },
    { upsert: true }
  );
}

export async function createBooking(user: any, input: any, opts: { allowPast?: boolean; channel?: "online" | "counter" | "group"; soldBy?: any; discountPct?: number; holdHours?: number; groupName?: string } = {}) {
  await releaseExpired();
  const dest: any = await Destination.findOne({ _id: input.destinationId, active: true }).lean();
  if (!dest) throw new ApiError(404, "Destination not found");
  const slot: any = await TimeSlot.findOne({ _id: input.slotId, destination: dest._id }).lean();
  if (!slot) throw new ApiError(404, "Time slot not found");
  const { date: today, minutes } = istParts();
  if (opts.channel === "counter" && slot.date !== today) throw new ApiError(400, "Counter sales are for today only");
  if (!opts.allowPast) {
    if (slot.date < today || slot.date > addDays(today, dest.bookingPolicy.advanceDays)) throw new ApiError(400, `Bookings open up to ${dest.bookingPolicy.advanceDays} days ahead`);
    if (slot.date === today && toMin(slot.end) <= minutes) throw new ApiError(400, "This slot has already ended");
  }
  if (dest.closures?.some((c: any) => c.date === slot.date)) throw new ApiError(400, "The site is closed on this date");
  if (slot.closed) throw new ApiError(409, "This slot is closed for booking");

  const cats = await TicketCategory.find({ destination: dest._id, active: true }).lean();
  const rules = await rulesFor(dest._id); // dynamic / peak pricing rules for this site
  let adjustPct = 0;
  const items = input.items.map((it: any) => {
    const c: any = cats.find((x: any) => String(x._id) === it.categoryId);
    if (!c) throw new ApiError(400, "Invalid ticket category");
    const pc = priceCategory(c, slot, rules); adjustPct = Math.abs(pc.pct) > Math.abs(adjustPct) ? pc.pct : adjustPct;
    return { category: c._id, name: c.name, audience: c.audience, basePriceMinor: pc.basePriceMinor, unitPriceMinor: pc.unitPriceMinor, unitFeeMinor: c.feeMinor || 0, quantity: it.quantity };
  });
  const qty = items.reduce((s: number, i: any) => s + i.quantity, 0);
  if (opts.channel !== "counter" && opts.channel !== "group" && qty > dest.bookingPolicy.maxTicketsPerBooking) throw new ApiError(400, `You can book up to ${dest.bookingPolicy.maxTicketsPerBooking} tickets at a time`);
  if (input.visitors.length !== qty) throw new ApiError(400, "Enter one visitor name per ticket");

  const idemKey = input.idempotencyKey ? `${user._id}:${input.idempotencyKey}` : undefined;
  if (idemKey) {
    const existing = await Booking.findOne({ idemKey }).lean();
    if (existing) return existing;
  }
  // Loyalty points (online bookings only): limited by the balance and by 20% of the ticket value. Spent atomically once the seats are held.
  let redeemPts = 0, loyaltyDiscount = 0;
  if (input.redeemPoints > 0 && (opts.channel || "online") === "online") {
    const gross = items.reduce((s: number, i: any) => s + (i.unitPriceMinor + i.unitFeeMinor) * i.quantity, 0);
    redeemPts = Math.min(Math.floor(input.redeemPoints), maxRedeemable(gross, (await loyaltySummary(user._id)).balance));
    loyaltyDiscount = pointsValueMinor(redeemPts);
  }
  const bookingId = new Types.ObjectId();
  // Abandoned holds by the same user for the same slot are released before allocating again.
  const olds: any[] = opts.channel === "counter" ? [] : await Booking.find({ user: user._id, slot: slot._id, status: "pending" }).lean();
  for (const o of olds) await endPending(o, "cancelled", "Superseded by a new booking attempt");

  // Concurrency-safe allocation: one atomic conditional update. `booked <= capacity - qty` is evaluated by the database
  // at update time; the capacity equality guard rejects the update if an admin changed capacity since we read it.
  let allocated: any = null, cur: any = slot;
  for (let i = 0; i < 4 && !allocated; i++) {
    if (i > 0) cur = await TimeSlot.findById(slot._id).lean();
    if (!cur || cur.closed) throw new ApiError(409, "This slot is closed for booking");
    if (cur.capacity - cur.booked < qty && i > 0) break;
    allocated = await TimeSlot.findOneAndUpdate(
      { _id: cur._id, closed: false, capacity: cur.capacity, booked: { $lte: cur.capacity - qty } },
      { $inc: { booked: qty } }, { new: true }
    ).lean();
    if (!allocated) { cur = await TimeSlot.findById(slot._id).lean(); if (cur && cur.capacity - cur.booked < qty) break; }
  }
  if (!allocated) throw new ApiError(409, "Not enough capacity left in this slot. Please pick another slot or fewer tickets.");

  try {
    const priced = priceItems(items, opts.channel === "group" ? opts.discountPct || 0 : 0, loyaltyDiscount);
    if (redeemPts > 0) await spendPoints({ user: user._id, points: redeemPts, key: `redeem:${bookingId}`, booking: bookingId, destination: dest._id, note: "Used on a booking" });
    const pricing = opts.channel === "counter" ? { grossMinor: priced.grossMinor, discountMinor: 0, subtotalMinor: priced.subtotalMinor, feesMinor: 0, taxMinor: 0, totalMinor: priced.subtotalMinor } : priced; // no online convenience fee at the counter
    const ref = makeRef();
    const booking = await Booking.create({
      _id: bookingId, priceAdjustPct: adjustPct, loyaltyPointsUsed: redeemPts, loyaltyDiscountMinor: priced.discountMinor && loyaltyDiscount ? loyaltyDiscount : 0,
      reference: ref, user: user._id, destination: dest._id, slot: slot._id, date: slot.date, start: slot.start, end: slot.end,
      items, quantity: qty, ...pricing, status: "pending", paymentStatus: "unpaid", channel: opts.channel || "online", soldBy: opts.soldBy, discountPct: opts.channel === "group" ? opts.discountPct || 0 : 0, groupName: opts.groupName,
      holdExpiresAt: new Date(Date.now() + (opts.holdHours ? opts.holdHours * 3600000 : holdMinutes() * 60000)),
      visitors: input.visitors, contact: input.contact, ...(input.buyer && (opts.channel || "online") === "online" ? { buyer: validBuyer(input.buyer) } : {}), idempotencyKey: input.idempotencyKey, idemKey: idemKey || `ref:${ref}`,
      history: [hist("created", String(user._id), `${qty} ticket(s) held`)],
    });
    await alertSlot(dest, allocated);
    await closeWaitlist({ user: user._id, slot: slot._id, status: { $in: ["waiting", "notified"] } }, "fulfilled");
    return booking.toObject();
  } catch (e: any) {
    await releaseSeats(slot._id, qty);
    if (redeemPts > 0) await restoreRedeemed({ _id: bookingId, user: user._id, destination: dest._id, loyaltyPointsUsed: redeemPts, reference: "(not created)" }).catch(() => {});
    if (e?.code === 11000 && idemKey) {
      const ex = await Booking.findOne({ idemKey }).lean();
      if (ex) return ex;
    }
    throw e;
  }
}

export async function payBooking(user: any, input: { bookingId: string; method: string; idempotencyKey: string; simulateFailure?: boolean }) {
  const prior: any = await Payment.findOne({ idempotencyKey: input.idempotencyKey }).lean();
  if (prior) {
    if (String(prior.user) !== String(user._id)) throw new ApiError(403, "Forbidden");
    const replayOrder = prior.provider === "razorpay" && prior.status === "created" ? { id: prior.providerOrderId, keyId: razorpayKeyId(), amount: prior.amountMinor, currency: "INR" } : undefined;
    return { payment: prior, booking: await Booking.findById(prior.booking).lean(), replayed: true, order: replayOrder };
  }
  const booking: any = await Booking.findOne({ _id: input.bookingId, user: user._id }).lean();
  if (!booking) throw new ApiError(404, "Booking not found");
  if (booking.status === "confirmed") throw new ApiError(409, "This booking is already paid");
  if (booking.status !== "pending") throw new ApiError(409, `This booking is ${booking.status}`);
  if (booking.holdExpiresAt && booking.holdExpiresAt < new Date()) { await endPending(booking, "expired", "Payment hold expired"); throw new ApiError(410, "Your hold expired. Please book again."); }

  if (razorpayEnabled()) {
    const order = await createOrder(booking.totalMinor, booking.reference, { bookingId: String(booking._id) });
    const rp = await Payment.create({ booking: booking._id, user: user._id, provider: "razorpay", providerOrderId: order.id, amountMinor: booking.totalMinor, method: input.method, idempotencyKey: input.idempotencyKey, status: "created" });
    return { payment: rp.toObject(), booking, replayed: false, order: { id: order.id as string, keyId: razorpayKeyId(), amount: booking.totalMinor, currency: "INR" } };
  }
  let payment: any;
  try {
    payment = await Payment.create({ booking: booking._id, user: user._id, amountMinor: booking.totalMinor, method: input.method, idempotencyKey: input.idempotencyKey, status: "created" });
  } catch (e: any) {
    if (e?.code === 11000) { const p = await Payment.findOne({ idempotencyKey: input.idempotencyKey }).lean(); return { payment: p, booking, replayed: true }; }
    throw e;
  }
  // ---- Simulated gateway (swap for Razorpay order + signature verification in production) ----
  if (input.simulateFailure) {
    payment.status = "failed"; payment.failureReason = "Simulated payment decline"; await payment.save();
    await Booking.updateOne({ _id: booking._id }, { paymentStatus: "failed", $push: { history: hist("payment_failed", String(user._id), payment.failureReason) } });
    return { payment: payment.toObject(), booking: await Booking.findById(booking._id).lean(), replayed: false };
  }
  const confirmed = await finalizeBooking(booking._id, payment, `Paid via ${input.method}`, String(user._id));
  if (!confirmed) {
    payment.status = "failed"; payment.failureReason = "Booking was already processed or the hold expired"; await payment.save();
    throw new ApiError(409, "This booking can no longer be paid");
  }
  payment.status = "succeeded"; payment.providerRef = `SIM_${rand(10)}`; await payment.save();
  await notifyBookingConfirmed(confirmed);
  return { payment: payment.toObject(), booking: confirmed, replayed: false };
}

/** The single pending -> confirmed transition, shared by every payment path. Returns null if it was already handled or the hold expired. */
export async function finalizeBooking(bookingId: any, payment: any, note: string, by: string) {
  const confirmed: any = await Booking.findOneAndUpdate(
    { _id: bookingId, status: "pending", holdExpiresAt: { $gt: new Date() } },
    { status: "confirmed", paymentStatus: "paid", payment: payment._id, $unset: { holdExpiresAt: 1 }, $push: { history: hist("confirmed", by, note) } },
    { new: true }
  ).lean();
  return confirmed ? assignInvoice(confirmed) : null;
}

/** Confirms a Razorpay payment from the browser callback (signature checked) or the webhook (already authenticated). */
export async function confirmRazorpayPayment(userId: any | null, p: { orderId: string; paymentId: string; signature?: string }, source: "client" | "webhook") {
  const payment: any = await Payment.findOne({ provider: "razorpay", providerOrderId: p.orderId, type: "charge" });
  if (!payment || (userId && String(payment.user) !== String(userId))) throw new ApiError(404, "Payment not found");
  if (payment.status === "succeeded") return { payment, booking: await Booking.findById(payment.booking).lean(), replayed: true };
  if (source === "client" && !verifySignature(p.orderId, p.paymentId, p.signature || "")) {
    payment.status = "failed"; payment.failureReason = "Signature mismatch"; await payment.save();
    throw new ApiError(400, "Payment verification failed");
  }
  const confirmed = await finalizeBooking(payment.booking, payment, `Paid via Razorpay ${p.paymentId}`, String(payment.user));
  if (!confirmed) {
    const b: any = await Booking.findById(payment.booking).lean();
    if (b?.status === "confirmed" && String(b.payment) === String(payment._id)) return { payment, booking: b, replayed: true }; // client and webhook raced
    // Money was captured but the seats were already released: refund automatically.
    payment.status = "succeeded"; payment.providerRef = p.paymentId; await payment.save();
    try {
      const r = await refundPayment(p.paymentId, payment.amountMinor);
      await Payment.create({ booking: payment.booking, user: payment.user, provider: "razorpay", type: "refund", amountMinor: payment.amountMinor, status: "succeeded", providerRef: r.id, idempotencyKey: `refund:auto:${payment._id}` });
    } catch (e) { console.error("[razorpay] AUTO-REFUND FAILED, needs manual refund", p.paymentId, e); }
    throw new ApiError(409, "Your held seats were released before the payment completed. The amount is being refunded.");
  }
  payment.status = "succeeded"; payment.providerRef = p.paymentId; await payment.save();
  await notifyBookingConfirmed(confirmed);
  return { payment, booking: confirmed, replayed: false };
}

export async function cancelBooking(booking: any, actor: any, reason = "Cancelled by user", force = false, opts: { refundMethod?: string } = {}) {
  if (actor.role === "tourist" && (booking.transferCount || 0) > 0 && booking.status === "confirmed") throw new ApiError(400, "Transferred tickets can't be cancelled by the new holder. Contact the site if you need help.");
  if (booking.status === "pending") { await endPending(booking, "cancelled", reason); return Booking.findById(booking._id).lean(); }
  const dest: any = await Destination.findById(booking.destination).lean();
  const info = cancellationInfo(booking, dest.cancellationPolicy);
  if (!force && !info.eligible) throw new ApiError(400, info.reason);
  if (booking.status !== "confirmed" || booking.checkedInAt) throw new ApiError(400, "Only confirmed, unused bookings can be cancelled");
  const refund = force ? booking.totalMinor : info.refundMinor;
  const upd: any = await Booking.findOneAndUpdate(
    { _id: booking._id, status: "confirmed", checkedInAt: null },
    { status: "cancelled", cancelledAt: new Date(), cancelReason: reason, refundMinor: refund,
      paymentStatus: refund <= 0 ? "paid" : refund >= booking.totalMinor ? "refunded" : "partially_refunded",
      $push: { history: hist("cancelled", String(actor._id), `${reason}; refund ${refund}`) } },
    { new: true }
  ).lean();
  if (!upd) throw new ApiError(409, "This booking was just changed. Refresh and try again.");
  await releaseSeats(booking.slot, booking.quantity);
  await restoreRedeemed(upd).catch((e) => console.error("[loyalty] restore failed", e));
  if (refund > 0) {
    const charge: any = await Payment.findOne({ booking: booking._id, type: "charge", status: "succeeded" }).lean();
    const real = charge?.provider === "razorpay" && razorpayEnabled();
    const provider = real ? "razorpay" : charge?.provider === "counter" ? "counter" : "simulated";
    let status = "succeeded", providerRef = `SIMREF_${rand(10)}`, failureReason: string | undefined;
    if (real) { try { providerRef = (await refundPayment(charge.providerRef, refund)).id; } catch (e: any) { status = "failed"; failureReason = e.message; providerRef = ""; console.error("[razorpay] refund failed, refund manually", booking.reference, e); } }
    // A counter refund is cash (or UPI/card) handed back at the desk by the person cancelling it, so it belongs to THEIR drawer.
    await Payment.create({ booking: booking._id, user: provider === "counter" ? actor._id : booking.user, provider, type: "refund", amountMinor: refund, status, method: real ? "razorpay" : (opts.refundMethod || charge?.method || "simulated"), providerRef, failureReason, idempotencyKey: `refund:${booking._id}` });
  }
  let finalBooking = upd;
  if (refund > 0 && upd.invoiceNo && (await Payment.findOne({ booking: booking._id, type: "refund", status: "succeeded" }).lean())) {
    // A credit note reverses the invoice for what was actually refunded, with the GST on the convenience fee reversed in proportion.
    finalBooking = (await issueCreditNote(Booking, upd._id, { creditNoteMinor: refund, creditNoteTaxMinor: creditTaxShare(upd.taxMinor || 0, upd.totalMinor || 0, refund) }).catch((e: any) => { console.error("[credit note]", e); return upd; })) || upd;
  }
  await notifyCancelled(finalBooking, refund);
  return finalBooking;
}

/* ---------------- Entry / exit ---------------- */
export async function getOccupancy(destinationId: any) {
  const match = { $match: { destination: destinationId, status: { $in: ["confirmed", "completed"] }, checkedInAt: { $gte: startOfDayIST() } } };
  // Two single-accumulator aggregations: equivalent on MongoDB, and also correct on MongoDB-compatible servers that mishandle multiple $sum in one $group.
  const [inn, out] = await Promise.all([
    Booking.aggregate([match, { $group: { _id: null, n: { $sum: "$checkedInCount" } } }]),
    Booking.aggregate([match, { $group: { _id: null, n: { $sum: "$checkedOutCount" } } }]),
  ]);
  const passesInside = await Pass.countDocuments({ insideDestination: destinationId, insideSince: { $gte: startOfDayIST() } });
  return Math.max(0, (inn[0]?.n || 0) - (out[0]?.n || 0)) + passesInside;
}

export async function validateTicket(user: any, code: string, action: "verify" | "in" | "out", qty?: number, at?: Date) {
  const parsed = parseCode(code);
  if (!parsed) return { valid: false, reasons: ["Unrecognised or tampered ticket code"], warnings: [] as string[], booking: null, dest: null };
  const booking: any = await Booking.findOne({ reference: parsed.ref }).lean();
  if (!booking) return { valid: false, reasons: ["No booking found for this code"], warnings: [], booking: null, dest: null };
  if (!canAccessDestination(user, booking.destination)) throw new ApiError(403, "This ticket is for a destination you are not assigned to");
  const dest: any = await Destination.findById(booking.destination).lean();
  const reasons: string[] = [], warnings: string[] = [];
  const inCount = booking.checkedInCount || 0, outCount = booking.checkedOutCount || 0;
  const toEnter = booking.quantity - inCount, inside = inCount - outCount;
  if (!parsed.signed) warnings.push("Reference typed manually: QR signature not checked");
  if (!["confirmed", ...(action === "verify" ? ["completed"] : [])].includes(booking.status)) reasons.push(`Booking is ${booking.status}`);
  const { date, minutes } = istParts(at);
  if (booking.date !== date) reasons.push(`Ticket is for ${booking.date}, not today`);
  else if (action !== "out") {
    if (process.env.DEMO_RELAX_SLOT_CHECK !== "true") {
      const grace = Number(process.env.ENTRY_SLOT_GRACE_MINUTES || 30);
      if (minutes < toMin(booking.start) - grace || minutes > toMin(booking.end) + grace) reasons.push(`Outside slot window ${booking.start}–${booking.end}`);
    } else warnings.push("Demo mode: slot time window not enforced");
  }
  if (action === "in") {
    if (dest?.entryPaused && !at) reasons.push(`Entry is paused${dest.entryPausedReason ? `: ${dest.entryPausedReason}` : ""}`);
    if (toEnter <= 0) reasons.push("Already checked in");
    else if (qty && qty > toEnter) reasons.push(`Only ${toEnter} visitor(s) left to check in`);
  }
  if (action === "out") {
    if (inside <= 0) reasons.push(inCount === 0 ? "Visitor has not checked in" : "Everyone has already checked out");
    else if (qty && qty > inside) reasons.push(`Only ${inside} visitor(s) are inside`);
  }
  return { valid: reasons.length === 0, reasons, warnings, booking, dest };
}

/** Records entry/exit for `qty` visitors of a booking (default: everyone still to enter / still inside). */
export async function recordEntry(user: any, code: string, action: "in" | "out", qty?: number, opts: { at?: Date; note?: string } = {}) {
  const v = await validateTicket(user, code, action, qty, opts.at);
  if (!v.valid || !v.booking) throw new ApiError(409, v.reasons.join("; "));
  let b = v.booking;
  const now = opts.at || new Date();
  let upd: any = null, q = 0;
  if (action === "in") {
    q = qty ?? b.quantity - (b.checkedInCount || 0);
    upd = await Booking.findOneAndUpdate(
      { _id: b._id, status: "confirmed", checkedInCount: { $lte: b.quantity - q } },
      { $inc: { checkedInCount: q }, $set: { checkedInAt: b.checkedInAt || now }, $push: { history: hist("checked_in", String(user._id), `${q} visitor(s)${opts.note ? `; ${opts.note}` : ""}`) } },
      { new: true }
    ).lean();
  } else {
    for (let i = 0; i < 3 && !upd; i++) {
      if (i > 0) { b = await Booking.findById(b._id).lean(); if (!b) break; }
      const inside = (b.checkedInCount || 0) - (b.checkedOutCount || 0);
      q = qty ?? inside;
      if (q < 1 || q > inside) throw new ApiError(409, "Nobody left to check out");
      upd = await Booking.findOneAndUpdate(
        { _id: b._id, status: "confirmed", checkedOutCount: b.checkedOutCount || 0, checkedInCount: { $gte: (b.checkedOutCount || 0) + q } },
        { $inc: { checkedOutCount: q }, $set: { checkedOutAt: now }, $push: { history: hist("checked_out", String(user._id), `${q} visitor(s)${opts.note ? `; ${opts.note}` : ""}`) } },
        { new: true }
      ).lean();
    }
    if (upd && upd.checkedOutCount >= upd.quantity) await Booking.updateOne({ _id: upd._id, status: "confirmed" }, { status: "completed" });
  }
  if (!upd) throw new ApiError(409, "Duplicate scan: this ticket was just processed");
  await EntryRecord.create({ booking: upd._id, destination: upd.destination, slot: upd.slot, type: action, quantity: q, by: user._id, device: user.isDevice ? user._id : undefined, at: now });
  if (action === "in" && !v.booking.checkedInAt) await awardForVisit(upd).catch((e) => console.error("[loyalty] award failed", e));
  if (action === "in") {
    await CrowdObservation.updateOne({ destination: upd.destination, date: istParts(now).date, hour: Number(istHour(now)), source: "recorded" }, { $inc: { visitors: q } }, { upsert: true });
  }
  const occupancy = await getOccupancy(upd.destination);
  const limit = v.dest.occupancyLimit || 3000;
  if ((occupancy / limit) * 100 >= (v.dest.alertThresholdPct ?? 85)) {
    const key = `occ:${upd.destination}:${todayIST()}:${Math.floor(now.getTime() / 3600000)}`;
    await Notification.updateOne({ key }, { $setOnInsert: { destination: upd.destination, type: "occupancy_alert", severity: occupancy >= limit ? "critical" : "warning", message: `${v.dest.name}: occupancy ${occupancy}/${limit} (${Math.round((occupancy / limit) * 100)}%)`, key } }, { upsert: true });
  }
  return { booking: upd, occupancy, limit, dest: v.dest, quantity: q };
}
/**
 * Walk-in sale at the gate: allocates capacity like any booking, takes payment at the counter (cash/UPI/card on the
 * operator's own device, recorded here), confirms, issues an invoice number and optionally checks everyone in.
 * No online convenience fee applies.
 */
export type CounterParking = { vehicleType: VType; bay?: Bay; badgeChecked?: boolean; vehicleNumber: string; driverName?: string; driverPhone?: string; reservationRef?: string; prepay?: boolean };
export async function counterSale(staff: any, input: { destinationId: string; slotId?: string; items: { categoryId: string; quantity: number }[]; method: "cash" | "upi" | "card"; checkIn?: boolean; idempotencyKey?: string; payment?: PayDetails; parking?: CounterParking; offline?: { at: string; id?: string } }) {
  if (!canAccessDestination(staff, input.destinationId)) throw new ApiError(403, "You are not assigned to this destination");
  const dest: any = await Destination.findOne({ _id: input.destinationId, active: true }).lean();
  if (!dest) throw new ApiError(404, "Destination not found");
  const { date, minutes } = istParts();
  let slotId = input.slotId;
  if (!slotId) {
    const slots = await ensureSlots(dest, date);
    const cur = slots.find((x) => !x.closed && toMin(x.start) <= minutes && minutes < toMin(x.end)) || slots.find((x) => !x.closed && toMin(x.start) > minutes);
    if (!cur?._id) throw new ApiError(409, "No open slot right now");
    slotId = cur._id;
  }
  const qty = input.items.reduce((a, i) => a + i.quantity, 0);
  if (qty > 100) throw new ApiError(400, "A single counter sale is limited to 100 tickets");

  // Check everything that can be checked before any seat is held, so a bad card slip or a full car park can't leave a half-finished sale.
  const cats: any[] = await TicketCategory.find({ _id: { $in: input.items.map((i) => i.categoryId) }, destination: dest._id, active: true }).lean();
  const slotDoc: any = await TimeSlot.findById(slotId).lean();
  const rules = slotDoc ? await rulesFor(dest._id) : [];
  const ticketsDue = input.items.reduce((a, i) => { const c = cats.find((x) => String(x._id) === i.categoryId); return a + (c ? ((slotDoc ? priceCategory(c, slotDoc, rules).unitPriceMinor : c.priceMinor) + (c.feeMinor || 0)) * i.quantity : 0); }, 0);
  let prepayMinor = 0;
  if (input.parking) {
    const pk = input.parking, vn = normalizeVehicle(pk.vehicleNumber), bay: Bay = pk.bay || "standard", pool = poolOf(pk.vehicleType, bay);
    if (vn.length < 4 || vn.length > 12) throw new ApiError(400, "Enter a valid vehicle number for parking");
    const lot: any = await ParkingLot.findOne({ destination: dest._id, active: true }).lean();
    if (!lot) throw new ApiError(404, "No parking is configured for this destination");
    if (bay !== "standard" && pk.vehicleType !== "car") throw new ApiError(409, "EV and accessible bays are for cars");
    const cap = capacityOn(lot, pool, await overridesFor(lot._id, date));
    if (!(cap > 0)) throw new ApiError(409, `${POOL_LABEL[pool]} parking isn't available here today`);
    if (bay === "accessible" && !pk.reservationRef && !pk.badgeChecked) throw new ApiError(400, "Confirm that the driver's disabled-parking badge or permit was checked");
    if (!pk.reservationRef) {
      const held = (await heldToday(lot._id))[pool] || 0;
      if ((lot[pool].occupied || 0) + held >= cap) throw new ApiError(409, "Parking is full for this vehicle type. Untick parking to sell tickets only.");
    }
    if (pk.prepay) prepayMinor = reservationFee(lot[pool]);
  }
  await assertUpiAllowed(input.destinationId, input.method);
  buildPaymentDetails(input.method, input.payment, ticketsDue + prepayMinor); // throws a clear 400 for missing card details or short cash

  const booking: any = await createBooking(staff, {
    destinationId: input.destinationId, slotId, items: input.items,
    visitors: Array.from({ length: qty }, (_, i) => ({ name: `Walk-in ${i + 1}` })), contact: { name: "Walk-in", email: "", phone: "" },
    idempotencyKey: input.idempotencyKey,
  }, { channel: "counter", soldBy: staff._id, allowPast: !!input.offline });
  if (booking.status === "confirmed" || booking.status === "completed") {
    const pt: any = await ParkingTicket.findOne({ booking: booking._id }).lean();
    return { booking, replayed: true as const, checkInError: undefined as string | undefined, parkingTicket: pt, parkingError: undefined as string | undefined };
  }
  const payment = await Payment.create({ booking: booking._id, user: staff._id, provider: "counter", type: "charge", amountMinor: booking.totalMinor, method: input.method, status: "succeeded", providerRef: `COUNTER_${rand(8)}`, idempotencyKey: `counter:${booking._id}`, details: buildPaymentDetails(input.method, input.payment, booking.totalMinor) });
  const confirmed = await finalizeBooking(booking._id, payment, `Counter sale (${input.method})${input.offline ? `; recorded offline at ${input.offline.at}, synced ${new Date().toISOString()}${input.offline.id ? `; local id ${input.offline.id}` : ""}` : ""}`, String(staff._id));
  if (!confirmed) throw new ApiError(409, "This sale could not be completed. Please try again.");
  let checkInError: string | undefined;
  if (input.checkIn !== false) {
    try { await recordEntry(staff, ticketCode(confirmed.reference), "in"); } catch (e: any) { checkInError = e.message; }
  }
  let parkingTicket: any, parkingError: string | undefined;
  if (input.parking) {
    try {
      parkingTicket = await enterVehicle(staff, {
        destinationId: input.destinationId, vehicleType: input.parking.vehicleType, vehicleNumber: input.parking.vehicleNumber, reservationRef: input.parking.reservationRef, bay: input.parking.bay, badgeChecked: input.parking.badgeChecked,
        driverName: input.parking.driverName, driverPhone: input.parking.driverPhone, bookingId: confirmed._id, source: "counter",
        prepay: prepayMinor > 0 ? { amountMinor: prepayMinor, method: input.method, details: input.payment } : undefined, at: input.offline?.at, offlineId: input.offline?.id,
      });
    } catch (e: any) { parkingError = e.message; }
  }
  return { booking: (await Booking.findById(confirmed._id).lean()) as any, replayed: false as const, checkInError, parkingTicket, parkingError };
}

const istHour = (d: Date) => new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", hour: "2-digit", hour12: false }).format(d);


/**
 * Cancels a confirmed, unused booking at the counter and records the refund.
 * - A walk-in (counter) sale made today is refunded in full by the staff member, in cash or the original method; managers can refund older sales.
 * - Online and group bookings follow the site's cancellation policy and the money goes back to the visitor's original payment method (not from the drawer). Only managers can override the policy.
 */
export async function counterRefund(actor: any, input: { reference: string; reason: string; method?: "cash" | "upi" | "card" }) {
  const reason = (input.reason || "").trim();
  if (reason.length < 3) throw new ApiError(400, "Give a short reason for the refund");
  const parsed = parseCode(input.reference);
  if (!parsed) throw new ApiError(400, "Enter the booking reference (HH-XXXX-XXXX) or scan the ticket");
  const b: any = await Booking.findOne({ reference: parsed.ref }).lean();
  if (!b || !canAccessDestination(actor, b.destination)) throw new ApiError(404, "No booking found with that reference at your sites");
  if (b.status !== "confirmed") throw new ApiError(409, `This booking is ${b.status}, so there is nothing to refund`);
  if ((b.checkedInCount || 0) > 0) throw new ApiError(409, "Visitors have already entered on this ticket");
  const manager = actor.role === "admin" || actor.role === "operator";
  const isCounter = b.channel === "counter";
  if (isCounter && !manager && b.createdAt < startOfDayIST()) throw new ApiError(403, "Walk-in sales can only be refunded on the day. Ask a manager.");
  const method = input.method || ((await Payment.findOne({ booking: b._id, type: "charge", status: "succeeded" }).lean()) as any)?.method || "cash";
  const upd = await cancelBooking(b, actor, `Counter refund: ${reason}`, isCounter || manager, { refundMethod: isCounter ? method : undefined });
  const parked: any = await ParkingTicket.findOne({ booking: b._id, status: "parked" }).select("ticketNo vehicleNumber").lean();
  return { booking: upd, refundMinor: (upd as any).refundMinor || 0, paidBack: isCounter ? (method as string) : "original payment method", parkingWarning: parked ? `Parking ticket ${parked.ticketNo} (${parked.vehicleNumber}) is still open. It is not refunded or closed.` : undefined };
}
