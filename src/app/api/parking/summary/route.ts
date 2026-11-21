import { handle, ok, ApiError } from "@/lib/api";
import { canAccessDestination, requireUser } from "@/lib/auth";
import { ParkingTicket } from "@/models";
import { startOfDayIST } from "@/lib/utils";

/** Today's parking numbers for one site. "byMethod" is money taken at the gate (exit payments and counter prepayments). */
export const GET = handle(async (req) => {
  const me = await requireUser(["staff", "admin", "operator"]);
  const id = req.nextUrl.searchParams.get("destination");
  if (!id) throw new ApiError(400, "destination is required");
  if (!canAccessDestination(me, id)) throw new ApiError(403, "Not assigned to this destination");
  const since = startOfDayIST();
  const [done, enteredToday] = await Promise.all([
    ParkingTicket.find({ destination: id, status: "exited", exitAt: { $gte: since } }).select("feeMinor paidMinor prepaidMinor method entryAt exitAt source").lean() as Promise<any[]>,
    ParkingTicket.find({ destination: id, entryAt: { $gte: since } }).select("source prepaidMinor prepaidMethod").lean() as Promise<any[]>,
  ]);
  const byMethod: Record<string, number> = { cash: 0, upi: 0, card: 0 };
  for (const t of done) if (t.paidMinor > 0 && byMethod[t.method] !== undefined) byMethod[t.method] += t.paidMinor;
  let counterPrepaid = 0, reservations = 0;
  for (const t of enteredToday) { if (t.source === "reservation") reservations++; if (t.source !== "reservation" && t.prepaidMinor > 0 && t.prepaidMethod && byMethod[t.prepaidMethod] !== undefined) { byMethod[t.prepaidMethod] += t.prepaidMinor; counterPrepaid += t.prepaidMinor; } }
  const collectedMinor = byMethod.cash + byMethod.upi + byMethod.card;
  const avgMinutes = done.length ? Math.round(done.reduce((a, t) => a + (new Date(t.exitAt).getTime() - new Date(t.entryAt).getTime()) / 60000, 0) / done.length) : 0;
  return ok({ entered: enteredToday.length, exited: done.length, collectedMinor, byMethod, counterPrepaidMinor: counterPrepaid, reservationArrivals: reservations, avgMinutes, creditedMinor: done.reduce((a, t) => a + (t.prepaidMinor || 0), 0) });
});
export const dynamic = "force-dynamic";
