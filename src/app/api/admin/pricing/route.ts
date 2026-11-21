import { z } from "zod";
import { handle, ok, ApiError } from "@/lib/api";
import { canAccessDestination, requireUser, scopeIds } from "@/lib/auth";
import { Destination, PricingRule } from "@/models";
import { audit } from "@/lib/audit";
import { adjustPctFor, adjustedUnit, MAX_ADJUST, MIN_ADJUST } from "@/lib/dynamic-pricing";

const hhmm = z.string().regex(/^\d{2}:\d{2}$/), day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const rule = z.object({
  destinationId: z.string().min(1), name: z.string().trim().min(2).max(80), adjustPct: z.number().int().min(MIN_ADJUST).max(MAX_ADJUST).refine((n) => n !== 0, "Adjustment can't be zero"),
  daysOfWeek: z.array(z.number().int().min(0).max(6)).default([]), dateFrom: day.optional(), dateTo: day.optional(), timeFrom: hhmm.optional(), timeTo: hhmm.optional(),
  minBookedPct: z.number().int().min(0).max(100).default(0), audiences: z.array(z.enum(["indian", "foreign", "child", "student"])).default([]), active: z.boolean().default(true),
}).refine((r) => !r.dateFrom || !r.dateTo || r.dateFrom <= r.dateTo, { message: "End date is before the start date", path: ["dateTo"] })
  .refine((r) => !r.timeFrom || !r.timeTo || r.timeFrom < r.timeTo, { message: "End time must be after the start time", path: ["timeTo"] });

/** Pricing rules for the manager's sites. Rules that match a slot add up and are capped to -50%..+100% (see the preview below the list in the admin page). */
export const GET = handle(async (req) => {
  const me = await requireUser(["admin", "operator"]);
  const sc = scopeIds(me), d = req.nextUrl.searchParams.get("destination");
  if (d && !canAccessDestination(me, d)) throw new ApiError(403, "Not your destination");
  const f: any = d ? { destination: d } : sc ? { destination: { $in: sc } } : {};
  const [items, dests] = await Promise.all([PricingRule.find(f).sort({ createdAt: -1 }).limit(200).populate("destination", "name").lean(), Destination.find(sc ? { _id: { $in: sc } } : {}).select("name").sort({ name: 1 }).lean()]);
  const prev = req.nextUrl.searchParams.get("preview");
  let preview: any = null;
  if (prev && d) { // ?preview=1&date=&start=&booked=&capacity=&price= : what a ticket would cost
    const sp = req.nextUrl.searchParams, active = (items as any[]).filter((r) => r.active), price = Math.max(0, Number(sp.get("price")) || 0);
    const pct = adjustPctFor(active, { date: sp.get("date") || "", start: sp.get("start") || "10:00", booked: Number(sp.get("booked")) || 0, capacity: Number(sp.get("capacity")) || 100, audience: sp.get("audience") || undefined });
    preview = { pct, unitPriceMinor: adjustedUnit(price, pct) };
  }
  return ok({ items, destinations: dests, preview });
});

export const POST = handle(async (req) => {
  const me = await requireUser(["admin", "operator"]);
  const b = rule.parse(await req.json());
  if (!canAccessDestination(me, b.destinationId)) throw new ApiError(403, "Not your destination");
  const d: any = await Destination.findById(b.destinationId).select("operator").lean();
  if (!d) throw new ApiError(404, "Destination not found");
  const { destinationId, ...rest } = b;
  const r = await PricingRule.create({ ...rest, destination: destinationId, operator: d.operator, createdBy: me._id });
  await audit(me, "pricing.create", "PricingRule", r._id, `${b.adjustPct > 0 ? "+" : ""}${b.adjustPct}% rule "${b.name}"`);
  return ok({ rule: r }, 201);
});
export const PATCH = handle(async (req) => {
  const me = await requireUser(["admin", "operator"]);
  const b = z.object({ id: z.string(), active: z.boolean() }).parse(await req.json());
  const r: any = await PricingRule.findById(b.id).lean();
  if (!r || !canAccessDestination(me, r.destination)) throw new ApiError(404, "Rule not found");
  await PricingRule.updateOne({ _id: r._id }, { active: b.active });
  await audit(me, b.active ? "pricing.enable" : "pricing.disable", "PricingRule", r._id, `${b.active ? "Enabled" : "Disabled"} rule "${r.name}"`);
  return ok({ ok: true });
});
export const DELETE = handle(async (req) => {
  const me = await requireUser(["admin", "operator"]);
  const id = req.nextUrl.searchParams.get("id");
  const r: any = id ? await PricingRule.findById(id).lean() : null;
  if (!r || !canAccessDestination(me, r.destination)) throw new ApiError(404, "Rule not found");
  await PricingRule.deleteOne({ _id: r._id });
  await audit(me, "pricing.delete", "PricingRule", r._id, `Deleted rule "${r.name}"`);
  return ok({ ok: true });
});
export const dynamic = "force-dynamic";
