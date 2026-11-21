/**
 * Integration tests for password reset, two-step sign-in, session revocation and privacy requests, against a real MongoDB.
 * Run with: MONGODB_URI_TEST=mongodb://127.0.0.1:27017/heritagehub_test npm run test:integration   (wipes that database)
 */
import bcrypt from "bcryptjs";
import mongoose from "mongoose";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const URI = process.env.MONGODB_URI_TEST;
const d = describe.skipIf(!URI);
const jar: Record<string, string> = {};
vi.mock("next/headers", () => ({
  cookies: () => ({ get: (n: string) => (jar[n] ? { value: jar[n] } : undefined), set: (n: string, v: string) => { jar[n] = v; }, delete: (n: string) => { delete jar[n]; } }),
  headers: () => new Headers(),
}));
let M: any, A: any, ACC: any, TF: any, T: any, P: any;
const oid = () => new mongoose.Types.ObjectId();

beforeAll(async () => {
  if (!URI) return;
  process.env.MONGODB_URI = URI; process.env.NOTIFY_DISABLED = "true"; process.env.AUTH_SECRET = "test-secret";
  const { connectDB } = await import("@/lib/db"); await connectDB();
  M = await import("@/models"); A = await import("@/lib/auth"); ACC = await import("@/lib/account"); TF = await import("@/lib/twofactor"); T = await import("@/lib/totp"); P = await import("@/lib/privacy");
  await Promise.all(Object.values(M).map((m: any) => m.syncIndexes?.()));
});
beforeEach(async () => { if (URI) { for (const m of Object.values(M)) await (m as any).deleteMany?.({}); for (const k of Object.keys(jar)) delete jar[k]; delete process.env.REQUIRE_MANAGER_2FA; } });
const mk = (role = "tourist", extra: any = {}) => M.User.create({ name: "Asha Rao", email: `${oid()}@t.test`, passwordHash: bcrypt.hashSync("OldPass123", 4), role, phone: "9876543210", vehicles: [{ label: "Car", number: "UP80AB1234", type: "car" }], ...extra });

d("password reset", () => {
  it("answers silently for unknown emails and keeps only the newest link", async () => {
    expect(await ACC.requestPasswordReset("nobody@t.test")).toBe(false);
    expect(await M.PasswordReset.countDocuments()).toBe(0);
    const u = await mk();
    await ACC.requestPasswordReset(u.email); await ACC.requestPasswordReset(u.email);
    expect(await M.PasswordReset.countDocuments({ user: u._id })).toBe(1);
  });
  it("changes the password once, ends old sessions, and refuses a reused or expired link", async () => {
    const u = await mk(); const tok = "t".repeat(43);
    await M.PasswordReset.create({ user: u._id, tokenHash: ACC.sha(tok), expiresAt: new Date(Date.now() + 60000) });
    await A.createSession(u); expect(await A.currentUser()).not.toBeNull();
    await ACC.completePasswordReset(tok, "BrandNew456");
    const after: any = await M.User.findById(u._id).select("+passwordHash");
    expect(await bcrypt.compare("BrandNew456", after.passwordHash)).toBe(true); expect(after.sessionVersion).toBe(1);
    expect(await A.currentUser()).toBeNull(); // the cookie issued before the reset no longer works
    await expect(ACC.completePasswordReset(tok, "Another789")).rejects.toThrow(/invalid or has expired/);
    const old = "o".repeat(43);
    await M.PasswordReset.create({ user: u._id, tokenHash: ACC.sha(old), expiresAt: new Date(Date.now() - 1000) });
    await expect(ACC.completePasswordReset(old, "Another789")).rejects.toThrow(/invalid or has expired/);
  });
  it("never stores the token itself", async () => {
    const u = await mk(); await ACC.requestPasswordReset(u.email);
    const r: any = await M.PasswordReset.findOne({ user: u._id }).lean();
    expect(r.tokenHash).toMatch(/^[0-9a-f]{64}$/);
  });
});

d("two-step sign-in", () => {
  it("enrols with a real code, then accepts each code once and each recovery code once", async () => {
    const u = await mk("admin");
    const { secret } = await TF.beginEnrollment(u);
    await expect(TF.finishEnrollment(u, "000000")).rejects.toThrow(/isn't right/);
    const codes = await TF.finishEnrollment(u, T.totpAt(secret));
    expect(codes).toHaveLength(10);
    const stored: any = await M.User.findById(u._id).select("+twoFactor.secretEnc");
    expect(stored.twoFactor.enabled).toBe(true); expect(stored.twoFactor.secretEnc).not.toContain(secret); // encrypted at rest
    const code = T.totpAt(secret);
    expect(await TF.checkSecondFactor(u._id, code)).toBe(false); // the enrolment code is already spent
    await M.User.updateOne({ _id: u._id }, { "twoFactor.lastStep": 0 });
    expect(await TF.checkSecondFactor(u._id, code)).toBe(true);
    expect(await TF.checkSecondFactor(u._id, code)).toBe(false); // replay refused
    expect(await TF.checkSecondFactor(u._id, "123456")).toBe(false);
    expect(await TF.checkSecondFactor(u._id, codes[0])).toBe(true);
    expect(await TF.checkSecondFactor(u._id, codes[0])).toBe(false); // recovery code is single use
    expect(await TF.checkSecondFactor(u._id, codes[1].toLowerCase().replace("-", " "))).toBe(true); // forgiving about case and separators
    await TF.disableTwoFactor(u._id);
    expect(await TF.checkSecondFactor(u._id, T.totpAt(secret))).toBe(false);
  });
  it("won't start enrolment twice", async () => {
    const u = await mk("admin"); const { secret } = await TF.beginEnrollment(u); await TF.finishEnrollment(u, T.totpAt(secret));
    await expect(TF.beginEnrollment(u)).rejects.toThrow(/already on/);
  });
});

d("sessions and the manager gate", () => {
  it("a two-step challenge token is not a session", async () => {
    const u = await mk("admin"); jar[A.COOKIE] = await A.issueChallenge(u);
    expect(await A.getSession()).toBeNull(); expect(await A.currentUser()).toBeNull();
    expect(await A.readChallenge(jar[A.COOKIE])).toBe(String(u._id));
  });
  it("a session dies when the password changes", async () => {
    const u = await mk(); await A.createSession(u); expect(await A.currentUser()).not.toBeNull();
    await M.User.updateOne({ _id: u._id }, { $inc: { sessionVersion: 1 } });
    expect(await A.currentUser()).toBeNull();
  });
  it("managers without two-step sign-in are blocked when it is required, others are not", async () => {
    process.env.REQUIRE_MANAGER_2FA = "true";
    const op = await M.Operator.create({ name: "Op", slug: "op" });
    const mgr = await mk("operator", { operator: op._id }); await A.createSession(mgr);
    expect((await A.currentUser()).mustEnrollTwoFactor).toBe(true);
    await expect(A.requireUser(["operator"])).rejects.toThrow(/two-step/i);
    await expect(A.requireUser(["operator"], { allowUnenrolled: true })).resolves.toBeTruthy();
    const { secret } = await TF.beginEnrollment(mgr); await TF.finishEnrollment(mgr, T.totpAt(secret));
    await expect(A.requireUser(["operator"])).resolves.toBeTruthy();
    const tourist = await mk(); await A.createSession(tourist);
    await expect(A.requireUser()).resolves.toBeTruthy();
    process.env.REQUIRE_MANAGER_2FA = "false";
    const other = await mk("admin"); await A.createSession(other);
    await expect(A.requireUser(["admin"])).resolves.toBeTruthy();
  });
});

d("privacy requests", () => {
  async function fixture(date: string) {
    const u = await mk(); const dest = oid(), slot = oid();
    const booking = await M.Booking.create({ reference: "HH-TEST-" + oid(), user: u._id, destination: dest, slot, date, start: "10:00", end: "11:00", quantity: 2, totalMinor: 11800, taxMinor: 1800, status: "confirmed", paymentStatus: "paid", idemKey: "k" + oid(), invoiceNo: "HH/2026-27/000042", contact: { name: "Asha Rao", email: u.email, phone: "9876543210" }, visitors: [{ name: "Asha Rao", age: 34 }, { name: "Dev Rao", age: 8 }] });
    await M.Payment.create({ booking: booking._id, user: u._id, amountMinor: 11800, status: "succeeded", idempotencyKey: "p" + oid(), details: { upiRef: "ABC123", card: { last4: "4242" } } });
    await M.LoyaltyAccount.create({ user: u._id, balance: 50, lifetime: 50 }); await M.LoyaltyEntry.create({ user: u._id, type: "earn", points: 50, key: "earn:" + booking._id });
    await M.SupportTicket.create({ reference: "SP-" + oid(), user: u._id, name: "Asha Rao", email: u.email, subject: "Missing ticket", messages: [{ from: "visitor", byName: "Asha Rao", body: "My phone is 9876543210" }, { from: "staff", byName: "Gate Lead", body: "Called you back" }] });
    await M.Review.create({ user: u._id, destination: dest, rating: 5, comment: "Loved it, I live at 12 MG Road" });
    const res = await M.ParkingReservation.create({ reference: "PR-" + oid(), idemKey: "r" + oid(), activeKey: "d:" + oid() + ":UP80AB1234", user: u._id, destination: dest, lot: oid(), date, vehicleType: "car", vehicleNumber: "UP80AB1234", status: "arrived" });
    const tk = await M.ParkingTicket.create({ destination: dest, lot: oid(), vehicleType: "car", vehicleNumber: "UP80AB1234", activeKey: "done:" + oid(), status: "exited", reservation: res._id, driverName: "Asha Rao", driverPhone: "9876543210", ticketNo: "PT-" + oid() });
    return { u, booking, ticket: tk };
  }
  const yesterday = () => { const x = new Date(Date.now() - 2 * 86400000); return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(x); };
  const tomorrow = () => { const x = new Date(Date.now() + 2 * 86400000); return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(x); };

  it("exports what is linked to the account and no secrets", async () => {
    const { u } = await fixture(yesterday());
    const out = await P.exportUserData(u._id); const text = JSON.stringify(out);
    expect(out.profile.email).toBe(u.email); expect(out.bookings).toHaveLength(1); expect(out.payments).toHaveLength(1); expect(out.supportTickets).toHaveLength(1); expect(out.loyalty.entries).toHaveLength(1); expect(out.parkingStays).toHaveLength(1);
    expect(text).not.toMatch(/passwordHash|secretEnc|recoveryHashes/); expect(text).not.toContain("idemKey");
    expect(await M.PrivacyRequest.countDocuments({ type: "export", status: "completed" })).toBe(1);
  });
  it("refuses erasure while a visit is still ahead, and with the wrong password", async () => {
    const { u } = await fixture(tomorrow());
    await expect(P.eraseUser(u, "OldPass123")).rejects.toThrow(/upcoming ticket booking/);
    expect((await M.User.findById(u._id)).active).toBe(true);
    const f = await fixture(yesterday());
    await expect(P.eraseUser(f.u, "wrong")).rejects.toThrow(/Password is incorrect/);
  });
  it("anonymises personal data, keeps the financial record, and closes the account", async () => {
    const { u, booking, ticket } = await fixture(yesterday());
    await P.eraseUser(u, "OldPass123");
    const user: any = await M.User.findById(u._id).lean();
    expect(user.name).toBe("Deleted visitor"); expect(user.email).toMatch(/@erased\.invalid$/); expect(user.phone).toBeUndefined(); expect(user.vehicles).toHaveLength(0); expect(user.active).toBe(false); expect(user.sessionVersion).toBe(1);
    const b: any = await M.Booking.findById(booking._id).lean();
    expect(b.contact.email).toBeUndefined(); expect(b.visitors).toHaveLength(0);
    expect(b.totalMinor).toBe(11800); expect(b.taxMinor).toBe(1800); expect(b.invoiceNo).toBe("HH/2026-27/000042"); // retained for accounts
    expect((await M.Payment.findOne({ user: u._id }).lean() as any).details).toBeUndefined();
    expect(await M.LoyaltyAccount.countDocuments({ user: u._id })).toBe(0); expect(await M.LoyaltyEntry.countDocuments({ user: u._id })).toBe(0);
    const s: any = await M.SupportTicket.findOne().lean(); expect(s.email).toBe("erased@erased.invalid"); expect(JSON.stringify(s)).not.toContain("9876543210");
    expect((await M.Review.findOne().lean() as any).comment).toBeUndefined(); expect((await M.Review.findOne().lean() as any).rating).toBe(5);
    expect((await M.ParkingReservation.findOne().lean() as any).vehicleNumber).toBe("REDACTED");
    const tk: any = await M.ParkingTicket.findById(ticket._id).lean(); expect(tk.vehicleNumber).toBe("REDACTED"); expect(tk.driverName).toBeUndefined(); expect(tk.driverPhone).toBeUndefined(); expect(tk.activeKey).toBe(`done:${ticket._id}`);
    const rec: any = await M.PrivacyRequest.findOne({ type: "erase", status: "completed" }).lean(); expect(JSON.stringify(rec)).not.toContain(String(u._id));
    expect(await A.currentUser()).toBeNull();
  });
  it("won't erase staff or manager accounts through the self-service path", async () => {
    const s = await mk("staff"); await expect(P.eraseUser(s, "OldPass123")).rejects.toThrow(/administrator/);
  });
});

d("UPI reconciliation data", () => {
  it("collects UPI payments staff recorded at counter, parking exit, prepaid parking and passes, and ignores cash and card", async () => {
    const { recordedUpi, reconcile, parseStatement } = await import("@/lib/reconcile");
    const staff = await mk("staff", { name: "Ravi Gate" });
    const dest = await M.Destination.create({ slug: "s" + oid(), name: "Test Fort", city: "Agra", state: "UP", type: "fort", shortDescription: "x", location: { lat: 1, lng: 1 }, hours: { open: "09:00", close: "17:00" }, defaultSlotCapacity: 10 });
    const mkBooking = (ref: string, method: string, amt: number) => M.Booking.create({ reference: ref, user: staff._id, soldBy: staff._id, destination: dest._id, slot: oid(), date: "2026-11-01", start: "10:00", end: "11:00", quantity: 1, totalMinor: amt, status: "confirmed", paymentStatus: "paid", channel: "counter", idemKey: "k" + oid() })
      .then((b: any) => M.Payment.create({ booking: b._id, user: staff._id, provider: "counter", type: "charge", method, status: "succeeded", amountMinor: amt, idempotencyKey: "p" + oid(), details: method === "upi" ? { upiRef: "UTR" + ref } : {} }));
    await mkBooking("HH-UPI1-0001", "upi", 118000); await mkBooking("HH-UPI2-0002", "upi", 59000); await mkBooking("HH-CASH-0003", "cash", 50000);
    const mkTicket = (n: string, extra: any) => M.ParkingTicket.create({ ticketNo: n, destination: dest._id, lot: oid(), vehicleType: "car", vehicleNumber: "UP80" + n, activeKey: "done:" + oid(), status: "exited", entryAt: new Date(), ...extra });
    await mkTicket("PT-1", { method: "upi", paidMinor: 10000, exitAt: new Date(), exitBy: staff._id });
    await mkTicket("PT-2", { method: "cash", paidMinor: 10000, exitAt: new Date(), exitBy: staff._id });
    await mkTicket("PT-3", { source: "counter", prepaidMethod: "upi", prepaidMinor: 5000, by: staff._id });
    const day = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());
    const from = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date(Date.now() - 86400000)), to = day;
    const rec = await recordedUpi([String(dest._id)], from, to);
    expect(rec.map((r) => r.ref).sort()).toEqual(["HH-UPI1-0001", "HH-UPI2-0002", "PT-1", "PT-3"]);
    expect(rec.every((r) => r.staffName === "Ravi Gate" && r.destinationName === "Test Fort")).toBe(true);
    // the statement shows all but the Rs 590 payment
    const csv = `Date,Narration,Withdrawal Amt,Deposit Amt\n${day.split("-").reverse().join("/")},UPI-PAYER-HHUPI10001,,1180.00\n${day.split("-").reverse().join("/")},UPI-X-PT1,,100.00\n${day.split("-").reverse().join("/")},UPI-Y,,50.00\n`;
    const out = reconcile(rec, parseStatement(csv).credits);
    expect(out.totals).toMatchObject({ recorded: 4, matched: 3, unmatchedRecorded: 1, unmatchedRecordedMinor: 59000 });
    expect(out.totals.byStaff[0]).toMatchObject({ staffName: "Ravi Gate", unmatched: 1 });
  });
});

d("business (GST) invoices", () => {
  it("stores buyer details with the booking, rejects a bad GSTIN, and exports a credit note after a refund", async () => {
    const B = await import("@/lib/booking"), S = await import("@/lib/slots"), U = await import("@/lib/utils"), E = await import("@/lib/einvoice");
    const u = await mk();
    const dest = await M.Destination.create({ slug: "s" + oid(), name: "Test Fort", city: "Agra", state: "UP", type: "fort", shortDescription: "x", location: { lat: 1, lng: 1 }, hours: { open: "09:00", close: "17:00" }, defaultSlotCapacity: 10 });
    const cat = await M.TicketCategory.create({ destination: dest._id, name: "Indian", audience: "indian", priceMinor: 10000 });
    const slot = (await S.ensureSlots(dest, U.addDays(U.todayIST(), 5)))[2];
    const base = { destinationId: String(dest._id), slotId: slot._id, items: [{ categoryId: String(cat._id), quantity: 2 }], visitors: [{ name: "A" }, { name: "B" }], contact: { name: "A", email: "a@t.test", phone: "9876543210" } };
    const buyer = { gstin: "29AABCT1332L1ZA", legalName: "Tour Co", address: "5 Brigade Rd", city: "Bengaluru", pin: "560001" };
    await expect(B.createBooking(u, { ...base, idempotencyKey: "gst-bad-0001", buyer: { ...buyer, gstin: "29AABCT1332L1ZZ" } })).rejects.toThrow(/GSTIN/);
    expect((await M.TimeSlot.findById(slot._id).lean() as any).booked).toBe(0); // the failed attempt released its seats
    const bk = await B.createBooking(u, { ...base, idempotencyKey: "gst-good-0001", buyer: { ...buyer, gstin: "29aabct1332l1za" } });
    expect(bk.buyer.gstin).toBe("29AABCT1332L1ZA");
    const paid = await B.payBooking(u, { bookingId: String(bk._id), method: "upi", idempotencyKey: "pay-gst-00001" });
    expect(paid.booking.invoiceNo).toMatch(/^HH\//);
    const full: any = await M.Booking.findById(bk._id).lean();
    const s = { gstin: "27AAPFU0939F1ZV", legalName: "HeritageHub Pvt Ltd", address: "1 MG Road", loc: "Mumbai", pin: "400001", sac: "998599" };
    const inv = E.buildEInvoice(full, "INV", s);
    expect(inv.DocDtls.No).toBe(full.invoiceNo); expect(inv.ValDtls.AssVal).toBe(full.feesMinor / 100); expect(inv.ValDtls.IgstVal).toBe(full.taxMinor / 100);
    await B.cancelBooking(await M.Booking.findById(bk._id), u, "test", true);
    const after: any = await M.Booking.findById(bk._id).lean();
    expect(after.creditNoteNo).toBeTruthy();
    { const cn = E.buildEInvoice(after, "CRN", s); expect(cn.PrecDocDtls![0].InvNo).toBe(full.invoiceNo); expect(cn.ValDtls.IgstVal).toBe(after.creditNoteTaxMinor / 100); }
  });
});
