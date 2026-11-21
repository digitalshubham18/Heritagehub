import crypto from "crypto";
import bcrypt from "bcryptjs";
import {
  Booking, GroupRequest, LoyaltyAccount, LoyaltyEntry, Notification, ParkingPass, ParkingReservation, ParkingTicket, Pass, Payment, PrivacyRequest, Review,
  SupportTicket, TicketTransfer, User, Waitlist,
} from "@/models";
import { ApiError } from "./api";
import { todayIST } from "./utils";

/**
 * Data requests from a visitor (DPDP Act 2023: access and erasure).
 * Export gives the visitor everything linked to their account. Erasure anonymises personal fields everywhere and ends the account,
 * but KEEPS the financial rows (amounts, GST, invoice and credit-note numbers, settlements) that tax and accounting rules require us to retain.
 * Only tourist accounts use this. Staff and manager accounts are removed by an administrator.
 */
const REDACTED = "Erased";
export const userRef = (id: unknown) => crypto.createHash("sha256").update(`privacy:${String(id)}`).digest("hex").slice(0, 24);
const plain = (d: any) => JSON.parse(JSON.stringify(d));

/** What is linked to this account and which of it blocks erasure right now (a visit still ahead, a vehicle still parked, a live pass). */
export async function linkedRecords(userId: any) {
  const today = todayIST();
  const bookings = await Booking.find({ user: userId }).select("_id status date paymentStatus").lean() as any[];
  const reservations = await ParkingReservation.find({ user: userId }).select("_id ticket status date").lean() as any[];
  const bookingIds = bookings.map((b) => b._id);
  const tickets = await ParkingTicket.find({ $or: [{ booking: { $in: bookingIds } }, { _id: { $in: reservations.map((r) => r.ticket).filter(Boolean) } }, { reservation: { $in: reservations.map((r) => r._id) } }] }).select("_id status").lean() as any[];
  const blockers: string[] = [];
  const upcoming = bookings.filter((b) => ["pending", "confirmed"].includes(b.status) && b.date >= today).length;
  if (upcoming) blockers.push(`${upcoming} upcoming ticket booking${upcoming > 1 ? "s" : ""} (cancel them first, or wait until after the visit)`);
  const livePasses = await Pass.countDocuments({ user: userId, status: { $in: ["pending", "active"] }, validTo: { $gte: today } });
  if (livePasses) blockers.push(`${livePasses} season pass${livePasses > 1 ? "es" : ""} still valid`);
  const liveRes = reservations.filter((r) => r.status === "reserved" && r.date >= today).length;
  if (liveRes) blockers.push(`${liveRes} parking reservation${liveRes > 1 ? "s" : ""} for today or later`);
  if (tickets.some((t) => t.status === "parked")) blockers.push("a vehicle that is still parked");
  const livePark = await ParkingPass.countDocuments({ user: userId, status: "active", validTo: { $gte: today } });
  if (livePark) blockers.push(`${livePark} monthly parking pass${livePark > 1 ? "es" : ""} still valid`);
  const groups = await GroupRequest.countDocuments({ user: userId, status: "approved" });
  if (groups) blockers.push(`${groups} approved group booking${groups > 1 ? "s" : ""} not yet completed`);
  const transfers = await TicketTransfer.countDocuments({ $or: [{ from: userId }, { to: userId }], status: "pending" });
  if (transfers) blockers.push("a ticket transfer that is still pending");
  return { bookingIds, reservationIds: reservations.map((r) => r._id), ticketIds: tickets.map((t) => t._id), blockers };
}

export async function exportUserData(userId: any) {
  const user: any = await User.findById(userId).lean();
  if (!user) throw new ApiError(404, "Account not found");
  const link = await linkedRecords(userId);
  const [bookings, payments, passes, reservations, tickets, parkingPasses, groups, loyaltyAccount, loyalty, reviews, waitlist, support, transfers, notices] = await Promise.all([
    Booking.find({ user: userId }).select("-idemKey -idempotencyKey").lean(),
    Payment.find({ user: userId }).select("-idempotencyKey").lean(),
    Pass.find({ user: userId }).select("-idemKey").lean(),
    ParkingReservation.find({ user: userId }).select("-idemKey -activeKey").lean(),
    ParkingTicket.find({ _id: { $in: link.ticketIds } }).select("-activeKey").lean(),
    ParkingPass.find({ user: userId }).select("-idemKey -activeKey").lean(),
    GroupRequest.find({ user: userId }).lean(),
    LoyaltyAccount.findOne({ user: userId }).lean(),
    LoyaltyEntry.find({ user: userId }).select("-key").lean(),
    Review.find({ user: userId }).lean(),
    Waitlist.find({ user: userId }).select("-slotKey").lean(),
    SupportTicket.find({ $or: [{ user: userId }, { email: user.email }] }).lean(),
    TicketTransfer.find({ $or: [{ from: userId }, { to: userId }] }).select("-pendingKey").lean(),
    Notification.find({ user: userId }).select("-key").lean(),
  ]);
  const counts = { bookings: bookings.length, payments: payments.length, passes: passes.length, parkingReservations: reservations.length, parkingStays: tickets.length, parkingPasses: parkingPasses.length, groupRequests: groups.length, loyaltyEntries: loyalty.length, reviews: reviews.length, supportTickets: support.length };
  await PrivacyRequest.create({ userRef: userRef(userId), type: "export", status: "completed", counts });
  return plain({
    exportedAt: new Date().toISOString(),
    about: "Everything HeritageHub holds that is linked to your account. Passwords and security secrets are never included.",
    profile: { id: user._id, name: user.name, email: user.email, phone: user.phone, nationality: user.nationality, createdAt: user.createdAt, savedVehicles: user.vehicles, savedTravelCompanions: user.savedVisitors, favouriteDestinationIds: user.favorites, twoStepSignIn: !!user.twoFactor?.enabled },
    bookings, payments, seasonPasses: passes, parkingReservations: reservations, parkingStays: tickets, monthlyParkingPasses: parkingPasses, groupRequests: groups,
    loyalty: { account: loyaltyAccount, entries: loyalty }, reviews, waitlist, supportTickets: support, ticketTransfers: transfers, notifications: notices, counts,
  });
}

export async function eraseUser(user: any, password: string) {
  if (user.role !== "tourist") throw new ApiError(403, "Staff and manager accounts are closed by an administrator. Ask your manager.");
  const u: any = await User.findById(user._id).select("+passwordHash email");
  if (!u || !(await bcrypt.compare(password, u.passwordHash))) throw new ApiError(400, "Password is incorrect");
  const link = await linkedRecords(user._id);
  if (link.blockers.length) {
    await PrivacyRequest.create({ userRef: userRef(user._id), type: "erase", status: "refused", reason: "open items", counts: { blockers: link.blockers.length } });
    throw new ApiError(409, `We can't erase the account yet because of: ${link.blockers.join("; ")}.`);
  }
  const id = user._id, email = u.email as string, tag = String(id);
  const r: Record<string, number> = {};
  const n = (k: string, x: any) => { r[k] = x?.modifiedCount ?? x?.deletedCount ?? 0; };

  n("bookings", await Booking.updateMany({ user: id }, { $set: { contact: { name: REDACTED }, visitors: [] } }));
  n("payments", await Payment.updateMany({ user: id }, { $unset: { details: "" } }));
  n("passes", await Pass.updateMany({ user: id }, { $set: { holderName: REDACTED } }));
  for (const rv of await ParkingReservation.find({ user: id }).select("_id").lean() as any[]) await ParkingReservation.updateOne({ _id: rv._id }, { $set: { vehicleNumber: "REDACTED", activeKey: `done:${rv._id}` }, $unset: { bookingRef: "" } });
  n("parkingStays", await ParkingTicket.updateMany({ _id: { $in: link.ticketIds } }, { $set: { vehicleNumber: "REDACTED" }, $unset: { driverName: "", driverPhone: "", plate: "" } }));
  // activeKey is unique per document and embeds the vehicle number, so each ticket gets its own neutral marker
  for (const tid of link.ticketIds) await ParkingTicket.updateOne({ _id: tid }, { $set: { activeKey: `done:${tid}` } });
  for (const pp of await ParkingPass.find({ user: id }).select("_id").lean() as any[]) await ParkingPass.updateOne({ _id: pp._id }, { $set: { vehicleNumber: "REDACTED", holderName: REDACTED, activeKey: `done:${pp._id}` }, $unset: { holderPhone: "", holderEmail: "" } });
  n("groupRequests", await GroupRequest.updateMany({ user: id }, { $set: { contact: { name: REDACTED } }, $unset: { notes: "" } }));
  n("reviewComments", await Review.updateMany({ user: id }, { $unset: { comment: "" } }));
  n("waitlist", await Waitlist.deleteMany({ user: id }));
  n("notifications", await Notification.deleteMany({ user: id }));
  n("loyaltyEntries", await LoyaltyEntry.deleteMany({ user: id })); await LoyaltyAccount.deleteMany({ user: id });
  n("transfers", await TicketTransfer.updateMany({ $or: [{ from: id }, { to: id }] }, { $set: { fromName: REDACTED, toName: REDACTED }, $unset: { toEmail: "", message: "", visitors: "" } }));
  const tickets = await SupportTicket.find({ $or: [{ user: id }, { email }] }).select("_id messages").lean() as any[];
  for (const t of tickets) {
    const messages = (t.messages || []).map((m: any) => ({ ...m, body: "[Removed at the visitor's request]", byName: m.from === "visitor" ? REDACTED : m.byName }));
    await SupportTicket.updateOne({ _id: t._id }, { $set: { name: REDACTED, email: "erased@erased.invalid", messages }, $unset: { user: "" } });
  }
  r.supportTickets = tickets.length;

  await User.updateOne({ _id: id }, {
    $set: { name: "Deleted visitor", email: `deleted-${tag}@erased.invalid`, active: false, erasedAt: new Date(), vehicles: [], savedVisitors: [], favorites: [], passwordHash: await bcrypt.hash(crypto.randomBytes(24).toString("hex"), 10), "twoFactor.enabled": false },
    $unset: { phone: "", "twoFactor.secretEnc": "", "twoFactor.pendingSecretEnc": "", "twoFactor.recoveryHashes": "" }, $inc: { sessionVersion: 1 },
  });
  await PrivacyRequest.create({ userRef: userRef(id), type: "erase", status: "completed", counts: r });
  return r;
}
