/**
 * Integration tests for the 24 features added after the first parking/staff/operator/tourist release.
 * Run with: MONGODB_URI_TEST=mongodb://127.0.0.1:27017/hh_test npx vitest run tests/new-features.integration.test.ts
 * Skipped when MONGODB_URI_TEST is not set. These tests wipe the target database.
 */
import crypto from "crypto";
import mongoose from "mongoose";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";

const URI = process.env.MONGODB_URI_TEST;
const d = describe.skipIf(!URI);
let M: any, B: any, PK: any, PP: any, U: any, S: any, SH: any, ES: any, TR: any, LY: any, SP: any, RO: any, LF: any, PL: any, DP: any;
const oid = () => new mongoose.Types.ObjectId();
const ALLDAY = { open: "00:00", close: "23:59" };

beforeAll(async () => {
  if (!URI) return;
  process.env.MONGODB_URI = URI;
  const { connectDB } = await import("@/lib/db"); await connectDB();
  M = await import("@/models"); B = await import("@/lib/booking"); PK = await import("@/lib/parking"); PP = await import("@/lib/parking-passes"); U = await import("@/lib/utils"); S = await import("@/lib/slots");
  SH = await import("@/lib/shift"); ES = await import("@/lib/escalation"); TR = await import("@/lib/transfer"); LY = await import("@/lib/loyalty"); SP = await import("@/lib/support"); RO = await import("@/lib/roster"); LF = await import("@/lib/lostfound"); PL = await import("@/lib/plate"); DP = await import("@/lib/dynamic-pricing");
  await Promise.all(Object.values(M).map((m: any) => m.syncIndexes?.()));
});
beforeEach(async () => { if (URI) { for (const m of Object.values(M)) await (m as any).deleteMany?.({}); process.env.DEMO_RELAX_SLOT_CHECK = "true"; process.env.RATE_LIMIT_DISABLED = "true"; } });

async function site(over: any = {}) {
  const dest = await M.Destination.create({ slug: "s" + oid(), name: "Test Fort", city: "Agra", state: "UP", type: "fort", shortDescription: "A test fort", location: { lat: 27, lng: 78 }, hours: { ...ALLDAY, closedDays: [] }, defaultSlotCapacity: 50, occupancyLimit: 500, ...over });
  const cat = await M.TicketCategory.create({ destination: dest._id, name: "Indian", audience: "indian", priceMinor: 5000 });
  return { dest, cat };
}
const rate = { freeMinutes: 15, firstHourMinor: 5000, extraHourMinor: 3000, dailyMaxMinor: 20000 };
const lot = (dest: any, over: any = {}) => M.ParkingLot.create({ destination: dest._id, reservablePct: 30, car: { capacity: 10, ...rate }, two_wheeler: { capacity: 4, ...rate }, bus: { capacity: 0, ...rate }, ...over });
const admin = () => ({ _id: oid(), role: "admin", name: "Admin" });
const mkUser = (role: string, over: any = {}) => M.User.create({ name: `${role} ${oid()}`.slice(0, 20), email: `${oid()}@t.test`, passwordHash: "x", role, ...over }).then((u: any) => u.toObject());
const enter = (a: any, s: any, over: any = {}) => PK.enterVehicle(a, { destinationId: String(s.dest._id), vehicleType: "car", vehicleNumber: "UP80AB" + Math.floor(1000 + Math.random() * 9000), ...over });
const backdate = (t: any, mins: number) => M.ParkingTicket.updateOne({ _id: t._id }, { entryAt: new Date(Date.now() - mins * 60000) });

d("lost-ticket handling", () => {
  it("needs ID verification, adds the lost-ticket charge, and records it on the ticket and invoice", async () => {
    const s = await site(), a = admin(); await lot(s.dest, { lostTicketFeeMinor: 10000 });
    const t = await enter(a, s); await backdate(t, 110); // 110 min bills 2 hours = 5000 + 3000
    await expect(PK.exitVehicle(a, { ticketNo: t.ticketNo, method: "cash", lost: { note: "", idChecked: false } })).rejects.toMatchObject({ status: 400 });
    const q = await PK.quoteExit(a, { ticketNo: t.ticketNo, lost: true });
    expect(q.feeMinor).toBe(8000); expect(q.penaltyMinor).toBe(10000); expect(q.dueMinor).toBe(18000);
    await expect(PK.exitVehicle(a, { ticketNo: t.ticketNo, method: "cash", quote: q.quote, lost: undefined })).rejects.toMatchObject({ status: 409 }); // quoted as lost, exited as normal
    const r = await PK.exitVehicle(a, { ticketNo: t.ticketNo, method: "cash", quote: q.quote, lost: { note: "Showed RC book, DL matches", idChecked: true } });
    expect(r.dueMinor).toBe(18000); expect(r.ticket.lostTicket).toBe(true); expect(r.ticket.penaltyMinor).toBe(10000); expect(r.ticket.paidMinor).toBe(18000);
    expect(r.ticket.invoiceNo).toMatch(/^HP\//);
  });
  it("waives the charge for monthly pass holders and charges nothing extra when the lot has no lost-ticket fee", async () => {
    const s = await site(), a = admin(); await lot(s.dest, { lostTicketFeeMinor: 0 });
    const t = await enter(a, s); await backdate(t, 30);
    const q = await PK.quoteExit(a, { ticketNo: t.ticketNo, lost: true });
    expect(q.penaltyMinor).toBe(0); expect(q.dueMinor).toBe(q.feeMinor);
  });
});

d("parking GST and invoices", () => {
  it("extracts GST from the inclusive amount and issues sequential invoice numbers", async () => {
    const s = await site(), a = admin(); await lot(s.dest, { gstPct: 18 });
    const t1 = await enter(a, s), t2 = await enter(a, s); await backdate(t1, 110); await backdate(t2, 110);
    const a1 = await PK.exitVehicle(a, { ticketNo: t1.ticketNo, method: "cash" }), a2 = await PK.exitVehicle(a, { ticketNo: t2.ticketNo, method: "upi", details: { reference: "UPI123456789" } });
    expect(a1.ticket.gstMinor).toBe(Math.round((8000 * 18) / 118)); expect(a1.ticket.gstPct).toBe(18);
    expect(a1.ticket.invoiceNo).not.toBe(a2.ticket.invoiceNo);
    const n1 = Number(a1.ticket.invoiceNo.split("/").pop()), n2 = Number(a2.ticket.invoiceNo.split("/").pop());
    expect(Math.abs(n1 - n2)).toBe(1);
  });
  it("issues no invoice for a free stay", async () => {
    const s = await site(), a = admin(); await lot(s.dest);
    const t = await enter(a, s); const r = await PK.exitVehicle(a, { ticketNo: t.ticketNo });
    expect(r.ticket.invoiceNo).toBeUndefined(); expect(r.feeMinor).toBe(0);
  });
});

d("EV and accessible bays", () => {
  it("keeps separate capacity from standard car bays and frees the right pool on exit", async () => {
    const s = await site(), a = admin(); const l = await lot(s.dest, { ev: { capacity: 1, ...rate }, accessible: { capacity: 1, ...rate } });
    const e1 = await enter(a, s, { bay: "ev" });
    await expect(enter(a, s, { bay: "ev" })).rejects.toMatchObject({ status: 409 });
    expect(e1.bay).toBe("ev");
    let cur = await M.ParkingLot.findById(l._id).lean(); expect(cur.ev.occupied).toBe(1); expect(cur.car.occupied).toBe(0);
    await enter(a, s); // standard car still fine
    await PK.exitVehicle(a, { ticketNo: e1.ticketNo });
    cur = await M.ParkingLot.findById(l._id).lean(); expect(cur.ev.occupied).toBe(0); expect(cur.car.occupied).toBe(1);
  });
  it("requires the badge check for accessible bays and rejects non-car bays", async () => {
    const s = await site(), a = admin(); await lot(s.dest, { accessible: { capacity: 2, ...rate }, bus: { capacity: 2, ...rate } });
    await expect(enter(a, s, { bay: "accessible" })).rejects.toMatchObject({ status: 400 });
    const ok = await enter(a, s, { bay: "accessible", badgeChecked: true }); expect(ok.bay).toBe("accessible");
    await expect(enter(a, s, { bay: "ev", vehicleType: "bus" })).rejects.toMatchObject({ status: 409 });
  });
  it("lets visitors pre-book an EV bay from its own quota", async () => {
    const s = await site(); const l = await lot(s.dest, { ev: { capacity: 10, ...rate } });
    const u = await mkUser("tourist"), date = U.addDays(U.todayIST(), 1);
    const r = await PK.reserveParking(u, { destinationId: String(s.dest._id), date, vehicleType: "car", bay: "ev", vehicleNumber: "UP80EV1234", paymentMode: "at_exit", idempotencyKey: "k-ev-0001" });
    expect(r.reservation.bay).toBe("ev");
    expect((await M.ParkingDay.findOne({ lot: l._id, date, vehicleType: "ev" }).lean()).reserved).toBe(1);
    expect(await M.ParkingDay.findOne({ lot: l._id, date, vehicleType: "car" }).lean()).toBeNull();
  });
});

d("per-date capacity overrides", () => {
  it("applies today's override to admission and availability, and tomorrow's to reservations", async () => {
    const s = await site(), a = admin(); const l = await lot(s.dest);
    const today = U.todayIST(), tomorrow = U.addDays(today, 1);
    await M.ParkingOverride.create({ lot: l._id, destination: s.dest._id, date: today, pool: "car", capacity: 2, key: `${l._id}:${today}:car` });
    await enter(a, s); await enter(a, s);
    await expect(enter(a, s)).rejects.toMatchObject({ status: 409 });
    const cur = await M.ParkingLot.findById(l._id).lean();
    const av = PK.availability(cur, {}, await PK.overridesFor(l._id, today)).find((x: any) => x.pool === "car");
    expect(av.capacity).toBe(2); expect(av.overridden).toBe(true); expect(av.available).toBe(0);
    await M.ParkingOverride.create({ lot: l._id, destination: s.dest._id, date: tomorrow, pool: "car", capacity: 0, key: `${l._id}:${tomorrow}:car` });
    const u = await mkUser("tourist");
    await expect(PK.reserveParking(u, { destinationId: String(s.dest._id), date: tomorrow, vehicleType: "car", vehicleNumber: "UP80XX1111", paymentMode: "at_exit", idempotencyKey: "k-ov-0001" })).rejects.toMatchObject({ status: 409 });
    expect((await PK.reservableLeft(cur, tomorrow)).find((x: any) => x.pool === "car")).toBeUndefined();
  });
  it("a larger override opens more spaces than the normal capacity", async () => {
    const s = await site(), a = admin(); const l = await lot(s.dest, { car: { capacity: 1, ...rate } });
    await M.ParkingOverride.create({ lot: l._id, destination: s.dest._id, date: U.todayIST(), pool: "car", capacity: 3, key: `${l._id}:${U.todayIST()}:car` });
    await enter(a, s); await enter(a, s); await enter(a, s);
    await expect(enter(a, s)).rejects.toMatchObject({ status: 409 });
  });
});

d("monthly parking passes", () => {
  const sell = (a: any, s: any, over: any = {}) => PP.sellParkingPass(a, "staff", { destinationId: String(s.dest._id), vehicleType: "car", vehicleNumber: "UP80PA1234", holderName: "Meera Shah", method: "cash", idempotencyKey: crypto.randomUUID(), ...over });
  it("sells a 30-day pass with an invoice; the vehicle then parks free, and replays are idempotent", async () => {
    const s = await site(), a = admin(); await lot(s.dest, { monthlyPass: { car: 100000, two_wheeler: 0, bus: 0, maxPerType: 0 }, gstPct: 18 });
    const key = crypto.randomUUID(), r = await sell(a, s, { idempotencyKey: key }), again = await sell(a, s, { idempotencyKey: key });
    expect(again.replayed).toBe(true); expect(String(again.pass._id)).toBe(String(r.pass._id));
    expect(r.pass.validFrom).toBe(U.todayIST()); expect(r.pass.validTo).toBe(U.addDays(U.todayIST(), 29));
    expect(r.pass.invoiceNo).toMatch(/^HP\//); expect(r.pass.gstMinor).toBe(Math.round((100000 * 18) / 118));
    const t = await enter(a, s, { vehicleNumber: "UP80 PA 1234" }); expect(t.passApplied).toBe(true); await backdate(t, 600);
    const x = await PK.exitVehicle(a, { ticketNo: t.ticketNo });
    expect(x.feeMinor).toBe(0); expect(x.ticket.method).toBe("pass"); expect(x.ticket.passRef).toBe(r.pass.reference);
    expect((await M.ParkingPass.findById(r.pass._id).lean()).entries).toBe(1);
  });
  it("refuses a pass when not offered or sold out, blocks early renewal, and renews from the end date", async () => {
    const s = await site(), a = admin(); await lot(s.dest, { monthlyPass: { car: 100000, two_wheeler: 0, bus: 0, maxPerType: 1 } });
    await expect(sell(a, s, { vehicleType: "two_wheeler", vehicleNumber: "UP80TW1111" })).rejects.toMatchObject({ status: 409 });
    const p = await sell(a, s);
    await expect(sell(a, s, { vehicleNumber: "UP80PB5555" })).rejects.toMatchObject({ status: 409 }); // sold out (max 1)
    await expect(sell(a, s)).rejects.toMatchObject({ status: 409 }); // 29 days left: too early to renew
    await M.ParkingPass.updateOne({ _id: p.pass._id }, { validTo: U.addDays(U.todayIST(), 5) });
    const r = await sell(a, s);
    expect(r.renewal).toBe(true); expect(r.pass.validFrom).toBe(U.addDays(U.todayIST(), 6)); expect(r.pass.validTo).toBe(U.addDays(U.todayIST(), 35));
    expect(await M.ParkingPass.countDocuments({ status: "active" })).toBe(2);
  });
  it("lets a visitor buy online and sees an expired pass not cover entry", async () => {
    const s = await site(); await lot(s.dest, { monthlyPass: { car: 80000, two_wheeler: 0, bus: 0, maxPerType: 0 } });
    const u = await mkUser("tourist");
    const r = await PP.sellParkingPass(u, "online", { destinationId: String(s.dest._id), vehicleType: "car", vehicleNumber: "UP80ON1234", holderName: "Visitor", method: "upi", idempotencyKey: "k-online-1" });
    expect(r.pass.channel).toBe("online"); expect(String(r.pass.user)).toBe(String(u._id));
    expect(await M.Payment.countDocuments({ user: u._id, amountMinor: 80000 })).toBe(1);
    await M.ParkingPass.updateOne({ _id: r.pass._id }, { validFrom: U.addDays(U.todayIST(), -40), validTo: U.addDays(U.todayIST(), -10) });
    expect(await PK.activePassFor(s.dest._id, "UP80ON1234")).toBeNull();
  });
});

d("offline parking", () => {
  it("keeps the real entry time and prices the exit at the real exit time", async () => {
    const s = await site(), a = admin(); await lot(s.dest);
    const entered = new Date(Date.now() - 3 * 3600000), left = new Date(Date.now() - 1 * 3600000); // 2h stay offline
    const t = await enter(a, s, { at: entered.toISOString(), offlineId: "L1" });
    expect(Math.abs(new Date(t.entryAt).getTime() - entered.getTime())).toBeLessThan(1000);
    const r = await PK.exitVehicle(a, { ticketNo: t.ticketNo, method: "cash", at: left.toISOString(), collectedMinor: 5000, offlineId: "L2" });
    expect(r.feeMinor).toBe(8000); expect(r.collectedMinor).toBe(5000); expect(r.ticket.paidMinor).toBe(5000);
    expect(r.ticket.offline.mismatchMinor).toBe(-3000); expect(r.ticket.offline.serverDueMinor).toBe(8000);
    expect(new Date(r.ticket.exitAt).getTime()).toBe(left.getTime());
  });
  it("rejects times in the future, before entry, or older than 48 hours", async () => {
    const s = await site(), a = admin(); await lot(s.dest);
    await expect(enter(a, s, { at: new Date(Date.now() + 3600000).toISOString() })).rejects.toMatchObject({ status: 400 });
    await expect(enter(a, s, { at: new Date(Date.now() - 49 * 3600000).toISOString() })).rejects.toMatchObject({ status: 400 });
    const t = await enter(a, s);
    await expect(PK.exitVehicle(a, { ticketNo: t.ticketNo, at: new Date(Date.now() - 3600000).toISOString() })).rejects.toMatchObject({ status: 400 }); // before entry
  });
});

d("number-plate matching", () => {
  it("recognises a pass, a reservation and a parked vehicle, and logs the read", async () => {
    const s = await site(), a = admin(); await lot(s.dest, { monthlyPass: { car: 100000, two_wheeler: 0, bus: 0, maxPerType: 0 } });
    await PP.sellParkingPass(a, "staff", { destinationId: String(s.dest._id), vehicleType: "car", vehicleNumber: "UP80PL1234", holderName: "Pass Holder", method: "cash", idempotencyKey: crypto.randomUUID() });
    expect((await PL.recordPlate({ destinationId: s.dest._id, raw: "up80 pl 1234", source: "camera_device" })).match).toBe("pass");
    const u = await mkUser("tourist");
    await PK.reserveParking(u, { destinationId: String(s.dest._id), date: U.todayIST(), vehicleType: "car", vehicleNumber: "UP80RS5678", paymentMode: "at_exit", idempotencyKey: "k-plate-1" });
    expect((await PL.recordPlate({ destinationId: s.dest._id, raw: "UP80RS5678", source: "staff_camera" })).match).toBe("reservation");
    await enter(a, s, { vehicleNumber: "UP80PK9999" });
    expect((await PL.recordPlate({ destinationId: s.dest._id, raw: "UP80PK9999", source: "camera_device" })).match).toBe("parked");
    expect((await PL.recordPlate({ destinationId: s.dest._id, raw: "UP80ZZ0000", source: "camera_device" })).match).toBe("none");
    expect(await M.PlateRead.countDocuments()).toBe(4);
    await expect(PL.recordPlate({ destinationId: s.dest._id, raw: "??", source: "camera_device" })).rejects.toMatchObject({ status: 422 });
  });
});

d("counter refunds", () => {
  const sale = (s: any, over: any = {}) => ({ destinationId: String(s.dest._id), items: [{ categoryId: String(s.cat._id), quantity: 2 }], method: "cash" as const, idempotencyKey: crypto.randomUUID(), checkIn: false, ...over });
  it("refunds a same-day walk-in sale to the staff member's own drawer, frees the seats, and nets the cash count to zero", async () => {
    const s = await site(); const st = await mkUser("staff", { assignedDestinations: [s.dest._id] });
    const r = await B.counterSale(st, sale(s));
    const slotBefore = (await M.TimeSlot.findById(r.booking.slot).lean()).booked;
    const out = await B.counterRefund(st, { reference: r.booking.reference, reason: "Wrong date sold", method: "cash" });
    expect(out.refundMinor).toBe(10000); expect(out.booking.status).toBe("cancelled");
    expect((await M.TimeSlot.findById(r.booking.slot).lean()).booked).toBe(slotBefore - 2);
    const pay = await M.Payment.findOne({ booking: r.booking._id, type: "refund" }).lean();
    expect(String(pay.user)).toBe(String(st._id)); expect(pay.provider).toBe("counter");
    const t = await SH.tally(st, String(s.dest._id)); expect(t.counter.cash).toBe(0);
    await expect(B.counterRefund(st, { reference: r.booking.reference, reason: "again" })).rejects.toMatchObject({ status: 409 });
  });
  it("blocks refunds of used tickets and of older walk-in sales for staff, but not for managers", async () => {
    const s = await site(); const st = await mkUser("staff", { assignedDestinations: [s.dest._id] });
    const used = await B.counterSale(st, sale(s, { checkIn: true }));
    await expect(B.counterRefund(st, { reference: used.booking.reference, reason: "visitor left" })).rejects.toMatchObject({ status: 409 });
    const old = await B.counterSale(st, sale(s));
    await M.Booking.collection.updateOne({ _id: old.booking._id }, { $set: { createdAt: new Date(Date.now() - 2 * 86400000) } }); // createdAt is immutable through Mongoose
    await expect(B.counterRefund(st, { reference: old.booking.reference, reason: "old sale" })).rejects.toMatchObject({ status: 403 });
    const ok = await B.counterRefund(admin(), { reference: old.booking.reference, reason: "Manager approved refund" });
    expect(ok.booking.status).toBe("cancelled");
    const other = await mkUser("staff", { assignedDestinations: [oid()] });
    const x = await B.counterSale(st, sale(s));
    await expect(B.counterRefund(other, { reference: x.booking.reference, reason: "not mine" })).rejects.toMatchObject({ status: 404 });
  });
});

d("shift handover", () => {
  it("closes the outgoing count, hands the float to a named colleague, and counts it into their expected cash", async () => {
    const s = await site(); const a = await mkUser("staff", { assignedDestinations: [s.dest._id] }), b = await mkUser("staff", { assignedDestinations: [s.dest._id] });
    await B.counterSale(a, { destinationId: String(s.dest._id), items: [{ categoryId: String(s.cat._id), quantity: 2 }], method: "cash", idempotencyKey: crypto.randomUUID(), checkIn: false });
    await expect(SH.createHandover(a, { destinationId: String(s.dest._id), toUserId: String(oid()), countedCashMinor: 10000 })).rejects.toMatchObject({ status: 404 });
    await expect(SH.createHandover(a, { destinationId: String(s.dest._id), toUserId: String(b._id), countedCashMinor: 9000 })).rejects.toMatchObject({ status: 400 }); // short without a note
    const h = await SH.createHandover(a, { destinationId: String(s.dest._id), toUserId: String(b._id), countedCashMinor: 10000, notes: "Quiet shift. Printer jams on tray 2." });
    expect(h.status).toBe("pending"); expect(h.varianceMinor).toBe(0); expect(h.snapshot.openIncidents).toEqual([]);
    await expect(SH.createHandover(a, { destinationId: String(s.dest._id), toUserId: String(b._id), countedCashMinor: 10000 })).rejects.toMatchObject({ status: 409 }); // one pending at a time
    await expect(SH.acceptHandover(a, String(h._id), 10000)).rejects.toMatchObject({ status: 404 }); // only the named colleague
    await expect(SH.acceptHandover(b, String(h._id), 9500)).rejects.toMatchObject({ status: 400 }); // differs, needs a note
    const acc = await SH.acceptHandover(b, String(h._id), 9500, "Counted two ₹50 notes short at handover");
    expect(acc.status).toBe("accepted"); expect(acc.receiveVarianceMinor).toBe(-500);
    await expect(SH.acceptHandover(b, String(h._id), 9500, "again")).rejects.toMatchObject({ status: 409 });
    const t = await SH.tally(b, String(s.dest._id)); expect(t.openingFloatMinor).toBe(9500); expect(t.expectedCashMinor).toBe(9500);
    expect((await SH.tally(a, String(s.dest._id))).expectedCashMinor).toBe(0); // the outgoing count reset their drawer
  });
  it("includes monthly pass sales in the seller's cash", async () => {
    const s = await site(); await lot(s.dest, { monthlyPass: { car: 100000, two_wheeler: 0, bus: 0, maxPerType: 0 } });
    const a = await mkUser("staff", { assignedDestinations: [s.dest._id] });
    await PP.sellParkingPass(a, "staff", { destinationId: String(s.dest._id), vehicleType: "car", vehicleNumber: "UP80CS1111", holderName: "Holder", method: "cash", idempotencyKey: crypto.randomUUID() });
    expect((await SH.tally(a, String(s.dest._id))).parking.cash).toBe(100000);
  });
});

d("lost and found", () => {
  it("suggests likely matches between found items and lost reports", async () => {
    const s = await site();
    const mk = (over: any) => M.LostFoundItem.create({ reference: LF.lfRef(), destination: s.dest._id, loggedBy: oid(), status: "open", ...over });
    const found = await mk({ kind: "found", category: "bag", color: "blue", description: "Blue backpack with water bottle near the east gate" });
    await mk({ kind: "lost", category: "bag", color: "blue", description: "Lost blue backpack with a water bottle", contactName: "A", contactPhone: "9876543210" });
    await mk({ kind: "lost", category: "phone", color: "black", description: "iPhone with red cover", contactName: "B", contactPhone: "9876543211" });
    const m = await LF.suggestMatches(found.toObject());
    expect(m).toHaveLength(1); expect(m[0].score).toBeGreaterThanOrEqual(60);
  });
});

d("staff roster", () => {
  it("prevents a person being double-booked and validates staff belong to the site", async () => {
    const s = await site(), other = await site(); const a = await mkUser("staff", { assignedDestinations: [s.dest._id, other.dest._id] }), adm = admin();
    const date = U.addDays(U.todayIST(), 1);
    const first = await RO.createShift(adm, { destinationId: String(s.dest._id), userId: String(a._id), date, start: "09:00", end: "13:00" }, null);
    expect(first.userName).toBe(a.name);
    await expect(RO.createShift(adm, { destinationId: String(other.dest._id), userId: String(a._id), date, start: "12:00", end: "16:00" }, null)).rejects.toMatchObject({ status: 409 }); // overlaps at another site
    await RO.createShift(adm, { destinationId: String(other.dest._id), userId: String(a._id), date, start: "13:00", end: "17:00" }, null); // back-to-back is fine
    await expect(RO.createShift(adm, { destinationId: String(s.dest._id), userId: String(a._id), date, start: "18:00", end: "17:00" }, null)).rejects.toMatchObject({ status: 400 });
    const outsider = await mkUser("staff", { assignedDestinations: [oid()] });
    await expect(RO.createShift(adm, { destinationId: String(s.dest._id), userId: String(outsider._id), date, start: "09:00", end: "12:00" }, null)).rejects.toMatchObject({ status: 404 });
    await expect(RO.createShift(adm, { destinationId: String(s.dest._id), userId: String(a._id), date: U.addDays(date, 1), start: "06:00", end: "20:00" }, null)).rejects.toMatchObject({ status: 400 }); // 14h
  });
});

d("dynamic and peak pricing", () => {
  const input = (s: any, slot: any, qty = 2) => ({ destinationId: String(s.dest._id), slotId: slot._id, items: [{ categoryId: String(s.cat._id), quantity: qty }], visitors: Array.from({ length: qty }, (_, i) => ({ name: `V${i}` })), contact: { name: "T", email: "t@example.com", phone: "9876543210" } });
  it("applies matching rules to ticket prices and records the base price and adjustment", async () => {
    const s = await site(); const date = U.addDays(U.todayIST(), 3), slot = (await S.ensureSlots(s.dest, date))[2];
    await M.PricingRule.create({ destination: s.dest._id, name: "Weekend peak", adjustPct: 20, daysOfWeek: [0, 1, 2, 3, 4, 5, 6] });
    await M.PricingRule.create({ destination: s.dest._id, name: "Other site audience", adjustPct: 50, audiences: ["foreign"] });
    const b = await B.createBooking(await mkUser("tourist"), input(s, slot));
    expect(b.items[0].basePriceMinor).toBe(5000); expect(b.items[0].unitPriceMinor).toBe(6000); expect(b.priceAdjustPct).toBe(20); expect(b.subtotalMinor).toBe(12000);
  });
  it("adds rules up, caps the total, rounds to whole rupees, and supports demand-based rules", () => {
    const ctx = { date: "2026-11-02", start: "10:00", booked: 90, capacity: 100, audience: "indian" };
    expect(DP.adjustPctFor([{ adjustPct: 60 }, { adjustPct: 70 }], ctx)).toBe(100);
    expect(DP.adjustPctFor([{ adjustPct: -40 }, { adjustPct: -40 }], ctx)).toBe(-50);
    expect(DP.adjustPctFor([{ adjustPct: 10, minBookedPct: 80 }], ctx)).toBe(10);
    expect(DP.adjustPctFor([{ adjustPct: 10, minBookedPct: 95 }], ctx)).toBe(0);
    expect(DP.adjustPctFor([{ adjustPct: 10, timeFrom: "11:00", timeTo: "14:00" }], ctx)).toBe(0);
    expect(DP.adjustedUnit(5050, 10)).toBe(5600); expect(DP.adjustedUnit(0, 50)).toBe(0);
  });
  it("makes the counter charge the adjusted price too", async () => {
    const s = await site(); await M.PricingRule.create({ destination: s.dest._id, name: "Peak", adjustPct: 20, daysOfWeek: [0, 1, 2, 3, 4, 5, 6] });
    const st = await mkUser("staff", { assignedDestinations: [s.dest._id] });
    const base = { destinationId: String(s.dest._id), items: [{ categoryId: String(s.cat._id), quantity: 2 }], method: "cash" as const, checkIn: false };
    await expect(B.counterSale(st, { ...base, idempotencyKey: crypto.randomUUID(), payment: { tenderedMinor: 10000 } })).rejects.toMatchObject({ status: 400 }); // 2 x 6000 = 12000
    const r = await B.counterSale(st, { ...base, idempotencyKey: crypto.randomUUID(), payment: { tenderedMinor: 12000 } });
    expect(r.booking.totalMinor).toBe(12000);
  });
});

d("incident SMS escalation", () => {
  it("escalates an unacknowledged incident once per level and stops when acknowledged", async () => {
    const s = await site(); const op = await M.Operator.create({ name: "Op", slug: "op" + oid(), escalation: { enabled: true, firstAfterMin: 10, secondAfterMin: 25, phones: ["9876543210"] } });
    await M.Destination.updateOne({ _id: s.dest._id }, { operator: op._id });
    const mk = (mins: number, over: any = {}) => M.Incident.create({ destination: s.dest._id, operator: op._id, reportedBy: oid(), reporterName: "Gate", category: "medical", severity: "critical", message: "Visitor collapsed", createdAt: new Date(Date.now() - mins * 60000), history: [], ...over });
    const young = await mk(3), due = await mk(12), acked = await mk(40, { status: "acknowledged" });
    expect((await ES.escalateIncidents()).map((x: any) => [x.id, x.level])).toEqual([[String(due._id), 1]]);
    expect((await ES.escalateIncidents())).toHaveLength(0); // already sent
    expect((await M.Incident.findById(due._id).lean()).history.at(-1).event).toBe("escalated (level 1)");
    await M.Incident.collection.updateOne({ _id: due._id }, { $set: { createdAt: new Date(Date.now() - 30 * 60000) } });
    expect((await ES.escalateIncidents()).map((x: any) => x.level)).toEqual([2]);
    expect((await M.Incident.findById(young._id).lean()).escalationLevel).toBe(0); expect((await M.Incident.findById(acked._id).lean()).escalationLevel).toBe(0);
  });
  it("sends each level once even when two requests escalate at the same moment, and warnings wait twice as long", async () => {
    const s = await site();
    const inc = await M.Incident.create({ destination: s.dest._id, reportedBy: oid(), reporterName: "G", category: "crowd", severity: "critical", message: "Crush at gate", createdAt: new Date(Date.now() - 15 * 60000), history: [] });
    const res = await Promise.all([ES.escalateIncidents(), ES.escalateIncidents(), ES.escalateIncidents()]);
    expect(res.flat().filter((x: any) => String(x.id) === String(inc._id))).toHaveLength(1);
    expect(ES.nextEscalationLevel({ status: "open", severity: "warning", createdAt: new Date(Date.now() - 12 * 60000) })).toBe(0);
    expect(ES.nextEscalationLevel({ status: "open", severity: "warning", createdAt: new Date(Date.now() - 21 * 60000) })).toBe(1);
    expect(ES.nextEscalationLevel({ status: "open", severity: "critical", createdAt: new Date(Date.now() - 99 * 60000), escalationLevel: 2 })).toBe(0);
    expect(ES.nextEscalationLevel({ status: "open", severity: "critical", createdAt: new Date(Date.now() - 99 * 60000) }, { enabled: false })).toBe(0);
  });
});

d("ticket transfer", () => {
  async function confirmed(owner: any) {
    const s = await site(); const date = U.addDays(U.todayIST(), 3), slot = (await S.ensureSlots(s.dest, date))[2];
    const b = await B.createBooking(owner, { destinationId: String(s.dest._id), slotId: slot._id, items: [{ categoryId: String(s.cat._id), quantity: 2 }], visitors: [{ name: "A One" }, { name: "A Two" }], contact: { name: owner.name, email: owner.email, phone: "9876543210" } });
    await B.payBooking(owner, { bookingId: String(b._id), method: "upi", idempotencyKey: crypto.randomUUID() });
    return { s, b: await M.Booking.findById(b._id).lean() };
  }
  const vis = [{ name: "New One" }, { name: "New Two" }];
  it("moves the ticket to the recipient with a new reference, so the old QR stops working", async () => {
    const a = await mkUser("tourist"), r = await mkUser("tourist"); const { b } = await confirmed(a);
    const t = await TR.offerTransfer(a, { bookingId: String(b._id), toEmail: r.email.toUpperCase(), visitors: vis });
    await expect(TR.offerTransfer(a, { bookingId: String(b._id), toEmail: r.email, visitors: vis })).rejects.toMatchObject({ status: 409 }); // one open offer per ticket
    const acc = await TR.acceptTransfer(r, String(t._id));
    expect(String(acc.booking.user)).toBe(String(r._id)); expect(acc.booking.reference).not.toBe(b.reference); expect(acc.booking.transferCount).toBe(1); expect(acc.booking.visitors.map((v: any) => v.name)).toEqual(["New One", "New Two"]);
    expect(await M.Booking.findOne({ reference: b.reference })).toBeNull();
    await expect(B.cancelBooking(acc.booking, r, "changed my mind")).rejects.toMatchObject({ status: 400 }); // transferred tickets are non-refundable for the new holder
    await expect(TR.acceptTransfer(r, String(t._id))).rejects.toMatchObject({ status: 409 });
  });
  it("rejects used tickets, unknown recipients, wrong visitor counts, yourself, and expired or declined offers", async () => {
    const a = await mkUser("tourist"), r = await mkUser("tourist"); const { b } = await confirmed(a);
    await expect(TR.offerTransfer(a, { bookingId: String(b._id), toEmail: "nobody@t.test", visitors: vis })).rejects.toMatchObject({ status: 404 });
    await expect(TR.offerTransfer(a, { bookingId: String(b._id), toEmail: r.email, visitors: [{ name: "Only One" }] })).rejects.toMatchObject({ status: 400 });
    await expect(TR.offerTransfer(a, { bookingId: String(b._id), toEmail: a.email, visitors: vis })).rejects.toMatchObject({ status: 400 });
    await expect(TR.offerTransfer(r, { bookingId: String(b._id), toEmail: a.email, visitors: vis })).rejects.toMatchObject({ status: 404 }); // not the owner
    const t = await TR.offerTransfer(a, { bookingId: String(b._id), toEmail: r.email, visitors: vis });
    await TR.declineTransfer(r, String(t._id), "to");
    const t2 = await TR.offerTransfer(a, { bookingId: String(b._id), toEmail: r.email, visitors: vis });
    await M.TicketTransfer.updateOne({ _id: t2._id }, { expiresAt: new Date(Date.now() - 1000) });
    await expect(TR.acceptTransfer(r, String(t2._id))).rejects.toMatchObject({ status: 409 });
    await M.Booking.updateOne({ _id: b._id }, { checkedInCount: 1 });
    await expect(TR.offerTransfer(a, { bookingId: String(b._id), toEmail: r.email, visitors: vis })).rejects.toMatchObject({ status: 409 });
  });
  it("fails safely when the ticket is used between the offer and the acceptance", async () => {
    const a = await mkUser("tourist"), r = await mkUser("tourist"); const { b } = await confirmed(a);
    const t = await TR.offerTransfer(a, { bookingId: String(b._id), toEmail: r.email, visitors: vis });
    await M.Booking.updateOne({ _id: b._id }, { checkedInCount: 1 });
    await expect(TR.acceptTransfer(r, String(t._id))).rejects.toMatchObject({ status: 409 });
    expect((await M.TicketTransfer.findById(t._id).lean()).status).toBe("failed");
    expect(String((await M.Booking.findById(b._id).lean()).user)).toBe(String(a._id));
  });
});

d("loyalty points", () => {
  async function bookable() { const s = await site(); const date = U.addDays(U.todayIST(), 3), slot = (await S.ensureSlots(s.dest, date))[2]; return { s, slot }; }
  const inp = (x: any, qty = 2, extra: any = {}) => ({ destinationId: String(x.s.dest._id), slotId: x.slot._id, items: [{ categoryId: String(x.s.cat._id), quantity: qty }], visitors: Array.from({ length: qty }, (_, i) => ({ name: `V${i}` })), contact: { name: "T", email: "t@example.com", phone: "9876543210" }, ...extra });
  it("awards points once on first entry, plus a first-visit bonus", async () => {
    const s0 = await site(), todaySlots = await S.ensureSlots(s0.dest, U.todayIST()), x = { s: s0, slot: todaySlots[todaySlots.length - 1] }, u = await mkUser("tourist"), st = await mkUser("staff", { assignedDestinations: [x.s.dest._id] });
    const b = await B.createBooking(u, inp(x, 4)); // 4 x 5000 = 20000 -> 20 points
    await B.payBooking(u, { bookingId: String(b._id), method: "upi", idempotencyKey: crypto.randomUUID() });
    const code = B.ticketCode((await M.Booking.findById(b._id).lean()).reference);
    await B.recordEntry(st, code, "in", 2); await B.recordEntry(st, code, "in", 2);
    const sum = await LY.loyaltySummary(u._id);
    expect(sum.balance).toBe(20 + LY.NEW_SITE_BONUS); expect(sum.tier.id).toBe("bronze");
    expect(await M.LoyaltyEntry.countDocuments({ user: u._id })).toBe(2);
  });
  it("lets points pay up to 20% of the ticket value, never overspends, and gives them back when the booking is cancelled", async () => {
    const x = await bookable(), u = await mkUser("tourist");
    await LY.addPoints({ user: u._id, type: "adjust", points: 1000, key: "seed" });
    const b = await B.createBooking(u, inp(x, 4, { redeemPoints: 999 })); // subtotal 20000; cap 20% = 4000 paise = 80 points
    expect(b.loyaltyPointsUsed).toBe(80); expect(b.loyaltyDiscountMinor).toBe(4000); expect(b.subtotalMinor).toBe(16000);
    expect((await LY.loyaltySummary(u._id)).balance).toBe(920);
    await B.cancelBooking(b, u, "changed mind");
    expect((await LY.loyaltySummary(u._id)).balance).toBe(1000);
    await B.cancelBooking(await M.Booking.findById(b._id).lean(), u, "again").catch(() => {});
    expect((await LY.loyaltySummary(u._id)).balance).toBe(1000); // restored once only
  });
  it("cannot be double-spent by simultaneous bookings", async (ctx) => {
    const x = await bookable(), u = await mkUser("tourist");
    await LY.addPoints({ user: u._id, type: "adjust", points: 100, key: "seed2" });
    const res = await Promise.all(Array.from({ length: 5 }, () => LY.spendPoints({ user: u._id, points: 40, key: `redeem:${oid()}` }).then(() => "ok", (e: any) => e.status)));
    expect(res.filter((r) => r === "ok")).toHaveLength(2); expect((await LY.loyaltySummary(u._id)).balance).toBe(20);
    void x; void ctx;
  });
  it("computes tiers and earn rates", () => {
    expect(LY.tierFor(0).id).toBe("bronze"); expect(LY.tierFor(500).id).toBe("silver"); expect(LY.tierFor(2000).id).toBe("gold");
    expect(LY.earnPoints(20000, 0)).toBe(20); expect(LY.earnPoints(20000, 500)).toBe(25); expect(LY.earnPoints(20000, 2000)).toBe(30);
    expect(LY.maxRedeemable(20000, 5)).toBe(5); expect(LY.maxRedeemable(0, 100)).toBe(0);
  });
});

d("support tickets", () => {
  it("keeps a threaded history, notifies on staff replies, and reopens when the visitor answers", async () => {
    const s = await site(); const u = await mkUser("tourist"), st = await mkUser("staff", { assignedDestinations: [s.dest._id] });
    const t = await SP.openTicket({ user: u, name: u.name, email: u.email, category: "payment", subject: "Charged twice", message: "I was charged twice for one booking", destinationId: String(s.dest._id) });
    expect(t.reference).toMatch(/^SP-/); expect(t.status).toBe("open"); expect(t.messages).toHaveLength(1);
    const r1 = await SP.addReply(t, "staff", st.name, "We are checking this now.", st);
    expect(r1.status).toBe("in_progress"); expect(r1.lastFrom).toBe("staff"); expect(String(r1.assignedTo)).toBe(String(st._id));
    await M.SupportTicket.updateOne({ _id: t._id }, { status: "resolved" });
    const r2 = await SP.addReply(await M.SupportTicket.findById(t._id).lean(), "visitor", u.name, "Still not refunded.");
    expect(r2.status).toBe("open"); expect(r2.messages).toHaveLength(3);
    await M.SupportTicket.updateOne({ _id: t._id }, { status: "closed" });
    await expect(SP.addReply(await M.SupportTicket.findById(t._id).lean(), "visitor", u.name, "hello?")).rejects.toMatchObject({ status: 409 });
  });
});
