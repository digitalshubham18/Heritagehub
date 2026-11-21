import { handle, ok, ApiError } from "@/lib/api";
import { canAccessDestination, requireUser } from "@/lib/auth";
import { ParkingLot, ParkingReservation, ParkingTicket } from "@/models";
import { availability, expireReservations, heldToday, minutesParked, overridesFor, OVERSTAY_MIN, parkingFee, poolOf } from "@/lib/parking";
import { todayIST } from "@/lib/utils";

/** Vehicles currently parked, with the running fee, live availability, and today's pre-booked vehicles still to arrive. */
export const GET = handle(async (req) => {
  const me = await requireUser(["staff", "admin", "operator"]);
  const id = req.nextUrl.searchParams.get("destination");
  if (!id) throw new ApiError(400, "destination is required");
  if (!canAccessDestination(me, id)) throw new ApiError(403, "Not assigned to this destination");
  const lot: any = await ParkingLot.findOne({ destination: id }).lean();
  if (!lot) return ok({ configured: false, items: [], types: [], expected: [] });
  await expireReservations();
  const [parked, expected] = await Promise.all([
    ParkingTicket.find({ destination: id, status: "parked" }).sort({ entryAt: 1 }).limit(500).lean() as Promise<any[]>,
    ParkingReservation.find({ destination: id, date: todayIST(), status: "reserved" }).sort({ arrivalFrom: 1 }).limit(200).lean() as Promise<any[]>,
  ]);
  return ok({
    configured: true, types: availability(lot, await heldToday(lot._id), await overridesFor(lot._id, todayIST())), lostTicketFeeMinor: lot.lostTicketFeeMinor || 0, gstPct: lot.gstPct || 0, rates: Object.fromEntries((["car","two_wheeler","bus","ev","accessible"] as const).map((k) => [k, { freeMinutes: lot[k]?.freeMinutes ?? 0, firstHourMinor: lot[k]?.firstHourMinor ?? 0, extraHourMinor: lot[k]?.extraHourMinor ?? 0, dailyMaxMinor: lot[k]?.dailyMaxMinor ?? 0 }])),
    items: parked.map((t) => { const m = minutesParked(t.entryAt), fee = t.passRef ? 0 : parkingFee(lot[poolOf(t.vehicleType, t.bay)], m); return { bay: t.bay || "standard", passRef: t.passRef, id: t._id, ticketNo: t.ticketNo, vehicleType: t.vehicleType, vehicleNumber: t.vehicleNumber, entryAt: t.entryAt, minutes: m, feeMinor: fee, prepaidMinor: t.prepaidMinor || 0, dueMinor: Math.max(0, fee - (t.prepaidMinor || 0)), driverName: t.driverName, driverPhone: t.driverPhone, source: t.source, overstay: m >= OVERSTAY_MIN }; }),
    expected: expected.map((r) => ({ bay: r.bay || "standard", id: r._id, reference: r.reference, vehicleType: r.vehicleType, vehicleNumber: r.vehicleNumber, arrivalFrom: r.arrivalFrom, prepaidMinor: r.prepaidMinor || 0 })),
  });
});
export const dynamic = "force-dynamic";
