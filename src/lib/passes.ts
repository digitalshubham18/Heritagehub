import crypto from "crypto";
import { CrowdObservation, Destination, Notification, Pass, PassEntry, PassType, Payment } from "@/models";
import { ApiError } from "./api";
import { canAccessDestination } from "./auth";
import { assignInvoice } from "./invoice";
import { priceItems } from "./pricing";
import { addDays, istParts } from "./utils";
import { getOccupancy } from "./booking";
import { notifyPassPurchased } from "./notify";

const tkey = () => process.env.TICKET_SECRET || process.env.AUTH_SECRET || "dev-ticket-secret";
const sig = (ref: string) => crypto.createHmac("sha256", tkey()).update("pass:" + ref).digest("base64url").slice(0, 12);
export const passCode = (ref: string) => `HP1.${ref}.${sig(ref)}`;
export const isPassCode = (c: string) => c.trim().startsWith("HP1.");
export function parsePassCode(raw: string): string | null {
  const [, ref, s] = raw.trim().split(".");
  if (!ref || !s) return null;
  const a = Buffer.from(s), b = Buffer.from(sig(ref));
  return a.length === b.length && crypto.timingSafeEqual(a, b) ? ref : null;
}
const rand = () => Array.from(crypto.randomBytes(7)).map((x) => "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"[x % 32]).join("");

/** Buys a pass with the simulated gateway (card data is never collected). Idempotent per client key. */
export async function purchasePass(user: any, input: { passTypeId: string; holderName: string; startDate?: string; idempotencyKey: string; simulateFailure?: boolean }) {
  const type: any = await PassType.findOne({ _id: input.passTypeId, active: true }).lean();
  if (!type) throw new ApiError(404, "Pass not found");
  const idemKey = `${user._id}:${input.idempotencyKey}`;
  const existing: any = await Pass.findOne({ idemKey }).lean();
  if (existing) return existing;
  const today = istParts().date, start = input.startDate || today;
  if (start < today || start > addDays(today, 90)) throw new ApiError(400, "Choose a start date within the next 90 days");
  const dests: any[] = await Destination.find({ _id: { $in: type.destinations }, active: true }).select("name").lean();
  if (!dests.length) throw new ApiError(409, "This pass has no active destinations");
  const pr = priceItems([{ unitPriceMinor: type.priceMinor, unitFeeMinor: 0, quantity: 1 }]);
  const pass: any = await Pass.create({
    reference: `HP-${rand()}`, idemKey, passType: type._id, operator: type.operator, user: user._id, holderName: input.holderName.trim(),
    destinations: dests.map((d) => d._id), destinationNames: dests.map((d) => d.name), validFrom: start, validTo: addDays(start, type.validityDays - 1),
    maxEntriesPerDay: type.maxEntriesPerDay, status: "pending", subtotalMinor: pr.subtotalMinor, feesMinor: pr.feesMinor, taxMinor: pr.taxMinor, totalMinor: pr.totalMinor,
  });
  if (input.simulateFailure) {
    await Payment.create({ pass: pass._id, user: user._id, amountMinor: pr.totalMinor, method: "card", status: "failed", failureReason: "Simulated payment decline", idempotencyKey: `pass:${pass._id}:fail` });
    await Pass.deleteOne({ _id: pass._id });
    throw new ApiError(402, "Simulated payment decline. Please try again.");
  }
  await Payment.create({ pass: pass._id, user: user._id, amountMinor: pr.totalMinor, method: "upi", status: "succeeded", providerRef: `SIM_${rand()}`, idempotencyKey: `pass:${pass._id}` });
  const active: any = await Pass.findOneAndUpdate({ _id: pass._id, status: "pending" }, { status: "active" }, { new: true }).lean();
  const final: any = await assignInvoice(active, Pass);
  await notifyPassPurchased(final, user);
  return final;
}

type Check = { valid: boolean; reasons: string[]; warnings: string[]; pass: any; dest: any };
function pickDestination(actor: any, destinationId?: string) {
  if (destinationId) return destinationId;
  const a = actor.assignedDestinations || [];
  return a.length === 1 ? String(a[0]) : null;
}

export async function validatePass(actor: any, code: string, action: "verify" | "in" | "out", destinationId?: string, at?: Date): Promise<Check> {
  const ref = parsePassCode(code);
  if (!ref) return { valid: false, reasons: ["Unrecognised or tampered pass code"], warnings: [], pass: null, dest: null };
  const pass: any = await Pass.findOne({ reference: ref }).lean();
  if (!pass) return { valid: false, reasons: ["No pass found for this code"], warnings: [], pass: null, dest: null };
  const destId = pickDestination(actor, destinationId);
  if (!destId) return { valid: false, reasons: ["Choose which site you are scanning for"], warnings: [], pass, dest: null };
  if (!canAccessDestination(actor, destId)) throw new ApiError(403, "You are not assigned to this destination");
  const dest: any = await Destination.findById(destId).select("name entryPaused entryPausedReason").lean();
  const reasons: string[] = [];
  const { date } = istParts(at);
  if (pass.status !== "active") reasons.push(`Pass is ${pass.status}`);
  if (date < pass.validFrom) reasons.push(`Pass is valid from ${pass.validFrom}`);
  if (date > pass.validTo) reasons.push(`Pass expired on ${pass.validTo}`);
  if (!pass.destinations.some((d: any) => String(d) === String(destId))) reasons.push(`This pass is not valid at ${dest?.name}`);
  const inside = pass.insideDestination ? String(pass.insideDestination) : null;
  const usedToday = pass.lastEntryDate === date ? pass.entriesOnDay : 0;
  if (action === "in") {
    if (dest?.entryPaused && !at) reasons.push(`Entry is paused${dest.entryPausedReason ? `: ${dest.entryPausedReason}` : ""}`);
    if (inside) reasons.push("Pass holder is already inside");
    else if (usedToday >= pass.maxEntriesPerDay) reasons.push(`Daily entry limit reached (${pass.maxEntriesPerDay} per day)`);
  }
  if (action === "out" && inside !== String(destId)) reasons.push("Pass holder is not inside this site");
  return { valid: reasons.length === 0, reasons, warnings: [], pass: { ...pass, entriesToday: usedToday, inside: !!inside }, dest };
}

/** Pass entry/exit. Day limits and "already inside" are enforced by guards in the atomic update, not by the read above. */
export async function recordPassEntry(actor: any, code: string, action: "in" | "out", destinationId?: string, opts: { at?: Date } = {}) {
  const v = await validatePass(actor, code, action, destinationId, opts.at);
  if (!v.valid) throw new ApiError(409, v.reasons.join("; "));
  const now = opts.at || new Date(), { date } = istParts(now), p = v.pass, destId = v.dest._id;
  let upd: any;
  if (action === "in") {
    const count = p.lastEntryDate === date ? p.entriesOnDay : 0;
    upd = await Pass.findOneAndUpdate(
      { _id: p._id, status: "active", insideDestination: null, lastEntryDate: p.lastEntryDate ?? null, entriesOnDay: p.entriesOnDay ?? 0 },
      { $set: { insideDestination: destId, insideSince: now, lastEntryDate: date, entriesOnDay: count + 1 }, $inc: { totalEntries: 1 } }, { new: true }
    ).lean();
  } else {
    upd = await Pass.findOneAndUpdate({ _id: p._id, insideDestination: destId }, { $set: { insideDestination: null } }, { new: true }).lean();
  }
  if (!upd) throw new ApiError(409, "Duplicate scan: this pass was just processed");
  await PassEntry.create({ pass: p._id, destination: destId, type: action, at: now, by: actor._id, device: actor.isDevice ? actor._id : undefined });
  if (action === "in") await CrowdObservation.updateOne({ destination: destId, date, hour: Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", hour: "2-digit", hour12: false }).format(now)), source: "recorded" }, { $inc: { visitors: 1 } }, { upsert: true });
  return { pass: upd, occupancy: await getOccupancy(destId), destination: v.dest };
}
export { Notification };
