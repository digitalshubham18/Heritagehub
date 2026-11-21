import { handle, ok, ApiError } from "@/lib/api";
import { canAccessDestination, requireUser } from "@/lib/auth";
import { Booking, Destination } from "@/models";
import { todayIST } from "@/lib/utils";

/**
 * Today's bookings for one destination, compact, so the scan page can keep working if the connection drops.
 * Offline checks use this list by reference; QR signatures are verified by the server when queued scans sync.
 */
export const GET = handle(async (req) => {
  const me = await requireUser(["staff", "admin", "operator"]);
  const id = req.nextUrl.searchParams.get("destination");
  if (!id) throw new ApiError(400, "destination is required");
  if (!canAccessDestination(me, id)) throw new ApiError(403, "Not assigned to this destination");
  const dest: any = await Destination.findById(id).select("name").lean();
  if (!dest) throw new ApiError(404, "Destination not found");
  const date = todayIST();
  const rows: any[] = await Booking.find({ destination: id, date, status: { $in: ["confirmed", "completed"] } }).select("reference quantity checkedInCount checkedOutCount start end status contact.name").limit(8000).lean();
  return ok({ at: new Date().toISOString(), date, destination: { id, name: dest.name }, items: rows.map((b) => ({ r: b.reference, q: b.quantity, i: b.checkedInCount || 0, o: b.checkedOutCount || 0, s: b.start, e: b.end, st: b.status, n: b.contact?.name || "" })) });
});

export const dynamic = "force-dynamic";
