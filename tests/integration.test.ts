/**
 * Integration tests for the booking engine against a real MongoDB.
 * Run with: MONGODB_URI_TEST=mongodb://127.0.0.1:27017/heritagehub_test npm run test:integration
 * Skipped automatically when MONGODB_URI_TEST is not set. These tests wipe the target database.
 */
import crypto from "crypto";
import mongoose from "mongoose";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const URI = process.env.MONGODB_URI_TEST;
const d = describe.skipIf(!URI);
let M: any, B: any, W: any, R: any, RL: any, S: any, U: any, PK: any, PS: any, GR: any, SC: any;
const oid = () => new mongoose.Types.ObjectId();

beforeAll(async () => {
  if (!URI) return;
  process.env.MONGODB_URI = URI;
  const { connectDB } = await import("@/lib/db"); await connectDB();
  M = await import("@/models"); B = await import("@/lib/booking"); W = await import("@/lib/waitlist"); RL = await import("@/lib/ratelimit"); S = await import("@/lib/slots"); U = await import("@/lib/utils"); PK = await import("@/lib/parking"); PS = await import("@/lib/passes"); GR = await import("@/lib/groups"); SC = await import("@/lib/scan");
  await Promise.all(Object.values(M).map((m: any) => m.syncIndexes?.()));
});
beforeEach(async () => { if (URI) for (const m of Object.values(M)) await (m as any).deleteMany?.({}); });
afterEach(() => { vi.unstubAllGlobals(); delete process.env.PAYMENT_PROVIDER; });

/** A site with one category, a persisted slot `daysAhead` days out. */
async function site(capacity = 10, daysAhead = 3, price = 5000, hours = { open: "09:00", close: "17:00" }) {
  const dest = await M.Destination.create({ slug: "s" + oid(), name: "Test Fort", city: "Agra", state: "UP", type: "fort", shortDescription: "A test fort", location: { lat: 1, lng: 1 }, hours: { ...hours, closedDays: [] }, defaultSlotCapacity: capacity, occupancyLimit: 100 });
  const cat = await M.TicketCategory.create({ destination: dest._id, name: "Indian", audience: "indian", priceMinor: price });
  const date = U.addDays(U.todayIST(), daysAhead);
  const slots = await S.ensureSlots(dest, date);
  return { dest, cat, date, slot: slots[2] };
}
const input = (s: any, qty = 2, extra: any = {}) => ({ destinationId: String(s.dest._id), slotId: s.slot._id, items: [{ categoryId: String(s.cat._id), quantity: qty }], visitors: Array.from({ length: qty }, (_, i) => ({ name: `V${i}` })), contact: { name: "Test User", email: "t@example.com", phone: "9876543210" }, ...extra });
const booked = async (s: any) => (await M.TimeSlot.findById(s.slot._id).lean()).booked;
const pay = (u: any, b: any, key = crypto.randomUUID(), more = {}) => B.payBooking(u, { bookingId: String(b._id), method: "upi", idempotencyKey: key, ...more });

d("capacity", () => {
  it("never overbooks: exactly capacity/qty bookings succeed, the rest get 409", async () => {
    const s = await site(10);
    const res: string[] = [];
    for (let i = 0; i < 8; i++) res.push(await B.createBooking({ _id: oid() }, input(s, 2)).then(() => "ok", (e: any) => (e.status === 409 ? "full" : "err:" + e.message)));
    expect(res.filter((r) => r === "ok")).toHaveLength(5);
    expect(res.filter((r) => r === "full")).toHaveLength(3);
    expect(await booked(s)).toBe(10);
  });
  it("rejects a booking larger than what remains, without consuming seats", async () => {
    const s = await site(3);
    await expect(B.createBooking({ _id: oid() }, input(s, 4))).rejects.toMatchObject({ status: 409 });
    expect(await booked(s)).toBe(0);
  });
  it("blocks closed slots and past dates", async () => {
    const s = await site(10);
    await M.TimeSlot.updateOne({ _id: s.slot._id }, { closed: true });
    await expect(B.createBooking({ _id: oid() }, input(s, 1))).rejects.toMatchObject({ status: 409 });
    const past = await site(10, -1);
    await expect(B.createBooking({ _id: oid() }, input(past, 1))).rejects.toMatchObject({ status: 400 });
  });
  it("is idempotent for the same client key", async () => {
    const s = await site(10), u = { _id: oid() };
    const a = await B.createBooking(u, input(s, 2, { idempotencyKey: "same-key-123" }));
    const b = await B.createBooking(u, input(s, 2, { idempotencyKey: "same-key-123" }));
    expect(String(a._id)).toBe(String(b._id));
    expect(await booked(s)).toBe(2);
  });
  it("supersedes a user's abandoned hold on the same slot", async () => {
    const s = await site(10), u = { _id: oid() };
    await B.createBooking(u, input(s, 2)); await B.createBooking(u, input(s, 3));
    expect(await booked(s)).toBe(3);
  });
  it("releases expired holds exactly once", async () => {
    const s = await site(10), u = { _id: oid() };
    const b = await B.createBooking(u, input(s, 4));
    await M.Booking.updateOne({ _id: b._id }, { holdExpiresAt: new Date(Date.now() - 1000) });
    await B.releaseExpired(); await B.releaseExpired();
    expect(await booked(s)).toBe(0);
    expect((await M.Booking.findById(b._id).lean()).status).toBe("expired");
  });
  it("admin capacity can't drop below booked seats", async () => {
    const s = await site(10);
    await B.createBooking({ _id: oid() }, input(s, 6));
    const res = await M.TimeSlot.findOneAndUpdate({ _id: s.slot._id, booked: { $lte: 4 } }, { capacity: 4 });
    expect(res).toBeNull();
  });
});

d("payments (simulated)", () => {
  it("confirms once, replays safely, and rejects a second payment with a new key", async () => {
    const s = await site(10), u = { _id: oid() };
    const b = await B.createBooking(u, input(s, 2));
    const key = crypto.randomUUID();
    const p1 = await pay(u, b, key); expect(p1.booking.status).toBe("confirmed"); expect(p1.booking.paymentStatus).toBe("paid");
    const p2 = await pay(u, b, key); expect(p2.replayed).toBe(true);
    await expect(pay(u, b)).rejects.toMatchObject({ status: 409 });
    expect(await M.Payment.countDocuments({ booking: b._id, type: "charge", status: "succeeded" })).toBe(1);
  });
  it("keeps the booking pending after a failed payment so the user can retry", async () => {
    const s = await site(10), u = { _id: oid() };
    const b = await B.createBooking(u, input(s, 1));
    const f = await pay(u, b, undefined, { simulateFailure: true });
    expect(f.payment.status).toBe("failed");
    expect((await M.Booking.findById(b._id).lean()).status).toBe("pending");
    expect((await pay(u, b)).booking.status).toBe("confirmed");
  });
  it("refuses to pay for another user's booking", async () => {
    const s = await site(10), u = { _id: oid() };
    const b = await B.createBooking(u, input(s, 1));
    await expect(pay({ _id: oid() }, b)).rejects.toMatchObject({ status: 404 });
  });
  it("rejects payment after the hold expired and frees the seats", async () => {
    const s = await site(10), u = { _id: oid() };
    const b = await B.createBooking(u, input(s, 2));
    await M.Booking.updateOne({ _id: b._id }, { holdExpiresAt: new Date(Date.now() - 1000) });
    await expect(pay(u, b)).rejects.toMatchObject({ status: 410 });
    expect(await booked(s)).toBe(0);
  });
});

d("cancellation", () => {
  it("refunds in full inside the free window and releases seats once", async () => {
    const s = await site(10, 5), u = { _id: oid() };
    const b = await B.createBooking(u, input(s, 2)); const paid = (await pay(u, b)).booking;
    const c = await B.cancelBooking(paid, u);
    expect(c.status).toBe("cancelled"); expect(c.refundMinor).toBe(paid.totalMinor); expect(c.paymentStatus).toBe("refunded");
    expect(await booked(s)).toBe(0);
    await expect(B.cancelBooking(paid, u)).rejects.toBeTruthy();
    expect(await booked(s)).toBe(0);
    expect(await M.Payment.countDocuments({ booking: b._id, type: "refund" })).toBe(1);
  });
  it("is not allowed once inside the no-cancellation window", async () => {
    const s = await site(10, 0), u = { _id: oid() };
    const b = await B.createBooking(u, input(s, 1), { allowPast: true }); const paid = (await pay(u, b)).booking;
    await M.Booking.updateOne({ _id: paid._id }, { start: U.istParts().minutes > 60 ? "00:05" : "23:59" });
    await expect(B.cancelBooking(await M.Booking.findById(paid._id).lean(), u)).rejects.toMatchObject({ status: 400 });
  });
  it("lets an administrator force-cancel with a full refund", async () => {
    const s = await site(10, 0), u = { _id: oid() };
    const b = await B.createBooking(u, input(s, 1), { allowPast: true }); const paid = (await pay(u, b)).booking;
    const c = await B.cancelBooking(paid, { _id: oid() }, "Admin", true);
    expect(c.refundMinor).toBe(paid.totalMinor);
  });
});

d("waitlist", () => {
  it("notifies the oldest fitting entry when seats return, and frees the key to rejoin", async () => {
    const s = await site(2), u = { _id: oid() };
    const b = await B.createBooking(u, input(s, 2)); const paid = (await pay(u, b)).booking;
    const w1 = oid(), w2 = oid();
    for (const [user, qty] of [[w1, 2], [w2, 1]] as const) await M.Waitlist.create({ user, destination: s.dest._id, slot: s.slot._id, date: s.date, quantity: qty, slotKey: `${user}:${s.slot._id}` });
    await B.cancelBooking(paid, u);
    const e1 = await M.Waitlist.findOne({ user: w1 }).lean(), e2 = await M.Waitlist.findOne({ user: w2 }).lean();
    expect(e1.status).toBe("notified"); expect(e2.status).toBe("waiting"); // the first entry consumed both seats
    await expect(M.Waitlist.create({ user: w2, destination: s.dest._id, slot: s.slot._id, date: s.date, quantity: 1, slotKey: `${w2}:${s.slot._id}` })).rejects.toMatchObject({ code: 11000 });
    await W.closeWaitlist({ _id: e2._id }, "cancelled");
    await M.Waitlist.create({ user: w2, destination: s.dest._id, slot: s.slot._id, date: s.date, quantity: 1, slotKey: `${w2}:${s.slot._id}` });
  });
  it("is marked fulfilled when the user books", async () => {
    const s = await site(5), u = { _id: oid() };
    await M.Waitlist.create({ user: u._id, destination: s.dest._id, slot: s.slot._id, date: s.date, quantity: 1, slotKey: `${u._id}:${s.slot._id}` });
    await B.createBooking(u, input(s, 1));
    expect((await M.Waitlist.findOne({ user: u._id }).lean()).status).toBe("fulfilled");
  });
});

d("entry and exit", () => {
  const staff = () => ({ _id: oid(), role: "admin" });
  async function confirmedToday(qty = 4) {
    process.env.DEMO_RELAX_SLOT_CHECK = "true";
    const s = await site(20, 0), u = { _id: oid() };
    const b = await B.createBooking(u, input(s, qty), { allowPast: true }); const paid = (await pay(u, b)).booking;
    return { s, paid, code: B.ticketCode(paid.reference) };
  }
  it("supports partial entry, blocks over-entry and duplicates, and tracks occupancy", async () => {
    const { s, paid, code } = await confirmedToday(4), st = staff();
    await B.recordEntry(st, code, "in", 1);
    expect(await B.getOccupancy(s.dest._id)).toBe(1);
    await expect(B.recordEntry(st, code, "in", 4)).rejects.toMatchObject({ status: 409 }); // only 3 left
    await B.recordEntry(st, code, "in");                                                   // the remaining 3
    expect(await B.getOccupancy(s.dest._id)).toBe(4);
    await expect(B.recordEntry(st, code, "in")).rejects.toMatchObject({ status: 409 });  // duplicate scan
    await B.recordEntry(st, code, "out", 1);
    expect(await B.getOccupancy(s.dest._id)).toBe(3);
    await B.recordEntry(st, code, "out");
    expect(await B.getOccupancy(s.dest._id)).toBe(0);
    expect((await M.Booking.findById(paid._id).lean()).status).toBe("completed");
    expect(await M.EntryRecord.countDocuments({ booking: paid._id })).toBe(4);
    const obs = await M.CrowdObservation.findOne({ destination: s.dest._id, source: "recorded" }).lean();
    expect(obs.visitors).toBe(4);
  });
  it("rejects tampered codes, cancelled bookings and exits without entry", async () => {
    const { paid, code } = await confirmedToday(2), st = staff();
    await expect(B.recordEntry(st, code.slice(0, -1) + "!", "in")).rejects.toMatchObject({ status: 409 });
    await expect(B.recordEntry(st, code, "out")).rejects.toMatchObject({ status: 409 });
    await B.cancelBooking(paid, { _id: oid() }, "x", true);
    await expect(B.recordEntry(st, code, "in")).rejects.toMatchObject({ status: 409 });
  });
  it("blocks entry for a ticket dated another day and for unassigned staff", async () => {
    const s = await site(10, 2), u = { _id: oid() };
    const paid = (await pay(u, await B.createBooking(u, input(s, 1)))).booking;
    await expect(B.recordEntry(staff(), B.ticketCode(paid.reference), "in")).rejects.toMatchObject({ status: 409 });
    await expect(B.validateTicket({ _id: oid(), role: "staff", assignedDestinations: [] }, B.ticketCode(paid.reference), "verify")).rejects.toMatchObject({ status: 403 });
  });
  it("enforces the slot window when demo mode is off", async () => {
    const { paid, code } = await confirmedToday(1);
    process.env.DEMO_RELAX_SLOT_CHECK = "false";
    await M.Booking.updateOne({ _id: paid._id }, { start: "00:00", end: "00:30" });
    const mins = U.istParts().minutes;
    const v = await B.validateTicket(staff(), code, "in");
    if (mins > 90) expect(v.reasons.join()).toMatch(/Outside slot window/);
    process.env.DEMO_RELAX_SLOT_CHECK = "true";
  });
});

d("rate limiting", () => {
  it("allows up to the max, then 429 with Retry-After, and resets after the window", async () => {
    process.env.RATE_LIMIT_DISABLED = "false";
    for (let i = 0; i < 3; i++) await RL.limit("t", ["a"], 3, 60);
    await expect(RL.limit("t", ["a"], 3, 60)).rejects.toMatchObject({ status: 429, headers: { "Retry-After": expect.any(String) } });
    await RL.limit("t", ["other"], 3, 60);                       // separate identity unaffected
    const later = await RL.hit("t:a", 60, Date.now() + 61000);   // window expired
    expect(later.count).toBe(1);
  });
  it("counts correctly under parallel hits", async () => {
    const r = await Promise.all(Array.from({ length: 10 }, () => RL.hit("p:x", 60)));
    expect(Math.max(...r.map((x: any) => x.count))).toBeLessThanOrEqual(10);
  });
});

d("razorpay flow (mocked HTTP)", () => {
  const rz = (calls: any[]) => vi.stubGlobal("fetch", async (url: string, init: any) => { calls.push({ url, body: init?.body && JSON.parse(init.body) }); return { ok: true, status: 200, json: async () => (url.endsWith("/orders") ? { id: "order_T1" } : { id: "rfnd_T1" }), text: async () => "" }; });
  const env = () => { Object.assign(process.env, { PAYMENT_PROVIDER: "razorpay", RAZORPAY_KEY_ID: "rzp_test_x", RAZORPAY_KEY_SECRET: "sek", RAZORPAY_WEBHOOK_SECRET: "wh" }); };
  const sig = (o: string, p: string) => crypto.createHmac("sha256", "sek").update(`${o}|${p}`).digest("hex");

  it("creates an order, rejects a bad signature, and confirms with a good one (replay-safe)", async () => {
    env(); const calls: any[] = []; rz(calls);
    const s = await site(10), u = { _id: oid() };
    const b = await B.createBooking(u, input(s, 2));
    const r: any = await pay(u, b);
    expect(r.order).toMatchObject({ id: "order_T1", keyId: "rzp_test_x", amount: b.totalMinor });
    expect(calls[0].body).toMatchObject({ amount: b.totalMinor, currency: "INR" });
    await expect(B.confirmRazorpayPayment(u._id, { orderId: "order_T1", paymentId: "pay_1", signature: "bad" }, "client")).rejects.toMatchObject({ status: 400 });
    expect((await M.Booking.findById(b._id).lean()).status).toBe("pending");
    const p2: any = await M.Payment.findOne({ providerOrderId: "order_T1" }).lean(); expect(p2.status).toBe("failed");
  });
  it("confirms on a valid signature and ignores the duplicate webhook", async () => {
    env(); const calls: any[] = []; rz(calls);
    const s = await site(10), u = { _id: oid() };
    const b = await B.createBooking(u, input(s, 1)); await pay(u, b);
    const ok = await B.confirmRazorpayPayment(u._id, { orderId: "order_T1", paymentId: "pay_9", signature: sig("order_T1", "pay_9") }, "client");
    expect(ok.booking.status).toBe("confirmed");
    const again = await B.confirmRazorpayPayment(null, { orderId: "order_T1", paymentId: "pay_9" }, "webhook");
    expect(again.replayed).toBe(true);
    expect(calls.some((c) => c.url.includes("/refund"))).toBe(false);
  });
  it("auto-refunds a payment captured after the hold expired", async () => {
    env(); const calls: any[] = []; rz(calls);
    const s = await site(10), u = { _id: oid() };
    const b = await B.createBooking(u, input(s, 2)); await pay(u, b);
    await M.Booking.updateOne({ _id: b._id }, { holdExpiresAt: new Date(Date.now() - 1000) });
    await expect(B.confirmRazorpayPayment(null, { orderId: "order_T1", paymentId: "pay_late" }, "webhook")).rejects.toMatchObject({ status: 409 });
    expect(calls.find((c) => c.url.includes("/payments/pay_late/refund"))?.body.amount).toBe(b.totalMinor);
    expect(await M.Payment.countDocuments({ booking: b._id, type: "refund", status: "succeeded" })).toBe(1);
  });
  it("refunds through Razorpay when a paid booking is cancelled", async () => {
    env(); const calls: any[] = []; rz(calls);
    const s = await site(10, 5), u = { _id: oid() };
    const b = await B.createBooking(u, input(s, 1)); await pay(u, b);
    const paid = (await B.confirmRazorpayPayment(u._id, { orderId: "order_T1", paymentId: "pay_c", signature: sig("order_T1", "pay_c") }, "client")).booking;
    await B.cancelBooking(paid, u);
    expect(calls.some((c) => c.url.includes("/payments/pay_c/refund"))).toBe(true);
    expect((await M.Payment.findOne({ booking: b._id, type: "refund" }).lean()).providerRef).toBe("rfnd_T1");
  });
});

const ALLDAY = { open: "00:00", close: "24:00" };
const cs = (s: any, qty: number, extra: any = {}) => ({ destinationId: String(s.dest._id), items: [{ categoryId: String(s.cat._id), quantity: qty }], method: "cash" as const, ...extra });

d("counter sales", () => {
  beforeEach(() => { process.env.DEMO_RELAX_SLOT_CHECK = "true"; });
  it("sells walk-in tickets with no online fee, issues an invoice, and checks visitors in", async () => {
    const s = await site(50, 0, 5000, ALLDAY), staff = { _id: oid(), role: "admin" };
    const r = await B.counterSale(staff, cs(s, 3));
    expect(r.booking).toMatchObject({ status: "confirmed", channel: "counter", quantity: 3, subtotalMinor: 15000, feesMinor: 0, taxMinor: 0, totalMinor: 15000, paymentStatus: "paid" });
    expect(r.booking.invoiceNo).toMatch(/^HH\/\d{4}-\d{2}\/\d{6}$/);
    expect(r.booking.checkedInCount).toBe(3);
    expect(await B.getOccupancy(s.dest._id)).toBe(3);
    const pay = await M.Payment.findOne({ booking: r.booking._id }).lean();
    expect(pay).toMatchObject({ provider: "counter", method: "cash", amountMinor: 15000, status: "succeeded" });
  });
  it("can skip check-in (e.g. selling for a later slot)", async () => {
    const s = await site(50, 0, 5000, ALLDAY);
    const r = await B.counterSale({ _id: oid(), role: "admin" }, cs(s, 2, { checkIn: false }));
    expect(r.booking.checkedInCount || 0).toBe(0);
  });
  it("uses the same capacity engine: refuses to oversell", async () => {
    const s = await site(4, 0, 5000, ALLDAY), staff = { _id: oid(), role: "admin" };
    const slot = (await M.TimeSlot.findOne({ destination: s.dest._id, date: s.date, start: { $lte: "99:99" } }).lean());
    const target = (await S.readSlots(s.dest, s.date)).find((x: any) => { const m = U.istParts().minutes; return U.toMin(x.start) <= m && m < U.toMin(x.end); });
    await B.counterSale(staff, cs(s, 3, { slotId: target._id, checkIn: false }));
    await expect(B.counterSale(staff, cs(s, 2, { slotId: target._id, checkIn: false }))).rejects.toMatchObject({ status: 409 });
    expect(slot).toBeTruthy();
  });
  it("is idempotent for the same key and rejects non-today slots and unassigned staff", async () => {
    const s = await site(50, 0, 5000, ALLDAY), staff = { _id: oid(), role: "admin" };
    const a = await B.counterSale(staff, cs(s, 1, { idempotencyKey: "pos-key-0001", checkIn: false }));
    const b = await B.counterSale(staff, cs(s, 1, { idempotencyKey: "pos-key-0001", checkIn: false }));
    expect(String(a.booking._id)).toBe(String(b.booking._id)); expect(b.replayed).toBe(true);
    const tomorrow = await site(50, 1, 5000, ALLDAY);
    await expect(B.counterSale(staff, cs(tomorrow, 1, { slotId: tomorrow.slot._id }))).rejects.toMatchObject({ status: 400 });
    await expect(B.counterSale({ _id: oid(), role: "staff", assignedDestinations: [] }, cs(s, 1))).rejects.toMatchObject({ status: 403 });
  });
  it("is not bound by the online per-booking ticket limit (groups at the gate), but still by capacity", async () => {
    const s = await site(40, 0, 5000, ALLDAY), staff = { _id: oid(), role: "admin" };
    const target = (await S.readSlots(s.dest, s.date)).find((x: any) => { const m = U.istParts().minutes; return U.toMin(x.start) <= m && m < U.toMin(x.end); });
    const r = await B.counterSale(staff, cs(s, 25, { slotId: target._id, checkIn: false }));
    expect(r.booking.quantity).toBe(25);
    await expect(B.counterSale(staff, cs(s, 20, { slotId: target._id, checkIn: false }))).rejects.toMatchObject({ status: 409 });
    await expect(B.counterSale(staff, { ...cs(s, 1), items: [{ categoryId: String(s.cat._id), quantity: 50 }, { categoryId: String(s.cat._id), quantity: 51 }] })).rejects.toMatchObject({ status: 400 });
  });
  it("records counter refunds against the counter, not the gateway", async () => {
    const s = await site(50, 0, 5000, ALLDAY), staff = { _id: oid(), role: "admin" };
    const r = await B.counterSale(staff, cs(s, 1, { checkIn: false }));
    await B.cancelBooking(r.booking, staff, "Customer changed mind", true);
    const refund = await M.Payment.findOne({ booking: r.booking._id, type: "refund" }).lean();
    expect(refund).toMatchObject({ provider: "counter", method: "cash", amountMinor: 5000 });
  });
});

d("invoices", () => {
  it("numbers confirmed bookings sequentially and uniquely, online bookings include the fee and GST", async () => {
    const s = await site(50, 3), nums: string[] = [];
    for (let i = 0; i < 5; i++) { const u = { _id: oid() }; const b = await B.createBooking(u, input(s, 1)); const paid = (await pay(u, b)).booking; nums.push(paid.invoiceNo); if (i === 0) expect(paid.feesMinor).toBeGreaterThan(0); }
    expect(new Set(nums).size).toBe(5);
    const seqs = nums.map((n) => Number(n.split("/")[2]));
    expect(seqs).toEqual([1, 2, 3, 4, 5]);
  });
  it("does not give pending or replayed payments a second number", async () => {
    const s = await site(50, 3), u = { _id: oid() };
    const b = await B.createBooking(u, input(s, 1)); expect((await M.Booking.findById(b._id).lean()).invoiceNo).toBeUndefined();
    const key = crypto.randomUUID(); const p1 = (await pay(u, b, key)).booking; const p2 = (await pay(u, b, key)).booking;
    expect(p2.invoiceNo).toBe(p1.invoiceNo);
    expect(await M.Counter.countDocuments({})).toBe(1);
  });
});

d("offline scans (timestamped replay)", () => {
  beforeEach(() => { process.env.DEMO_RELAX_SLOT_CHECK = "true"; });
  async function booked() { const s = await site(20, 0, 5000, ALLDAY), u = { _id: oid() }; const b = await B.createBooking(u, input(s, 2), { allowPast: true }); const paid = (await pay(u, b)).booking; return { s, paid, code: B.ticketCode(paid.reference) }; }
  it("records an entry at the time it happened and keeps the audit note", async () => {
    const { s, paid, code } = await booked(), at = new Date(Date.now() - 20 * 60000);
    await B.recordEntry({ _id: oid(), role: "admin" }, code, "in", undefined, { at, note: "recorded offline, synced later" });
    const bk = await M.Booking.findById(paid._id).lean();
    expect(bk.checkedInAt.getTime()).toBe(at.getTime());
    expect(bk.history.some((h: any) => /offline/.test(h.note || ""))).toBe(true);
    expect((await M.EntryRecord.findOne({ booking: paid._id }).lean()).at.getTime()).toBe(at.getTime());
    expect(await B.getOccupancy(s.dest._id)).toBe(2);
  });
  it("still rejects tampered codes and wrong-day timestamps when replayed", async () => {
    const { code } = await booked(), st = { _id: oid(), role: "admin" };
    await expect(B.recordEntry(st, code.slice(0, -1) + "!", "in", undefined, { at: new Date() })).rejects.toMatchObject({ status: 409 });
    await expect(B.recordEntry(st, code, "in", undefined, { at: new Date(Date.now() - 3 * 86400000) })).rejects.toMatchObject({ status: 409 });
  });
  it("replays duplicates safely: the second identical entry is rejected", async () => {
    const { code } = await booked(), st = { _id: oid(), role: "admin" };
    await B.recordEntry(st, code, "in", undefined, { at: new Date() });
    await expect(B.recordEntry(st, code, "in", undefined, { at: new Date() })).rejects.toMatchObject({ status: 409 });
  });
});

const mgr = () => ({ _id: oid(), role: "admin" });
async function lot(dest: any, over: any = {}) {
  const base = { freeMinutes: 15, firstHourMinor: 5000, extraHourMinor: 3000, dailyMaxMinor: 20000 };
  return M.ParkingLot.create({ destination: dest._id, car: { capacity: 3, ...base }, two_wheeler: { capacity: 2, ...base }, bus: { capacity: 0, ...base }, ...over });
}

d("parking", () => {
  it("never exceeds capacity, rejects duplicates and unaccepted vehicle types", async () => {
    const s = await site(10), st = mgr(); const l = await lot(s.dest);
    for (const n of ["UP80AA1001", "UP80AA1002", "UP80AA1003"]) await PK.enterVehicle(st, { destinationId: String(s.dest._id), vehicleType: "car", vehicleNumber: n });
    await expect(PK.enterVehicle(st, { destinationId: String(s.dest._id), vehicleType: "car", vehicleNumber: "UP80AA1004" })).rejects.toMatchObject({ status: 409 });
    expect((await M.ParkingLot.findById(l._id).lean()).car.occupied).toBe(3);
    await expect(PK.enterVehicle(st, { destinationId: String(s.dest._id), vehicleType: "two_wheeler", vehicleNumber: "up81bb2001" })).resolves.toBeTruthy();
    await expect(PK.enterVehicle(st, { destinationId: String(s.dest._id), vehicleType: "two_wheeler", vehicleNumber: "UP-81 BB 2001" })).rejects.toMatchObject({ status: 409 }); // same vehicle already parked
    expect((await M.ParkingLot.findById(l._id).lean()).two_wheeler.occupied).toBe(1);           // failed duplicate released its space
    await expect(PK.enterVehicle(st, { destinationId: String(s.dest._id), vehicleType: "bus", vehicleNumber: "UP32BB0001" })).rejects.toMatchObject({ status: 409 });
    await expect(PK.enterVehicle(st, { destinationId: String(s.dest._id), vehicleType: "car", vehicleNumber: "x" })).rejects.toMatchObject({ status: 400 });
  });
  it("charges by time parked at exit, needs a payment method when a fee is due, and frees the space once", async () => {
    const s = await site(10), st = mgr(); const l = await lot(s.dest);
    const t = await PK.enterVehicle(st, { destinationId: String(s.dest._id), vehicleType: "car", vehicleNumber: "UP80CC2001" });
    await M.ParkingTicket.updateOne({ _id: t._id }, { entryAt: new Date(Date.now() - 125 * 60000) });          // parked ~2h05m -> 3 started hours
    await expect(PK.exitVehicle(st, { ticketNo: t.ticketNo })).rejects.toMatchObject({ status: 400 });
    const r = await PK.exitVehicle(st, { ticketNo: t.ticketNo, method: "cash" });
    expect(r.feeMinor).toBe(5000 + 2 * 3000); expect(r.ticket).toMatchObject({ status: "exited", method: "cash" });
    expect((await M.ParkingLot.findById(l._id).lean()).car.occupied).toBe(0);
    await expect(PK.exitVehicle(st, { ticketNo: t.ticketNo, method: "cash" })).rejects.toMatchObject({ status: 404 });
    expect((await M.ParkingLot.findById(l._id).lean()).car.occupied).toBe(0);
    await PK.enterVehicle(st, { destinationId: String(s.dest._id), vehicleType: "car", vehicleNumber: "UP80CC2001" }); // can park again after exiting
  });
  it("short stays are free and need no payment method; staff can't touch other sites", async () => {
    const s = await site(10), other = await site(10), st = mgr(); await lot(s.dest);
    const t = await PK.enterVehicle(st, { destinationId: String(s.dest._id), vehicleType: "two_wheeler", vehicleNumber: "UP80DD3001" });
    expect((await PK.exitVehicle(st, { ticketNo: t.ticketNo })).feeMinor).toBe(0);
    const staff = { _id: oid(), role: "staff", assignedDestinations: [other.dest._id] };
    await expect(PK.enterVehicle(staff, { destinationId: String(s.dest._id), vehicleType: "car", vehicleNumber: "UP80EE4001" })).rejects.toMatchObject({ status: 403 });
  });
});

async function passSetup(extra: any = {}) {
  const a = await site(50), b = await site(50), c = await site(50);
  const type = await M.PassType.create({ name: "Test Pass", destinations: [a.dest._id, b.dest._id], validityDays: 3, priceMinor: 40000, maxEntriesPerDay: 1, ...extra });
  const user = { _id: oid(), email: "p@example.com" };
  return { a, b, c, type, user };
}
const buyPass = (u: any, t: any, extra: any = {}) => PS.purchasePass(u, { passTypeId: String(t._id), holderName: "Pass Holder", idempotencyKey: "pass-key-" + crypto.randomUUID(), ...extra });

d("season passes", () => {
  it("is sold once per idempotency key with the fee, GST and an invoice, valid for the right dates", async () => {
    const { type, user } = await passSetup();
    const key = "pass-key-fixed-1", p1 = await PS.purchasePass(user, { passTypeId: String(type._id), holderName: "Asha", idempotencyKey: key }), p2 = await PS.purchasePass(user, { passTypeId: String(type._id), holderName: "Asha", idempotencyKey: key });
    expect(String(p1._id)).toBe(String(p2._id));
    expect(p1).toMatchObject({ status: "active", subtotalMinor: 40000, feesMinor: 800, totalMinor: 40000 + 800 + 144 });
    expect(p1.invoiceNo).toMatch(/^HH\/\d{4}-\d{2}\/\d{6}$/);
    expect(p1.validTo).toBe(U.addDays(p1.validFrom, 2));
    expect(await M.Pass.countDocuments({})).toBe(1);
  });
  it("leaves nothing behind when the payment fails, and rejects bad start dates", async () => {
    const { type, user } = await passSetup();
    await expect(buyPass(user, type, { simulateFailure: true })).rejects.toMatchObject({ status: 402 });
    expect(await M.Pass.countDocuments({})).toBe(0);
    await expect(buyPass(user, type, { startDate: U.addDays(U.todayIST(), -1) })).rejects.toMatchObject({ status: 400 });
    await expect(buyPass(user, type, { startDate: U.addDays(U.todayIST(), 200) })).rejects.toMatchObject({ status: 400 });
  });
  it("admits at covered sites, blocks double entry, counts toward occupancy, and exits", async () => {
    const { a, c, type, user } = await passSetup(); const pass = await buyPass(user, type), code = PS.passCode(pass.reference), st = mgr();
    const occ0 = await B.getOccupancy(a.dest._id);
    const r = await SC.recordAny(st, code, "in", { destinationId: String(a.dest._id) });
    expect(r).toMatchObject({ kind: "pass", quantity: 1 }); expect(await B.getOccupancy(a.dest._id)).toBe(occ0 + 1);
    await expect(SC.recordAny(st, code, "in", { destinationId: String(a.dest._id) })).rejects.toMatchObject({ status: 409 });   // already inside
    await expect(SC.recordAny(st, code, "out", { destinationId: String((await site(5)).dest._id) })).rejects.toMatchObject({ status: 409 }); // not inside there
    await SC.recordAny(st, code, "out", { destinationId: String(a.dest._id) });
    expect(await B.getOccupancy(a.dest._id)).toBe(occ0);
    await expect(SC.recordAny(st, code, "in", { destinationId: String(a.dest._id) })).rejects.toMatchObject({ status: 409 });   // daily limit (1/day) reached
    await expect(SC.recordAny(st, code, "in", { destinationId: String(c.dest._id) })).rejects.toMatchObject({ status: 409 });   // site not covered
  });
  it("respects multiple entries per day, validity dates, cancellation and tampering", async () => {
    const { a, type, user } = await passSetup({ maxEntriesPerDay: 2 }); const pass = await buyPass(user, type), code = PS.passCode(pass.reference), st = mgr(), dest = String(a.dest._id);
    for (let i = 0; i < 2; i++) { await SC.recordAny(st, code, "in", { destinationId: dest }); await SC.recordAny(st, code, "out", { destinationId: dest }); }
    await expect(SC.recordAny(st, code, "in", { destinationId: dest })).rejects.toMatchObject({ status: 409 });
    expect((await M.Pass.findById(pass._id).lean()).totalEntries).toBe(2);
    const later = new Date(Date.now() + 5 * 86400000);
    expect((await SC.verifyAny(st, code, { destinationId: dest })).valid).toBe(true);
    await expect(PS.validatePass(st, code, "in", dest, later)).resolves.toMatchObject({ valid: false });
    expect((await PS.validatePass(st, code.slice(0, -1) + "!", "in", dest)).valid).toBe(false);
    await M.Pass.updateOne({ _id: pass._id }, { status: "cancelled" });
    expect((await PS.validatePass(st, code, "in", dest)).reasons.join()).toMatch(/cancelled/);
  });
  it("needs a site to be chosen when staff cover several, and enforces assignment", async () => {
    const { a, b, type, user } = await passSetup(); const pass = await buyPass(user, type), code = PS.passCode(pass.reference);
    const two = { _id: oid(), role: "staff", assignedDestinations: [a.dest._id, b.dest._id] };
    expect((await PS.validatePass(two, code, "verify")).reasons.join()).toMatch(/Choose which site/);
    expect((await PS.validatePass({ _id: oid(), role: "staff", assignedDestinations: [a.dest._id] }, code, "verify")).valid).toBe(true);
    await expect(PS.validatePass({ _id: oid(), role: "staff", assignedDestinations: [b.dest._id] }, code, "verify", String(a.dest._id))).rejects.toMatchObject({ status: 403 });
  });
});

async function groupSetup(capacity = 100) {
  const s = await site(capacity, 5, 10000), user = { _id: oid(), name: "Teacher", email: "t@example.com" };
  const req = await M.GroupRequest.create({ user: user._id, destination: s.dest._id, organisation: "Test School", orgType: "school", size: 30, category: s.cat._id, date: s.date, contact: { name: "Teacher", email: "t@example.com", phone: "9876543210" } });
  return { s, user, req: req.toObject() };
}
d("group bookings", () => {
  it("approval holds seats for the whole group with the concession applied, and ignores the online ticket cap", async () => {
    const { s, req } = await groupSetup();
    const r = await GR.approveGroup(mgr(), req, { slotId: s.slot._id, discountPct: 50, holdHours: 48, note: "ok" });
    expect(r.booking).toMatchObject({ channel: "group", status: "pending", quantity: 30, discountPct: 50, grossMinor: 300000, discountMinor: 150000, subtotalMinor: 150000, groupName: "Test School" });
    expect(await booked(s)).toBe(30);
    expect(r.booking.holdExpiresAt.getTime() - Date.now()).toBeGreaterThan(47 * 3600000);
    expect((await M.GroupRequest.findById(req._id).lean()).status).toBe("approved");
  });
  it("can be paid like any booking and then shows as paid; the hold survives the 10-minute online timeout", async () => {
    const { s, user, req } = await groupSetup();
    const r = await GR.approveGroup(mgr(), req, { slotId: s.slot._id, discountPct: 20, holdHours: 24 });
    await B.releaseExpired(); expect((await M.Booking.findById(r.booking._id).lean()).status).toBe("pending");
    const paid = (await pay(user, r.booking)).booking;
    expect(paid.status).toBe("confirmed"); expect(paid.invoiceNo).toBeTruthy();
    const [d] = await GR.decorateRequests([(await M.GroupRequest.findById(req._id).lean())]); expect(d.displayStatus).toBe("paid");
  });
  it("expires when unpaid, releasing the seats", async () => {
    const { s, req } = await groupSetup();
    const r = await GR.approveGroup(mgr(), req, { slotId: s.slot._id, discountPct: 0, holdHours: 24 });
    await M.Booking.updateOne({ _id: r.booking._id }, { holdExpiresAt: new Date(Date.now() - 1000) }); await B.releaseExpired();
    expect(await booked(s)).toBe(0);
    const [d] = await GR.decorateRequests([(await M.GroupRequest.findById(req._id).lean())]); expect(d.displayStatus).toBe("expired");
  });
  it("fails cleanly when the group does not fit, and decisions are final and site-scoped", async () => {
    const { s, req } = await groupSetup(20);
    await expect(GR.approveGroup(mgr(), req, { slotId: s.slot._id, discountPct: 0, holdHours: 24 })).rejects.toMatchObject({ status: 409 });
    expect(await booked(s)).toBe(0);
    await expect(GR.approveGroup({ _id: oid(), role: "operator", assignedDestinations: [] }, req, { discountPct: 0, holdHours: 24 })).rejects.toMatchObject({ status: 403 });
    await GR.rejectGroup(mgr(), req, "Not available");
    await expect(GR.approveGroup(mgr(), req, { slotId: s.slot._id, discountPct: 0, holdHours: 24 })).rejects.toMatchObject({ status: 409 });
    await expect(GR.rejectGroup(mgr(), req)).rejects.toMatchObject({ status: 409 });
  });
  it("picks a slot that can hold the group when none is named", async () => {
    const { s, req } = await groupSetup(40);
    await M.TimeSlot.updateOne({ _id: s.slot._id }, { booked: 35 });
    const r = await GR.approveGroup(mgr(), { ...req, preferredStart: s.slot.start }, { discountPct: 0, holdHours: 24 });
    expect(r.booking.start).not.toBe(s.slot.start);                       // preferred slot is too full
    const near = Math.abs(U.toMin(r.booking.start) - U.toMin(s.slot.start));
    expect(near).toBe(60);                                                // the nearest slot that fits (one slot away)
  });
});
