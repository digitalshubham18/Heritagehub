import { dow, toMin } from "./utils";

/** Pure dynamic-pricing maths (no database), shared by the booking engine and the browser. */
export const MIN_ADJUST = -50, MAX_ADJUST = 100;
export type RuleLike = { adjustPct: number; daysOfWeek?: number[]; dateFrom?: string; dateTo?: string; timeFrom?: string; timeTo?: string; minBookedPct?: number; audiences?: string[]; active?: boolean };
export type PriceCtx = { date: string; start: string; booked: number; capacity: number; audience?: string };

export function ruleApplies(r: RuleLike, c: PriceCtx) {
  if (r.active === false) return false;
  if (r.daysOfWeek?.length && !r.daysOfWeek.includes(dow(c.date))) return false;
  if (r.dateFrom && c.date < r.dateFrom) return false;
  if (r.dateTo && c.date > r.dateTo) return false;
  if (r.timeFrom && toMin(c.start) < toMin(r.timeFrom)) return false;
  if (r.timeTo && toMin(c.start) >= toMin(r.timeTo)) return false;
  if ((r.minBookedPct || 0) > 0 && (c.capacity <= 0 || (c.booked / c.capacity) * 100 < (r.minBookedPct || 0))) return false;
  if (r.audiences?.length && (!c.audience || !r.audiences.includes(c.audience))) return false;
  return true;
}
/** Matching rules add up (+20 and +10 make +30, a -15 off-peak discount makes it +15), then the total is capped to -50%..+100%. */
export const adjustPctFor = (rules: RuleLike[], c: PriceCtx) => Math.min(MAX_ADJUST, Math.max(MIN_ADJUST, rules.filter((r) => ruleApplies(r, c)).reduce((s, r) => s + r.adjustPct, 0)));
/** Adjusted unit price, rounded to a whole rupee so visitors never see odd paise. A free ticket stays free. */
export const adjustedUnit = (baseMinor: number, pct: number) => (baseMinor <= 0 || pct === 0 ? baseMinor : Math.max(0, Math.round((baseMinor * (1 + pct / 100)) / 100) * 100));
export const AUDIENCES = ["indian", "foreign", "child", "student"] as const;

/** Price of one ticket category for a slot after any rules: the base price, the adjustment and the resulting unit price. */
export function priceCategory(cat: { priceMinor: number; audience?: string }, slot: { date: string; start: string; booked: number; capacity: number }, rules: RuleLike[]) {
  const pct = adjustPctFor(rules, { ...slot, audience: cat.audience });
  return { basePriceMinor: cat.priceMinor, pct, unitPriceMinor: adjustedUnit(cat.priceMinor, pct) };
}

/** Per-audience adjustment for one slot, for the slot picker and the booking engine. */
export function slotAdjust(rules: RuleLike[], slot: { date: string; start: string; booked: number; capacity: number }) {
  return Object.fromEntries(AUDIENCES.map((a) => [a, adjustPctFor(rules, { ...slot, audience: a })])) as Record<(typeof AUDIENCES)[number], number>;
}
