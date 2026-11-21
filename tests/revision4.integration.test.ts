/**
 * Integration tests: credit notes, UPI blocking, pass refunds and reminders, roster attendance and swaps, loyalty expiry and adjustments.
 * Run with: MONGODB_URI_TEST=mongodb://127.0.0.1:27017/hh_test npx vitest run tests/revision4.integration.test.ts   (wipes that database)
 */
import crypto from "crypto";
import mongoose from "mongoose";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";

const URI = process.env.MONGODB_URI_TEST;
const d = describe.skipIf(!URI);
let M: any, B: any, PK: any, PP: any, U: any, S: any, AT: any, LY: any, CO: any;
const oid = () => new mongoose.Types.ObjectId();

beforeAll(async () => {
  if (!URI) return;
  process.env.MONGODB_URI = URI;
  const { connectDB } = await import("@/lib/db"); await connectDB();
  M = await import("@/models"); B = await import("@/lib/booking"); PK = await import("@/lib/parking"); PP = await import("@/lib/parking-passes"); U = await import("@/lib/utils"); S = await import("@/lib/slots");
  AT = await import("@/lib/attendance"); LY = await import("@/lib/loyalty"); CO = await import("@/lib/collect");
  await Promise.all(Object.values(M).map((m: any) => m.syncIndexes?.()));
});
beforeEach(async () => { if (URI) { for (const m of Object.values(M)) await (m as any).deleteMany?.({}); process.env.DEMO_RELAX_SLOT_CHECK = "true"; process.env.RATE_LIMIT_DISABLED = "true"; } });

async function site(over: any = {}, opOver: any = null) {
  const op = opOver ? await M.Operator.create({ name: "Op", slug: "op" + oid(), ...opOver }) : null;
  const dest = await M.Destination.create({ slug: "s" + oid(), name: "Test Fort", city: "Agra", state: "UP", type: "fort", shortDescription: "A test fort", location: { lat: 27, lng: 78 }, hours: { open: "00:00", close: "23:59", closedDays: [] }, defaultSlotCapacity: 50, occupancyLimit: 500, operator: op?._id, ...over });
  const cat = await M.TicketCategory.create({ destination: dest._id, name: "Indian", audience: "indian", priceMinor: 5000 });
  return { dest, cat, op };
}
const rate = { freeMinutes: 15, firstHourMinor: 5000, extraHourMinor: 3000, dailyMaxMinor: 20000 };
const lot = (dest: any, over: any = {}) => M.ParkingLot.create({ destination: dest._id, reservablePct: 30, car: { capacity: 10, ...rate }, two_wheeler: { capacity: 4, ...rate }, bus: { capacity: 0, ...rate }, ...over });
const mkUser = (role: string, over: any = {}) => M.User.create({ name: `${role} ${oid()}`.slice(0, 22), email: `${oid()}@t.test`, passwordHash: "x", role, ...over }).then((u: any) => u.toObject());
const admin = () => ({ _id: oid(), role: "admin", name: "Admin" });
const sale = (s: any, over: any = {}) => ({ destinationId: String(s.dest._id), items: [{ categoryId: String(s.cat._id), quantity: 2 }], method: "cash" as const, idempotencyKey: crypto.randomUUID(), checkIn: false, ...over });
const futureBooking = async (owner: any, s: any, qty = 2) => {
  const slot = (await S.ensureSlots(s.dest, U.addDays(U.todayIST(), 3)))[2];
  const b = await B.createBooking(owner, { destinationId: String(s.dest._id), slotId: slot._id, items: [{ categoryId: String(s.cat._id), quantity: qty }], visitors: Array.from({ length: qty }, (_, i) => ({ name: `V${i}` })), contact: { name: owner.name, email: owner.email, phone: "9876543210" } });
  await B.payBooking(owner, { bookingId: String(b._id), method: "upi", idempotencyKey: crypto.randomUUID() });
  return M.Booking.findById(b._id).lean();
};

d("credit notes", () => {
  it("issues one numbered credit note when an online refund is paid, reversing GST in proportion", async () => {
    const s = await site(), u = await mkUser("tourist"), b = await futureBooking(u, s);
    expect(b.invoiceNo).toMatch(/^HH\//); expect(b.taxMinor).toBeGreaterThan(0);
    const cancelled = await B.cancelBooking(b, u, "Plans changed");
    expect(cancelled.refundMinor).toBeGreaterThan(0); expect(cancelled.creditNoteNo).toMatch(/^CN\/\d{4}-\d{2}\/\d{6}$/);
    expect(cancelled.creditNoteMinor).toBe(cancelled.refundMinor);
    expect(cancelled.creditNoteTaxMinor).toBe(Math.round((b.taxMinor * cancelled.refundMinor) / b.totalMinor));
    const again = await M.Booking.findById(b._id).lean(); expect(again.creditNoteNo).toBe(cancelled.creditNoteNo);
  });
  it("numbers credit notes sequentially and writes none when nothing is refunded", async () => {
    const s = await site(), st = await mkUser("staff", { assignedDestinations: [s.dest._id] });
    const a = await B.counterSale(st, sale(s)), c = await B.counterSale(st, sale(s));
    const r1 = await B.counterRefund(st, { reference: a.booking.reference, reason: "Wrong date" }), r2 = await B.counterRefund(st, { reference: c.booking.reference, reason: "Wrong date" });
    const n1 = Number(r1.booking.creditNoteNo.split("/").pop()), n2 = Number(r2.booking.creditNoteNo.split("/").pop());
    expect(n2).toBe(n1 + 1); expect(r1.booking.creditNoteTaxMinor).toBe(0); // counter sales carry no convenience-fee GST
  });
});

d("UPI blocking until a UPI ID is set", () => {
  const prev = process.env.PLATFORM_UPI_ID;
  it("refuses UPI at the counter, at parking exit and on a pass sale when the operator blocked the demo QR, but never cash", async () => {
    delete process.env.PLATFORM_UPI_ID;
    const s = await site({}, { blockDemoUpi: true }); await lot(s.dest, { monthlyPass: { car: 100000, two_wheeler: 0, bus: 0, maxPerType: 0 } });
    const st = await mkUser("staff", { assignedDestinations: [s.dest._id] });
    expect(await CO.upiStatus(s.dest._id)).toEqual({ demo: true, blocked: true });
    await expect(B.counterSale(st, sale(s, { method: "upi", payment: { reference: "UPI123456789" } }))).rejects.toMatchObject({ status: 409 });
    expect((await B.counterSale(st, sale(s))).booking.status).toBe("confirmed");
    await expect(CO.upiQr(s.dest._id, 5000, "x")).rejects.toMatchObject({ status: 409 });
    await expect(PP.sellParkingPass(st, "staff", { destinationId: String(s.dest._id), vehicleType: "car", vehicleNumber: "UP80UB1111", holderName: "Holder", method: "upi", payment: { reference: "UPI123456789" }, idempotencyKey: crypto.randomUUID() })).rejects.toMatchObject({ status: 409 });
    const t = await PK.enterVehicle(st, { destinationId: String(s.dest._id), vehicleType: "car", vehicleNumber: "UP80UB2222" });
    await M.ParkingTicket.updateOne({ _id: t._id }, { entryAt: new Date(Date.now() - 110 * 60000) });
    await expect(PK.exitVehicle(st, { ticketNo: t.ticketNo, method: "upi", details: { reference: "UPI123456789" } })).rejects.toMatchObject({ status: 409 });
    expect((await PK.exitVehicle(st, { ticketNo: t.ticketNo, method: "cash" })).dueMinor).toBe(8000);
    process.env.PLATFORM_UPI_ID = prev as any; if (prev === undefined) delete process.env.PLATFORM_UPI_ID;
  });
  it("allows UPI once the operator has its own UPI ID, or when blocking is off", async () => {
    delete process.env.PLATFORM_UPI_ID;
    const set = await site({}, { blockDemoUpi: true, upiId: "fort.trust@sbi" }), off = await site({}, { blockDemoUpi: false });
    expect(await CO.upiStatus(set.dest._id)).toEqual({ demo: false, blocked: false });
    expect(await CO.upiStatus(off.dest._id)).toEqual({ demo: true, blocked: false });
    expect((await CO.upiQr(set.dest._id, 5000, "x")).demo).toBe(false);
    if (prev !== undefined) process.env.PLATFORM_UPI_ID = prev;
  });
});

d("monthly pass refunds and reminders", () => {
  const sellFor = (a: any, s: any, over: any = {}) => PP.sellParkingPass(a, over.channel || "staff", { destinationId: String(s.dest._id), vehicleType: "car", vehicleNumber: "UP80PR1234", holderName: "Meera", method: over.method || "cash", idempotencyKey: crypto.randomUUID(), ...over.input });
  it("refunds the unused days pro rata, issues a credit note with the GST reversed, and frees the vehicle for a new pass", async () => {
    const s = await site(); await lot(s.dest, { gstPct: 18, monthlyPass: { car: 90000, two_wheeler: 0, bus: 0, maxPerType: 0 } });
    const a = admin(), r = await sellFor(a, s);
    await M.ParkingPass.updateOne({ _id: r.pass._id }, { validFrom: U.addDays(U.todayIST(), -9), validTo: U.addDays(U.todayIST(), 20), entries: 3 }); // 30 days, 9 used, 20 left after today
    expect(PP.passRefundMinor({ priceMinor: 90000, validFrom: U.addDays(U.todayIST(), -9), validTo: U.addDays(U.todayIST(), 20), entries: 3 }, "prorata")).toBe(60000);
    await expect(PP.cancelParkingPass(a, String(r.pass._id), { refund: "full", reason: "Moved away" })).rejects.toMatchObject({ status: 400 }); // used pass can't be fully refunded
    await expect(PP.cancelParkingPass(a, String(r.pass._id), { refund: "prorata", reason: "" })).rejects.toMatchObject({ status: 400 });
    const c = await PP.cancelParkingPass(a, String(r.pass._id), { refund: "prorata", reason: "Moved away", method: "cash" });
    expect(c.status).toBe("cancelled"); expect(c.refundMinor).toBe(60000); expect(c.creditNoteNo).toMatch(/^CN\//); expect(c.creditNoteGstMinor).toBe(Math.round((60000 * 18) / 118));
    await expect(PP.cancelParkingPass(a, String(r.pass._id), { refund: "none", reason: "again" })).rejects.toMatchObject({ status: 409 });
    expect((await sellFor(a, s)).pass.status).toBe("active");
  });
  it("refunds an online pass to the original method and records the payment", async () => {
    const s = await site(); await lot(s.dest, { monthlyPass: { car: 80000, two_wheeler: 0, bus: 0, maxPerType: 0 } });
    const u = await mkUser("tourist"), r = await PP.sellParkingPass(u, "online", { destinationId: String(s.dest._id), vehicleType: "car", vehicleNumber: "UP80ON5555", holderName: "Visitor", method: "upi", idempotencyKey: crypto.randomUUID() });
    const c = await PP.cancelParkingPass(admin(), String(r.pass._id), { refund: "full", reason: "Bought by mistake" });
    expect(c.refundMinor).toBe(80000); expect(c.refundMethod).toBe("original payment method");
    expect(await M.Payment.countDocuments({ user: u._id, type: "refund", amountMinor: 80000 })).toBe(1);
  });
  it("reminds each expiring pass once, skips renewed ones and ones with no contact details", async () => {
    const s = await site(); await lot(s.dest, { monthlyPass: { car: 80000, two_wheeler: 40000, bus: 0, maxPerType: 0 } });
    const a = admin(), today = U.todayIST();
    const mk = async (vn: string, left: number, extra: any = {}) => { const r = await PP.sellParkingPass(a, "staff", { destinationId: String(s.dest._id), vehicleType: "car", vehicleNumber: vn, holderName: "H " + vn, method: "cash", idempotencyKey: crypto.randomUUID(), ...extra }); await M.ParkingPass.updateOne({ _id: r.pass._id }, { validFrom: U.addDays(today, left - 29), validTo: U.addDays(today, left) }); return r.pass; };
    const soon = await mk("UP80RM1111", 3, { holderEmail: "a@example.com" }), none = await mk("UP80RM2222", 2), far = await mk("UP80RM3333", 20, { holderEmail: "c@example.com" });
    const renewing = await mk("UP80RM4444", 4, { holderEmail: "d@example.com" });
    await M.ParkingPass.create({ reference: "PP-RENEW1", idemKey: "k-renew", activeKey: `done:renew`, destination: s.dest._id, lot: renewing.lot, vehicleType: "car", vehicleNumber: "UP80RM4444", holderName: "H", validFrom: U.addDays(today, 5), validTo: U.addDays(today, 34), priceMinor: 1, status: "active" });
    const r1 = await PP.remindExpiringPasses(null, today);
    expect(r1).toMatchObject({ reminded: 1, noContact: 1, alreadyRenewed: 1 });
    expect((await M.ParkingPass.findById(soon._id).lean()).reminderSentAt).toBeTruthy(); expect((await M.ParkingPass.findById(far._id).lean()).reminderSentAt).toBeUndefined(); expect((await M.ParkingPass.findById(none._id).lean()).reminderSentAt).toBeUndefined();
    expect((await PP.remindExpiringPasses(null, today)).reminded).toBe(0); // once only
    await M.ParkingPass.updateOne({ _id: none._id }, { holderPhone: "9876543210" });
    expect((await PP.remindExpiringPasses(null, today)).reminded).toBe(1); // now reachable
  });
});

d("roster attendance", () => {
  const nowShift = () => { const m = U.istParts().minutes, p = (n: number) => `${String(Math.floor(n / 60)).padStart(2, "0")}:${String(n % 60).padStart(2, "0")}`; return m > 1380 ? { start: "00:00", end: "23:59" } : { start: p(Math.max(0, m - 10)), end: p(Math.min(1439, m + 120)) }; };
  async function rostered(s: any, user: any, over: any = {}) { const t = nowShift(); return M.RosterShift.create({ operator: s.dest.operator, destination: s.dest._id, user: user._id, userName: user.name, date: U.todayIST(), ...t, position: "gate", ...over }); }
  it("matches a clock-in to the rostered shift, records lateness, and refuses a second open clock-in", async () => {
    const s = await site(), u = await mkUser("staff", { assignedDestinations: [s.dest._id] }), sh = await rostered(s, u);
    const r = await AT.clockIn(u, String(s.dest._id));
    expect(String(r.attendance.shift)).toBe(String(sh._id)); expect(r.unrostered).toBe(false); expect(r.lateMin).toBeGreaterThanOrEqual(0);
    await expect(AT.clockIn(u, String(s.dest._id))).rejects.toMatchObject({ status: 409 });
    expect((await AT.attendanceStatus(u)).open).toBeTruthy();
    const out = await AT.clockOut(u); expect(out.outAt).toBeTruthy();
    await expect(AT.clockOut(u)).rejects.toMatchObject({ status: 409 });
    expect((await AT.clockIn(u, String(s.dest._id))).attendance._id).toBeTruthy(); // can clock in again after clocking out
  });
  it("flags a clock-in with no rostered shift, and refuses a site the person isn't assigned to", async () => {
    const s = await site(), u = await mkUser("staff", { assignedDestinations: [s.dest._id] });
    expect((await AT.clockIn(u, String(s.dest._id))).unrostered).toBe(true);
    await expect(AT.clockIn(await mkUser("staff", { assignedDestinations: [oid()] }), String(s.dest._id))).rejects.toMatchObject({ status: 403 });
  });
  it("closes a clock-in that was never closed and flags it", async () => {
    const s = await site(), u = await mkUser("staff", { assignedDestinations: [s.dest._id] });
    const a = await M.Attendance.create({ user: u._id, userName: u.name, destination: s.dest._id, date: U.todayIST(), inAt: new Date(Date.now() - 20 * 3600000), openKey: String(u._id) });
    await AT.closeStale();
    const done = await M.Attendance.findById(a._id).lean(); expect(done.autoClosed).toBe(true); expect(done.outAt).toBeTruthy();
    expect((await AT.attendanceStatus(u)).open).toBeNull();
  });
  it("reports rostered against worked hours, no-shows, lateness and counter sales outside the shift", async () => {
    const s = await site(), u = await mkUser("staff", { assignedDestinations: [s.dest._id] }), y = U.addDays(U.todayIST(), -1);
    await M.RosterShift.create({ destination: s.dest._id, user: u._id, userName: u.name, date: y, start: "09:00", end: "13:00" });            // worked, 10 minutes late
    await M.RosterShift.create({ destination: s.dest._id, user: u._id, userName: u.name, date: U.addDays(y, -1), start: "09:00", end: "13:00" }); // no-show
    const sh = (await M.RosterShift.findOne({ date: y }).lean());
    await M.Attendance.create({ user: u._id, userName: u.name, destination: s.dest._id, date: y, shift: sh._id, inAt: new Date(`${y}T09:10:00+05:30`), outAt: new Date(`${y}T12:40:00+05:30`), lateMin: 10, openKey: `done:x` });
    const mk = async (hhmm: string) => { const b = await B.counterSale(u, sale(s)); await M.Booking.collection.updateOne({ _id: b.booking._id }, { $set: { createdAt: new Date(`${y}T${hhmm}:00+05:30`) } }); };
    await mk("10:00"); await mk("18:30"); // one inside the shift, one outside
    const rep = await AT.attendanceReport(null, U.addDays(y, -1), y);
    const row = rep.rows.find((r: any) => r.userId === String(u._id));
    expect(row).toMatchObject({ shifts: 2, rosteredHours: 8, workedHours: 3.5, noShows: 1, lateCount: 1, lateMinutes: 10, counterSales: 2, outsideShiftSales: 1 });
  });
});

d("shift swaps", () => {
  async function setup() {
    const s = await site(), a = await mkUser("staff", { assignedDestinations: [s.dest._id] }), b = await mkUser("staff", { assignedDestinations: [s.dest._id] });
    const shift = await M.RosterShift.create({ destination: s.dest._id, user: a._id, userName: a.name, date: U.addDays(U.todayIST(), 2), start: "09:00", end: "13:00" });
    return { s, a, b, shift };
  }
  it("moves the shift to the colleague only after they agree AND a manager approves", async () => {
    const { a, b, shift } = await setup();
    const req = await AT.requestSwap(a, { shiftId: String(shift._id), toUserId: String(b._id), note: "Family function" });
    expect(req.status).toBe("pending_colleague");
    await expect(AT.requestSwap(a, { shiftId: String(shift._id), toUserId: String(b._id) })).rejects.toMatchObject({ status: 409 }); // one open request per shift
    await expect(AT.respondSwap(a, String(req._id), true)).rejects.toMatchObject({ status: 404 }); // only the colleague can answer
    await expect(AT.decideSwap(admin(), String(req._id), true)).rejects.toMatchObject({ status: 409 }); // not yet agreed
    expect((await AT.respondSwap(b, String(req._id), true)).status).toBe("pending_manager");
    expect(String((await M.RosterShift.findById(shift._id).lean()).user)).toBe(String(a._id)); // unchanged so far
    const done = await AT.decideSwap(admin(), String(req._id), true);
    expect(done.status).toBe("approved");
    const moved = await M.RosterShift.findById(shift._id).lean(); expect(String(moved.user)).toBe(String(b._id)); expect(moved.userName).toBe(b.name); expect(moved.notes).toMatch(/Covered for/);
    await expect(AT.decideSwap(admin(), String(req._id), true)).rejects.toMatchObject({ status: 409 });
  });
  it("lets the colleague decline or the requester cancel, and then a new request can be made", async () => {
    const { a, b, shift } = await setup();
    const r1 = await AT.requestSwap(a, { shiftId: String(shift._id), toUserId: String(b._id) });
    expect((await AT.respondSwap(b, String(r1._id), false)).status).toBe("declined");
    const r2 = await AT.requestSwap(a, { shiftId: String(shift._id), toUserId: String(b._id) });
    expect((await AT.cancelSwap(a, String(r2._id))).status).toBe("cancelled");
    expect((await AT.requestSwap(a, { shiftId: String(shift._id), toUserId: String(b._id) })).status).toBe("pending_colleague");
  });
  it("refuses swaps with a colleague who is double-booked, someone off-site, a shift about to start, or a shift that isn't yours", async () => {
    const { s, a, b, shift } = await setup();
    await M.RosterShift.create({ destination: s.dest._id, user: b._id, userName: b.name, date: shift.date, start: "12:00", end: "15:00" });
    await expect(AT.requestSwap(a, { shiftId: String(shift._id), toUserId: String(b._id) })).rejects.toMatchObject({ status: 409 });
    const out = await mkUser("staff", { assignedDestinations: [oid()] });
    await expect(AT.requestSwap(a, { shiftId: String(shift._id), toUserId: String(out._id) })).rejects.toMatchObject({ status: 404 });
    await expect(AT.requestSwap(b, { shiftId: String(shift._id), toUserId: String(a._id) })).rejects.toMatchObject({ status: 404 });
    const soon = await M.RosterShift.create({ destination: s.dest._id, user: a._id, userName: a.name, date: U.todayIST(), start: "00:00", end: "23:59" });
    await expect(AT.requestSwap(a, { shiftId: String(soon._id), toUserId: String(b._id) })).rejects.toMatchObject({ status: 409 });
  });
  it("fails safely at approval if the colleague got a clashing shift meanwhile, and only managers of that site can decide", async () => {
    const { s, a, b, shift } = await setup();
    const req = await AT.requestSwap(a, { shiftId: String(shift._id), toUserId: String(b._id) }); await AT.respondSwap(b, String(req._id), true);
    await M.RosterShift.create({ destination: s.dest._id, user: b._id, userName: b.name, date: shift.date, start: "10:00", end: "11:00" });
    const outsider = { _id: oid(), role: "operator", name: "Other", operator: oid(), assignedDestinations: [oid()] };
    await expect(AT.decideSwap(outsider, String(req._id), true)).rejects.toMatchObject({ status: 404 });
    await expect(AT.decideSwap(admin(), String(req._id), true)).rejects.toMatchObject({ status: 409 });
    expect((await M.SwapRequest.findById(req._id).lean()).status).toBe("failed");
    expect(String((await M.RosterShift.findById(shift._id).lean()).user)).toBe(String(a._id));
  });
});

d("loyalty expiry and manual adjustments", () => {
  it("expires points past their date once, writes the ledger entry, and lowers the balance", async () => {
    const u = await mkUser("tourist");
    await LY.addPoints({ user: u._id, type: "earn", points: 100, key: "e1" }); await LY.addPoints({ user: u._id, type: "earn", points: 50, key: "e2" });
    const e1 = await M.LoyaltyEntry.findOne({ key: "e1" }).lean(); expect(e1.remaining).toBe(100); expect(e1.expiresAt.getTime()).toBeGreaterThan(Date.now() + 300 * 86400000);
    await M.LoyaltyEntry.updateOne({ key: "e1" }, { expiresAt: new Date(Date.now() - 1000) });
    const s1 = await LY.loyaltySummary(u._id); expect(s1.balance).toBe(50);
    expect(await M.LoyaltyEntry.countDocuments({ user: u._id, type: "expire" })).toBe(1);
    expect((await LY.loyaltySummary(u._id)).balance).toBe(50); expect(await M.LoyaltyEntry.countDocuments({ user: u._id, type: "expire" })).toBe(1); // not expired twice
  });
  it("spends the oldest points first, so newer points survive when the older ones lapse", async () => {
    const u = await mkUser("tourist");
    await LY.addPoints({ user: u._id, type: "earn", points: 100, key: "old" }); await LY.addPoints({ user: u._id, type: "earn", points: 100, key: "new" });
    await M.LoyaltyEntry.updateOne({ key: "old" }, { expiresAt: new Date(Date.now() + 5 * 86400000) });
    await LY.spendPoints({ user: u._id, points: 60, key: "redeem:a" });
    expect((await M.LoyaltyEntry.findOne({ key: "old" }).lean()).remaining).toBe(40); expect((await M.LoyaltyEntry.findOne({ key: "new" }).lean()).remaining).toBe(100);
    const s = await LY.loyaltySummary(u._id); expect(s.balance).toBe(140); expect(s.expiringSoon).toMatchObject({ points: 40 });
    await M.LoyaltyEntry.updateOne({ key: "old" }, { expiresAt: new Date(Date.now() - 1000) });
    expect((await LY.loyaltySummary(u._id)).balance).toBe(100);
  });
  it("refuses to spend points that have already lapsed", async () => {
    const u = await mkUser("tourist");
    await LY.addPoints({ user: u._id, type: "earn", points: 30, key: "x" }); await M.LoyaltyEntry.updateOne({ key: "x" }, { expiresAt: new Date(Date.now() - 1000) });
    await expect(LY.spendPoints({ user: u._id, points: 10, key: "redeem:z" })).rejects.toMatchObject({ status: 409 });
  });
  it("lets a manager add or take back points with a reason, never below zero, and the grant expires like any other", async () => {
    const u = await mkUser("tourist"), mgr = { _id: oid(), name: "Manager" };
    expect(await LY.adjustPoints(mgr, u._id, 80, "Apology for the queue")).toBe(80);
    const e = await M.LoyaltyEntry.findOne({ user: u._id, type: "adjust" }).lean(); expect(e.note).toMatch(/Apology for the queue/); expect(e.expiresAt).toBeTruthy();
    await LY.adjustPoints(mgr, u._id, -30, "Duplicate grant");
    expect((await LY.loyaltySummary(u._id)).balance).toBe(50);
    await expect(LY.adjustPoints(mgr, u._id, -500, "Too much")).rejects.toMatchObject({ status: 409 });
    expect((await LY.loyaltySummary(u._id)).balance).toBe(50);
  });
});
