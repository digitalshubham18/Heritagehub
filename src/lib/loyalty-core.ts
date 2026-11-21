/** Pure loyalty-programme maths (no database), shared by the booking engine and the browser. */
/** 1 point per ₹10 of ticket value after the visit; 1 point is worth ₹0.50 off a later booking, up to 20% of its ticket value. Tiers raise the earn rate. */
export const EARN_MINOR_PER_POINT = 1000;
export const REDEEM_MINOR_PER_POINT = 50;
export const MAX_REDEEM_PCT = 20;
export const NEW_SITE_BONUS = 25;
export const TIERS = [{ id: "bronze", label: "Bronze", from: 0, mult: 1 }, { id: "silver", label: "Silver", from: 500, mult: 1.25 }, { id: "gold", label: "Gold", from: 2000, mult: 1.5 }] as const;
export type TierId = (typeof TIERS)[number]["id"];
export const tierFor = (lifetime: number) => [...TIERS].reverse().find((t) => lifetime >= t.from) || TIERS[0];
export const nextTier = (lifetime: number) => TIERS.find((t) => t.from > lifetime) || null;
export const earnPoints = (subtotalMinor: number, lifetime: number) => Math.floor(Math.floor(Math.max(0, subtotalMinor) / EARN_MINOR_PER_POINT) * tierFor(lifetime).mult);
export const pointsValueMinor = (points: number) => Math.max(0, Math.floor(points)) * REDEEM_MINOR_PER_POINT;
/** The most points a booking can use: limited by balance and by 20% of the ticket value. */
export const maxRedeemable = (subtotalMinor: number, balance: number) => Math.max(0, Math.min(Math.floor(balance), Math.floor((Math.max(0, subtotalMinor) * MAX_REDEEM_PCT) / 100 / REDEEM_MINOR_PER_POINT)));


/** Points expire this many months after they were credited (0 turns expiry off). Set LOYALTY_EXPIRY_MONTHS to change it. */
export const expiryMonths = () => { const n = Number(process.env.LOYALTY_EXPIRY_MONTHS); return Number.isFinite(n) && process.env.LOYALTY_EXPIRY_MONTHS !== undefined && process.env.LOYALTY_EXPIRY_MONTHS !== "" ? Math.max(0, Math.floor(n)) : 12; };
export const expiryDate = (from: Date, months = expiryMonths()) => { if (months <= 0) return undefined; const d = new Date(from); d.setUTCMonth(d.getUTCMonth() + months); return d; };
export const EXPIRY_WARN_DAYS = 30;
/** The most points one manual adjustment may add or remove. */
export const MAX_ADJUST_POINTS = 1000;

