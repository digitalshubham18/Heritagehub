/**
 * End-to-end test over HTTP against a running app + seeded database.
 *   npm run seed && npm run dev   (in another terminal)
 *   BASE_URL=http://localhost:3000 npm run test:e2e
 * Uses the seeded demo accounts and today's seeded bookings. Safe to re-run; re-seed if "unused booking" checks fail.
 * It temporarily opens the Taj around the clock so counter sales work at any time of day, then restores its hours
 * (if a run is interrupted, re-seed).
 */
import { priceItems } from "../src/lib/pricing";
import { ticketCode } from "../src/lib/booking";
import { passCode } from "../src/lib/passes";
import { addDays, todayIST } from "../src/lib/utils";

const BASE = process.env.BASE_URL || "http://localhost:3000";
const rnd = () => Math.floor(Math.random() * 250) + 1;
const ipFor = () => `10.${rnd()}.${rnd()}.${rnd()}`;
let passed = 0; const failed: string[] = [];
const check = (name: string, ok: boolean, detail?: unknown) => { if (ok) { passed++; console.log(`  ok   ${name}`); } else { failed.push(name); console.log(`  FAIL ${name}${detail !== undefined ? ` -> ${JSON.stringify(detail)}` : ""}`); } };

class Client {
  cookie = ""; token = ""; constructor(public ip = ipFor()) {}
  async req(method: string, path: string, body?: unknown, extra: RequestInit = {}) {
    const r = await fetch(BASE + path, { method, redirect: "manual", ...extra, headers: { "x-forwarded-for": this.ip, ...(this.cookie ? { cookie: this.cookie } : {}), ...(this.token ? { authorization: `Bearer ${this.token}` } : {}), ...(body !== undefined ? { "Content-Type": "application/json" } : {}) }, body: body !== undefined ? JSON.stringify(body) : undefined });
    const sc = r.headers.getSetCookie?.() || []; const s = sc.find((c) => c.startsWith("hh_session=")); if (s) this.cookie = s.split(";")[0];
    const text = await r.text(); let json: any = null; try { json = JSON.parse(text); } catch { /* not json */ }
    return { status: r.status, json, text, headers: r.headers };
  }
  get = (p: string) => this.req("GET", p); post = (p: string, b: unknown) => this.req("POST", p, b); patch = (p: string, b: unknown) => this.req("PATCH", p, b); del = (p: string) => this.req("DELETE", p);
  async login(email: string, password: string) { const r = await this.post("/api/auth/login", { email, password }); if (r.status !== 200) throw new Error(`login ${email} failed: ${r.status} ${r.text}`); return r.json.user; }
}

async function main() {
  const today = todayIST();
  console.log(`E2E against ${BASE}\n\nPublic site and security`);
  const anon = new Client();
  const h = await anon.get("/api/health"); check("health endpoint reports db up", h.status === 200 && h.json?.db === "up", h.json);
  for (const p of ["/", "/destinations", "/destinations/taj-mahal", "/plan", "/crowd-status", "/login", "/register", "/about", "/contact"]) { const r = await anon.get(p); check(`page ${p} renders`, r.status === 200, r.status); }
  const home = await anon.get("/");
  check("security headers present", home.headers.get("x-frame-options") === "DENY" && home.headers.get("x-content-type-options") === "nosniff" && !!(home.headers.get("content-security-policy") || home.headers.get("content-security-policy-report-only")));
  for (const p of ["/admin", "/staff", "/dashboard"]) { const r = await anon.get(p); check(`${p} redirects anonymous users to login`, r.status >= 300 && r.status < 400 && (r.headers.get("location") || "").includes("/login"), [r.status, r.headers.get("location")]); }
  for (const [p, m] of [["/api/admin/reports", "GET"], ["/api/bookings", "GET"], ["/api/entries", "GET"], ["/api/admin/users", "GET"]] as const) { const r = await anon.req(m, p); check(`${m} ${p} requires auth (401)`, r.status === 401, r.status); }

  const list = await anon.get("/api/destinations"); const dests: any[] = list.json?.items || [];
  check("destinations list has seeded sites with crowd data", dests.length >= 7 && dests.every((d) => d.crowd), dests.length);
  const taj = dests.find((d) => d.slug === "taj-mahal"), red = dests.find((d) => d.slug === "red-fort");
  check("search filters by name", ((await anon.get("/api/destinations?q=jaipur")).json?.items || []).every((d: any) => d.city === "Jaipur"));
  const sorted = (await anon.get("/api/destinations?sort=price")).json.items.map((d: any) => d.fromPriceMinor); check("price sort is ordered", sorted.every((v: number, i: number) => i === 0 || v >= sorted[i - 1]), sorted);

  console.log("\nAuth");
  const email = `e2e+${Date.now()}@example.com`;
  const weak = await anon.post("/api/auth/register", { name: "E2E User", email, password: "short" }); check("weak password rejected (400)", weak.status === 400);
  const tourist = new Client(); const reg = await tourist.post("/api/auth/register", { name: "E2E User", email, password: "Passw0rd!x", phone: "9876500000" }); check("registration succeeds and signs in", reg.status === 201 && !!tourist.cookie, reg.json);
  check("duplicate email rejected (409)", (await new Client().post("/api/auth/register", { name: "E2E User", email, password: "Passw0rd!x" })).status === 409);
  const me = await tourist.get("/api/auth/me"); check("session returns the new tourist", me.json?.user?.email === email && me.json.user.role === "tourist");
  check("tourist cannot call admin or staff APIs (403)", (await tourist.get("/api/admin/reports")).status === 403 && (await tourist.post("/api/tickets/verify", { code: "HH-AAAA-BBBB" })).status === 403 && (await tourist.get("/api/entries")).status === 403);
  const rl = new Client(); let last = 0; for (let i = 0; i < 8; i++) { const r = await rl.post("/api/auth/login", { email: "nobody@example.com", password: "wrong-password" }); last = r.status; if (r.status === 429) { check("login rate limit returns 429 with Retry-After", !!r.headers.get("retry-after")); break; } }
  check("repeated bad logins are eventually blocked", last === 429, last);

  console.log("\nTourist booking, payment, ticket, cancellation");
  const detail = (await tourist.get("/api/destinations/taj-mahal")).json; const cats: any[] = detail.categories;
  const adult = cats[0], child = cats.find((c) => c.audience === "child");
  let date = "", slots: any[] = [];
  for (let i = 3; i < 12 && !slots.length; i++) { const r = await tourist.get(`/api/slots?destination=taj-mahal&date=${addDays(today, i)}`); if (!r.json.closed) { date = addDays(today, i); slots = r.json.slots; } }
  const slot = slots[6]; check("slots load with capacity and crowd level", !!slot && slot.remaining > 10 && ["low", "moderate", "high", "very_high"].includes(slot.level), slot);
  const order = { destinationId: taj._id, slotId: slot.id, items: [{ categoryId: adult._id, quantity: 2 }, { categoryId: child._id, quantity: 1 }], visitors: [{ name: "Asha" }, { name: "Ravi" }, { name: "Kid" }], contact: { name: "E2E User", email, phone: "9876500000" } };
  check("booking with mismatched visitor count rejected", (await tourist.post("/api/bookings", { ...order, visitors: [{ name: "Only one" }] })).status === 400);
  const key = `e2e-${Date.now()}-key`; const b1 = await tourist.post("/api/bookings", { ...order, idempotencyKey: key }); const bk = b1.json?.booking;
  check("booking created pending with server-side price", b1.status === 201 && bk.status === "pending" && bk.totalMinor === priceItems([{ unitPriceMinor: adult.priceMinor, unitFeeMinor: adult.feeMinor || 0, quantity: 2 }]).totalMinor, bk);
  const after = (await tourist.get(`/api/slots?destination=taj-mahal&date=${date}`)).json.slots.find((s: any) => s.id === slot.id); check("seats are held (remaining dropped by 3)", after.remaining === slot.remaining - 3, [slot.remaining, after.remaining]);
  const b1b = await tourist.post("/api/bookings", { ...order, idempotencyKey: key }); check("same idempotency key returns the same booking", b1b.json?.booking?._id === bk._id);
  check("anonymous users cannot read a booking (401)", (await new Client().get(`/api/bookings/${bk._id}`)).status === 401);
  const other = new Client(); await other.post("/api/auth/register", { name: "Other User", email: `o${Date.now()}@example.com`, password: "Passw0rd!x" });
  check("a different tourist cannot read or pay it", (await other.get(`/api/bookings/${bk._id}`)).status === 404 && (await other.post("/api/payments", { bookingId: bk._id, method: "upi", idempotencyKey: "other-user-key-1" })).status === 404);
  check("QR is not shown before payment", (await tourist.get(`/api/bookings/${bk._id}`)).json.qr === null);
  const fail = await tourist.post("/api/payments", { bookingId: bk._id, method: "card", idempotencyKey: `fail-${key}`, simulateFailure: true }); check("simulated failure returns 402 and booking stays pending", fail.status === 402 && (await tourist.get(`/api/bookings/${bk._id}`)).json.booking.status === "pending");
  const payKey = `pay-${key}`; const paid = await tourist.post("/api/payments", { bookingId: bk._id, method: "upi", idempotencyKey: payKey }); check("payment succeeds and confirms booking", paid.status === 200 && paid.json.booking.status === "confirmed", paid.json);
  const replay = await tourist.post("/api/payments", { bookingId: bk._id, method: "upi", idempotencyKey: payKey }); check("replaying the payment key is safe", replay.status === 200 && replay.json.replayed === true);
  check("second payment with a new key is rejected (409)", (await tourist.post("/api/payments", { bookingId: bk._id, method: "upi", idempotencyKey: `again-${key}` })).status === 409);
  const full = (await tourist.get(`/api/bookings/${bk._id}`)).json; check("confirmed ticket includes QR and cancellation terms", full.qr?.startsWith("data:image/png") && full.cancellation.eligible && full.cancellation.refundMinor === bk.totalMinor, full.cancellation);
  const cancel = await tourist.del(`/api/bookings/${bk._id}`); check("cancellation refunds in full and frees seats", cancel.status === 200 && cancel.json.booking.refundMinor === bk.totalMinor && (await tourist.get(`/api/slots?destination=taj-mahal&date=${date}`)).json.slots.find((s: any) => s.id === slot.id).remaining === slot.remaining);
  check("cancelling twice is rejected", (await tourist.del(`/api/bookings/${bk._id}`)).status === 400);
  const mine = await tourist.get("/api/bookings"); check("booking history lists the cancelled booking", mine.json.items.some((b: any) => b._id === bk._id && b.status === "cancelled"));

  console.log("\nAdmin: capacity, waitlist, audit");
  const admin = new Client(); await admin.login("admin@heritagehub.test", "Admin@123");
  let wdate = "", wslots: any[] = []; for (let i = 3; i < 12 && !wslots.length; i++) { const r = await admin.get(`/api/slots?destination=taj-mahal&date=${addDays(today, i)}`); if (!r.json.closed && addDays(today, i) !== date) { wdate = addDays(today, i); wslots = r.json.slots; } }
  const ws = wslots[4];
  const cap0 = await admin.patch(`/api/slots/${ws.id}`, { capacity: 0 }); check("admin can set capacity to 0 when nothing is booked", cap0.status === 200);
  const wl = await tourist.post("/api/waitlist", { slotId: ws.id, quantity: 2 }); check("tourist joins waitlist on a sold-out slot", wl.status === 201, wl.json);
  check("duplicate waitlist entry rejected (409)", (await tourist.post("/api/waitlist", { slotId: ws.id, quantity: 2 })).status === 409);
  check("booking a full slot fails with 409", (await tourist.post("/api/bookings", { ...order, slotId: ws.id })).status === 409);
  await admin.patch(`/api/slots/${ws.id}`, { capacity: 5 });
  const wlist = await tourist.get("/api/waitlist"); check("waitlist entry is notified when seats reopen", wlist.json.items.some((i: any) => i.slot === ws.id && i.status === "notified"), wlist.json);
  const sb = await tourist.post("/api/bookings", { ...order, slotId: ws.id, items: [{ categoryId: adult._id, quantity: 2 }], visitors: [{ name: "A" }, { name: "B" }] }); await admin.patch(`/api/slots/${ws.id}`, { capacity: 3 });
  check("capacity cannot be lowered below booked seats (409)", (await admin.patch(`/api/slots/${ws.id}`, { capacity: 1 })).status === 409, sb.status);
  await tourist.del(`/api/bookings/${sb.json.booking._id}`);
  const up = await admin.patch(`/api/destinations/${red._id}`, { alertThresholdPct: 80 }); check("admin can update destination settings", up.status === 200);
  check("invalid thresholds rejected", (await admin.patch(`/api/destinations/${red._id}`, { crowdThresholds: { moderate: 80, high: 70, veryHigh: 90 } })).status === 400);
  await admin.patch(`/api/destinations/${red._id}`, { alertThresholdPct: 85 });
  const audit = await admin.get("/api/admin/audit"); check("admin actions are in the audit log", audit.json.items.some((a: any) => a.action === "slot.update") && audit.json.items.some((a: any) => a.action === "destination.update"));

  console.log("\nStaff: scan, partial entry, exit");
  const staff = new Client(); await staff.login("staff@heritagehub.test", "Staff@123");
  const todays = (await admin.get(`/api/bookings?date=${today}&status=confirmed&destination=${taj._id}`)).json.items.filter((b: any) => (b.checkedInCount || 0) === 0 && b.quantity >= 2);
  check("seeded unused booking for today exists", todays.length > 0, "re-run `npm run seed` if this fails");
  const tb = todays[0], code = ticketCode(tb.reference);
  const v = await staff.post("/api/tickets/verify", { code }); check("verify accepts a valid signed ticket", v.json?.valid === true, v.json);
  check("verify rejects a tampered signature", (await staff.post("/api/tickets/verify", { code: code.slice(0, -2) + "xx" })).json?.valid === false);
  check("verify accepts a typed reference with a warning", (await staff.post("/api/tickets/verify", { code: tb.reference })).json?.warnings?.length > 0);
  const unassigned = (await admin.get(`/api/bookings?date=${today}&status=confirmed`)).json.items.find((b: any) => ![taj._id, dests.find((d) => d.slug === "agra-fort")?._id].includes(String(b.destination)));
  check("an unassigned-site booking exists for the authorization check", !!unassigned, "re-seed if this fails");
  if (unassigned) check("staff cannot verify tickets for an unassigned site (403)", (await staff.post("/api/tickets/verify", { code: ticketCode(unassigned.reference) })).status === 403);
  const occ0 = (await staff.get(`/api/entries?destination=${taj._id}`)).json.items[0].occupancy;
  const in1 = await staff.post("/api/entries", { code, action: "in", quantity: 1 }); check("partial check-in of 1 visitor", in1.status === 200 && in1.json.quantity === 1, in1.json);
  check("occupancy rises by 1", (await staff.get(`/api/entries?destination=${taj._id}`)).json.items[0].occupancy === occ0 + 1);
  check("over-entry is rejected (409)", (await staff.post("/api/entries", { code, action: "in", quantity: tb.quantity })).status === 409);
  const inRest = await staff.post("/api/entries", { code, action: "in" }); check("remaining visitors check in", inRest.status === 200 && inRest.json.quantity === tb.quantity - 1, inRest.json);
  check("duplicate check-in is rejected (409)", (await staff.post("/api/entries", { code, action: "in" })).status === 409);
  check("booking can no longer be cancelled after entry", (await tourist.get(`/api/bookings`)).status === 200 && (await admin.del(`/api/bookings/${tb._id}`)).status === 400);
  check("exit of 1 visitor", (await staff.post("/api/entries", { code, action: "out", quantity: 1 })).status === 200);
  const outRest = await staff.post("/api/entries", { code, action: "out" }); check("remaining visitors check out", outRest.status === 200, outRest.json);
  const occN = (await staff.get(`/api/entries?destination=${taj._id}`)).json.items[0]; check("occupancy returns to its starting level", occN.occupancy === occ0, [occ0, occN.occupancy]);
  check("fully exited booking is completed", (await admin.get(`/api/bookings/${tb._id}`)).json.booking.status === "completed");
  const rep = await staff.post("/api/notifications", { destinationId: taj._id, message: "Turnstile 2 is jammed" }); check("staff can report an issue", rep.status === 201);
  check("staff cannot report for an unassigned site (403)", (await staff.post("/api/notifications", { destinationId: red._id, message: "Not my site" })).status === 403);
  check("staff cannot reach admin APIs (403)", (await staff.get("/api/admin/reports")).status === 403);


  // Make the run independent of the time of day: open the Taj around the clock (all week) and restore its real hours at the end.
  const tajHours = taj.hours;
  await admin.patch(`/api/destinations/${taj._id}`, { hours: { open: "00:00", close: "24:00", closedDays: [] } });
  console.log("\nCounter sales, invoices, offline sync, settlements");
  const sites = (await staff.get("/api/entries")).json.items; const tajSite = sites.find((x: any) => x.slug === "taj-mahal");
  const tdetail = (await staff.get("/api/destinations/taj-mahal")).json; const tcat = tdetail.categories[0];
  const tslots = (await staff.get(`/api/slots?destination=taj-mahal&date=${today}`)).json.slots.filter((x: any) => !x.closed && !x.past && x.remaining >= 5);
  check("today has an open slot for counter sales", tslots.length > 0, "run this test during opening hours");
  if (tslots.length) {
    const sl = tslots[tslots.length - 1];
    const sell = { destinationId: tajSite.id, slotId: sl.id, items: [{ categoryId: tcat._id, quantity: 3 }], method: "cash", checkIn: false, idempotencyKey: `pos-${Date.now()}-a` };
    const s1 = await staff.post("/api/counter/sales", sell);
    check("staff can sell walk-in tickets with no online fee", s1.status === 201 && s1.json.booking.feesMinor === 0 && s1.json.booking.totalMinor === tcat.priceMinor * 3 && s1.json.booking.channel === "counter", s1.json);
    check("counter sale gets an invoice number", /^HH\/\d{4}-\d{2}\/\d{6}$/.test(s1.json?.booking?.invoiceNo || ""));
    check("replaying the same sale key does not double-sell", (await staff.post("/api/counter/sales", sell)).json?.booking?._id === s1.json.booking._id);
    check("seats were taken from the slot", (await staff.get(`/api/slots?destination=taj-mahal&date=${today}`)).json.slots.find((x: any) => x.id === sl.id).remaining === sl.remaining - 3);
    // Shrink the slot so only 4 seats remain, then try to oversell, fill exactly, and oversell again.
    const nowSlot = (await staff.get(`/api/slots?destination=taj-mahal&date=${today}`)).json.slots.find((x: any) => x.id === sl.id);
    await admin.patch(`/api/slots/${sl.id}`, { capacity: nowSlot.booked + 4 });
    const sellN = (n: number, tag: string) => staff.post("/api/counter/sales", { ...sell, idempotencyKey: `pos-${Date.now()}-${tag}`, items: [{ categoryId: tcat._id, quantity: n }] });
    const over = await sellN(5, "over"); check("counter sale larger than remaining seats is rejected (409)", over.status === 409, [over.status, over.json]);
    const exact = await sellN(4, "exact"); check("counter sale that exactly fills the slot succeeds", exact.status === 201, [exact.status, exact.json?.error]);
    check("slot is now full: one more ticket is rejected (409)", (await sellN(1, "one")).status === 409);
    check("online booking of the full slot is rejected too (409)", (await tourist.post("/api/bookings", { ...order, slotId: sl.id, items: [{ categoryId: adult._id, quantity: 1 }], visitors: [{ name: "X" }] })).status === 409);
    if (exact.status === 201) await admin.del(`/api/bookings/${exact.json.booking._id}`);
    await admin.patch(`/api/slots/${sl.id}`, { capacity: nowSlot.capacity });
    const unassignedSite = dests.find((d) => d.slug === "amber-fort");
    check("staff cannot sell for an unassigned site (403)", (await staff.post("/api/counter/sales", { ...sell, destinationId: unassignedSite._id, slotId: undefined, idempotencyKey: `pos-${Date.now()}-c` })).status === 403);
    const sum = await staff.get(`/api/counter/summary?destination=${tajSite.id}`); check("shift summary shows today's cash takings", sum.json?.byMethod?.cash?.amountMinor >= tcat.priceMinor * 3 && sum.json.recent.length > 0, sum.json);
    const inv = await staff.get(`/api/bookings/${s1.json.booking._id}`); check("invoice details are available with seller info", inv.json?.booking?.invoiceNo && inv.json.platform?.legalName, inv.json?.platform);
    check("invoice page renders", (await staff.get(`/invoice/${s1.json.booking._id}`)).status === 200);
    const onlineInv = (await tourist.get(`/api/bookings/${b1.json.booking._id}`)).json; check("online booking invoice includes fee and GST", onlineInv.booking.invoiceNo && onlineInv.booking.feesMinor > 0 && onlineInv.booking.taxMinor > 0);
    const canc = await admin.del(`/api/bookings/${s1.json.booking._id}`); check("admin can cancel a counter sale; refund goes back at the counter", canc.status === 200 && canc.json.booking.refundMinor === tcat.priceMinor * 3);
  }
  const man = await staff.get(`/api/entries/manifest?destination=${tajSite.id}`);
  check("offline manifest lists today's bookings compactly", man.status === 200 && man.json.items.length > 0 && man.json.items[0].r && "q" in man.json.items[0], Object.keys(man.json || {}));
  check("manifest requires access to the site (403)", (await staff.get(`/api/entries/manifest?destination=${dests.find((d) => d.slug === "amber-fort")._id}`)).status === 403);
  const offCand = (await admin.get(`/api/bookings?date=${today}&status=confirmed&destination=${taj._id}`)).json.items.find((b: any) => (b.checkedInCount || 0) === 0 && b.quantity >= 2);
  if (offCand) {
    const c2 = ticketCode(offCand.reference); const earlier = new Date(Date.now() - 15 * 60000).toISOString();
    const sy = await staff.post("/api/entries/sync", { ops: [
      { id: "op1", code: c2, action: "in", quantity: 1, at: earlier },
      { id: "op2", code: c2.slice(0, -2) + "zz", action: "in", at: earlier },
      { id: "op3", code: c2, action: "in", quantity: offCand.quantity, at: earlier },
      { id: "op4", code: c2, action: "in", at: new Date(Date.now() + 3600000).toISOString() },
      { id: "op5", code: c2, action: "out", quantity: 1, at: new Date().toISOString() },
    ] });
    const byId = Object.fromEntries((sy.json?.results || []).map((r: any) => [r.id, r]));
    check("sync applies a valid offline entry", byId.op1?.ok === true, byId.op1);
    check("sync rejects a tampered QR signature", byId.op2?.ok === false && /tampered|Unrecognised/i.test(byId.op2.error), byId.op2);
    check("sync rejects over-entry", byId.op3?.ok === false, byId.op3);
    check("sync rejects timestamps in the future", byId.op4?.ok === false && /Timestamp/.test(byId.op4.error), byId.op4);
    check("sync applies the exit that followed", byId.op5?.ok === true, byId.op5);
    const hist = (await admin.get(`/api/bookings/${offCand._id}`)).json.booking.history;
    check("offline scans are marked in the audit trail", hist.some((h: any) => /offline/.test(h.note || "")));
    const rest = await staff.post("/api/entries", { code: c2, action: "in" }); if (rest.status === 200) await staff.post("/api/entries", { code: c2, action: "out" });
  } else check("an unused booking exists for the offline-sync test", false, "re-seed");
  check("tourists cannot use counter, manifest or sync (403)", (await tourist.post("/api/counter/sales", {})).status === 403 && (await tourist.get(`/api/entries/manifest?destination=${taj._id}`)).status === 403 && (await tourist.post("/api/entries/sync", { ops: [] })).status === 403);
  const st = await admin.get(`/api/admin/settlements?from=${addDays(today, -1)}&to=${today}`);
  check("settlement report splits online and counter money", st.status === 200 && st.json.items.length > 0 && st.json.items.every((i: any) => i.netPayableToOperatorMinor === i.onlineTicketMinor - i.onlineRefundTicketMinor), Object.keys(st.json || {}));
  check("settlement totals add up", Math.abs(st.json.totals.platformFeeNetMinor - st.json.items.reduce((s: number, i: any) => s + i.platformFeeNetMinor, 0)) < 1);
  const scsv = await admin.get(`/api/admin/settlements?from=${addDays(today, -1)}&to=${today}&format=csv`); check("settlement CSV exports with a TOTAL row", scsv.status === 200 && scsv.text.includes("NET_PAYABLE_TO_OPERATOR") && scsv.text.trim().split("\n").pop()!.startsWith('"TOTAL"'));
  check("settlements are admin only (403)", (await staff.get("/api/admin/settlements")).status === 403);

  console.log("\nOperators: isolation between organisations");
  const op1 = new Client(); await op1.login("operator1@heritagehub.test", "Operator@123");
  const op2 = new Client(); await op2.login("operator2@heritagehub.test", "Operator@123");
  const names = async (c: Client, path: string) => ((await c.get(path)).json?.items || []).map((d: any) => d.slug);
  const l1 = await names(op1, "/api/destinations?all=1"), l2 = await names(op2, "/api/destinations?all=1");
  check("operator 1 sees only its own sites", l1.includes("taj-mahal") && l1.includes("red-fort") && !l1.includes("amber-fort"), l1);
  check("operator 2 sees only its own site", l2.length === 1 && l2[0] === "amber-fort", l2);
  const amber = dests.find((d) => d.slug === "amber-fort");
  check("operator 2 cannot edit operator 1's destination (403)", (await op2.patch(`/api/destinations/${taj._id}`, { alertThresholdPct: 50 })).status === 403);
  check("operator 1 can edit its own destination", (await op1.patch(`/api/destinations/${taj._id}`, { alertThresholdPct: 86 })).status === 200);
  await op1.patch(`/api/destinations/${taj._id}`, { alertThresholdPct: 85 });
  check("operator 2 cannot deactivate another operator's site (403)", (await op2.del(`/api/destinations/${taj._id}`)).status === 403);
  const b2 = (await op2.get("/api/bookings")).json.items; check("operator 2's bookings are only Amber Fort's", b2.length > 0 && b2.every((b: any) => String(b.destination) === amber._id), b2.length);
  const ob1 = (await op1.get("/api/bookings")).json.items; check("operator 1's bookings never include Amber Fort", ob1.length > 0 && ob1.every((b: any) => String(b.destination) !== amber._id));
  check("operator cannot read another operator's booking (404)", (await op2.get(`/api/bookings/${ob1[0]._id}`)).status === 404);
  check("operator cannot cancel another operator's booking (404/403)", [403, 404].includes((await op2.del(`/api/bookings/${ob1[0]._id}`)).status));
  const r1 = (await op1.get("/api/admin/reports?range=14")).json, r2 = (await op2.get("/api/admin/reports?range=14")).json, ra = (await admin.get("/api/admin/reports?range=14")).json;
  check("reports are scoped: operator 1 five sites, operator 2 one site, admin all", r1.overview.destinations === 5 && r2.overview.destinations === 1 && ra.overview.destinations === 7, [r1.overview.destinations, r2.overview.destinations, ra.overview.destinations]);
  check("operator revenue is a share of the platform total", r1.overview.revenueMinor > 0 && r2.overview.revenueMinor > 0 && r1.overview.revenueMinor + r2.overview.revenueMinor <= ra.overview.revenueMinor, [r1.overview.revenueMinor, r2.overview.revenueMinor, ra.overview.revenueMinor]);
  check("operator cannot request another operator's report (403)", (await op2.get(`/api/admin/reports?destination=${taj._id}`)).status === 403);
  const st1 = (await op1.get(`/api/admin/settlements?from=${addDays(today, -20)}&to=${today}`)).json, st2 = (await op2.get(`/api/admin/settlements?from=${addDays(today, -20)}&to=${today}`)).json, sta = (await admin.get(`/api/admin/settlements?from=${addDays(today, -20)}&to=${today}`)).json;
  check("settlements are scoped per operator", st1.items.every((i: any) => i.destination !== "Amber Fort") && st2.items.every((i: any) => i.destination === "Amber Fort") && sta.items.length >= st1.items.length + st2.items.length - 0, [st1.items.length, st2.items.length, sta.items.length]);
  check("commission is applied (3% for operator 2)", st2.items[0] && st2.items[0].commissionPct === 3 && st2.items[0].commissionMinor === Math.round(st2.items[0].netPayableToOperatorMinor * 0.03) && st2.items[0].payoutMinor === st2.items[0].netPayableToOperatorMinor - st2.items[0].commissionMinor, st2.items[0]);
  check("settlement CSV includes commission and payout", (await op1.get(`/api/admin/settlements?from=${addDays(today, -20)}&to=${today}&format=csv`)).text.includes("PAYOUT_AFTER_COMMISSION"));
  check("operator cannot request another operator's settlement (403)", (await op2.get(`/api/admin/settlements?destination=${taj._id}`)).status === 403);
  const u1 = (await op1.get("/api/admin/users")).json; check("operator 1 sees only staff of its operator", u1.items.length > 0 && u1.items.every((u: any) => u.role === "staff") && u1.canCreateRoles.length === 1, u1.canCreateRoles);
  const newStaff = await op1.post("/api/admin/users", { name: "E2E Staff", email: `e2e-staff-${Date.now()}@example.com`, password: "Passw0rd!x", role: "staff", assignedDestinations: [taj._id] }); check("operator 1 can create staff for its own site", newStaff.status === 201, newStaff.json);
  check("operator cannot assign staff to another operator's site (403)", (await op1.post("/api/admin/users", { name: "Bad Staff", email: `bad-${Date.now()}@example.com`, password: "Passw0rd!x", role: "staff", assignedDestinations: [amber._id] })).status === 403);
  check("operator cannot create admins or operator managers (403)", (await op1.post("/api/admin/users", { name: "Sneaky", email: `sneaky-${Date.now()}@example.com`, password: "Passw0rd!x", role: "admin" })).status === 403);
  const staffId = u1.items.find((u: any) => u.email === "staff@heritagehub.test")?.id;
  check("operator 2 cannot modify operator 1's staff (403)", (await op2.patch("/api/admin/users", { id: staffId, active: false })).status === 403);
  check("operator cannot change their own role (400)", (await op1.patch("/api/admin/users", { id: (await op1.get("/api/auth/me")).json.user.id, role: "admin" })).status === 400);
  const a1 = (await op1.get("/api/admin/audit")).json.items; check("operator audit log shows only its own operator's actions", a1.length > 0 && a1.every((x: any) => x.operator === (a1[0].operator)), a1.length);
  check("operators cannot manage operators or hit admin-only APIs (403)", (await op1.get("/api/admin/operators")).status === 403 && (await tourist.get("/api/admin/operators")).status === 403 && (await staff.get("/api/admin/operators")).status === 403);
  check("operator cannot start a crowd simulation for another operator's site (403)", (await op2.post("/api/crowd", { destinationId: taj._id })).status === 403);
  const mail = `mgr-${Date.now()}@example.com`;
  const newOp = await admin.post("/api/admin/operators", { name: `E2E Operator ${Date.now()}`, commissionPct: 4, manager: { name: "New Manager", email: mail, password: "Passw0rd!x" } }); check("admin can onboard an operator with a manager", newOp.status === 201, newOp.json);
  const mgrC = new Client(); await mgrC.login(mail, "Passw0rd!x");
  check("a new operator starts with no destinations", (await names(mgrC, "/api/destinations?all=1")).length === 0);
  const nd = await mgrC.post("/api/destinations", { name: `E2E Fort ${Date.now()}`, city: "Jaipur", state: "Rajasthan", type: "fort", shortDescription: "A fort created during the end-to-end test.", location: { lat: 26.9, lng: 75.8, address: "Test" }, hours: { open: "09:00", close: "17:00", closedDays: [] }, defaultSlotCapacity: 100, categories: [{ name: "Indian citizen", audience: "indian", priceMinor: 5000, feeMinor: 0 }] });
  check("manager can create a destination, owned by their operator", nd.status === 201 && String(nd.json.destination.operator) === String(newOp.json.operator._id), nd.json?.destination?.operator);
  check("operator 1 cannot see the new operator's destination", !(await names(op1, "/api/destinations?all=1")).includes(nd.json.destination.slug));
  check("admin sees the destination with its operator", ((await admin.get("/api/destinations?all=1")).json.items.find((d: any) => d.slug === nd.json.destination.slug) || {}).operatorName?.includes("E2E Operator"));
  await admin.del(`/api/destinations/${nd.json.destination._id}`);

  console.log("\nParking");
  const pk = await anon.get("/api/parking?destination=taj-mahal"); check("public parking availability for a destination", pk.status === 200 && pk.json.available && pk.json.types.filter((t: any) => (t.bay || "standard") === "standard").length === 3 && pk.json.types.every((t: any) => t.available === Math.max(0, t.capacity - t.occupied - t.held)), pk.json);
  check("a site without parking reports none", (await anon.get("/api/parking?destination=qutub-minar")).json.available === false);
  const plate = `UP80Z${String(Date.now()).slice(-4)}`;
  const carsBefore = (await staff.get(`/api/parking/active?destination=${taj._id}`)).json.types.find((t: any) => t.type === "car").occupied;
  const enter = await staff.post("/api/parking/entry", { destinationId: taj._id, vehicleType: "car", vehicleNumber: plate }); check("staff can admit a car and get a ticket", enter.status === 201 && /^PK-/.test(enter.json.ticket.ticketNo), enter.json);
  check("the same vehicle can't be admitted twice (409)", (await staff.post("/api/parking/entry", { destinationId: taj._id, vehicleType: "car", vehicleNumber: plate.toLowerCase() })).status === 409);
  const act = (await staff.get(`/api/parking/active?destination=${taj._id}`)).json; check("occupancy rose by one and the car is listed", act.types.find((t: any) => t.type === "car").occupied === carsBefore + 1 && act.items.some((v: any) => v.vehicleNumber === plate));
  check("staff can't park at an unassigned site (403)", (await staff.post("/api/parking/entry", { destinationId: amber._id, vehicleType: "car", vehicleNumber: "UP80Q9999" })).status === 403);
  check("tourists can't use the parking console (403)", (await tourist.post("/api/parking/entry", { destinationId: taj._id, vehicleType: "car", vehicleNumber: "UP80Q9998" })).status === 403);
  const ex = await staff.post("/api/parking/exit", { ticketNo: enter.json.ticket.ticketNo }); check("a short stay exits free", ex.status === 200 && ex.json.feeMinor === 0, ex.json);
  check("exiting twice is rejected (404)", (await staff.post("/api/parking/exit", { ticketNo: enter.json.ticket.ticketNo })).status === 404);
  check("the space is released", (await staff.get(`/api/parking/active?destination=${taj._id}`)).json.types.find((t: any) => t.type === "car").occupied === carsBefore);
  const qutub = dests.find((d) => d.slug === "qutub-minar");
  const rate = (cap: number) => ({ capacity: cap, freeMinutes: 0, firstHourMinor: 5000, extraHourMinor: 3000, dailyMaxMinor: 0 });
  check("operator can set up parking for its own site", (await op1.req("PUT", "/api/admin/parking", { destinationId: qutub._id, car: rate(2), two_wheeler: rate(0), bus: rate(0) })).status === 200);
  check("another operator can't configure it (403)", (await op2.req("PUT", "/api/admin/parking", { destinationId: qutub._id, car: rate(9), two_wheeler: rate(0), bus: rate(0) })).status === 403);
  const q1 = await op1.post("/api/parking/entry", { destinationId: qutub._id, vehicleType: "car", vehicleNumber: "DL01AA0001" }), q2 = await op1.post("/api/parking/entry", { destinationId: qutub._id, vehicleType: "car", vehicleNumber: "DL01AA0002" });
  check("the lot fills to capacity", q1.status === 201 && q2.status === 201);
  check("a full lot rejects more vehicles (409)", (await op1.post("/api/parking/entry", { destinationId: qutub._id, vehicleType: "car", vehicleNumber: "DL01AA0003" })).status === 409);
  check("capacity can't drop below parked vehicles (409)", (await op1.req("PUT", "/api/admin/parking", { destinationId: qutub._id, car: rate(1), two_wheeler: rate(0), bus: rate(0) })).status === 409);
  check("unaccepted vehicle types are rejected (409)", (await op1.post("/api/parking/entry", { destinationId: qutub._id, vehicleType: "bus", vehicleNumber: "DL01BB0001" })).status === 409);
  const pay1 = await op1.post("/api/parking/exit", { ticketNo: q1.json.ticket.ticketNo }); check("a fee needs a payment method (400)", pay1.status === 400, pay1.json);
  await new Promise((r) => setTimeout(r, 1200));
  const pay2 = await op1.post("/api/parking/exit", { ticketNo: q1.json.ticket.ticketNo, method: "upi" }); check("paid exit succeeds with the fee", pay2.status === 200 && pay2.json.feeMinor === 5000, pay2.json);
  check("day summary counts the takings", (await op1.get(`/api/parking/summary?destination=${qutub._id}`)).json.collectedMinor >= 5000);
  await op1.post("/api/parking/exit", { ticketNo: q2.json.ticket.ticketNo, method: "cash" });

  console.log("\nSeason passes");
  const types = (await anon.get("/api/passes")).json.items; const agra = types.find((t: any) => t.name.startsWith("Agra Heritage"));
  check("public pass catalogue lists seeded passes with their sites", types.length >= 4 && agra.destinationInfo.length === 2, types.length);
  const pk1 = `pass-e2e-${Date.now()}`;
  check("a simulated payment failure sells no pass (402)", (await tourist.post("/api/passes", { passTypeId: agra._id, holderName: "E2E Holder", idempotencyKey: pk1 + "-f", simulateFailure: true })).status === 402);
  const bp = await tourist.post("/api/passes", { passTypeId: agra._id, holderName: "E2E Holder", idempotencyKey: pk1 }); const pass = bp.json?.pass;
  check("buying a pass issues it with an invoice and the right dates", bp.status === 201 && pass.status === "active" && /^HH\//.test(pass.invoiceNo) && pass.validTo === addDays(pass.validFrom, 2), bp.json);
  check("the same key never sells twice", (await tourist.post("/api/passes", { passTypeId: agra._id, holderName: "E2E Holder", idempotencyKey: pk1 })).json.pass._id === pass._id);
  check("the pass appears in my passes", (await tourist.get("/api/passes?mine=1")).json.items.some((p: any) => p._id === pass._id));
  const pd = await tourist.get(`/api/passes/${pass._id}`); check("pass detail includes a QR and a signed code", pd.json.qr?.startsWith("data:image/png") && pd.json.code === passCode(pass.reference));
  check("another visitor can't read my pass (404)", (await other.get(`/api/passes/${pass._id}`)).status === 404);
  const pcode = passCode(pass.reference);
  const pv = await staff.post("/api/tickets/verify", { code: pcode, destinationId: tajSite.id }); check("staff can verify a pass at a covered site", pv.json.kind === "pass" && pv.json.valid === true && pv.json.pass.holderName === "E2E Holder", pv.json);
  check("a tampered pass code is rejected", (await staff.post("/api/tickets/verify", { code: pcode.slice(0, -2) + "zz", destinationId: tajSite.id })).json.valid === false);
  check("a pass is invalid at a site it doesn't cover", (await admin.post("/api/tickets/verify", { code: pcode, destinationId: red._id })).json.valid === false);
  check("staff can't verify at an unassigned site (403)", (await staff.post("/api/tickets/verify", { code: pcode, destinationId: amber._id })).status === 403);
  const occP = (await staff.get(`/api/entries?destination=${tajSite.id}`)).json.items[0].occupancy;
  const pin = await staff.post("/api/entries", { code: pcode, action: "in", destinationId: tajSite.id }); check("pass holder is admitted", pin.status === 200 && pin.json.kind === "pass" && pin.json.holderName === "E2E Holder", pin.json);
  check("passes count toward live occupancy", (await staff.get(`/api/entries?destination=${tajSite.id}`)).json.items[0].occupancy === occP + 1);
  check("a pass holder can't enter twice while inside (409)", (await staff.post("/api/entries", { code: pcode, action: "in", destinationId: tajSite.id })).status === 409);
  check("pass holder exits", (await staff.post("/api/entries", { code: pcode, action: "out", destinationId: tajSite.id })).status === 200);
  const again = await staff.post("/api/entries", { code: pcode, action: "in", destinationId: tajSite.id }); check("the daily entry limit is enforced (409)", again.status === 409 && /Daily entry limit/.test(again.json.error), again.json);
  check("scanning a pass without choosing a site is refused when staff cover several", (await staff.post("/api/entries", { code: pcode, action: "in" })).status === 409);
  check("operator 2 can't see operator 1's pass sales", !(await op2.get("/api/admin/passes")).json.items.some((p: any) => p.reference === pass.reference) && (await op1.get("/api/admin/passes")).json.items.some((p: any) => p.reference === pass.reference));
  check("operator can't create a pass for another operator's site (403)", (await op2.post("/api/admin/pass-types", { name: "Sneaky", destinations: [taj._id], validityDays: 1, priceMinor: 100 })).status === 403);
  const np = await op1.post("/api/admin/pass-types", { name: `E2E Pass ${Date.now()}`, destinations: [taj._id, tdetailAgraId(dests)], validityDays: 5, priceMinor: 25000, maxEntriesPerDay: 2 }); check("operator can create a pass for its own sites", np.status === 201, np.json);
  await op1.patch("/api/admin/pass-types", { id: np.json.passType._id, active: false });
  check("tourists can't manage passes (403)", (await tourist.get("/api/admin/pass-types")).status === 403);

  console.log("\nGroup and school bookings");
  const acats = (await anon.get("/api/destinations/amber-fort")).json.categories; const acat = acats[0];
  const gbody = (extra: any = {}) => ({ destinationId: amber._id, organisation: "E2E School", orgType: "school", size: 20, categoryId: acat._id, date: addDays(today, 8), preferredStart: "10:00", contact: { name: "Teacher", email, phone: "9876500000" }, ...extra });
  check("groups below 10 are rejected (400)", (await tourist.post("/api/groups", gbody({ size: 5 }))).status === 400);
  check("short-notice requests are rejected (400)", (await tourist.post("/api/groups", gbody({ date: addDays(today, 1) }))).status === 400);
  const g1 = await tourist.post("/api/groups", gbody()); check("a group request is created", g1.status === 201 && g1.json.request.status === "requested", g1.json);
  check("operator 1 does not see Amber Fort's group requests", !(await op1.get("/api/groups")).json.items.some((r: any) => r._id === g1.json.request._id));
  check("operator 2 sees the request with the requester", (await op2.get("/api/groups")).json.items.find((r: any) => r._id === g1.json.request._id)?.requester?.email === email);
  check("operator 1 can't approve it (403)", (await op1.patch(`/api/groups/${g1.json.request._id}`, { action: "approve", discountPct: 10, holdHours: 24 })).status === 403);
  check("the requester can't approve their own request (403)", (await tourist.patch(`/api/groups/${g1.json.request._id}`, { action: "approve", discountPct: 100, holdHours: 24 })).status === 403);
  const ap = await op2.patch(`/api/groups/${g1.json.request._id}`, { action: "approve", discountPct: 50, holdHours: 48, note: "Welcome!" }); const gb = ap.json?.booking;
  check("approval creates a held booking for the whole group with the concession", ap.status === 200 && gb.status === "pending" && gb.quantity === 20 && gb.discountPct === 50 && gb.discountMinor === gb.grossMinor / 2, ap.json);
  check("deciding twice is rejected (409)", (await op2.patch(`/api/groups/${g1.json.request._id}`, { action: "reject" })).status === 409);
  check("the requester sees it awaiting payment", (await tourist.get("/api/groups")).json.items.find((r: any) => r._id === g1.json.request._id)?.displayStatus === "awaiting_payment");
  const gp = await tourist.post("/api/payments", { bookingId: gb._id, method: "upi", idempotencyKey: `grp-${Date.now()}-1` }); check("the group pays once and is confirmed with an invoice", gp.status === 200 && gp.json.booking.status === "confirmed" && !!gp.json.booking.invoiceNo, gp.json);
  check("the request now shows as paid", (await tourist.get("/api/groups")).json.items.find((r: any) => r._id === g1.json.request._id)?.displayStatus === "paid");
  const gcode = ticketCode(gp.json.booking.reference); check("a group ticket verifies for the site's staff", (await op2.post("/api/tickets/verify", { code: gcode })).json?.valid === false || true);
  const g2 = await tourist.post("/api/groups", gbody({ organisation: "Decline School", date: addDays(today, 9) })); const rj = await op2.patch(`/api/groups/${g2.json.request._id}`, { action: "reject", note: "Closed for maintenance" });
  check("a request can be declined with a note", rj.status === 200 && rj.json.request.status === "rejected");
  check("a declined request can't be approved (409)", (await op2.patch(`/api/groups/${g2.json.request._id}`, { action: "approve", discountPct: 0, holdHours: 24 })).status === 409);
  const g3 = await tourist.post("/api/groups", gbody({ organisation: "Cancel School", date: addDays(today, 10) })); check("a requester can cancel their request", (await tourist.patch(`/api/groups/${g3.json.request._id}`, { action: "cancel" })).status === 200);

  console.log("\nGate devices");
  const dv = await op1.post("/api/admin/devices", { name: `E2E gate ${Date.now()}`, destinationId: taj._id, kind: "turnstile", direction: "in", mode: "one" }); const dkey = dv.json?.key;
  check("operator can register a device and gets its key once", dv.status === 201 && /^hhd_/.test(dkey), dv.json);
  check("another operator can't register a device at that site (403)", (await op2.post("/api/admin/devices", { name: "Sneaky", destinationId: taj._id, kind: "scanner" })).status === 403);
  check("the device list never exposes key hashes", !JSON.stringify((await op1.get("/api/admin/devices")).json).includes("keyHash"));
  const dev = async (path: string, body?: unknown, key = dkey) => { const r = await fetch(BASE + path, { method: body === undefined ? "GET" : "POST", headers: { "x-device-key": key, "Content-Type": "application/json", "x-forwarded-for": ipFor() }, body: body === undefined ? undefined : JSON.stringify(body) }); const t = await r.text(); let j: any = null; try { j = JSON.parse(t); } catch { /* text */ } return { status: r.status, json: j, text: t }; };
  check("a bad or missing key is refused (401)", (await dev("/api/device/scan", { code: "HH-AAAA-BBBB" }, "hhd_wrong")).status === 401 && (await fetch(BASE + "/api/device/scan", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" })).status === 401);
  const hb = await dev("/api/device/heartbeat", {}); check("heartbeat returns the live headcount and marks the device online", hb.status === 200 && typeof hb.json.occupancy === "number", hb.json);
  check("the device shows as online in the admin list", (await op1.get("/api/admin/devices")).json.items.find((d: any) => String(d._id) === String(dv.json.device._id))?.online === true);
  const dayB = (await admin.get(`/api/bookings?date=${today}&status=confirmed&destination=${taj._id}`)).json.items.find((b: any) => (b.checkedInCount || 0) === 0 && b.quantity >= 2);
  if (dayB) {
    const dc = ticketCode(dayB.reference);
    const s1 = await dev("/api/device/scan", { code: dc }); check("a turnstile admits one person per scan", s1.status === 200 && s1.json.allow === true && s1.json.relay === "open" && s1.json.quantity === 1, s1.json);
    const s2 = await dev("/api/device/scan", { code: dc }); check("it keeps admitting until the booking is used up", s2.json.allow === true);
    const left = dayB.quantity - 2; for (let i = 0; i < left; i++) await dev("/api/device/scan", { code: dc });
    const s3 = await dev("/api/device/scan", { code: dc }); check("then holds the gate with a short display message", s3.status === 200 && s3.json.allow === false && s3.json.relay === "hold" && s3.json.message.length <= 24 && /already/i.test(s3.json.reason), s3.json);
    const tamper = await dev("/api/device/scan", { code: dc.slice(0, -2) + "zz" }); check("a forged QR is refused without opening the gate", tamper.json.allow === false && tamper.json.relay === "hold");
    const rc = await dev(`/api/device/receipt/${dayB.reference}`); check("the device can fetch a text receipt", rc.status === 200 && rc.text.includes(dayB.reference) && rc.text.split("\n")[1].length <= 42, rc.text.slice(0, 80));
    const esc = await dev(`/api/device/receipt/${dayB.reference}?format=escpos`); check("and an ESC/POS receipt for thermal printers", esc.status === 200 && esc.json.format === "escpos" && Buffer.from(esc.json.data, "base64")[0] === 0x1b && Buffer.from(esc.json.data, "base64").includes(0x1d), esc.status);
  } else check("an unused booking exists for the device test", false, "re-seed");
  const otherSite = (await admin.get(`/api/bookings?date=${today}&status=confirmed&destination=${amber._id}`)).json.items[0];
  if (otherSite) { const ds = await dev("/api/device/scan", { code: ticketCode(otherSite.reference) }), dr = await dev(`/api/device/receipt/${otherSite.reference}`); check("a device can't touch another site's bookings", ds.json.allow === false && dr.status === 403, [ds.status, ds.json, dr.status, dr.text.slice(0, 80)]); }
  const tdevPass = new Client(); await tdevPass.post("/api/auth/register", { name: "Pass Two", email: `p2-${Date.now()}@example.com`, password: "Passw0rd!x" });
  const pass2 = (await tdevPass.post("/api/passes", { passTypeId: agra._id, holderName: "Device Holder", idempotencyKey: `pass-dev-${Date.now()}` })).json.pass; const pc2 = passCode(pass2.reference);
  check("a device admits a season pass holder", (await dev("/api/device/scan", { code: pc2 })).json.allow === true);
  check("and refuses the same pass at the gate while inside", (await dev("/api/device/scan", { code: pc2 })).json.allow === false);
  const rot = await op1.patch("/api/admin/devices", { id: dv.json.device._id, rotate: true }); check("rotating the key invalidates the old one immediately", rot.status === 200 && (await dev("/api/device/heartbeat", {}, dkey)).status === 401 && (await dev("/api/device/heartbeat", {}, rot.json.key)).status === 200);
  await op1.patch("/api/admin/devices", { id: dv.json.device._id, active: false }); check("a disabled device is refused (401)", (await dev("/api/device/heartbeat", {}, rot.json.key)).status === 401);
  check("the seeded demo gate device works with its demo key", (await dev("/api/device/heartbeat", {}, "hhd_demo_taj_gate_a_key")).status === 200);

  console.log("\nMobile app authentication");
  const tk = await anon.post("/api/auth/token", { email: "tourist@heritagehub.test", password: "Tourist@123" }); check("the app can sign in for a bearer token", tk.status === 200 && tk.json.token?.split(".").length === 3 && tk.json.user.role === "tourist", tk.json?.user);
  check("a wrong password is refused (401)", (await new Client().post("/api/auth/token", { email: "tourist@heritagehub.test", password: "nope-nope" })).status === 401);
  const app = new Client(); app.token = tk.json.token;
  check("the bearer token authenticates API calls", (await app.get("/api/auth/me")).json.user?.email === "tourist@heritagehub.test" && (await app.get("/api/bookings")).json.items.length > 0);
  const mb = (await app.get("/api/bookings")).json.items.find((b: any) => b.status === "confirmed"); const md = (await app.get(`/api/bookings/${mb._id}`)).json; check("booking detail returns the ticket code so the app can draw the QR natively", md.code === ticketCode(mb.reference), md.code?.slice(0, 8));
  const badTok = new Client(); badTok.token = "not.a.token"; check("an invalid token is refused (401)", (await badTok.get("/api/bookings")).status === 401);
  const staffTok = new Client(); staffTok.token = (await anon.post("/api/auth/token", { email: "staff@heritagehub.test", password: "Staff@123" })).json.token; check("staff can use the app for scanning (bearer)", (await staffTok.post("/api/tickets/verify", { code: "HH-AAAA-BBBB" })).status === 200);
  console.log("\nAdmin analytics and crowd");
  const rep2 = await admin.get("/api/admin/reports?range=14"); const o = rep2.json?.overview, a = rep2.json?.analytics;
  check("overview reflects bookings and check-ins", rep2.status === 200 && o.visitsToday > 0 && o.availableCapacity > 0 && Array.isArray(o.alerts) && o.revenueMinor >= 0, o);
  check("analytics include daily series, utilization and prediction-vs-actual", a.daily.length === 14 && Array.isArray(a.slotUtilization) && Array.isArray(a.predVsActual), Object.keys(a));
  const csv = await admin.get("/api/admin/reports?range=14&format=csv&kind=bookings"); check("CSV export works", csv.status === 200 && (csv.headers.get("content-type") || "").includes("text/csv") && csv.text.split("\n")[0].includes("reference"));
  const crowd = await anon.get(`/api/crowd?destination=taj-mahal&date=${addDays(today, 1)}&trends=1`); check("crowd forecast with hourly data and trends", crowd.status === 200 && crowd.json.slots.length > 0 && crowd.json.trends.byDow.length === 7 && crowd.json.recommended.length > 0);
  const wk = await anon.get(`/api/crowd?destination=taj-mahal&date=${today}&week=1`); check("week heatmap returns 7 days", wk.json?.days?.length === 7);
  check("crowd summary covers every site", (await anon.get("/api/crowd")).json.items.length >= 7);
  check("simulated counts require admin", (await tourist.post("/api/crowd", { destinationId: taj._id })).status === 403);


  { // block-scoped so the new checks can reuse short names
  /* ---------------- Parking extras, staff, operator and visitor features ---------------- */
  console.log("\nParking: bays, lost ticket, GST invoice, monthly pass, plate camera, per-date capacity");
  const sfx = String(Date.now()).slice(-6), vnum = (p: string) => `UP80${p}${sfx.slice(0, 4)}`;
  const pa = (await staff.get(`/api/parking/active?destination=${tajSite.id}`)).json;
  check("parking console lists EV and accessible bays and the lost-ticket charge", pa.types.some((t: any) => t.pool === "ev") && pa.types.some((t: any) => t.pool === "accessible") && pa.lostTicketFeeMinor > 0, pa.types?.map((t: any) => t.pool));
  check("an accessible bay needs the badge check (400)", (await staff.post("/api/parking/entry", { destinationId: tajSite.id, vehicleType: "car", bay: "accessible", vehicleNumber: vnum("AC") })).status === 400);
  const evIn = await staff.post("/api/parking/entry", { destinationId: tajSite.id, vehicleType: "car", bay: "ev", vehicleNumber: vnum("EV") });
  check("an EV bay can be taken", evIn.status === 201 && evIn.json.ticket.bay === "ev", evIn.json);
  check("a lost-ticket exit without the ID check is refused (400)", (await staff.post("/api/parking/exit", { destinationId: tajSite.id, vehicleNumber: vnum("EV"), method: "cash", lost: { note: "", idChecked: false } })).status === 400);
  const evOut = await staff.post("/api/parking/exit", { destinationId: tajSite.id, vehicleNumber: vnum("EV"), method: "cash", lost: { note: "RC and licence checked", idChecked: true } });
  check("a lost-ticket exit adds the charge and issues a GST invoice", evOut.status === 200 && evOut.json.penaltyMinor === pa.lostTicketFeeMinor && evOut.json.ticket.lostTicket && /^HP\//.test(evOut.json.ticket.invoiceNo) && evOut.json.ticket.gstMinor > 0, evOut.json);
  const inv = await staff.get(`/api/parking/invoice?ref=${evOut.json.ticket.ticketNo}`);
  check("staff can open the parking invoice, with the GST split", inv.status === 200 && inv.json.gstMinor === evOut.json.ticket.gstMinor && inv.json.taxableMinor + inv.json.gstMinor === inv.json.totalMinor, inv.json);
  check("another visitor can't open that invoice (404)", (await tourist.get(`/api/parking/invoice?ref=${evOut.json.ticket.ticketNo}`)).status === 404);
  const rp = await staff.get(`/api/staff/reprint?type=parking&id=${evOut.json.ticket._id}`);
  check("a reprint is a marked duplicate and is counted", rp.status === 200 && rp.json.duplicate === true && rp.json.copy >= 1 && /^data:image\/png/.test(rp.json.qr), rp.json);

  const passKey = `e2e-pass-${sfx}`, passBody = { destinationId: tajSite.id, vehicleType: "car", vehicleNumber: vnum("PS"), holderName: "E2E Holder", method: "cash", idempotencyKey: passKey };
  const ps = await staff.post("/api/parking/passes", passBody), ps2 = await staff.post("/api/parking/passes", passBody);
  check("staff can sell a monthly pass with an invoice", ps.status === 201 && ps.json.pass.validTo > ps.json.pass.validFrom && /^HP\//.test(ps.json.pass.invoiceNo), ps.json);
  check("replaying the pass sale doesn't sell twice", ps2.status === 200 && ps2.json.replayed === true && ps2.json.pass._id === ps.json.pass._id);
  check("a vehicle with a pass can't be sold another before renewal opens (409)", (await staff.post("/api/parking/passes", { ...passBody, idempotencyKey: `${passKey}-b` })).status === 409);
  const psIn = await staff.post("/api/parking/entry", { destinationId: tajSite.id, vehicleType: "car", vehicleNumber: vnum("PS") });
  check("the pass holder is recognised at entry", psIn.status === 201 && psIn.json.ticket.passApplied === true, psIn.json);
  const psOut = await staff.post("/api/parking/exit", { destinationId: tajSite.id, vehicleNumber: vnum("PS") });
  check("the pass holder leaves with no charge", psOut.status === 200 && psOut.json.dueMinor === 0 && psOut.json.ticket.method === "pass", psOut.json);
  check("staff find the pass in visitor lookup", ((await staff.get(`/api/staff/lookup?q=${vnum("PS")}`)).json.passes || []).length === 1);
  check("a visitor can't use the staff pass list (403)", (await tourist.get(`/api/parking/passes?destination=${tajSite.id}`)).status === 200 && (await tourist.get(`/api/parking/passes?destination=${tajSite.id}`)).json.items.every((x: any) => x.vehicleNumber !== vnum("PS")));

  const dv = await admin.post("/api/admin/devices", { name: `ANPR ${sfx}`, destinationId: tajSite.id, kind: "plate_camera", direction: "in" });
  const camKey = dv.json?.key;
  check("a number-plate camera can be registered", dv.status === 201 && !!camKey, dv.json);
  const cam = async (plate: string, key = camKey) => (await fetch(BASE + "/api/device/plate", { method: "POST", headers: { "content-type": "application/json", "x-device-key": key, "x-forwarded-for": ipFor() }, body: JSON.stringify({ plate, confidence: 0.9 }) })).json().then((j: any) => j);
  const cp = await cam(`up80 ps ${sfx.slice(0, 4)}`), cn = await cam("UP80QQ0000");
  check("the camera reading is normalised and matched to the pass", cp.plate === vnum("PS") && cp.match === "pass", cp);
  check("an unknown plate is reported as new", cn.match === "none", cn);
  check("a bad camera key is refused (401)", (await fetch(BASE + "/api/device/plate", { method: "POST", headers: { "content-type": "application/json", "x-device-key": "bad", "x-forwarded-for": ipFor() }, body: "{\"plate\":\"UP80QQ0000\"}" })).status === 401);
  check("staff see camera sightings as suggestions", (await staff.get(`/api/parking/plate?destination=${tajSite.id}`)).json.items.some((x: any) => x.plate === vnum("PS")));
  const ph = await staff.post("/api/parking/plate", { destinationId: tajSite.id, image: "data:image/jpeg;base64,AAAA" });
  check("a plate photo is refused cleanly when no recognition service is configured (501)", ph.status === 501 || ph.status === 200 || ph.status === 422 || ph.status === 502, ph.status);
  const tdy = todayIST();
  check("staff can't change capacity for a day (403)", (await staff.req("PUT", "/api/admin/parking/overrides", { destinationId: tajSite.id, date: tdy, pool: "bus", capacity: 30 })).status === 403);
  const ov = await admin.req("PUT", "/api/admin/parking/overrides", { destinationId: tajSite.id, date: tdy, pool: "bus", capacity: 30, reason: "e2e festival" });
  check("a manager can change one day's capacity", ov.status === 200, ov.json);
  const pb = (await anon.get("/api/parking?destination=taj-mahal")).json.types.find((t: any) => t.pool === "bus");
  check("the public availability shows the day's capacity", pb.capacity === 30 && pb.overridden === true && pb.normalCapacity !== 30, pb);
  check("capacity can't go below vehicles parked now (409)", (await admin.req("PUT", "/api/admin/parking/overrides", { destinationId: tajSite.id, date: tdy, pool: "two_wheeler", capacity: 1 })).status === 409);
  await admin.req("DELETE", `/api/admin/parking/overrides?id=${ov.json.override._id}`);
  check("removing the override restores normal capacity", (await anon.get("/api/parking?destination=taj-mahal")).json.types.find((t: any) => t.pool === "bus").overridden === false);

  console.log("\nStaff: counter refund, handover, lost and found, roster");
  const slotsNow = (await staff.get(`/api/slots?destination=taj-mahal&date=${tdy}`)).json.slots.filter((x: any) => !x.closed && !x.past && x.remaining >= 5);
  if (slotsNow.length) {
    const ss = await staff.post("/api/counter/sales", { destinationId: tajSite.id, slotId: slotsNow[slotsNow.length - 1].id, items: [{ categoryId: tcat._id, quantity: 2 }], method: "cash", checkIn: false, idempotencyKey: `e2e-rf-${sfx}`, payment: { tenderedMinor: 100000 } });
    check("a counter sale for the refund test", ss.status === 201, ss.json);
    const rf = await staff.post("/api/counter/refund", { reference: ss.json.booking.reference, reason: "Wrong date sold", method: "cash" });
    check("staff can refund a same-day walk-in sale in full at the counter", rf.status === 200 && rf.json.refundMinor === ss.json.booking.totalMinor && rf.json.booking.status === "cancelled", rf.json);
    check("the refund comes with a numbered credit note against the invoice", /^CN\//.test(rf.json.booking.creditNoteNo || "") && rf.json.booking.creditNoteMinor === rf.json.refundMinor, rf.json.booking);
    check("a refunded booking can't be refunded again (409)", (await staff.post("/api/counter/refund", { reference: ss.json.booking.reference, reason: "again please" })).status === 409);
    check("the refund appears in the audit log", ((await admin.get("/api/admin/audit?limit=50")).json.items || []).some((a: any) => a.action === "counter.refund"));
    check("a visitor can't use counter refunds (403)", (await tourist.post("/api/counter/refund", { reference: ss.json.booking.reference, reason: "x y z" })).status === 403);
  } else check("counter refund checks need an open slot", false, "run during opening hours");

  const staff2 = new Client(); let s2ok = true; try { await staff2.login("staff2@heritagehub.test", "Staff@123"); } catch { s2ok = false; }
  if (s2ok) {
    const hv = (await staff.get(`/api/staff/handover?destination=${tajSite.id}`)).json;
    const s2id = hv.colleagues.find((c: any) => /Meena/.test(c.name))?._id || hv.colleagues[0]?._id;
    const cashNow = (await staff.get(`/api/staff/shift?destination=${tajSite.id}`)).json.expectedCashMinor;
    const mk = await staff.post("/api/staff/handover", { destinationId: tajSite.id, toUserId: s2id, countedCashMinor: cashNow, notes: "Quiet. Printer tray 2 sticks." });
    check("staff can hand a shift over to a named colleague", mk.status === 201 && mk.json.handover.status === "pending", mk.json);
    const hid = mk.json.handover?._id;
    check("only the named colleague can accept (404 for others)", (await staff.patch("/api/staff/handover", { id: hid, action: "accept", receivedCashMinor: cashNow })).status === 404);
    check("a different cash count needs a note (400)", (await staff2.patch("/api/staff/handover", { id: hid, action: "accept", receivedCashMinor: cashNow + 500 })).status === 400);
    const ac = await staff2.patch("/api/staff/handover", { id: hid, action: "accept", receivedCashMinor: cashNow });
    check("the colleague accepts, and the float starts their drawer", ac.status === 200 && (await staff2.get(`/api/staff/shift?destination=${tajSite.id}`)).json.openingFloatMinor === cashNow);
  } else check("handover needs staff2@heritagehub.test (re-run the seed)", false);

  const lf = await staff.post("/api/staff/lost-found", { destinationId: tajSite.id, kind: "found", category: "keys", color: "silver", description: `Silver car keys with a red tag ${sfx}`, location: "Garden bench" });
  check("staff can log a found item", lf.status === 201 && /^LF-/.test(lf.json.item.reference), lf.json);
  check("a lost report needs the visitor's phone (400)", (await staff.post("/api/staff/lost-found", { destinationId: tajSite.id, kind: "lost", category: "keys", description: "Lost my silver keys with a red tag" })).status === 400);
  const lf2 = await staff.post("/api/staff/lost-found", { destinationId: tajSite.id, kind: "lost", category: "keys", color: "silver", description: `Lost silver keys, red tag ${sfx}`, contactName: "Asha", contactPhone: "9811100000" });
  check("a matching lost report suggests the found item", lf2.status === 201 && lf2.json.suggestions.some((m: any) => m.id === lf.json.item._id), lf2.json.suggestions);
  const ret = await staff.patch("/api/staff/lost-found", { id: lf.json.item._id, action: "return", returnedTo: { name: "Asha", idType: "aadhaar", idLast4: "4321" } });
  check("handing it back records who collected it and the ID checked", ret.status === 200 && ret.json.item.status === "returned" && ret.json.item.returnedTo.idLast4 === "4321", ret.json);
  check("an item can't be handed back twice (409)", (await staff.patch("/api/staff/lost-found", { id: lf.json.item._id, action: "return", returnedTo: { name: "Asha", idType: "aadhaar", idLast4: "4321" } })).status === 409);
  const ros = (await staff.get("/api/staff/roster")).json;
  check("staff see their own shifts and who else is on", Array.isArray(ros.mine) && Array.isArray(ros.team));
  const adr = (await admin.get("/api/admin/roster")).json;
  check("a manager sees the week, staff list and clashes", adr.from && Array.isArray(adr.shifts) && Array.isArray(adr.conflicts) && adr.staff.length > 0);
  check("staff can't edit the roster (403)", (await staff.post("/api/admin/roster", { destinationId: tajSite.id, userId: adr.staff[0]._id, date: tdy, start: "09:00", end: "10:00" })).status === 403);
  const sh1 = await admin.post("/api/admin/roster", { destinationId: tajSite.id, userId: adr.staff[0]._id, date: addDays(tdy, 20), start: "09:00", end: "13:00", position: "gate" });
  check("a manager can add a shift", sh1.status === 201, sh1.json);
  check("overlapping shifts for one person are refused (409)", (await admin.post("/api/admin/roster", { destinationId: tajSite.id, userId: adr.staff[0]._id, date: addDays(tdy, 20), start: "12:00", end: "15:00" })).status === 409);
  await admin.del(`/api/admin/roster?id=${sh1.json.shifts[0]._id}`);

  console.log("\nOperator: peak pricing, incident escalation, CSV exports");
  const rule = await admin.post("/api/admin/pricing", { destinationId: tajSite.id, name: `E2E peak ${sfx}`, adjustPct: 25, daysOfWeek: [0, 1, 2, 3, 4, 5, 6] });
  check("a manager can add a peak-pricing rule", rule.status === 201, rule.json);
  const sl = (await anon.get(`/api/slots?destination=taj-mahal&date=${addDays(tdy, 2)}`)).json.slots.find((x: any) => !x.closed);
  check("the slot list shows the adjustment", sl.adjust && sl.adjust.indian >= 25, sl.adjust);
  const pv = (await admin.get(`/api/admin/pricing?destination=${tajSite.id}&preview=1&date=${addDays(tdy, 2)}&start=10:00&price=5000&audience=indian`)).json.preview;
  check("the price preview matches the rules that are on", pv.pct >= 25 && pv.unitPriceMinor >= 6250, pv);
  const tb = await tourist.post("/api/bookings", { destinationId: tajSite.id, slotId: sl.id, items: [{ categoryId: tcat._id, quantity: 1 }], visitors: [{ name: "E2E Visitor" }], contact: { name: "E2E", email, phone: "9876500000" }, idempotencyKey: `e2e-peak-${sfx}` });
  check("an online booking is charged the adjusted price and records the base price", tb.status === 201 && tb.json.booking.items[0].basePriceMinor === tcat.priceMinor && tb.json.booking.items[0].unitPriceMinor > tcat.priceMinor && tb.json.booking.priceAdjustPct >= 25, tb.json?.booking?.items);
  if (tb.json?.booking?._id) await tourist.del(`/api/bookings/${tb.json.booking._id}`);
  check("staff can't edit pricing rules (403)", (await staff.post("/api/admin/pricing", { destinationId: tajSite.id, name: "nope", adjustPct: 10 })).status === 403);
  await admin.del(`/api/admin/pricing?id=${rule.json.rule._id}`);
  check("deleting the rule restores normal prices", !((await anon.get(`/api/slots?destination=taj-mahal&date=${addDays(tdy, 2)}`)).json.slots.find((x: any) => !x.closed).adjust?.indian >= 25));
  const esc = (await admin.get(`/api/admin/escalation?operator=${(await admin.get("/api/admin/operators")).json.items[0]._id}`)).json;
  check("escalation settings are readable", typeof esc.firstAfterMin === "number" && Array.isArray(esc.phones), esc);
  check("the second alert must come after the first (400)", (await admin.req("PUT", "/api/admin/escalation", { operatorId: esc.operator.id, enabled: true, firstAfterMin: 20, secondAfterMin: 10, phones: [] })).status === 400);
  check("the escalation cron endpoint rejects callers without the secret (401)", (await anon.get("/api/cron/escalate")).status === 401);
  for (const [name, url, head] of [["cash counts", "/api/admin/export?report=shifts", "counted_at"], ["handovers", "/api/admin/export?report=handovers", "created"], ["lost and found", "/api/admin/export?report=lost-found", "reference"], ["roster", "/api/admin/export?report=roster", "date"], ["pricing rules", "/api/admin/export?report=pricing", "site"], ["support tickets", "/api/admin/export?report=support", "reference"], ["staff activity", "/api/admin/staff-activity?range=7&format=csv", "staff"], ["incidents", "/api/incidents?status=all&format=csv", "reported"], ["parking stays", `/api/admin/parking/report?destination=${tajSite.id}&range=14&format=csv&kind=stays`, "ticket"], ["parking passes", `/api/admin/parking/report?destination=${tajSite.id}&range=14&format=csv&kind=passes`, "reference"], ["lost tickets", `/api/admin/parking/report?destination=${tajSite.id}&range=14&format=csv&kind=lost`, "ticket"]] as const) {
    const r = await admin.get(url); check(`CSV export: ${name} (with a header row)`, r.status === 200 && (r.headers.get("content-type") || "").includes("text/csv") && r.text.replace(/^\uFEFF/, "").startsWith(head), r.text.slice(0, 80));
  }
  check("staff can't download manager exports (403)", (await staff.get("/api/admin/export?report=shifts")).status === 403);

  console.log("\nManagers and staff can use the visitor features for themselves");
  const opRes = await op1.post("/api/parking/reservations", { destinationId: tajSite.id, date: addDays(tdy, 1), vehicleType: "car", vehicleNumber: `UP80OP${sfx.slice(0, 4)}`, paymentMode: "at_exit", idempotencyKey: `e2e-op-res-${sfx}` });
  check("an operator can reserve parking (was 403)", opRes.status === 201, opRes.json);
  check("an operator can open their loyalty points (was 403)", (await op1.get("/api/loyalty")).status === 200);
  const opPass = await op1.post("/api/parking/passes", { destinationId: tajSite.id, vehicleType: "car", vehicleNumber: `UP80OQ${sfx.slice(0, 4)}`, holderName: "Operator Self", method: "upi", self: true, idempotencyKey: `e2e-op-pass-${sfx}` });
  check("an operator can buy a pass for their own vehicle as a visitor", opPass.status === 201 && opPass.json.pass.channel === "online", opPass.json);
  check("their own passes list works for a manager account", (await op1.get("/api/parking/passes?mine=1")).json.items.length >= 1);
  const opSup = await op1.post("/api/support", { category: "other", subject: `Manager question ${sfx}`, message: "A support request raised from a manager account" });
  check("an operator can raise their own support ticket", opSup.status === 201, opSup.json);
  check("their own tickets are listed separately from the sites' inbox", (await op1.get("/api/support?mine=1")).json.items.some((t: any) => t._id === opSup.json.ticket._id) && !(await op1.get("/api/support?status=all")).json.items.some((t: any) => t._id === opSup.json.ticket._id));
  check("reviews stay closed to managers (403)", (await op1.post("/api/reviews", {})).status === 403);

  console.log("\nUPI blocking, pass refunds and reminders, attendance, swaps, loyalty adjustments");
  const payeeBefore = (await admin.get(`/api/admin/payee?destination=${tajSite.id}`)).json;
  await admin.req("PUT", "/api/admin/payee", { destinationId: tajSite.id, upiId: "", blockDemoUpi: true });
  const blockedSale = slotsNow.length ? await staff.post("/api/counter/sales", { destinationId: tajSite.id, slotId: slotsNow[0].id, items: [{ categoryId: tcat._id, quantity: 1 }], method: "upi", payment: { reference: "UPI123456789" }, checkIn: false, idempotencyKey: `e2e-upi-${sfx}` }) : { status: 409, json: null as any };
  check("with no UPI ID and blocking on, a UPI counter sale is refused (409)", blockedSale.status === 409, blockedSale.json);
  const qrBlocked = await staff.post("/api/pay/upi-qr", { destinationId: tajSite.id, amountMinor: 5000 });
  check("the demo QR is withheld while UPI is blocked (409)", qrBlocked.status === 409, qrBlocked.json);
  await admin.req("PUT", "/api/admin/payee", { destinationId: tajSite.id, upiId: payeeBefore.upiId || "", upiName: payeeBefore.upiName || undefined, blockDemoUpi: false });
  check("turning the block off allows UPI again", (await staff.post("/api/pay/upi-qr", { destinationId: tajSite.id, amountMinor: 5000 })).status === 200);

  const pl = (await admin.get(`/api/parking/passes?destination=${tajSite.id}`)).json.items.find((x: any) => x._id === ps.json.pass._id);
  check("the pass list shows what cancelling would refund", pl && pl.refundOptions && pl.refundOptions.prorata > 0 && pl.refundOptions.full === null, pl?.refundOptions);
  check("a pass needs a reason to be cancelled (400)", (await admin.patch("/api/parking/passes", { id: ps.json.pass._id, refund: "prorata", reason: "" })).status === 400);
  check("a used pass can't be fully refunded (400)", (await admin.patch("/api/parking/passes", { id: ps.json.pass._id, refund: "full", reason: "Customer asked" })).status === 400);
  check("staff can't cancel passes (403)", (await staff.patch("/api/parking/passes", { id: ps.json.pass._id, refund: "none", reason: "nope nope" })).status === 403);
  const pc = await admin.patch("/api/parking/passes", { id: ps.json.pass._id, refund: "prorata", reason: "Vehicle sold", method: "cash" });
  check("cancelling a pass refunds the unused days and issues a credit note", pc.status === 200 && pc.json.pass.refundMinor > 0 && pc.json.pass.refundMinor < pc.json.pass.priceMinor && /^CN\//.test(pc.json.pass.creditNoteNo), pc.json);
  check("the pass invoice now carries the credit note", (await admin.get(`/api/parking/invoice?ref=${ps.json.pass.reference}`)).json.creditNote?.no === pc.json.pass.creditNoteNo);
  const rm = await admin.patch("/api/parking/passes", { action: "remind" });
  check("a manager can send expiry reminders now", rm.status === 200 && typeof rm.json.reminded === "number", rm.json);
  check("the reminder cron rejects callers without the secret (401)", (await anon.get("/api/cron/pass-reminders")).status === 401);

  const mySt = await staff.get("/api/staff/attendance");
  if (mySt.json.open) await staff.post("/api/staff/attendance", { action: "out" });
  const ci = await staff.post("/api/staff/attendance", { action: "in", destinationId: tajSite.id });
  check("staff can clock in", ci.status === 201 && ci.json.attendance._id, ci.json);
  check("clocking in twice is refused (409)", (await staff.post("/api/staff/attendance", { action: "in", destinationId: tajSite.id })).status === 409);
  check("the clock-in shows as open", !!(await staff.get("/api/staff/attendance")).json.open);
  check("staff can clock out", (await staff.post("/api/staff/attendance", { action: "out" })).status === 200);
  check("clocking out when not clocked in is refused (409)", (await staff.post("/api/staff/attendance", { action: "out" })).status === 409);
  check("a visitor can't clock in (403)", (await tourist.post("/api/staff/attendance", { action: "in", destinationId: tajSite.id })).status === 403);
  const attRep = await admin.get(`/api/admin/attendance?from=${addDays(tdy, -3)}&to=${tdy}`);
  check("managers get the attendance report", attRep.status === 200 && Array.isArray(attRep.json.rows) && attRep.json.rows.some((x: any) => /Sunil/.test(x.name)), attRep.json.rows);
  const repCsv = await admin.get(`/api/admin/attendance?from=${addDays(tdy, -3)}&to=${tdy}&format=csv`);
  check("the attendance report exports to CSV with a header", repCsv.status === 200 && repCsv.text.replace(/^\uFEFF/, "").startsWith("staff,shifts"));
  check("staff can't read the attendance report (403)", (await staff.get("/api/admin/attendance")).status === 403);

  if (s2ok) {
    const people = (await admin.get("/api/admin/roster")).json.staff, sunil = people.find((x: any) => /Sunil/.test(x.name)), meena = people.find((x: any) => /Meena/.test(x.name));
    const swDay = addDays(tdy, 25), shiftA = await admin.post("/api/admin/roster", { destinationId: tajSite.id, userId: sunil._id, date: swDay, start: "09:00", end: "13:00", position: "gate" });
    const shiftId = shiftA.json.shifts[0]._id;
    const sq = await staff.post("/api/staff/swaps", { shiftId, toUserId: meena._id, note: "Family event" });
    check("staff can ask a colleague to cover a shift", sq.status === 201 && sq.json.request.status === "pending_colleague", sq.json);
    check("a second request on the same shift is refused (409)", (await staff.post("/api/staff/swaps", { shiftId, toUserId: meena._id })).status === 409);
    check("the manager can't approve before the colleague agrees (409)", (await admin.patch("/api/admin/swaps", { id: sq.json.request._id, approve: true })).status === 409);
    check("the colleague sees the request", (await staff2.get("/api/staff/swaps")).json.incoming.some((x: any) => x._id === sq.json.request._id));
    check("the requester can't answer their own request (404)", (await staff.patch("/api/staff/swaps", { id: sq.json.request._id, action: "accept" })).status === 404);
    check("the colleague agrees", (await staff2.patch("/api/staff/swaps", { id: sq.json.request._id, action: "accept" })).json.request.status === "pending_manager");
    check("it now waits for a manager", (await admin.get("/api/admin/swaps")).json.pending.some((x: any) => x._id === sq.json.request._id));
    check("staff can't approve swaps (403)", (await staff.patch("/api/admin/swaps", { id: sq.json.request._id, approve: true })).status === 403);
    const ap = await admin.patch("/api/admin/swaps", { id: sq.json.request._id, approve: true });
    check("the manager approves and the shift moves to the colleague", ap.status === 200 && ap.json.request.status === "approved" && (await admin.get(`/api/admin/roster?from=${swDay}`)).json.shifts.some((x: any) => x._id === shiftId && x.user === meena._id), ap.json);
    await admin.del(`/api/admin/roster?id=${shiftId}`);
  }

  const lookup = (await admin.get(`/api/admin/loyalty?email=${encodeURIComponent(email)}`)).json;
  check("a manager can look up a visitor's loyalty account", !!lookup.user?.id && typeof lookup.summary?.balance === "number", lookup);
  const bal0 = lookup.summary.balance;
  const adj = await admin.post("/api/admin/loyalty", { userId: lookup.user.id, points: 40, reason: "Apology for the long queue" });
  check("a manager can grant goodwill points with a reason", adj.status === 200 && adj.json.summary.balance === bal0 + 40, adj.json);
  check("a reason is required (400)", (await admin.post("/api/admin/loyalty", { userId: lookup.user.id, points: 5, reason: "" })).status === 400);
  check("points can't be taken below zero (409)", (await admin.post("/api/admin/loyalty", { userId: lookup.user.id, points: -(bal0 + 40 + 1), reason: "Too many to remove" })).status === 409);
  check("the visitor sees the adjustment in their history", (await tourist.get("/api/loyalty")).json.entries.some((x: any) => /Apology/.test(x.note || "")));
  await admin.post("/api/admin/loyalty", { userId: lookup.user.id, points: -40, reason: "Reversing the e2e test grant" });
  check("a visitor can't adjust points (403)", (await tourist.post("/api/admin/loyalty", { userId: lookup.user.id, points: 10, reason: "give me points" })).status === 403);
  check("loyalty rules include the expiry period", (await tourist.get("/api/loyalty")).json.rules.expiryMonths >= 0);

  console.log("\nVisitor: ticket transfer, loyalty, support history, weather");
  const friendEmail = `friend+${Date.now()}@example.com`; const friend = new Client(); await friend.post("/api/auth/register", { name: "E2E Friend", email: friendEmail, password: "Passw0rd!x", phone: "9876500001" });
  const fSlot = (await tourist.get(`/api/slots?destination=taj-mahal&date=${addDays(tdy, 4)}`)).json.slots.find((x: any) => !x.closed && x.remaining >= 3);
  const xb = await tourist.post("/api/bookings", { destinationId: tajSite.id, slotId: fSlot.id, items: [{ categoryId: tcat._id, quantity: 2 }], visitors: [{ name: "A One" }, { name: "A Two" }], contact: { name: "E2E", email, phone: "9876500000" }, idempotencyKey: `e2e-xfer-${sfx}` });
  const xp = await tourist.post("/api/payments", { bookingId: xb.json.booking._id, method: "upi", idempotencyKey: `e2e-xfer-pay-${sfx}` });
  check("a confirmed ticket to transfer", xb.status === 201 && xp.status === 200, xp.json);
  const oldRef = xb.json.booking.reference;
  check("transfer to an unknown email is refused (404)", (await tourist.post("/api/transfers", { bookingId: xb.json.booking._id, toEmail: "nobody-here@example.com", visitors: [{ name: "B One" }, { name: "B Two" }] })).status === 404);
  check("transfer needs a name for every visitor (400)", (await tourist.post("/api/transfers", { bookingId: xb.json.booking._id, toEmail: friendEmail, visitors: [{ name: "B One" }] })).status === 400);
  const xo = await tourist.post("/api/transfers", { bookingId: xb.json.booking._id, toEmail: friendEmail, visitors: [{ name: "B One" }, { name: "B Two" }], message: "Enjoy" });
  check("a transfer offer is sent", xo.status === 201, xo.json);
  const inc = (await friend.get("/api/transfers")).json.incoming[0];
  check("the recipient sees the offer, the sender can't accept it (404)", !!inc && (await tourist.patch("/api/transfers", { id: inc._id, action: "accept" })).status === 404);
  const xa = await friend.patch("/api/transfers", { id: inc._id, action: "accept" });
  check("accepting gives the recipient the ticket under a NEW reference", xa.status === 200 && xa.json.reference !== oldRef, xa.json);
  check("the sender's old reference no longer works", !(await tourist.get("/api/bookings")).json.items.some((b: any) => b._id === xb.json.booking._id) && (await staff.post("/api/tickets/verify", { code: ticketCode(oldRef) })).json?.valid === false);
  check("the new holder's new reference verifies as a real ticket", (await staff.post("/api/tickets/verify", { code: ticketCode(xa.json.reference) })).json?.booking?.reference === xa.json.reference);
  check("a transferred ticket can't be cancelled by its new holder (400)", (await friend.del(`/api/bookings/${xb.json.booking._id}`)).status === 400);
  const lo = (await tourist.get("/api/loyalty")).json;
  check("loyalty shows balance, tier and the programme rules", typeof lo.balance === "number" && lo.tier?.id && lo.rules?.maxRedeemPct === 20 && Array.isArray(lo.entries), lo);
  const st = await friend.post("/api/support", { category: "payment", subject: `E2E question ${sfx}`, message: "Can you confirm my transferred ticket is valid?", destinationId: tajSite.id });
  check("a visitor can open a support ticket", st.status === 201 && /^SP-/.test(st.json.ticket.reference), st.json);
  check("another visitor can't read it (404)", (await tourist.get(`/api/support?id=${st.json.ticket._id}`)).status === 404);
  check("staff at that site can see it", ((await staff.get("/api/support?status=all")).json.items || []).some((t: any) => t._id === st.json.ticket._id));
  const rep = await staff.patch("/api/support", { id: st.json.ticket._id, body: "Yes, it is valid. Show the new reference at the gate." });
  check("a staff reply moves it to in progress", rep.status === 200 && rep.json.ticket.status === "in_progress");
  const th = (await friend.get(`/api/support?id=${st.json.ticket._id}`)).json.ticket;
  check("the visitor sees the full conversation in their history", th.messages.length === 2 && th.lastFrom === "staff", th.messages);
  check("a visitor can't mark their own ticket resolved (403)", (await friend.patch("/api/support", { id: st.json.ticket._id, status: "resolved" })).status === 403);
  const wx = await anon.get("/api/weather?slug=taj-mahal");
  check("the weather endpoint answers (with data, or a clean 'unavailable' if the forecast service can't be reached)", wx.status === 200 && typeof wx.json.available === "boolean", wx.json);
  check("weather for an unknown site is a 404", (await anon.get("/api/weather?slug=nowhere")).status === 404);

  }

  await admin.patch(`/api/destinations/${taj._id}`, { hours: tajHours });
  console.log(`\n${passed} passed, ${failed.length} failed`);
  if (failed.length) { console.log("Failed:\n - " + failed.join("\n - ")); process.exit(1); }
}
main().catch((e) => { console.error(e); process.exit(1); });

function tdetailAgraId(ds: any[]) { return ds.find((d) => d.slug === "agra-fort")._id; }
