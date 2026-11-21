import QRCode from "qrcode";
import { handle, ok, ApiError } from "@/lib/api";
import { canAccessDestination, requireUser } from "@/lib/auth";
import { Booking, Destination, ParkingPass, ParkingReservation, ParkingTicket } from "@/models";
import { ticketCode } from "@/lib/booking";
import { audit } from "@/lib/audit";
import { limit } from "@/lib/ratelimit";

const qr = (v: string) => QRCode.toDataURL(v, { margin: 1, width: 280, color: { dark: "#173B2C", light: "#FFFFFF" } });
/**
 * Reprint from visitor lookup. Returns what is needed to print a DUPLICATE: the copy is recorded (count, time, staff member in the audit log), so a duplicate
 * can be told from the original. Booking tickets reprint the same QR, which stays valid because entry is counted per booking.
 */
export const GET = handle(async (req) => {
  const me = await requireUser(["staff", "admin", "operator"]);
  await limit("reprint", [String(me._id)], 60, 3600);
  const sp = req.nextUrl.searchParams, type = sp.get("type"), id = sp.get("id");
  if (!id) throw new ApiError(400, "id is required");
  const stamp = { at: new Date(), by: me.name };
  if (type === "booking") {
    const b: any = await Booking.findById(id).lean();
    if (!b || !canAccessDestination(me, b.destination)) throw new ApiError(404, "Booking not found");
    if (!["confirmed", "completed"].includes(b.status)) throw new ApiError(409, `This booking is ${b.status}, so it can't be reprinted`);
    const d: any = await Destination.findById(b.destination).select("name city").lean();
    await Booking.updateOne({ _id: b._id }, { $push: { history: { at: stamp.at, event: "reprinted", by: String(me._id), note: `Ticket reprinted by ${me.name}` } } });
    await audit(me, "ticket.reprint", "Booking", b._id, `Reprinted ticket ${b.reference}`);
    return ok({ kind: "booking", duplicate: true, reference: b.reference, site: d?.name, date: b.date, start: b.start, end: b.end, quantity: b.quantity, visitors: b.visitors, entered: b.checkedInCount || 0, qr: await qr(ticketCode(b.reference)), printedBy: stamp.by, printedAt: stamp.at });
  }
  if (type === "parking") {
    const t: any = await ParkingTicket.findById(id).lean();
    if (!t || !canAccessDestination(me, t.destination)) throw new ApiError(404, "Parking ticket not found");
    const upd: any = await ParkingTicket.findByIdAndUpdate(t._id, { $inc: { reprints: 1 }, lastReprintAt: stamp.at }, { new: true }).lean();
    const d: any = await Destination.findById(t.destination).select("name").lean();
    await audit(me, "parking.reprint", "ParkingTicket", t._id, `Reprinted parking ticket ${t.ticketNo}`);
    return ok({ kind: "parking", duplicate: true, copy: upd.reprints, ticketNo: t.ticketNo, vehicleNumber: t.vehicleNumber, vehicleType: t.vehicleType, bay: t.bay, status: t.status, site: d?.name, entryAt: t.entryAt, exitAt: t.exitAt, qr: await qr(t.ticketNo), printedBy: stamp.by, printedAt: stamp.at });
  }
  if (type === "reservation") {
    const r: any = await ParkingReservation.findById(id).lean();
    if (!r || !canAccessDestination(me, r.destination)) throw new ApiError(404, "Reservation not found");
    const d: any = await Destination.findById(r.destination).select("name").lean();
    return ok({ kind: "reservation", duplicate: true, reference: r.reference, vehicleNumber: r.vehicleNumber, date: r.date, arrivalFrom: r.arrivalFrom, site: d?.name, status: r.status, qr: await qr(r.reference), printedBy: stamp.by, printedAt: stamp.at });
  }
  if (type === "pass") {
    const p: any = await ParkingPass.findById(id).lean();
    if (!p || !canAccessDestination(me, p.destination)) throw new ApiError(404, "Pass not found");
    const d: any = await Destination.findById(p.destination).select("name").lean();
    await audit(me, "parking.pass.reprint", "ParkingPass", p._id, `Reprinted parking pass ${p.reference}`);
    return ok({ kind: "parking_pass", duplicate: true, reference: p.reference, vehicleNumber: p.vehicleNumber, holder: p.holderName, validFrom: p.validFrom, validTo: p.validTo, site: d?.name, qr: await qr(p.reference), printedBy: stamp.by, printedAt: stamp.at });
  }
  throw new ApiError(400, "type must be booking, parking, reservation or pass");
});
export const dynamic = "force-dynamic";
