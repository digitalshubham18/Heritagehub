import { handle, ok, ApiError } from "@/lib/api";
import { canAccessDestination, requireUser } from "@/lib/auth";
import { Booking, Payment } from "@/models";
import { startOfDayIST } from "@/lib/utils";

/** Today's counter takings (cash drawer view). Staff see their own sales; admins can pass ?all=1. */
export const GET = handle(async (req) => {
  const me = await requireUser(["staff", "admin"]);
  const sp = req.nextUrl.searchParams;
  const dest = sp.get("destination");
  if (dest && !canAccessDestination(me, dest)) throw new ApiError(403, "Not assigned to this destination");
  const f: any = { provider: "counter", createdAt: { $gte: startOfDayIST() }, status: "succeeded" };
  if (!(me.role === "admin" && sp.get("all") === "1")) f.user = me._id;
  const pays: any[] = await Payment.find(f).sort({ createdAt: -1 }).lean();
  const bookings: any[] = await Booking.find({ _id: { $in: pays.map((p) => p.booking) }, ...(dest ? { destination: dest } : {}) }).select("reference quantity destination").lean();
  const byId = new Map(bookings.map((b) => [String(b._id), b]));
  const byMethod: Record<string, { count: number; amountMinor: number }> = { cash: { count: 0, amountMinor: 0 }, upi: { count: 0, amountMinor: 0 }, card: { count: 0, amountMinor: 0 } };
  let refundsMinor = 0, tickets = 0; const recent: any[] = [];
  for (const p of pays) {
    const b = byId.get(String(p.booking)); if (!b) continue;
    if (p.type === "refund") { refundsMinor += p.amountMinor; continue; }
    const m = byMethod[p.method] || (byMethod[p.method] = { count: 0, amountMinor: 0 });
    m.count++; m.amountMinor += p.amountMinor; tickets += b.quantity;
    if (recent.length < 15) recent.push({ id: p.booking, reference: b.reference, quantity: b.quantity, amountMinor: p.amountMinor, method: p.method, at: p.createdAt });
  }
  const gross = Object.values(byMethod).reduce((s, m) => s + m.amountMinor, 0);
  return ok({ byMethod, grossMinor: gross, refundsMinor, netMinor: gross - refundsMinor, tickets, recent });
});

export const dynamic = "force-dynamic";
