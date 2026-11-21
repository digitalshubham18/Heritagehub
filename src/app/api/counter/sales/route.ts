import { handle, ok } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { counterSaleSchema } from "@/lib/validators";
import { counterSale } from "@/lib/booking";
import { limit } from "@/lib/ratelimit";
import { audit } from "@/lib/audit";

/** Staff sell walk-in tickets at the gate. Same atomic capacity engine as online bookings. */
export const POST = handle(async (req) => {
  const me = await requireUser(["staff", "admin"]);
  await limit("counter", [String(me._id)], 120, 60);
  const body = counterSaleSchema.parse(await req.json());
  const r = await counterSale(me, body);
  if (me.role === "admin") await audit(me, "counter.sale", "Booking", r.booking._id, `Counter sale ${r.booking.reference} (${r.booking.quantity} tickets)`);
  return ok({ booking: r.booking, replayed: r.replayed, checkInError: r.checkInError, parkingTicket: r.parkingTicket, parkingError: r.parkingError }, r.replayed ? 200 : 201);
});

export const dynamic = "force-dynamic";
