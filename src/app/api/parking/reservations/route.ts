import QRCode from "qrcode";
import { z } from "zod";
import { handle, ok, ApiError } from "@/lib/api";
import { canAccessDestination, requireUser } from "@/lib/auth";
import { Destination, ParkingReservation } from "@/models";
import { cancelReservation, expireReservations, reserveParking } from "@/lib/parking";
import { limit } from "@/lib/ratelimit";

const schema = z.object({
  destinationId: z.string().min(1), date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), vehicleType: z.enum(["car", "two_wheeler", "bus"]), bay: z.enum(["standard", "ev", "accessible"]).optional(),
  vehicleNumber: z.string().trim().min(4, "Enter the vehicle number").max(20), arrivalFrom: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  paymentMode: z.enum(["prepay", "at_exit"]).default("at_exit"), method: z.enum(["upi", "card"]).optional(), bookingRef: z.string().max(20).optional(),
  idempotencyKey: z.string().min(8).max(80),
});

/** Visitors: their own reservations (with a QR of the reservation code). Staff and managers: ?destination=&date= lists a site's reservations. */
export const GET = handle(async (req) => {
  const me = await requireUser();
  await expireReservations();
  const sp = req.nextUrl.searchParams;
  let rows: any[];
  if (me.role === "tourist") rows = await ParkingReservation.find({ user: me._id }).sort({ date: -1, createdAt: -1 }).limit(100).lean();
  else {
    const dest = sp.get("destination");
    if (!dest) throw new ApiError(400, "destination is required");
    if (!canAccessDestination(me, dest)) throw new ApiError(403, "Not assigned to this destination");
    const f: any = { destination: dest }; if (sp.get("date")) f.date = sp.get("date");
    rows = await ParkingReservation.find(f).sort({ date: -1, arrivalFrom: 1 }).limit(300).populate("user", "name phone").lean();
  }
  const dests: any[] = await Destination.find({ _id: { $in: rows.map((r) => r.destination) } }).select("name slug city location").lean();
  const byId = new Map(dests.map((d) => [String(d._id), d]));
  const items = await Promise.all(rows.map(async (r) => ({ ...r, destinationInfo: byId.get(String(r.destination)), qr: me.role === "tourist" && r.status === "reserved" ? await QRCode.toDataURL(r.reference, { margin: 1, width: 280, color: { dark: "#173B2C", light: "#FFFFFF" } }) : undefined })));
  return ok({ items });
});

export const POST = handle(async (req) => {
  const me = await requireUser(); // any signed-in account can reserve parking for its own vehicle
  await limit("parkres", [String(me._id)], 20, 3600);
  const r = await reserveParking(me, schema.parse(await req.json()));
  return ok({ reservation: r.reservation, replayed: r.replayed }, r.replayed ? 200 : 201);
});

export const DELETE = handle(async (req) => {
  const me = await requireUser();
  const id = req.nextUrl.searchParams.get("id");
  if (!id) throw new ApiError(400, "id is required");
  const r = await cancelReservation(me, id);
  return ok({ ok: true, refundMinor: r.refundMinor });
});
export const dynamic = "force-dynamic";
