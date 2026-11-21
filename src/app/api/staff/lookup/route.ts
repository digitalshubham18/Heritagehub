import { handle, ok, ApiError } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { Booking, Destination, ParkingPass, ParkingReservation, ParkingTicket } from "@/models";
import { escapeRe } from "@/lib/utils";
import { normalizeVehicle } from "@/lib/parking";
import { limit } from "@/lib/ratelimit";

/** Find a visitor fast: by booking reference, name, phone, vehicle number, parking ticket, or reservation code. Scoped to the staff member's sites. */
export const GET = handle(async (req) => {
  const me = await requireUser(["staff", "admin", "operator"]);
  await limit("lookup", [String(me._id)], 120, 60);
  const q = (req.nextUrl.searchParams.get("q") || "").trim();
  if (q.length < 3) throw new ApiError(400, "Type at least 3 characters");
  const ids: any[] | null = me.role === "admin" ? null : (me.assignedDestinations || []);
  const scope: any = ids ? { destination: { $in: ids } } : {};
  const re = new RegExp(escapeRe(q), "i"), upper = q.toUpperCase().replace(/\s+/g, ""), veh = normalizeVehicle(q);
  const [bookings, tickets, reservations, passes] = await Promise.all([
    Booking.find({ ...scope, status: { $in: ["confirmed", "completed"] }, $or: [{ reference: upper }, { "contact.phone": re }, { "contact.name": re }, { "contact.email": re }, { "visitors.name": re }] }).sort({ date: -1 }).limit(10).select("reference date start end quantity checkedInCount checkedOutCount status contact destination channel").lean(),
    ParkingTicket.find({ ...scope, $or: [{ ticketNo: upper }, ...(veh.length >= 3 ? [{ vehicleNumber: new RegExp(escapeRe(veh)) }] : []), { driverPhone: re }, { driverName: re }] }).sort({ entryAt: -1 }).limit(10).select("ticketNo vehicleNumber vehicleType bay status entryAt exitAt driverName driverPhone feeMinor penaltyMinor prepaidMinor destination invoiceNo reprints").lean(),
    ParkingReservation.find({ ...scope, $or: [{ reference: upper }, ...(veh.length >= 3 ? [{ vehicleNumber: new RegExp(escapeRe(veh)) }] : [])] }).sort({ date: -1 }).limit(10).select("reference date vehicleNumber vehicleType status arrivalFrom prepaidMinor destination").lean(),
    ParkingPass.find({ ...scope, $or: [{ reference: upper }, ...(veh.length >= 3 ? [{ vehicleNumber: new RegExp(escapeRe(veh)) }] : []), { holderName: re }, { holderPhone: re }] }).sort({ validTo: -1 }).limit(10).select("reference vehicleNumber vehicleType holderName holderPhone validFrom validTo status destination").lean(),
  ]);
  const dests: any[] = await Destination.find({ _id: { $in: [...bookings, ...tickets, ...reservations, ...passes].map((x: any) => x.destination) } }).select("name").lean();
  const name = (id: any) => dests.find((d) => String(d._id) === String(id))?.name;
  const tag = (x: any) => ({ ...x, destinationName: name(x.destination) });
  return ok({ bookings: bookings.map(tag), parking: tickets.map(tag), reservations: reservations.map(tag), passes: passes.map(tag) });
});
export const dynamic = "force-dynamic";
