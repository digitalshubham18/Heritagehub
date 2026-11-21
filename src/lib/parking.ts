import crypto from "crypto";
import { Destination, ParkingDay, ParkingLot, ParkingOverride, ParkingPass, ParkingReservation, ParkingTicket, Payment } from "@/models";
import { assignParkingInvoice, gstFromInclusive } from "./invoice";
import { assertUpiAllowed } from "./collect";
import { ApiError } from "./api";
import { canAccessDestination } from "./auth";
import { buildPaymentDetails, PAY_METHODS, type PayDetails, type PayMethod } from "./collect";
import { daysBetween, dow, todayIST } from "./utils";

export { normalizeVehicle, parkingFee, minutesParked, reservationFee, dueAfterCredit } from "./parking-fee";
import { normalizeVehicle, parkingFee, minutesParked, reservationFee, dueAfterCredit } from "./parking-fee";
export type VType = "car" | "two_wheeler" | "bus";
export const VTYPES: VType[] = ["car", "two_wheeler", "bus"];
export const VLABEL: Record<VType, string> = { car: "Car", two_wheeler: "Two-wheeler", bus: "Bus or coach" };
/** Reserved car bays are separate pools with their own capacity and rates. "standard" parking uses the vehicle-type pool. */
export type Bay = "standard" | "ev" | "accessible";
export const BAYS: Bay[] = ["standard", "ev", "accessible"];
export type Pool = VType | "ev" | "accessible";
export const POOLS: Pool[] = ["car", "two_wheeler", "bus", "ev", "accessible"];
export const POOL_LABEL: Record<Pool, string> = { ...VLABEL, ev: "EV charging bay", accessible: "Accessible bay" };
export const poolOf = (type: VType, bay: Bay = "standard"): Pool => (bay === "standard" ? type : bay);
export const vehicleOfPool = (p: Pool): VType => (p === "ev" || p === "accessible" ? "car" : p);
export type { Rate } from "./parking-fee";

export const OVERSTAY_MIN = 480; // flag vehicles parked longer than 8 hours
export const RESERVE_AHEAD_DAYS = 30;
export const RESERVE_FREE_CANCEL_HOURS = 2;
export const QUOTE_TTL_MS = 5 * 60 * 1000;


/** Amount a visitor can prepay when pre-booking: the first-hour rate, credited against the final fee at exit. */
/** Spaces per vehicle type that visitors can pre-book each day. */
export const reservableQuota = (lot: any, pool: Pool, capacity?: number) => Math.floor(((capacity ?? lot?.[pool]?.capacity ?? 0) * Math.min(100, Math.max(0, lot?.reservablePct ?? 30))) / 100);

/* ---------------- Per-date capacity overrides (events, festivals, maintenance) ---------------- */
export type CapMap = Partial<Record<Pool, number>>;
export async function overridesFor(lotId: any, date: string): Promise<CapMap> {
  const rows: any[] = await ParkingOverride.find({ lot: lotId, date }).lean();
  const m: CapMap = {};
  for (const r of rows) m[r.pool as Pool] = r.capacity;
  return m;
}
/** Capacity of a pool on a date: the per-date override when one exists, otherwise the lot's normal capacity. */
export const capacityOn = (lot: any, pool: Pool, ov: CapMap = {}) => ov[pool] ?? lot?.[pool]?.capacity ?? 0;

/** GST and total for a parking charge. Rates are entered GST-inclusive, so GST is the portion contained in the amount. */
export const parkingGst = (lot: any, totalMinor: number) => { const pct = lot?.gstPct || 0; return { gstPct: pct, gstMinor: gstFromInclusive(totalMinor, pct) }; };
export const PASS_DAYS = 30;
export const MAX_OFFLINE_AGE_MS = 48 * 3600000;
/** An offline-recorded time must be real: not in the future, not before a floor, and not older than 48 h. */
export function validOfflineTime(at: string | Date | undefined, now = Date.now(), floor?: Date) {
  if (!at) return undefined;
  const t = new Date(at).getTime();
  if (!Number.isFinite(t)) throw new ApiError(400, "Invalid offline time");
  if (t > now + 120000) throw new ApiError(400, "The recorded time is in the future. Check the device clock.");
  if (now - t > MAX_OFFLINE_AGE_MS) throw new ApiError(400, "This offline record is more than 48 hours old and needs a manager");
  if (floor && t < new Date(floor).getTime()) throw new ApiError(400, "The recorded time is before the vehicle entered");
  return new Date(Math.min(t, now));
}
/** Fee due at exit after crediting anything already paid. */

export type HeldMap = Partial<Record<Pool, number>>;
/** Pre-booked vehicles that have not arrived yet today. Their spaces are kept free for them. */
export async function heldToday(lotId: any, date = todayIST()): Promise<HeldMap> {
  const rows: any[] = await ParkingDay.find({ lot: lotId, date }).lean();
  const m: HeldMap = {};
  for (const r of rows) m[r.vehicleType as Pool] = r.reserved || 0;
  return m;
}

export function availability(lot: any, held: HeldMap = {}, ov: CapMap = {}) {
  return POOLS.map((pl) => {
    const cap = capacityOn(lot, pl, ov), occ = lot[pl]?.occupied || 0, hold = (held as any)[pl] || 0, base = lot[pl]?.capacity || 0;
    return { type: vehicleOfPool(pl), pool: pl, bay: (pl === "ev" || pl === "accessible" ? pl : "standard") as Bay, label: POOL_LABEL[pl], capacity: cap, normalCapacity: base, overridden: ov[pl] !== undefined && ov[pl] !== base, occupied: occ, held: hold, available: Math.max(0, cap - occ - hold), reservable: reservableQuota(lot, pl, cap),
      freeMinutes: lot[pl]?.freeMinutes ?? 0, firstHourMinor: lot[pl]?.firstHourMinor ?? 0, extraHourMinor: lot[pl]?.extraHourMinor ?? 0, dailyMaxMinor: lot[pl]?.dailyMaxMinor ?? 0,
      monthlyPassMinor: pl === "car" || pl === "two_wheeler" || pl === "bus" ? lot.monthlyPass?.[pl] || 0 : 0 };
  }).filter((x) => x.capacity > 0 || x.normalCapacity > 0);
}

const rand = (n = 5) => Array.from(crypto.randomBytes(n)).map((x) => "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"[x % 32]).join("");

/* ---------------- Signed exit quotes (so the amount a visitor pays by QR is the amount staff record) ---------------- */
const qkey = () => process.env.TICKET_SECRET || process.env.AUTH_SECRET || "dev-ticket-secret";
export type QuotePayload = { t: string; f: number; d: number; e: number; l?: number }; // l = lost-ticket charge included in d
const qsig = (body: string) => crypto.createHmac("sha256", qkey()).update("pq:" + body).digest("base64url").slice(0, 22);
export function signQuote(p: QuotePayload) { const body = Buffer.from(JSON.stringify(p)).toString("base64url"); return `${body}.${qsig(body)}`; }
export function verifyQuote(tok?: string, now = Date.now()): QuotePayload | null {
  if (!tok || !tok.includes(".")) return null;
  const [body, sig] = tok.split(".");
  const want = qsig(body);
  if (!sig || sig.length !== want.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(want))) return null;
  try { const p = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as QuotePayload; return p.e > now ? p : null; } catch { return null; }
}

/* ---------------- Atomic space claims ---------------- */
/**
 * Claims one space with a single conditional update, so a lot can never be over-filled.
 * Walk-ins leave room for pre-booked vehicles that have not arrived yet (`respectHeld`).
 */
async function claimSpace(lotId: any, pool: Pool, respectHeld: boolean) {
  for (let i = 0; i < 4; i++) {
    const cur: any = await ParkingLot.findById(lotId).lean();
    if (!cur) return null;
    const lotCap = cur[pool]?.capacity || 0;
    const cap = capacityOn(cur, pool, await overridesFor(lotId, todayIST())); // today's per-date override, if any
    const hold = respectHeld ? (await heldToday(lotId))[pool] || 0 : 0;
    if (cap <= 0 || (cur[pool].occupied || 0) + hold >= cap) return null;
    const got = await ParkingLot.findOneAndUpdate({ _id: lotId, [`${pool}.capacity`]: lotCap, [`${pool}.occupied`]: { $lte: cap - 1 - hold } }, { $inc: { [`${pool}.occupied`]: 1 } }, { new: true }).lean();
    if (got) return got;
  }
  return null;
}
const freeSpace = (lotId: any, pool: Pool) => ParkingLot.updateOne({ _id: lotId, [`${pool}.occupied`]: { $gte: 1 } }, { $inc: { [`${pool}.occupied`]: -1 } });

const dayKey = (lotId: any, date: string, type: string) => `${lotId}:${date}:${type}`;
async function claimDayQuota(lot: any, date: string, type: Pool, quota: number) {
  const key = dayKey(lot._id, date, type);
  try { await ParkingDay.updateOne({ key }, { $setOnInsert: { key, lot: lot._id, date, vehicleType: type, reserved: 0 } }, { upsert: true }); } catch (e: any) { if (e?.code !== 11000) throw e; }
  return !!(await ParkingDay.findOneAndUpdate({ key, reserved: { $lte: quota - 1 } }, { $inc: { reserved: 1 } }, { new: true }).lean());
}
const releaseDayQuota = (lotId: any, date: string, type: string) => ParkingDay.updateOne({ key: dayKey(lotId, date, type), reserved: { $gte: 1 } }, { $inc: { reserved: -1 } });

/* ---------------- Visitor reservations ---------------- */
const isOpenOn = (dest: any, date: string) => !(dest.hours?.closedDays || []).includes(dow(date)) && !(dest.closures || []).some((c: any) => c.date === date);
const hist = (event: string, note?: string) => ({ at: new Date(), event, note });

export async function reserveParking(user: any, input: { destinationId: string; date: string; vehicleType: VType; bay?: Bay; vehicleNumber: string; arrivalFrom?: string; paymentMode: "prepay" | "at_exit"; method?: "upi" | "card"; bookingRef?: string; idempotencyKey: string }) {
  const idemKey = `${user._id}:${input.idempotencyKey}`;
  const existing: any = await ParkingReservation.findOne({ idemKey }).lean();
  if (existing) return { reservation: existing, replayed: true as const };
  const today = todayIST();
  if (input.date < today) throw new ApiError(400, "Pick today or a later date");
  if (daysBetween(today, input.date) > RESERVE_AHEAD_DAYS) throw new ApiError(400, `Parking can be reserved up to ${RESERVE_AHEAD_DAYS} days ahead`);
  const dest: any = await Destination.findOne({ _id: input.destinationId, active: true }).lean();
  if (!dest) throw new ApiError(404, "Destination not found");
  if (!isOpenOn(dest, input.date)) throw new ApiError(409, `${dest.name} is closed on that date`);
  const lot: any = await ParkingLot.findOne({ destination: dest._id, active: true }).lean();
  if (!lot) throw new ApiError(404, "Parking isn't available at this destination");
  const type = input.vehicleType, bay = input.bay || "standard";
  if (!VTYPES.includes(type) || !BAYS.includes(bay)) throw new ApiError(409, "This vehicle type isn't accepted here");
  if (bay !== "standard" && type !== "car") throw new ApiError(409, "EV and accessible bays are for cars");
  const pool = poolOf(type, bay);
  const ov = await overridesFor(lot._id, input.date), cap = capacityOn(lot, pool, ov);
  if (!(cap > 0)) throw new ApiError(409, `${POOL_LABEL[pool]} parking isn't available on that date`);
  const quota = reservableQuota(lot, pool, cap);
  if (quota < 1) throw new ApiError(409, "Pre-booking isn't offered for this vehicle type. Parking is first come, first served at the gate.");
  const vn = normalizeVehicle(input.vehicleNumber);
  if (vn.length < 4 || vn.length > 12) throw new ApiError(400, "Enter a valid vehicle number");
  if (input.date === today) {
    const hold = (await heldToday(lot._id))[pool] || 0;
    if ((lot[pool].occupied || 0) + hold >= cap) throw new ApiError(409, `${POOL_LABEL[pool]} parking is full right now`);
  }
  if (!(await claimDayQuota(lot, input.date, pool, quota))) throw new ApiError(409, `All pre-bookable ${POOL_LABEL[pool].toLowerCase()} spaces for that day are taken`);
  const fee = input.paymentMode === "prepay" ? reservationFee(lot[pool]) : 0;
  let created: any;
  try {
    created = await ParkingReservation.create({
      reference: `PR-${rand(6)}`, idemKey, activeKey: `${dest._id}:${input.date}:${vn}`, user: user._id, destination: dest._id, lot: lot._id, date: input.date,
      arrivalFrom: /^\d{2}:\d{2}$/.test(input.arrivalFrom || "") ? input.arrivalFrom : "09:00", vehicleType: type, bay, vehicleNumber: vn, bookingRef: input.bookingRef || undefined,
      paymentMode: fee > 0 ? "prepay" : "at_exit", prepaidMinor: 0, history: [hist("reserved")],
    });
  } catch (e: any) {
    await releaseDayQuota(lot._id, input.date, pool);
    if (e?.code === 11000) {
      const again: any = await ParkingReservation.findOne({ idemKey }).lean();
      if (again) return { reservation: again, replayed: true as const };
      throw new ApiError(409, "This vehicle already has a reservation for that date");
    }
    throw e;
  }
  if (fee > 0) {
    try {
      await Payment.create({ parkingReservation: created._id, user: user._id, amountMinor: fee, method: input.method || "upi", status: "succeeded", providerRef: `SIM_${rand(8)}`, idempotencyKey: `parkres:${created._id}` });
      created = await ParkingReservation.findByIdAndUpdate(created._id, { prepaidMinor: fee, $push: { history: hist("paid", `${fee} paise prepaid`) } }, { new: true });
    } catch (e) {
      await ParkingReservation.updateOne({ _id: created._id }, { status: "cancelled", activeKey: `done:${created._id}` });
      await releaseDayQuota(lot._id, input.date, pool);
      throw e;
    }
  }
  return { reservation: created.toObject ? created.toObject() : created, replayed: false as const };
}

/** Cancels a reservation (owner, or staff of that site). A prepayment is refunded when cancelled early enough. */
export async function cancelReservation(actor: any, id: string) {
  const r: any = await ParkingReservation.findById(id).lean();
  if (!r) throw new ApiError(404, "Reservation not found");
  const mine = String(r.user) === String(actor._id);
  if (!mine && !canAccessDestination(actor, r.destination)) throw new ApiError(404, "Reservation not found");
  if (r.status !== "reserved") throw new ApiError(409, `This reservation is already ${r.status}`);
  const arrival = new Date(`${r.date}T${r.arrivalFrom || "09:00"}:00+05:30`).getTime();
  const early = Date.now() <= arrival - RESERVE_FREE_CANCEL_HOURS * 3600000;
  const refund = early || !mine ? r.prepaidMinor || 0 : 0; // staff cancellations are always refunded in full
  const upd: any = await ParkingReservation.findOneAndUpdate({ _id: r._id, status: "reserved" }, { status: "cancelled", activeKey: `done:${r._id}`, refundMinor: refund, $push: { history: hist("cancelled", mine ? "By visitor" : "By staff") } }, { new: true }).lean();
  if (!upd) throw new ApiError(409, "This reservation was just changed");
  await releaseDayQuota(r.lot, r.date, poolOf(r.vehicleType, r.bay));
  if (refund > 0) await Payment.create({ parkingReservation: r._id, user: r.user, type: "refund", amountMinor: refund, method: "upi", status: "succeeded", providerRef: `SIMREF_${rand(8)}`, idempotencyKey: `parkres:${r._id}:refund` });
  return { reservation: upd, refundMinor: refund };
}

/** Pre-booked vehicles whose date has passed without arriving are marked as no-shows (any prepayment is forfeited). */
export async function expireReservations() {
  await ParkingReservation.updateMany({ status: "reserved", date: { $lt: todayIST() } }, { status: "expired", $push: { history: hist("expired", "No-show") } });
}

/* ---------------- Monthly passes ---------------- */
/** The live monthly pass covering a vehicle at a site on a date, if any. */
export async function activePassFor(destinationId: any, vehicleNumber: string, date = todayIST()) {
  return (await ParkingPass.findOne({ destination: destinationId, vehicleNumber: normalizeVehicle(vehicleNumber), status: "active", validFrom: { $lte: date }, validTo: { $gte: date } }).lean()) as any;
}

/* ---------------- Gate: admit and check out ---------------- */
export type PlateInfo = { read: string; confidence?: number; source?: string };
export async function enterVehicle(actor: any, input: {
  destinationId: string; vehicleType?: VType; bay?: Bay; vehicleNumber?: string; reservationRef?: string; driverName?: string; driverPhone?: string; bookingId?: any;
  prepay?: { amountMinor: number; method: PayMethod; details?: PayDetails }; source?: "staff" | "counter";
  badgeChecked?: boolean; at?: string | Date; offlineId?: string; plate?: PlateInfo;
}) {
  if (!canAccessDestination(actor, input.destinationId)) throw new ApiError(403, "You are not assigned to this destination");
  const lot: any = await ParkingLot.findOne({ destination: input.destinationId, active: true }).lean();
  if (!lot) throw new ApiError(404, "No parking is configured for this destination");
  const entryAt = validOfflineTime(input.at);

  // A pre-booked visitor: by reservation code, or recognised automatically by vehicle number.
  let res: any = null;
  if (input.reservationRef) {
    res = await ParkingReservation.findOne({ reference: String(input.reservationRef).toUpperCase().trim(), destination: input.destinationId }).lean();
    if (!res) throw new ApiError(404, "No reservation found with that code at this site");
  } else if (input.vehicleNumber) {
    res = await ParkingReservation.findOne({ destination: input.destinationId, date: todayIST(), status: "reserved", vehicleNumber: normalizeVehicle(input.vehicleNumber) }).lean();
  }
  if (res) {
    if (res.status !== "reserved") throw new ApiError(409, `This reservation is already ${res.status}`);
    if (res.date !== todayIST()) throw new ApiError(409, `This reservation is for ${res.date}, not today`);
  }
  const type = (res?.vehicleType || input.vehicleType) as VType;
  const bay: Bay = res ? res.bay || "standard" : input.bay || "standard";
  if (!VTYPES.includes(type) || !BAYS.includes(bay)) throw new ApiError(409, "This vehicle type isn't accepted here");
  if (bay !== "standard" && type !== "car") throw new ApiError(409, "EV and accessible bays are for cars");
  const pool = poolOf(type, bay);
  if (!(lot[pool]?.capacity > 0)) throw new ApiError(409, `${POOL_LABEL[pool]} parking isn't available here`);
  if (bay === "accessible" && !res && !input.badgeChecked) throw new ApiError(400, "Confirm that the driver's disabled-parking badge or permit was checked");
  const vn = normalizeVehicle(res?.vehicleNumber || input.vehicleNumber || "");
  if (vn.length < 4 || vn.length > 12) throw new ApiError(400, "Enter a valid vehicle number");
  const pass = await activePassFor(input.destinationId, vn);
  if (pass && pass.vehicleType !== type) throw new ApiError(409, `This number holds a monthly pass for a ${VLABEL[pass.vehicleType as VType].toLowerCase()}. Check the vehicle type.`);

  // Validate payment details before any state changes, so a bad slip can't leave a half-admitted vehicle.
  let prepaid = res?.prepaidMinor || 0, prepayDetails: any;
  if (input.prepay && input.prepay.amountMinor > 0) {
    await assertUpiAllowed(input.destinationId, input.prepay.method);
    prepayDetails = buildPaymentDetails(input.prepay.method, input.prepay.details, input.prepay.amountMinor);
    prepaid += input.prepay.amountMinor;
  }

  if (res) {
    const flipped = await ParkingReservation.findOneAndUpdate({ _id: res._id, status: "reserved" }, { status: "arrived", $push: { history: hist("arrived") } }, { new: true }).lean();
    if (!flipped) throw new ApiError(409, "This reservation was just used");
    await releaseDayQuota(lot._id, res.date, pool);
  }
  const undoReservation = async () => { if (res) { await ParkingReservation.updateOne({ _id: res._id }, { status: "reserved" }); await ParkingDay.updateOne({ key: dayKey(lot._id, res.date, pool) }, { $inc: { reserved: 1 } }); } };

  const claimed = await claimSpace(lot._id, pool, !res);
  if (!claimed) { await undoReservation(); throw new ApiError(409, `${POOL_LABEL[pool]} parking is full`); }

  try {
    const t = (await ParkingTicket.create({
      ticketNo: `PK-${rand()}`, destination: input.destinationId, lot: lot._id, vehicleType: type, bay, vehicleNumber: vn, activeKey: `${input.destinationId}:${vn}`, by: actor._id,
      ...(entryAt ? { entryAt } : {}), passRef: pass?.reference,
      source: res ? "reservation" : input.source || "staff", reservation: res?._id, booking: input.bookingId, driverName: input.driverName?.trim() || undefined, driverPhone: input.driverPhone?.trim() || undefined,
      prepaidMinor: prepaid, prepaidMethod: input.prepay && input.prepay.amountMinor > 0 ? input.prepay.method : undefined, payment: prepayDetails ? { prepay: prepayDetails } : undefined,
      offline: entryAt ? { entryAt, id: input.offlineId, syncedAt: new Date() } : undefined,
      plate: input.plate?.read ? { read: input.plate.read, confidence: input.plate.confidence, source: input.plate.source } : undefined,
    })).toObject();
    if (res) await ParkingReservation.updateOne({ _id: res._id }, { ticket: t._id });
    if (pass) await ParkingPass.updateOne({ _id: pass._id }, { $inc: { entries: 1 } });
    return { ...t, reservationApplied: !!res, reservationRef: res?.reference as string | undefined, passApplied: !!pass };
  } catch (e: any) {
    await freeSpace(lot._id, pool);
    await undoReservation();
    if (e?.code === 11000) throw new ApiError(409, "This vehicle is already parked");
    throw e;
  }
}

async function findParked(actor: any, input: { ticketNo?: string; vehicleNumber?: string; destinationId?: string }) {
  const q: any = { status: "parked" };
  if (input.ticketNo) q.ticketNo = String(input.ticketNo).toUpperCase().trim();
  else if (input.vehicleNumber && input.destinationId) { q.destination = input.destinationId; q.vehicleNumber = normalizeVehicle(input.vehicleNumber); }
  else throw new ApiError(400, "Provide a ticket number, or a vehicle number and destination");
  const t: any = await ParkingTicket.findOne(q).lean();
  if (!t) throw new ApiError(404, "No parked vehicle found for that ticket");
  if (!canAccessDestination(actor, t.destination)) throw new ApiError(403, "You are not assigned to this destination");
  const lot: any = await ParkingLot.findById(t.lot).lean();
  return { t, lot };
}
/** Fee for a stay. A monthly pass covers the fee. A lost ticket adds the lot's lost-ticket charge (waived for pass holders, who are identified by their pass). */
export function price(t: any, lot: any, now = new Date(), opts: { lost?: boolean } = {}) {
  const pool = poolOf(t.vehicleType, t.bay), minutes = minutesParked(t.entryAt, now);
  const feeMinor = t.passRef ? 0 : parkingFee(lot[pool], minutes);
  const penaltyMinor = opts.lost && !t.passRef ? lot.lostTicketFeeMinor || 0 : 0;
  return { minutes, feeMinor, penaltyMinor, prepaidMinor: t.prepaidMinor || 0, dueMinor: dueAfterCredit(feeMinor, t.prepaidMinor || 0) + penaltyMinor };
}

/** What the visitor owes right now. The signed token freezes this amount for a few minutes so the QR they pay matches what staff record. */
export async function quoteExit(actor: any, input: { ticketNo?: string; vehicleNumber?: string; destinationId?: string; lost?: boolean }) {
  const { t, lot } = await findParked(actor, input);
  const p = price(t, lot, new Date(), { lost: !!input.lost }), expiresAt = Date.now() + QUOTE_TTL_MS;
  return { ticket: t, ...p, expiresAt: new Date(expiresAt), quote: signQuote({ t: t.ticketNo, f: p.feeMinor, d: p.dueMinor, e: expiresAt, ...(p.penaltyMinor ? { l: p.penaltyMinor } : {}) }) };
}

/**
 * Closes a parking ticket. The fee is computed from the time parked (or taken from a still-valid quote). The state change is one conditional update.
 * Offline exits (`at`) are priced at the time the vehicle actually left; if the amount staff collected from their cached rates differs, the money collected is
 * recorded as paid and the difference is flagged on the ticket for a manager.
 */
export async function exitVehicle(actor: any, input: { ticketNo?: string; vehicleNumber?: string; destinationId?: string; method?: string; details?: PayDetails; quote?: string; expectedDueMinor?: number; lost?: { note: string; idChecked: boolean }; at?: string | Date; collectedMinor?: number; offlineId?: string }) {
  const { t, lot } = await findParked(actor, input);
  const lost = !!input.lost;
  if (lost && (!input.lost!.idChecked || (input.lost!.note || "").trim().length < 3)) throw new ApiError(400, "For a lost ticket, confirm the driver's ID or vehicle papers were checked and note what you saw");
  const now = new Date(), exitAt = validOfflineTime(input.at, now.getTime(), t.entryAt);
  let p = price(t, lot, exitAt || now, { lost });
  if (!exitAt) {
    const q = verifyQuote(input.quote);
    if (q && q.t === t.ticketNo) {
      if ((q.l || 0) !== p.penaltyMinor) throw new ApiError(409, "The lost-ticket status changed since the amount was quoted. Refresh the amount and collect again.");
      p = { ...p, feeMinor: q.f, dueMinor: q.d }; // honour the amount the visitor was shown
    }
    if (input.expectedDueMinor != null && input.expectedDueMinor !== p.dueMinor) throw new ApiError(409, `The amount due has changed to ₹${(p.dueMinor / 100).toFixed(2)}. Please show the new amount and collect again.`);
  }
  const collected = exitAt && input.collectedMinor != null ? input.collectedMinor : p.dueMinor;
  let method = t.passRef && p.dueMinor === 0 ? "pass" : "free", details: any;
  if (collected > 0) {
    if (!PAY_METHODS.includes(input.method as PayMethod)) throw new ApiError(400, "Choose how the parking fee was paid");
    method = input.method!;
    await assertUpiAllowed(t.destination, method);
    details = buildPaymentDetails(method as PayMethod, input.details, collected);
  } else if (p.prepaidMinor > 0 && p.dueMinor === 0) method = "prepaid";
  const total = p.feeMinor + p.penaltyMinor, g = parkingGst(lot, total);
  const set: any = { status: "exited", exitAt: exitAt || now, feeMinor: p.feeMinor, penaltyMinor: p.penaltyMinor, lostTicket: lost, lostNote: lost ? `${input.lost!.note.trim()} (ID checked)` : undefined, paidMinor: collected, method, payment: { ...(t.payment || {}), exit: details }, exitBy: actor._id, activeKey: `done:${t._id}`, gstMinor: g.gstMinor, gstPct: g.gstPct };
  if (exitAt) set.offline = { ...(t.offline || {}), exitAt, exitId: input.offlineId, collectedMinor: collected, serverDueMinor: p.dueMinor, mismatchMinor: collected - p.dueMinor, syncedAt: now };
  let done: any = await ParkingTicket.findOneAndUpdate({ _id: t._id, status: "parked" }, set, { new: true }).lean();
  if (!done) throw new ApiError(409, "This vehicle was just checked out");
  await freeSpace(lot._id, poolOf(t.vehicleType, t.bay));
  if (total > 0) done = await assignParkingInvoice(done, ParkingTicket);
  return { ticket: done, minutes: p.minutes, feeMinor: p.feeMinor, penaltyMinor: p.penaltyMinor, prepaidMinor: p.prepaidMinor, dueMinor: p.dueMinor, collectedMinor: collected };
}

export async function lotFor(idOrSlug: string) {
  const d: any = await Destination.findOne(/^[a-f\d]{24}$/i.test(idOrSlug) ? { _id: idOrSlug } : { slug: idOrSlug }).lean();
  if (!d) throw new ApiError(404, "Destination not found");
  return { dest: d, lot: (await ParkingLot.findOne({ destination: d._id, active: true }).lean()) as any };
}

/** Reservable spaces left for a date (public and visitor-facing). Respects per-date capacity overrides. */
export async function reservableLeft(lot: any, date: string) {
  const [rows, ov] = await Promise.all([ParkingDay.find({ lot: lot._id, date }).lean() as Promise<any[]>, overridesFor(lot._id, date)]);
  const by = new Map(rows.map((r) => [r.vehicleType, r.reserved || 0]));
  return POOLS.filter((pl) => capacityOn(lot, pl, ov) > 0).map((pl) => { const q = reservableQuota(lot, pl, capacityOn(lot, pl, ov)); return { type: vehicleOfPool(pl), pool: pl, bay: (pl === "ev" || pl === "accessible" ? pl : "standard") as Bay, label: POOL_LABEL[pl], quota: q, left: Math.max(0, q - (by.get(pl) || 0)), prepayMinor: reservationFee(lot[pl]) }; });
}
