import { Booking, Destination, Incident, ParkingPass, ParkingTicket, Payment, ShiftHandover, ShiftReport, User } from "@/models";
import { ApiError } from "./api";
import { canAccessDestination } from "./auth";
import { getOccupancy } from "./booking";
import { startOfDayIST, todayIST } from "./utils";

/** Everything this staff member has taken since their last cash count today (or the start of the day), plus any float accepted in a handover. */
export async function tally(me: any, dest: string) {
  const last: any = await ShiftReport.findOne({ user: me._id, destination: dest, date: todayIST() }).sort({ createdAt: -1 }).lean();
  const since: Date = last?.createdAt || startOfDayIST();
  const pays: any[] = await Payment.find({ provider: "counter", user: me._id, status: "succeeded", createdAt: { $gte: since } }).lean();
  const bookings: any[] = await Booking.find({ _id: { $in: pays.map((p) => p.booking) }, destination: dest }).select("quantity").lean();
  const byId = new Map(bookings.map((b) => [String(b._id), b]));
  const m: Record<string, number> = { cash: 0, upi: 0, card: 0 }; let tickets = 0, sales = 0;
  for (const p of pays) { const b = byId.get(String(p.booking)); if (!b) continue; const sign = p.type === "refund" ? -1 : 1; m[p.method] = (m[p.method] || 0) + sign * p.amountMinor; if (sign > 0) { tickets += b.quantity; sales++; } }
  const exits: any[] = await ParkingTicket.find({ destination: dest, exitBy: me._id, exitAt: { $gte: since } }).select("paidMinor method").lean();
  const park: Record<string, number> = { cash: 0, upi: 0, card: 0 };
  for (const t of exits) if (t.paidMinor > 0 && park[t.method] !== undefined) park[t.method] += t.paidMinor;
  const pre: any[] = await ParkingTicket.find({ destination: dest, by: me._id, source: "counter", entryAt: { $gte: since }, prepaidMinor: { $gt: 0 } }).select("prepaidMinor prepaidMethod").lean();
  for (const t of pre) if (t.prepaidMethod && park[t.prepaidMethod] !== undefined) park[t.prepaidMethod] += t.prepaidMinor;
  const passes: any[] = await ParkingPass.find({ destination: dest, soldBy: me._id, channel: "staff", createdAt: { $gte: since } }).select("priceMinor method").lean();
  for (const x of passes) if (x.method && park[x.method] !== undefined) park[x.method] += x.priceMinor;
  const hand: any = await ShiftHandover.findOne({ destination: dest, to: me._id, status: "accepted", acceptedAt: { $gte: since } }).sort({ acceptedAt: -1 }).lean();
  const openingFloatMinor = hand?.receivedCashMinor || 0;
  return { since, counter: m, parking: park, tickets, sales, parkingExits: exits.length, passesSold: passes.length, openingFloatMinor, takingsCashMinor: m.cash + park.cash, expectedCashMinor: m.cash + park.cash + openingFloatMinor, lastCountAt: last?.createdAt || null };
}

/** Records a cash count: what the system expected, what was counted, and the difference. A difference needs a note. */
export async function closeShift(me: any, destinationId: string, countedCashMinor: number, notes?: string, handover?: any) {
  if (!canAccessDestination(me, destinationId)) throw new ApiError(403, "Not assigned to this destination");
  const t = await tally(me, destinationId);
  const variance = countedCashMinor - t.expectedCashMinor;
  if (variance !== 0 && (notes || "").trim().length < 3) throw new ApiError(400, "The count doesn't match. Add a short note explaining the difference.");
  const d: any = await Destination.findById(destinationId).select("operator").lean();
  const report = await ShiftReport.create({ user: me._id, userName: me.name, destination: destinationId, operator: d?.operator, date: todayIST(), ticketsSold: t.tickets, counterCashMinor: t.counter.cash, parkingCashMinor: t.parking.cash, openingFloatMinor: t.openingFloatMinor, expectedCashMinor: t.expectedCashMinor, countedCashMinor, varianceMinor: variance, notes, handover });
  return { report: report.toObject(), tally: t };
}

/** Outgoing staff close their count and hand the drawer and a briefing to the named colleague. */
export async function createHandover(me: any, i: { destinationId: string; toUserId: string; countedCashMinor: number; notes?: string }) {
  if (!canAccessDestination(me, i.destinationId)) throw new ApiError(403, "Not assigned to this destination");
  if (String(i.toUserId) === String(me._id)) throw new ApiError(400, "Choose a colleague to hand over to");
  const to: any = await User.findOne({ _id: i.toUserId, role: "staff", active: true }).select("name assignedDestinations").lean();
  if (!to || !(to.assignedDestinations || []).some((d: any) => String(d) === String(i.destinationId))) throw new ApiError(404, "That colleague isn't on staff at this site");
  if (await ShiftHandover.findOne({ destination: i.destinationId, from: me._id, status: "pending" }).lean()) throw new ApiError(409, "You already have a handover waiting to be accepted. Cancel it first.");
  const dest: any = await Destination.findById(i.destinationId).select("name operator entryPaused entryPausedReason").lean();
  const { report, tally: t } = await closeShift(me, i.destinationId, i.countedCashMinor, i.notes);
  const [parked, inside, incs]: any[] = await Promise.all([ParkingTicket.countDocuments({ destination: i.destinationId, status: "parked" }), getOccupancy(dest._id), Incident.find({ destination: i.destinationId, status: { $in: ["open", "acknowledged"] } }).select("category severity message status").limit(20).lean()]);
  const h = await ShiftHandover.create({
    destination: i.destinationId, operator: dest.operator, from: me._id, fromName: me.name, to: to._id, toName: to.name, date: todayIST(), handedCashMinor: i.countedCashMinor, expectedCashMinor: t.expectedCashMinor, varianceMinor: report.varianceMinor, report: report._id, notes: i.notes,
    snapshot: { vehiclesParked: parked, insideNow: inside, entryPaused: !!dest.entryPaused, entryPausedReason: dest.entryPausedReason, openIncidents: incs.map((x: any) => ({ id: String(x._id), category: x.category, severity: x.severity, message: x.message, status: x.status })) },
  });
  await ShiftReport.updateOne({ _id: report._id }, { handover: h._id });
  return h.toObject();
}

/** The incoming colleague counts the drawer they were handed. The float becomes their opening balance; a mismatch is recorded for managers. */
export async function acceptHandover(me: any, id: string, receivedCashMinor: number, notes?: string) {
  const h: any = await ShiftHandover.findById(id).lean();
  if (!h || String(h.to) !== String(me._id)) throw new ApiError(404, "Handover not found");
  if (h.status !== "pending") throw new ApiError(409, `This handover is already ${h.status}`);
  const diff = receivedCashMinor - h.handedCashMinor;
  if (diff !== 0 && (notes || "").trim().length < 3) throw new ApiError(400, "The cash you counted differs from what was handed over. Add a short note.");
  const upd = await ShiftHandover.findOneAndUpdate({ _id: h._id, status: "pending" }, { status: "accepted", acceptedAt: new Date(), receivedCashMinor, receiveVarianceMinor: diff, receiveNotes: notes }, { new: true }).lean();
  if (!upd) throw new ApiError(409, "This handover was just changed");
  return upd;
}
export async function cancelHandover(me: any, id: string) {
  const upd = await ShiftHandover.findOneAndUpdate({ _id: id, from: me._id, status: "pending" }, { status: "cancelled" }, { new: true }).lean();
  if (!upd) throw new ApiError(404, "No pending handover of yours with that id");
  return upd;
}
