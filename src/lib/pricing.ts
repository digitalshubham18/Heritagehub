// Isomorphic: used by the booking widget (preview) and the server (authoritative).
export const PLATFORM_FEE_PCT = 2; // convenience fee on ticket subtotal
export const GST_PCT = 18; // GST on the convenience fee

export type PricedItem = { unitPriceMinor: number; unitFeeMinor: number; quantity: number };
export function priceItems(items: PricedItem[], discountPct = 0, extraDiscountMinor = 0) {
  const grossMinor = items.reduce((s, i) => s + (i.unitPriceMinor + i.unitFeeMinor) * i.quantity, 0);
  const pctDiscount = Math.round((grossMinor * Math.min(100, Math.max(0, discountPct))) / 100);
  const discountMinor = Math.min(grossMinor, pctDiscount + Math.max(0, Math.round(extraDiscountMinor))); // group concession plus any loyalty-points discount
  const subtotalMinor = grossMinor - discountMinor; // net ticket value after discounts
  const feesMinor = Math.round((subtotalMinor * PLATFORM_FEE_PCT) / 100);
  const taxMinor = Math.round((feesMinor * GST_PCT) / 100);
  return { grossMinor, discountMinor, subtotalMinor, feesMinor, taxMinor, totalMinor: subtotalMinor + feesMinor + taxMinor };
}

export type CancelPolicy = { freeUntilHours: number; lateRefundPercent: number; noRefundHours: number };
/**
 * Free window: full refund (incl. fees). Late window: lateRefundPercent of the ticket subtotal (fees kept).
 * Inside noRefundHours, or after check-in, the booking can no longer be cancelled.
 */
export function cancellationInfo(
  b: { status: string; date: string; start: string; subtotalMinor: number; totalMinor: number; checkedInAt?: any },
  p: CancelPolicy,
  now = new Date()
) {
  const hours = (new Date(`${b.date}T${b.start}:00+05:30`).getTime() - now.getTime()) / 3600000;
  if (b.status !== "confirmed" || b.checkedInAt) return { eligible: false, refundMinor: 0, reason: "Only confirmed, unused bookings can be cancelled" };
  if (hours < p.noRefundHours) return { eligible: false, refundMinor: 0, reason: `Cancellation closes ${p.noRefundHours}h before the slot` };
  if (hours >= p.freeUntilHours) return { eligible: true, refundMinor: b.totalMinor, reason: "Full refund" };
  return { eligible: true, refundMinor: Math.round((b.subtotalMinor * p.lateRefundPercent) / 100), reason: `${p.lateRefundPercent}% of ticket value refunded` };
}
