/**
 * Integration tests for parking reservations, gate payment capture, counter-sale parking, entry pause and live crowd.
 * Run with: MONGODB_URI_TEST=mongodb://127.0.0.1:27017/heritagehub_test npm run test:integration
 * Skipped automatically when MONGODB_URI_TEST is not set. These tests wipe the target database.
 */
import crypto from "crypto";
import mongoose from "mongoose";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";

const URI = process.env.MONGODB_URI_TEST;
const d = describe.skipIf(!URI);
let M: any, B: any, PK: any, U: any, S: any, L: any;
/** True when the database applies a conditional single-document update atomically (real MongoDB does). Some emulators do not, so the parallel-race tests skip there rather than report a false failure. */
let atomicDb = true;
const oid = () => new mongoose.Types.ObjectId();
const ALLDAY = { open: "00:00", close: "23:59" };

beforeAll(async () => {
  if (!URI) return;
  process.env.MONGODB_URI = URI;
  const { connectDB } = await import("@/lib/db"); await connectDB();
  M = await import("@/models"); B = await import("@/lib/booking"); PK = await import("@/lib/parking"); U = await import("@/lib/utils"); S = await import("@/lib/slots"); L = await import("@/lib/live");
  await Promise.all(Object.values(M).map((m: any) => m.syncIndexes?.()));
  const probe = mongoose.connection.collection("atomic_probe");
  await probe.deleteMany({}); await probe.insertOne({ k: "a", n: 0 });
  const r = await Promise.all(Array.from({ length: 10 }, () => probe.findOneAndUpdate({ k: "a", n: { $lte: 2 } }, { $inc: { n: 1 } })));
  atomicDb = r.filter((x: any) => x && (x.value ?? x)).length === 3;
  await probe.drop().catch(() => {});
  if (!atomicDb) console.warn("[features.integration] This database does not apply conditional updates atomically; parallel-race tests are skipped. Run against real MongoDB to exercise them.");
});
beforeEach(async () => { if (URI) { for (const m of Object.values(M)) await (m as any).deleteMany?.({}); L.clearLiveCache(); process.env.DEMO_RELAX_SLOT_CHECK = "true"; } });

async function site(capacity = 50, hours = ALLDAY) {
  const dest = await M.Destination.create({ slug: "s" + oid(), name: "Test Fort", city: "Agra", state: "UP", type: "fort", shortDescription: "A test fort", location: { lat: 1, lng: 1 }, hours: { ...hours, closedDays: [] }, defaultSlotCapacity: capacity, occupancyLimit: 100 });
  const cat = await M.TicketCategory.create({ destination: dest._id, name: "Indian", audience: "indian", priceMinor: 5000 });
  return { dest, cat };
}
const rate = { freeMinutes: 15, firstHourMinor: 5000, extraHourMinor: 3000, dailyMaxMinor: 20000 };
const lot = (dest: any, over: any = {}) => M.ParkingLot.create({ destination: dest._id, reservablePct: 30, car: { capacity: 10, ...rate }, two_wheeler: { capacity: 4, ...rate }, bus: { capacity: 0, ...rate }, ...over });
const admin = () => ({ _id: oid(), role: "admin" });
const visitor = () => ({ _id: oid(), role: "tourist" });
const tomorrow = () => U.addDays(U.todayIST(), 1);
const reserve = (u: any, s: any, over: any = {}) => PK.reserveParking(u, { destinationId: String(s.dest._id), date: tomorrow(), vehicleType: "car", vehicleNumber: "UP80AB" + String(Math.floor(1000 + Math.random() * 9000)), paymentMode: "at_exit", idempotencyKey: crypto.randomUUID(), ...over });
const dayDoc = async (l: any, date: string, type = "car") => (await M.ParkingDay.findOne({ lot: l._id, date, vehicleType: type }).lean())?.reserved ?? 0;
const card = { network: "visa", type: "debit", last4: "4242", authCode: "A1B2C3" };

d("parking reservations", () => {
  it("never lets more than the pre-bookable share be reserved, even in parallel", async (ctx) => {
    if (!atomicDb) return ctx.skip();
    const s = await site(), l = await lot(s.dest); // 30% of 10 cars = 3
    const results = await Promise.all(Array.from({ length: 10 }, () => reserve(visitor(), s).then(() => "ok", (e: any) => (e.status === 409 ? "full" : "err:" + e.message))));
    expect(results.filter((r) => r === "ok")).toHaveLength(3);
    expect(results.filter((r) => r === "full")).toHaveLength(7);
    expect(await dayDoc(l, tomorrow())).toBe(3);
  });
  it("is idempotent, rejects a second booking for the same vehicle and date, and rejects bad dates and closed days", async () => {
    const s = await site(); await lot(s.dest);
    const u = visitor(), key = crypto.randomUUID();
    const a = await reserve(u, s, { idempotencyKey: key, vehicleNumber: "UP80 AB 1234" }), b = await reserve(u, s, { idempotencyKey: key, vehicleNumber: "UP80 AB 1234" });
    expect(b.replayed).toBe(true); expect(String(b.reservation._id)).toBe(String(a.reservation._id));
    expect(await M.ParkingReservation.countDocuments()).toBe(1);
    await expect(reserve(visitor(), s, { vehicleNumber: "up80ab1234" })).rejects.toMatchObject({ status: 409 }); // same vehicle, same date
    expect(await dayDoc(await M.ParkingLot.findOne(), tomorrow())).toBe(1); // the failed attempt gave its quota back
    await expect(reserve(visitor(), s, { date: U.addDays(U.todayIST(), -1) })).rejects.toMatchObject({ status: 400 });
    await expect(reserve(visitor(), s, { date: U.addDays(U.todayIST(), 45) })).rejects.toMatchObject({ status: 400 });
    await expect(reserve(visitor(), s, { vehicleType: "bus" })).rejects.toMatchObject({ status: 409 });
    await M.Destination.updateOne({ _id: s.dest._id }, { closures: [{ date: U.addDays(U.todayIST(), 2), reason: "Holiday" }] });
    await expect(reserve(visitor(), s, { date: U.addDays(U.todayIST(), 2) })).rejects.toMatchObject({ status: 409 });
  });
  it("cancelling frees the quota; a prepayment is refunded only when cancelled early, or always by staff", async () => {
    const s = await site(), l = await lot(s.dest), u = visitor();
    const r = await reserve(u, s, { paymentMode: "prepay", method: "upi" });
    expect(r.reservation.prepaidMinor).toBe(5000);
    expect(await M.Payment.countDocuments({ parkingReservation: r.reservation._id, type: { $ne: "refund" } })).toBe(1);
    const c = await PK.cancelReservation(u, String(r.reservation._id));
    expect(c.refundMinor).toBe(5000); expect(await dayDoc(l, tomorrow())).toBe(0);
    expect(await M.Payment.countDocuments({ parkingReservation: r.reservation._id, type: "refund" })).toBe(1);
    await expect(PK.cancelReservation(u, String(r.reservation._id))).rejects.toMatchObject({ status: 409 }); // not twice
    // late cancellation by the visitor forfeits; staff cancellation refunds
    const today = U.todayIST(), late = await reserve(u, s, { date: today, arrivalFrom: "00:00", paymentMode: "prepay" });
    expect((await PK.cancelReservation(u, String(late.reservation._id))).refundMinor).toBe(0);
    const late2 = await reserve(u, s, { date: today, arrivalFrom: "00:00", paymentMode: "prepay" });
    expect((await PK.cancelReservation(admin(), String(late2.reservation._id))).refundMinor).toBe(5000);
    await expect(PK.cancelReservation(visitor(), String((await reserve(u, s)).reservation._id))).rejects.toMatchObject({ status: 404 }); // someone else's
  });
  it("marks past reservations that never arrived as no-shows", async () => {
    const s = await site(), l = await lot(s.dest), u = visitor();
    const r = await reserve(u, s);
    await M.ParkingReservation.updateOne({ _id: r.reservation._id }, { date: U.addDays(U.todayIST(), -2) });
    await PK.expireReservations();
    expect((await M.ParkingReservation.findById(r.reservation._id).lean()).status).toBe("expired");
    void l;
  });
});

d("arrival of pre-booked and walk-in vehicles", () => {
  it("keeps spaces for pre-booked vehicles that have not arrived, then admits them even when the lot looks full", async () => {
    const s = await site(), l = await lot(s.dest, { car: { capacity: 3, ...rate }, reservablePct: 100 }), st = admin(), id = String(s.dest._id);
    const r = await reserve(visitor(), s, { date: U.todayIST(), vehicleNumber: "UP80PB0001" });
    await PK.enterVehicle(st, { destinationId: id, vehicleType: "car", vehicleNumber: "UP80WA0001" });
    await PK.enterVehicle(st, { destinationId: id, vehicleType: "car", vehicleNumber: "UP80WA0002" });
    await expect(PK.enterVehicle(st, { destinationId: id, vehicleType: "car", vehicleNumber: "UP80WA0003" })).rejects.toMatchObject({ status: 409 }); // the last space is held
    const av = PK.availability(await M.ParkingLot.findById(l._id).lean(), await PK.heldToday(l._id));
    expect(av.find((x: any) => x.type === "car")).toMatchObject({ occupied: 2, held: 1, available: 0 });
    const t = await PK.enterVehicle(st, { destinationId: id, vehicleNumber: "up80 pb 0001" }); // recognised by number alone
    expect(t).toMatchObject({ reservationApplied: true, source: "reservation", vehicleType: "car" });
    expect((await M.ParkingReservation.findById(r.reservation._id).lean()).status).toBe("arrived");
    expect(await dayDoc(l, U.todayIST())).toBe(0);
    expect((await M.ParkingLot.findById(l._id).lean()).car.occupied).toBe(3);
    await expect(PK.enterVehicle(st, { destinationId: id, reservationRef: r.reservation.reference })).rejects.toMatchObject({ status: 409 }); // code can't be reused
  });
  it("rejects another day's code, another site's code, and does not leak a space or leave the reservation half-used", async () => {
    const s = await site(), other = await site(), l = await lot(s.dest), st = admin();
    await lot(other.dest);
    const future = await reserve(visitor(), s);
    await expect(PK.enterVehicle(st, { destinationId: String(s.dest._id), reservationRef: future.reservation.reference })).rejects.toMatchObject({ status: 409 });
    await expect(PK.enterVehicle(st, { destinationId: String(other.dest._id), reservationRef: future.reservation.reference })).rejects.toMatchObject({ status: 404 });
    expect((await M.ParkingLot.findById(l._id).lean()).car.occupied).toBe(0);
    expect((await M.ParkingReservation.findById(future.reservation._id).lean()).status).toBe("reserved");
    // vehicle already parked: the arrival must roll back cleanly
    const today = await reserve(visitor(), s, { date: U.todayIST(), vehicleNumber: "UP80DD0001" });
    await M.ParkingTicket.create({ ticketNo: "PK-OLD01", destination: s.dest._id, lot: l._id, vehicleType: "car", vehicleNumber: "UP80DD0001", activeKey: `${s.dest._id}:UP80DD0001`, status: "parked" });
    await M.ParkingLot.updateOne({ _id: l._id }, { "car.occupied": 1 });
    await expect(PK.enterVehicle(st, { destinationId: String(s.dest._id), reservationRef: today.reservation.reference })).rejects.toMatchObject({ status: 409 });
    expect((await M.ParkingReservation.findById(today.reservation._id).lean()).status).toBe("reserved");
    expect(await dayDoc(l, U.todayIST())).toBe(1);
    expect((await M.ParkingLot.findById(l._id).lean()).car.occupied).toBe(1);
  });
  it("only allows a same-day reservation while a space is actually free", async () => {
    const s = await site(), l = await lot(s.dest, { car: { capacity: 2, ...rate }, reservablePct: 100 });
    await M.ParkingLot.updateOne({ _id: l._id }, { "car.occupied": 2 });
    await expect(reserve(visitor(), s, { date: U.todayIST() })).rejects.toMatchObject({ status: 409 });
    expect(await dayDoc(l, U.todayIST())).toBe(0);
  });
});

d("parking checkout payments", () => {
  async function parked(prepaid = 0, minsAgo = 125) {
    const s = await site(), l = await lot(s.dest), st = admin();
    const t = await PK.enterVehicle(st, { destinationId: String(s.dest._id), vehicleType: "car", vehicleNumber: "UP80EE" + Math.floor(1000 + Math.random() * 9000) });
    await M.ParkingTicket.updateOne({ _id: t._id }, { entryAt: new Date(Date.now() - minsAgo * 60000), prepaidMinor: prepaid });
    return { s, l, st, t };
  }
  it("requires the right details for each payment method and leaves the vehicle parked when they are missing", async () => {
    const { st, t, l } = await parked();
    await expect(PK.exitVehicle(st, { ticketNo: t.ticketNo })).rejects.toMatchObject({ status: 400 });
    await expect(PK.exitVehicle(st, { ticketNo: t.ticketNo, method: "card" })).rejects.toMatchObject({ status: 400 });
    await expect(PK.exitVehicle(st, { ticketNo: t.ticketNo, method: "cash", details: { tenderedMinor: 100 } })).rejects.toMatchObject({ status: 400 });
    expect((await M.ParkingTicket.findById(t._id).lean()).status).toBe("parked");
    expect((await M.ParkingLot.findById(l._id).lean()).car.occupied).toBe(1);
    const ok = await PK.exitVehicle(st, { ticketNo: t.ticketNo, method: "card", details: { card } });
    expect(ok.dueMinor).toBe(11000);
    const saved = await M.ParkingTicket.findById(t._id).lean();
    expect(saved).toMatchObject({ method: "card", paidMinor: 11000, feeMinor: 11000 });
    expect(saved.payment.exit.card).toMatchObject({ last4: "4242", authCode: "A1B2C3" });
    expect(JSON.stringify(saved.payment)).not.toMatch(/cvv|expiry|\d{13,}/i);
  });
  it("records cash tendered and change, and a UPI reference", async () => {
    const a = await parked();
    await PK.exitVehicle(a.st, { ticketNo: a.t.ticketNo, method: "cash", details: { tenderedMinor: 20000 } });
    expect((await M.ParkingTicket.findById(a.t._id).lean()).payment.exit).toMatchObject({ tenderedMinor: 20000, changeMinor: 9000 });
    const b = await parked();
    await PK.exitVehicle(b.st, { ticketNo: b.t.ticketNo, method: "upi", details: { upiRef: "412345678901" } });
    expect((await M.ParkingTicket.findById(b.t._id).lean())).toMatchObject({ method: "upi", paidMinor: 11000 });
  });
  it("freezes the quoted amount, so the QR the visitor paid is the amount recorded, and refuses a stale expectation", async () => {
    const { st, t } = await parked(0, 59); // 59 min: 5000 now
    const q = await PK.quoteExit(st, { ticketNo: t.ticketNo });
    expect(q.dueMinor).toBe(5000);
    await M.ParkingTicket.updateOne({ _id: t._id }, { entryAt: new Date(Date.now() - 61 * 60000) }); // crosses into the next hour: live fee is now 8000
    await expect(PK.exitVehicle(st, { ticketNo: t.ticketNo, method: "upi", expectedDueMinor: 5000 })).rejects.toMatchObject({ status: 409 }); // no quote: amount changed
    const r = await PK.exitVehicle(st, { ticketNo: t.ticketNo, method: "upi", quote: q.quote, expectedDueMinor: 5000 });
    expect(r.dueMinor).toBe(5000); expect((await M.ParkingTicket.findById(t._id).lean()).paidMinor).toBe(5000);
  });
  it("ignores a quote for another ticket or a forged one", async () => {
    const a = await parked(), b = await parked(0, 20);
    const qb = await PK.quoteExit(b.st, { ticketNo: b.t.ticketNo });
    const r = await PK.exitVehicle(a.st, { ticketNo: a.t.ticketNo, method: "cash", quote: qb.quote });
    expect(r.dueMinor).toBe(11000); // a's own fee, not b's quoted 5000
    const c = await parked();
    expect((await PK.exitVehicle(c.st, { ticketNo: c.t.ticketNo, method: "cash", quote: "x.y" })).dueMinor).toBe(11000);
  });
  it("credits a prepayment, and nothing is collected when it covers the whole fee", async () => {
    const a = await parked(5000, 125); // fee 11000 - 5000 prepaid
    expect((await PK.exitVehicle(a.st, { ticketNo: a.t.ticketNo, method: "cash" })).dueMinor).toBe(6000);
    const b = await parked(5000, 40); // fee 5000 fully prepaid: no method needed
    const r = await PK.exitVehicle(b.st, { ticketNo: b.t.ticketNo });
    expect(r).toMatchObject({ feeMinor: 5000, prepaidMinor: 5000, dueMinor: 0 });
    expect((await M.ParkingTicket.findById(b.t._id).lean())).toMatchObject({ method: "prepaid", paidMinor: 0 });
  });
  it("lets exactly one of two simultaneous check-outs succeed and frees one space", async (ctx) => {
    if (!atomicDb) return ctx.skip();
    const { st, t, l } = await parked();
    const res = await Promise.all([1, 2].map(() => PK.exitVehicle(st, { ticketNo: t.ticketNo, method: "cash" }).then(() => "ok", (e: any) => e.status)));
    expect(res.filter((x) => x === "ok")).toHaveLength(1);
    expect((await M.ParkingLot.findById(l._id).lean()).car.occupied).toBe(0);
  });
});

d("counter sale with parking", () => {
  const sale = (s: any, over: any = {}) => ({ destinationId: String(s.dest._id), items: [{ categoryId: String(s.cat._id), quantity: 2 }], method: "cash" as const, idempotencyKey: crypto.randomUUID(), ...over });
  const pk = (over: any = {}) => ({ vehicleType: "car", vehicleNumber: "UP80 CS 0001", driverName: "Ravi Kumar", driverPhone: "9876543210", ...over });
  it("sells tickets and admits the vehicle with the driver's details, linked to the booking", async () => {
    const s = await site(), l = await lot(s.dest), st = admin();
    const r = await B.counterSale(st, sale(s, { parking: pk() }));
    expect(r.parkingError).toBeUndefined();
    expect(r.parkingTicket).toMatchObject({ vehicleNumber: "UP80CS0001", driverName: "Ravi Kumar", driverPhone: "9876543210", source: "counter" });
    expect(String(r.parkingTicket.booking)).toBe(String(r.booking._id));
    expect((await M.ParkingLot.findById(l._id).lean()).car.occupied).toBe(1);
  });
  it("can take the first-hour parking fee at the counter and credits it at exit", async () => {
    const s = await site(), l = await lot(s.dest), st = admin();
    const r = await B.counterSale(st, sale(s, { parking: pk({ prepay: true }) }));
    expect(r.parkingTicket).toMatchObject({ prepaidMinor: 5000, prepaidMethod: "cash" });
    await M.ParkingTicket.updateOne({ _id: r.parkingTicket._id }, { entryAt: new Date(Date.now() - 125 * 60000) });
    expect((await PK.exitVehicle(st, { ticketNo: r.parkingTicket.ticketNo, method: "cash" })).dueMinor).toBe(6000);
    void l;
  });
  it("is idempotent: a retried sale returns the same parking ticket and admits nothing twice", async () => {
    const s = await site(), l = await lot(s.dest), st = admin(), body = sale(s, { parking: pk() });
    const a = await B.counterSale(st, body), b = await B.counterSale(st, body);
    expect(b.replayed).toBe(true); expect(String(b.parkingTicket._id)).toBe(String(a.parkingTicket._id));
    expect(await M.ParkingTicket.countDocuments()).toBe(1); expect((await M.ParkingLot.findById(l._id).lean()).car.occupied).toBe(1);
  });
  it("refuses before selling anything when card details are missing, cash is short, or the car park is full", async () => {
    const s = await site(), l = await lot(s.dest, { car: { capacity: 1, ...rate } }), st = admin();
    await expect(B.counterSale(st, sale(s, { method: "card" }))).rejects.toMatchObject({ status: 400 });
    await expect(B.counterSale(st, sale(s, { payment: { tenderedMinor: 9000 }, parking: pk({ prepay: true }) }))).rejects.toMatchObject({ status: 400 }); // needs 10000 + 5000
    const ok = await B.counterSale(st, sale(s, { method: "card", payment: { card }, parking: pk() }));
    expect(ok.parkingTicket.vehicleNumber).toBe("UP80CS0001");
    await expect(B.counterSale(st, sale(s, { parking: pk({ vehicleNumber: "UP80CS0002" }) }))).rejects.toMatchObject({ status: 409 });
    expect(await M.Booking.countDocuments({ channel: "counter", status: "confirmed" })).toBe(1); // the refused sales left no booking behind
    expect(await M.Booking.countDocuments({ status: "pending" })).toBe(0);
    void l;
  });
  it("stores the payment details on the payment record, never a full card number", async () => {
    const s = await site(), st = admin();
    await B.counterSale(st, sale(s, { method: "card", payment: { card } }));
    const p = await M.Payment.findOne({ provider: "counter" }).lean();
    expect(p.details.card).toMatchObject({ network: "visa", last4: "4242", authCode: "A1B2C3" });
    await B.counterSale(st, sale(s, { method: "cash", payment: { tenderedMinor: 20000 } }));
    expect((await M.Payment.findOne({ provider: "counter", method: "cash" }).lean()).details).toMatchObject({ tenderedMinor: 20000, changeMinor: 10000 });
  });
  it("still sells the tickets and reports the problem if the vehicle can't be admitted after the sale", async () => {
    const s = await site(), st = admin();
    await lot(s.dest);
    await M.ParkingTicket.create({ ticketNo: "PK-DUP01", destination: s.dest._id, lot: (await M.ParkingLot.findOne())._id, vehicleType: "car", vehicleNumber: "UP80CS0001", activeKey: `${s.dest._id}:UP80CS0001`, status: "parked" });
    const r = await B.counterSale(st, sale(s, { parking: pk() }));
    expect(r.booking.status).toBe("confirmed"); expect(r.parkingTicket).toBeUndefined(); expect(r.parkingError).toMatch(/already parked/i);
  });
});

d("entry pause and live crowd", () => {
  async function paidToday() {
    const s = await site(), st = admin();
    const r = await B.counterSale(st, { destinationId: String(s.dest._id), items: [{ categoryId: String(s.cat._id), quantity: 2 }], method: "cash" as const, checkIn: false, idempotencyKey: crypto.randomUUID() });
    return { s, st, ref: r.booking.reference, id: s.dest._id };
  }
  it("refuses entry while paused but never blocks an exit, and resumes cleanly", async () => {
    const { s, st, ref, id } = await paidToday();
    await M.Destination.updateOne({ _id: id }, { entryPaused: true, entryPausedReason: "Crowd surge" });
    await expect(B.recordEntry(st, ref, "in")).rejects.toMatchObject({ status: 409, message: expect.stringMatching(/paused: Crowd surge/) });
    expect((await B.validateTicket(st, ref, "verify")).valid).toBe(true); // looking a ticket up still works
    await M.Destination.updateOne({ _id: id }, { entryPaused: false });
    await B.recordEntry(st, ref, "in", 1);
    await M.Destination.updateOne({ _id: id }, { entryPaused: true, entryPausedReason: "Incident" });
    await expect(B.recordEntry(st, ref, "out", 1)).resolves.toBeTruthy(); // visitors can always leave
    void s;
  });
  it("lets queued offline scans through a pause (they happened earlier)", async () => {
    const { st, ref, id } = await paidToday();
    await M.Destination.updateOne({ _id: id }, { entryPaused: true, entryPausedReason: "Incident" });
    await expect(B.recordEntry(st, ref, "in", undefined, { at: new Date() })).resolves.toBeTruthy();
  });
  it("reports occupancy, percentage, level, trend and parking, and says when the gates have been quiet", async () => {
    const { s, st, ref } = await paidToday();
    await lot(s.dest);
    let live = await L.liveSnapshot(await M.Destination.findById(s.dest._id).lean());
    expect(live).toMatchObject({ occupancy: 0, pct: 0, level: "low", open: true, paused: false, quiet: true });
    L.clearLiveCache();
    await B.recordEntry(st, ref, "in", 2);
    live = await L.liveSnapshot(await M.Destination.findById(s.dest._id).lean());
    expect(live).toMatchObject({ occupancy: 2, pct: 2, entriesLast15: 2, exitsLast15: 0, quiet: false });
    expect(live.parking[0]).toMatchObject({ type: "car", available: 10 });
    L.clearLiveCache();
    await M.Destination.updateOne({ _id: s.dest._id }, { occupancyLimit: 4 });
    live = await L.liveSnapshot(await M.Destination.findById(s.dest._id).lean());
    expect(live.pct).toBe(50); expect(live.level).toBe("moderate");
  });
  it("uses the real headcount (sensor deltas and staff counts) instead of tickets once it is reporting", async () => {
    const { s, st, ref } = await paidToday();
    const H = await import("@/lib/headcount");
    const dest = async () => await M.Destination.findById(s.dest._id).lean();
    await B.recordEntry(st, ref, "in", 2); // 2 ticketed visitors scanned in
    L.clearLiveCache();
    expect((await L.liveSnapshot(await dest())).source).toBe("tickets");
    await H.recordHeadcount(s.dest._id, { in: 40, source: "sensor" }); // door sensor counts 40 people, most without tickets
    await H.recordHeadcount(s.dest._id, { out: 5, source: "sensor" });
    let live = await L.liveSnapshot(await dest());
    expect(live).toMatchObject({ source: "headcount", occupancy: 35, ticketOccupancy: 2, headcount: 35, entriesLast15: 40, exitsLast15: 5, quiet: false });
    await H.recordHeadcount(s.dest._id, { inside: 20, source: "manual" }); // walk-round count re-baselines the total
    await H.recordHeadcount(s.dest._id, { in: 3, source: "sensor" });
    live = await L.liveSnapshot(await dest());
    expect(live.occupancy).toBe(23);
    await expect(H.recordHeadcount(s.dest._id, { source: "sensor" })).rejects.toThrow();
  });
});
