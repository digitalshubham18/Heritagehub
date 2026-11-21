import { z } from "zod";
import { handle, ok, ApiError } from "@/lib/api";
import { canAccessDestination, requireUser, scopeIds } from "@/lib/auth";
import { payDetailsSchema } from "@/lib/collect";
import { ParkingPass } from "@/models";
import { cancelParkingPass, passRefundMinor, remindExpiringPasses, sellParkingPass } from "@/lib/parking-passes";
import { normalizeVehicle } from "@/lib/parking";
import { limit } from "@/lib/ratelimit";
import { audit } from "@/lib/audit";
import { daysBetween, todayIST } from "@/lib/utils";

const sell = z.object({ destinationId: z.string().min(1), vehicleType: z.enum(["car", "two_wheeler", "bus"]), vehicleNumber: z.string().trim().min(4).max(20), holderName: z.string().trim().min(2).max(80), holderPhone: z.string().trim().max(20).optional(), holderEmail: z.string().trim().email().optional(), method: z.enum(["cash", "upi", "card"]).optional(), payment: payDetailsSchema.optional(), idempotencyKey: z.string().min(8).max(80), self: z.boolean().optional() }); // self = buy as a visitor for my own vehicle (managers and staff otherwise sell passes at the gate)
const view = (p: any) => {
  const today = todayIST(), full = passRefundMinor(p, "full");
  return { ...p, expired: p.validTo < today, current: p.status === "active" && p.validFrom <= today && p.validTo >= today, daysLeft: Math.max(0, daysBetween(today, p.validTo)),
    refundOptions: p.status === "active" ? { prorata: passRefundMinor(p, "prorata"), full: full < 0 ? null : full } : null }; // what cancelling would refund, for the manager's dialog
};

/** Visitors: their own passes (?mine=1). Staff and managers: a site's passes (?destination=), optionally filtered by vehicle (?q=). */
export const GET = handle(async (req) => {
  const me = await requireUser();
  const sp = req.nextUrl.searchParams;
  if (me.role === "tourist" || sp.get("mine") === "1") return ok({ items: (await ParkingPass.find({ user: me._id }).sort({ validTo: -1 }).limit(50).populate("destination", "name slug").lean()).map(view) });
  const dest = sp.get("destination");
  if (!dest) throw new ApiError(400, "destination is required");
  if (!canAccessDestination(me, dest)) throw new ApiError(403, "Not assigned to this destination");
  const f: any = { destination: dest }, q = (sp.get("q") || "").trim();
  if (q) f.$or = [{ vehicleNumber: new RegExp(normalizeVehicle(q).replace(/[^A-Z0-9]/g, "")) }, { reference: q.toUpperCase() }, { holderName: new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i") }];
  return ok({ items: (await ParkingPass.find(f).sort({ validTo: -1 }).limit(200).lean()).map(view) });
});

export const POST = handle(async (req) => {
  const me = await requireUser(["staff", "admin", "operator", "tourist"]);
  await limit("parkpass", [String(me._id)], 30, 3600);
  const b = sell.parse(await req.json());
  const staff = me.role !== "tourist" && !b.self;
  if (!staff && b.method && b.method !== "upi" && b.method !== "card") throw new ApiError(400, "Pay online by UPI or card");
  const { self: _self, ...sale } = b;
  const r = await sellParkingPass(me, staff ? "staff" : "online", { ...sale, method: b.method as any });
  if (staff && me.role !== "staff") await audit(me, "parking.pass.sell", "ParkingPass", r.pass._id, `Parking pass ${r.pass.reference} for ${r.pass.vehicleNumber}`);
  return ok({ pass: r.pass, replayed: r.replayed, renewal: (r as any).renewal }, r.replayed ? 200 : 201);
});

const cancelSchema = z.object({ id: z.string().min(1), refund: z.enum(["none", "prorata", "full"]).default("none"), reason: z.string().trim().min(3, "Give a short reason").max(200), method: z.enum(["cash", "upi", "card"]).optional() });
/** Cancels a pass with an optional refund (none, the unused days, or the full price for a pass nobody has used). A credit note is issued for any refund and the holder is told. */
export const PATCH = handle(async (req) => {
  const me = await requireUser(["admin", "operator"]);
  const raw = await req.json();
  if (raw?.action === "remind") { // send the 7-day expiry reminders now (a scheduler also does this daily)
    const r = await remindExpiringPasses(scopeIds(me));
    await audit(me, "parking.pass.remind", "ParkingPass", undefined, `Sent ${r.reminded} expiry reminder(s)`);
    return ok(r);
  }
  const b = cancelSchema.parse(raw);
  const p: any = await cancelParkingPass(me, b.id, { refund: b.refund, reason: b.reason, method: b.method });
  await audit(me, "parking.pass.cancel", "ParkingPass", b.id, `Cancelled parking pass ${p.reference}; refund ₹${((p.refundMinor || 0) / 100).toFixed(2)}${p.creditNoteNo ? `, credit note ${p.creditNoteNo}` : ""}. ${b.reason}`);
  return ok({ pass: p });
});

export const DELETE = handle(async (req) => {
  const me = await requireUser(["admin", "operator"]);
  const id = req.nextUrl.searchParams.get("id");
  if (!id) throw new ApiError(400, "id is required");
  const p = await cancelParkingPass(me, id, { refund: "none", reason: req.nextUrl.searchParams.get("reason") || "Cancelled by a manager" });
  await audit(me, "parking.pass.cancel", "ParkingPass", id, `Cancelled parking pass ${(p as any).reference}`);
  return ok({ pass: p });
});
export const dynamic = "force-dynamic";
