/** Pure parking maths with no database imports, so the offline-capable staff pages can run it in the browser. */
export type Rate = { capacity: number; occupied: number; freeMinutes: number; firstHourMinor: number; extraHourMinor: number; dailyMaxMinor: number };
export const normalizeVehicle = (s: string) => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");

/** Free period, then a first-hour rate, then a rate per started hour, capped per 24 h if a daily maximum is set. */
export function parkingFee(r: Pick<Rate, "freeMinutes" | "firstHourMinor" | "extraHourMinor" | "dailyMaxMinor">, minutes: number) {
  if (minutes <= r.freeMinutes) return 0;
  const hours = Math.ceil(minutes / 60);
  let fee = r.firstHourMinor + Math.max(0, hours - 1) * r.extraHourMinor;
  if (r.dailyMaxMinor > 0) fee = Math.min(fee, Math.ceil(minutes / 1440) * r.dailyMaxMinor);
  return fee;
}

export const minutesParked = (entryAt: Date, now = new Date()) => Math.max(1, Math.ceil((now.getTime() - new Date(entryAt).getTime()) / 60000));
export const reservationFee = (r: Pick<Rate, "firstHourMinor">) => r.firstHourMinor || 0;
export const dueAfterCredit = (feeMinor: number, prepaidMinor: number) => Math.max(0, feeMinor - (prepaidMinor || 0));
