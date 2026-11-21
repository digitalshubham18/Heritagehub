import { Types } from "mongoose";
import { LoyaltyAccount, LoyaltyEntry } from "@/models";
import { ApiError } from "./api";

export * from "./loyalty-core";
import { EXPIRY_WARN_DAYS, NEW_SITE_BONUS, earnPoints, expiryDate, nextTier, pointsValueMinor, tierFor } from "./loyalty-core";

async function ensureAccount(user: any) {
  try { await LoyaltyAccount.updateOne({ user }, { $setOnInsert: { user, balance: 0, lifetime: 0 } }, { upsert: true }); } catch (e: any) { if (e?.code !== 11000) throw e; }
}
/** The ledger is the record; the account holds the running balance for atomic spending. If they ever disagree, the ledger wins and the account is repaired. */
export async function loyaltySummary(user: any) {
  await ensureAccount(user);
  await expireDue(user);
  const rows: any[] = await LoyaltyEntry.find({ user }).sort({ createdAt: -1 }).limit(100).lean();
  const sums: any[] = await LoyaltyEntry.aggregate([{ $match: { user } }, { $group: { _id: null, bal: { $sum: "$points" }, life: { $sum: { $cond: [{ $in: ["$type", ["earn", "bonus"]] }, "$points", 0] } } } }]);
  const bal = Math.max(0, sums[0]?.bal || 0), life = sums[0]?.life || 0;
  let acc: any = await LoyaltyAccount.findOne({ user }).lean();
  if (!acc || acc.balance !== bal || acc.lifetime !== life) acc = await LoyaltyAccount.findOneAndUpdate({ user }, { balance: bal, lifetime: life }, { new: true }).lean();
  const tier = tierFor(life), nxt = nextTier(life);
  const soon: any[] = await LoyaltyEntry.aggregate([{ $match: { user, remaining: { $gt: 0 }, expiresAt: { $gt: new Date(), $lte: new Date(Date.now() + EXPIRY_WARN_DAYS * 86400000) } } }, { $group: { _id: null, points: { $sum: "$remaining" }, first: { $min: "$expiresAt" } } }]);
  return { balance: acc.balance as number, lifetime: acc.lifetime as number, tier, next: nxt ? { ...nxt, pointsToGo: nxt.from - life } : null, valueMinor: pointsValueMinor(acc.balance), expiringSoon: soon[0] ? { points: Math.min(soon[0].points, acc.balance), by: soon[0].first as Date } : null, entries: rows };
}

/** Adds points once per key (a replay does nothing). Returns the points actually added. */
export async function addPoints(o: { user: any; type: "earn" | "restore" | "bonus" | "adjust"; points: number; key: string; booking?: any; destination?: any; note?: string; by?: any }) {
  if (o.points <= 0) return 0;
  await ensureAccount(o.user);
  try { await LoyaltyEntry.create({ user: o.user, type: o.type, points: o.points, key: o.key, booking: o.booking, destination: o.destination, note: o.note, by: o.by, remaining: o.points, expiresAt: expiryDate(new Date()) }); } catch (e: any) { if (e?.code === 11000) return 0; throw e; }
  await LoyaltyAccount.updateOne({ user: o.user }, { $inc: o.type === "earn" || o.type === "bonus" ? { balance: o.points, lifetime: o.points } : { balance: o.points } });
  return o.points;
}
/** Spends points atomically: the balance can never go below zero, even with simultaneous bookings. */
export async function spendPoints(o: { user: any; points: number; key: string; booking?: any; destination?: any; note?: string; type?: "redeem" | "adjust"; by?: any }) {
  if (o.points <= 0) return;
  await ensureAccount(o.user);
  await expireDue(o.user); // points that have lapsed can't be spent
  const acc = await LoyaltyAccount.findOneAndUpdate({ user: o.user, balance: { $gte: o.points } }, { $inc: { balance: -o.points } }, { new: true }).lean();
  if (!acc) throw new ApiError(409, "You don't have enough loyalty points for that");
  try { await LoyaltyEntry.create({ user: o.user, type: o.type || "redeem", points: -o.points, key: o.key, booking: o.booking, destination: o.destination, note: o.note, by: o.by }); }
  catch (e: any) { await LoyaltyAccount.updateOne({ user: o.user }, { $inc: { balance: o.points } }); if (e?.code === 11000) return; throw e; }
  await consumeFifo(o.user, o.points);
}
/** Spending takes the oldest points first, so the ones about to expire are used before newer ones. */
async function consumeFifo(user: any, points: number) {
  let left = points;
  for (let guard = 0; left > 0 && guard < 60; guard++) {
    const e: any = (await LoyaltyEntry.findOne({ user, remaining: { $gt: 0 }, expiresAt: { $exists: true, $ne: null } }).sort({ expiresAt: 1, createdAt: 1 }).lean()) || (await LoyaltyEntry.findOne({ user, remaining: { $gt: 0 } }).sort({ createdAt: 1 }).lean());
    if (!e) return;
    const take = Math.min(left, e.remaining);
    if ((await LoyaltyEntry.updateOne({ _id: e._id, remaining: { $gte: take } }, { $inc: { remaining: -take } })).modifiedCount) left -= take;
  }
}
/**
 * Lapses points whose expiry date has passed. Each credit expires once (the ledger key is unique per credit), the unspent part becomes a negative
 * "expire" entry, and the balance drops by the same amount.
 */
export async function expireDue(user: any) {
  const due: any[] = await LoyaltyEntry.find({ user, remaining: { $gt: 0 }, expiresAt: { $lte: new Date() } }).limit(100).lean();
  for (const e of due) {
    const was: any = await LoyaltyEntry.findOneAndUpdate({ _id: e._id, remaining: { $gt: 0 }, expiresAt: { $lte: new Date() } }, { remaining: 0 }, { new: false }).lean();
    if (!was) continue; // another request expired it
    try { await LoyaltyEntry.create({ user, type: "expire", points: -was.remaining, key: `expire:${e._id}`, note: `Expired: ${was.note || was.type} from ${new Date(was.createdAt).toLocaleDateString("en-IN")}` }); }
    catch (err: any) { if (err?.code === 11000) continue; throw err; }
    await LoyaltyAccount.updateOne({ user }, { $inc: { balance: -was.remaining } });
  }
}
/** A manager adds or removes points with a reason. Removal can't take the balance below zero. Returns the signed amount applied. */
export async function adjustPoints(by: any, user: any, points: number, reason: string) {
  const key = `adjust:${new Types.ObjectId()}`, note = `Adjusted by ${by.name}: ${reason}`;
  if (points > 0) return addPoints({ user, type: "adjust", points, key, note, by: by._id });
  await spendPoints({ user, points: -points, key, note, type: "adjust", by: by._id });
  return points;
}
/** Gives back the points a booking used, once, when it is cancelled or its hold expires. Points have no cash value, so they are always returned in full. */
export async function restoreRedeemed(booking: any) {
  if (!booking?.loyaltyPointsUsed) return 0;
  return addPoints({ user: booking.user, type: "restore", points: booking.loyaltyPointsUsed, key: `restore:${booking._id}`, booking: booking._id, destination: booking.destination, note: `Returned: booking ${booking.reference} was not used` });
}
/** Points for a completed visit (first entry), plus a one-time bonus for the first visit to each site. Online and group bookings only. */
export async function awardForVisit(booking: any) {
  if (!booking || booking.channel === "counter") return 0;
  const sum = await loyaltySummary(booking.user);
  let n = await addPoints({ user: booking.user, type: "earn", points: earnPoints(booking.subtotalMinor || 0, sum.lifetime), key: `earn:${booking._id}`, booking: booking._id, destination: booking.destination, note: `Visit ${booking.reference}` });
  n += await addPoints({ user: booking.user, type: "bonus", points: NEW_SITE_BONUS, key: `first:${booking.user}:${booking.destination}`, booking: booking._id, destination: booking.destination, note: "First visit to this site" });
  return n;
}
