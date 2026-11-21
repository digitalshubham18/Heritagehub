import { handle, ok } from "@/lib/api";
import { availability, heldToday, lotFor, overridesFor, RESERVE_AHEAD_DAYS, reservableLeft } from "@/lib/parking";
import { todayIST } from "@/lib/utils";

/** Public: free spaces per vehicle type (from staff-recorded movements, minus spaces held for pre-booked vehicles) and what can still be pre-booked on a date. */
export const GET = handle(async (req) => {
  const { dest, lot } = await lotFor(req.nextUrl.searchParams.get("destination") || "");
  const date = req.nextUrl.searchParams.get("date") || todayIST();
  return ok({
    destination: { id: dest._id, name: dest.name }, available: !!lot, name: lot?.name,
    types: lot ? availability(lot, await heldToday(lot._id), await overridesFor(lot._id, todayIST())) : [], lostTicketFeeMinor: lot?.lostTicketFeeMinor || 0, gstPct: lot?.gstPct || 0,
    reservable: lot ? await reservableLeft(lot, /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : todayIST()) : [], reserveAheadDays: RESERVE_AHEAD_DAYS,
  });
});
export const dynamic = "force-dynamic";
