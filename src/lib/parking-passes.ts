import crypto from "crypto";
import { ParkingLot, ParkingPass, Destination, Payment, User } from "@/models";
import { ApiError } from "./api";
import { canAccessDestination } from "./auth";
import { assertUpiAllowed, buildPaymentDetails, PAY_METHODS, type PayDetails, type PayMethod } from "./collect";
import { assignParkingInvoice, gstFromInclusive, issueCreditNote } from "./invoice";
import { sendEmail, sendSms } from "./notify";
import { normalizeVehicle, PASS_DAYS, parkingGst, VTYPES, type VType } from "./parking";
import { addDays, daysBetween, fmtDate, todayIST } from "./utils";

const rand = (n = 6) => Array.from(crypto.randomBytes(n)).map((x) => "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"[x % 32]).join("");
export const RENEW_WINDOW_DAYS = 7;
/** Pure: when a purchase starts and ends. A new pass starts today; a renewal (allowed in the last 7 days) starts the day after the current pass ends. */
export function passPeriod(today: string, currentValidTo?: string) {
  if (currentValidTo && currentValidTo >= today) return { validFrom: addDays(currentValidTo, 1), validTo: addDays(currentValidTo, PASS_DAYS), renewal: true };
  return { validFrom: today, validTo: addDays(today, PASS_DAYS - 1), renewal: false };
}

export type SellInput = { destinationId: string; vehicleType: VType; vehicleNumber: string; holderName: string; holderPhone?: string; holderEmail?: string; method?: PayMethod; payment?: PayDetails; idempotencyKey: string };

/** Sells (or renews) a 30-day parking pass. Staff record a payment taken at the counter; visitors pay on the (simulated) gateway. */
export async function sellParkingPass(actor: any, channel: "staff" | "online", input: SellInput) {
  const idemKey = `${actor._id}:${input.idempotencyKey}`;
  const prior: any = await ParkingPass.findOne({ idemKey }).lean();
  if (prior) return { pass: prior, replayed: true as const };
  if (channel === "staff" && !canAccessDestination(actor, input.destinationId)) throw new ApiError(403, "You are not assigned to this destination");
  const dest: any = await Destination.findOne({ _id: input.destinationId, active: true }).select("name operator").lean();
  if (!dest) throw new ApiError(404, "Destination not found");
  const lot: any = await ParkingLot.findOne({ destination: dest._id, active: true }).lean();
  if (!lot) throw new ApiError(404, "Parking isn't available at this destination");
  if (!VTYPES.includes(input.vehicleType)) throw new ApiError(400, "Choose a vehicle type");
  const priceMinor = lot.monthlyPass?.[input.vehicleType] || 0;
  if (priceMinor <= 0) throw new ApiError(409, "Monthly passes aren't offered for this vehicle type");
  const vn = normalizeVehicle(input.vehicleNumber);
  if (vn.length < 4 || vn.length > 12) throw new ApiError(400, "Enter a valid vehicle number");
  const holderName = input.holderName.trim();
  if (holderName.length < 2) throw new ApiError(400, "Enter the pass holder's name");
  const today = todayIST();

  // Retire passes that have run out, then find a live one (a renewal continues from its end date).
  const mine: any[] = await ParkingPass.find({ destination: dest._id, vehicleNumber: vn, status: "active" }).sort({ validTo: -1 }).lean();
  for (const o of mine.filter((x) => x.validTo < today)) await ParkingPass.updateOne({ _id: o._id, activeKey: o.activeKey }, { activeKey: `done:${o._id}` });
  const live = mine.find((x) => x.validTo >= today);
  if (live && live.vehicleType !== input.vehicleType) throw new ApiError(409, "This vehicle number already has a pass for a different vehicle type");
  if (live && new Date(live.validTo + "T00:00:00Z").getTime() - new Date(today + "T00:00:00Z").getTime() > RENEW_WINDOW_DAYS * 86400000) throw new ApiError(409, `This vehicle already has a pass valid until ${live.validTo}. It can be renewed in the last ${RENEW_WINDOW_DAYS} days.`);
  if (!live && lot.monthlyPass?.maxPerType > 0) {
    const n = await ParkingPass.countDocuments({ destination: dest._id, vehicleType: input.vehicleType, status: "active", validTo: { $gte: today } });
    if (n >= lot.monthlyPass.maxPerType) throw new ApiError(409, "All monthly passes for this vehicle type are sold");
  }
  const period = passPeriod(today, live?.validTo);

  let details: any, method: string | undefined;
  if (channel === "staff") {
    if (!PAY_METHODS.includes(input.method as PayMethod)) throw new ApiError(400, "Choose how the pass was paid");
    method = input.method; await assertUpiAllowed(input.destinationId, method); details = buildPaymentDetails(input.method as PayMethod, input.payment, priceMinor);
  } else { method = input.method || "upi"; }

  if (live) await ParkingPass.updateOne({ _id: live._id, activeKey: live.activeKey }, { activeKey: `done:${live._id}` });
  const g = parkingGst(lot, priceMinor);
  let created: any;
  try {
    created = await ParkingPass.create({
      reference: `PP-${rand()}`, idemKey, activeKey: `${dest._id}:${vn}`, destination: dest._id, lot: lot._id, operator: dest.operator, user: channel === "online" ? actor._id : undefined, soldBy: channel === "staff" ? actor._id : undefined, channel,
      vehicleType: input.vehicleType, vehicleNumber: vn, holderName, holderPhone: input.holderPhone?.trim() || undefined, holderEmail: input.holderEmail?.trim().toLowerCase() || undefined, validFrom: period.validFrom, validTo: period.validTo,
      priceMinor, gstMinor: g.gstMinor, gstPct: g.gstPct, method, payment: details, history: [{ at: new Date(), event: period.renewal ? "renewed" : "sold", note: `${period.validFrom} to ${period.validTo}` }],
    });
  } catch (e: any) {
    if (live) await ParkingPass.updateOne({ _id: live._id }, { activeKey: live.activeKey });
    if (e?.code === 11000) { const again: any = await ParkingPass.findOne({ idemKey }).lean(); if (again) return { pass: again, replayed: true as const }; throw new ApiError(409, "This vehicle already has a pass. Refresh and try again."); }
    throw e;
  }
  if (channel === "online") await Payment.create({ user: actor._id, amountMinor: priceMinor, method, status: "succeeded", providerRef: `SIM_${rand(8)}`, idempotencyKey: `ppass:${created._id}`, details: { parkingPass: created.reference } });
  const withInvoice = await assignParkingInvoice(created.toObject(), ParkingPass);
  return { pass: withInvoice, replayed: false as const, renewal: period.renewal };
}

export type PassRefundMode = "none" | "prorata" | "full";
/**
 * What a cancelled pass refunds. "full" is only for a pass nobody has used yet; "prorata" gives back the days not yet used (from tomorrow), rounded down to the rupee-paise;
 * a pass that hasn't started refunds the whole price under "prorata" too.
 */
export function passRefundMinor(p: { priceMinor: number; validFrom: string; validTo: string; entries?: number }, mode: PassRefundMode, today = todayIST()) {
  if (mode === "none" || p.priceMinor <= 0) return 0;
  if (mode === "full") return (p.entries || 0) === 0 ? p.priceMinor : -1; // -1 = not allowed for a used pass
  const total = daysBetween(p.validFrom, p.validTo) + 1;
  if (today < p.validFrom) return p.priceMinor;
  const remaining = Math.max(0, Math.min(total, daysBetween(today, p.validTo)));
  return Math.floor((p.priceMinor * remaining) / Math.max(1, total));
}

/** Ends a pass at once. The refund (if any) is recorded, a credit note is issued against the pass invoice, and the holder is told. */
export async function cancelParkingPass(actor: any, id: string, o: { refund?: PassRefundMode; reason?: string; method?: string } = {}) {
  const p: any = await ParkingPass.findById(id).lean();
  if (!p || !canAccessDestination(actor, p.destination)) throw new ApiError(404, "Pass not found");
  if (p.status !== "active") throw new ApiError(409, "This pass is already cancelled");
  const mode = o.refund || "none", reason = (o.reason || "").trim();
  if (reason.length < 3) throw new ApiError(400, "Give a short reason for cancelling the pass");
  const refund = passRefundMinor(p, mode);
  if (refund < 0) throw new ApiError(400, "A pass that has been used can only be refunded for the unused days");
  const upd: any = await ParkingPass.findOneAndUpdate({ _id: p._id, status: "active" }, { status: "cancelled", activeKey: `done:${p._id}`, cancelReason: reason, refundMinor: refund, refundMethod: refund > 0 ? (p.channel === "online" ? "original payment method" : o.method || "cash") : undefined, $push: { history: { at: new Date(), event: "cancelled", note: `By ${actor.name}: ${reason}${refund > 0 ? `; refund ${refund}` : ""}` } } }, { new: true }).lean();
  if (!upd) throw new ApiError(409, "This pass was just changed");
  let out = upd;
  if (refund > 0) {
    if (p.channel === "online" && p.user) await Payment.create({ user: p.user, amountMinor: refund, type: "refund", provider: "simulated", method: "simulated", status: "succeeded", providerRef: `SIMREF_${rand(10)}`, idempotencyKey: `ppref:${p._id}`, details: { parkingPass: p.reference } }).catch((e: any) => { if (e?.code !== 11000) throw e; });
    if (p.invoiceNo) out = (await issueCreditNote(ParkingPass, p._id, { creditNoteGstMinor: gstFromInclusive(refund, p.gstPct || 0) })) || upd;
  }
  await tellHolder(out, "cancelled").catch((e) => console.error("[pass notify]", e));
  return out;
}

/* ---------------- Expiry reminders ---------------- */
export const REMIND_DAYS = 7;
async function contactFor(p: any) {
  let email = p.holderEmail as string | undefined, phone = p.holderPhone as string | undefined;
  if (p.user && (!email || !phone)) { const u: any = await User.findById(p.user).select("email phone").lean(); email = email || u?.email; phone = phone || u?.phone; }
  return { email, phone };
}
async function tellHolder(p: any, kind: "expiring" | "cancelled") {
  const { email, phone } = await contactFor(p);
  const site: any = await Destination.findById(p.destination).select("name").lean();
  const subject = kind === "expiring" ? `Your parking pass for ${site?.name} ends on ${fmtDate(p.validTo)}` : `Your parking pass ${p.reference} has been cancelled`;
  const body = kind === "expiring" ? `Your monthly parking pass for ${p.vehicleNumber} at ${site?.name} ends on ${fmtDate(p.validTo)}. Renew in My parking on HeritageHub, or at the gate, to keep parking without paying each visit.`
    : `Your monthly parking pass ${p.reference} for ${p.vehicleNumber} at ${site?.name} was cancelled${p.refundMinor > 0 ? `. A refund of ₹${(p.refundMinor / 100).toFixed(2)} is due to you via ${p.refundMethod}` : ""}.`;
  let sent = 0;
  if (email) { await sendEmail({ to: email, subject, html: `<p>Hello ${p.holderName},</p><p>${body}</p>` }).then(() => sent++).catch(() => {}); }
  if (phone) { await sendSms(phone, `HeritageHub: ${body}`.slice(0, 300)).then((ok) => { if (ok) sent++; }).catch(() => {}); }
  return { email: !!email, phone: !!phone, sent };
}
/**
 * Texts and emails holders whose pass ends within 7 days and who have not already renewed. Each pass is reminded once: it is claimed with a
 * conditional update before sending. Passes with no email or phone are counted but left unmarked so a later contact detail can still be used.
 */
export async function remindExpiringPasses(scope: string[] | null = null, today = todayIST()) {
  const f: any = { status: "active", validTo: { $gte: today, $lte: addDays(today, REMIND_DAYS) }, reminderSentAt: { $exists: false } };
  if (scope) f.destination = { $in: scope };
  const due: any[] = await ParkingPass.find(f).limit(500).lean();
  let reminded = 0, renewed = 0, noContact = 0;
  for (const p of due) {
    if (await ParkingPass.exists({ destination: p.destination, vehicleNumber: p.vehicleNumber, status: "active", validFrom: { $gt: p.validTo } })) { renewed++; continue; }
    const c = await contactFor(p);
    if (!c.email && !c.phone) { noContact++; continue; }
    const claimed = await ParkingPass.findOneAndUpdate({ _id: p._id, reminderSentAt: { $exists: false } }, { reminderSentAt: new Date() }, { new: true }).lean();
    if (!claimed) continue;
    await tellHolder(claimed, "expiring").catch((e) => console.error("[pass reminder]", e));
    reminded++;
  }
  return { due: due.length, reminded, alreadyRenewed: renewed, noContact };
}
