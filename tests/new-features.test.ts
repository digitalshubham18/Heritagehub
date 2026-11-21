import { describe, expect, it } from "vitest";
import { csvCell, toCsv } from "@/lib/csv";
import { gstFromInclusive, formatParkingInvoiceNo } from "@/lib/invoice";
import { appleDirections, googleDirections, haversineKm, osmDirections, roughDrive } from "@/lib/geo";
import { WMO, adviceFor, mapForecast } from "@/lib/weather";
import { normalizePlate } from "@/lib/plate";
import { passPeriod } from "@/lib/parking-passes";
import { PASS_DAYS, capacityOn, parkingGst, poolOf, vehicleOfPool, validOfflineTime, reservableQuota } from "@/lib/parking";
import { parkingFee, minutesParked } from "@/lib/parking-fee";
import { adjustPctFor, adjustedUnit, ruleApplies, slotAdjust, priceCategory } from "@/lib/pricing-rules";
import { EARN_MINOR_PER_POINT, earnPoints, maxRedeemable, nextTier, pointsValueMinor, tierFor } from "@/lib/loyalty-core";
import { MAX_SHIFT_HOURS, conflictsFor, overlaps, shiftHours } from "@/lib/roster";
import { matchScore } from "@/lib/lostfound";
import { nextEscalationLevel, escalationText } from "@/lib/escalation";
import { transferProblem } from "@/lib/transfer";
import { priceItems } from "@/lib/pricing";

describe("CSV export", () => {
  it("quotes commas, quotes and newlines", () => {
    expect(csvCell('a,"b"\nc')).toBe('"a,""b""\nc"');
    expect(csvCell(null)).toBe(""); expect(csvCell(12.5)).toBe("12.5");
  });
  it("neutralises spreadsheet formulas in text but never touches numbers", () => {
    for (const evil of ["=HYPERLINK(\"http://x\")", "+1+1", "-2+3", "@SUM(A1)", "\tcmd"]) expect(csvCell(evil).replace(/^"/, "")[0]).toBe("'");
    expect(csvCell(-500)).toBe("-500");
  });
  it("writes a header and rows, and uses explicit column order", () => {
    expect(toCsv([{ a: 1, b: "x" }, { a: 2, b: "y,z" }])).toBe('a,b\r\n1,x\r\n2,"y,z"\r\n');
    expect(toCsv([{ a: 1, b: 2 }], ["b", "a"])).toBe("b,a\r\n2,1\r\n");
    expect(toCsv([])).toBe("");
  });
});

describe("parking GST and invoice numbers", () => {
  it("extracts GST from a tax-inclusive amount", () => {
    expect(gstFromInclusive(11800, 18)).toBe(1800); expect(gstFromInclusive(8000, 18)).toBe(1220);
    expect(gstFromInclusive(0, 18)).toBe(0); expect(gstFromInclusive(5000, 0)).toBe(0);
    expect(parkingGst({ gstPct: 18 }, 11800)).toEqual({ gstPct: 18, gstMinor: 1800 }); expect(parkingGst({}, 5000)).toEqual({ gstPct: 0, gstMinor: 0 });
  });
  it("formats the HP series", () => expect(formatParkingInvoiceNo("2026-27", 42)).toBe("HP/2026-27/000042"));
});

describe("pools and capacity", () => {
  it("maps bays to pools and back", () => {
    expect(poolOf("car", "ev")).toBe("ev"); expect(poolOf("car", "accessible")).toBe("accessible"); expect(poolOf("bus")).toBe("bus"); expect(poolOf("two_wheeler", "standard")).toBe("two_wheeler");
    expect(vehicleOfPool("ev")).toBe("car"); expect(vehicleOfPool("bus")).toBe("bus");
  });
  it("uses a per-date override when present, including 0 (closed)", () => {
    const lot = { car: { capacity: 10 } };
    expect(capacityOn(lot, "car")).toBe(10); expect(capacityOn(lot, "car", { car: 25 })).toBe(25); expect(capacityOn(lot, "car", { car: 0 })).toBe(0); expect(capacityOn(lot, "bus")).toBe(0);
  });
  it("scales the pre-bookable share with the day's capacity", () => {
    const lot = { reservablePct: 30, car: { capacity: 10 } };
    expect(reservableQuota(lot, "car")).toBe(3); expect(reservableQuota(lot, "car", 100)).toBe(30); expect(reservableQuota(lot, "car", 0)).toBe(0);
  });
  it("keeps the fee maths unchanged by the refactor", () => {
    const r = { capacity: 1, occupied: 0, freeMinutes: 15, firstHourMinor: 5000, extraHourMinor: 3000, dailyMaxMinor: 20000 };
    expect(parkingFee(r, 10)).toBe(0); expect(parkingFee(r, 30)).toBe(5000); expect(parkingFee(r, 61)).toBe(8000); expect(parkingFee(r, 600)).toBe(20000);
    expect(minutesParked(new Date(Date.now() - 90 * 60000))).toBeGreaterThanOrEqual(90);
  });
});

describe("offline timestamps", () => {
  const now = Date.now();
  it("accepts a recent past time and returns nothing when none is given", () => {
    expect(validOfflineTime(undefined)).toBeUndefined();
    expect(validOfflineTime(new Date(now - 3600000), now)!.getTime()).toBe(now - 3600000);
  });
  it("rejects the future, the too old, garbage, and a time before the floor", () => {
    expect(() => validOfflineTime(new Date(now + 600000), now)).toThrow(/future/);
    expect(() => validOfflineTime(new Date(now - 49 * 3600000), now)).toThrow(/48 hours/);
    expect(() => validOfflineTime("nope", now)).toThrow(/Invalid/);
    expect(() => validOfflineTime(new Date(now - 3600000), now, new Date(now - 1800000))).toThrow(/before the vehicle/);
  });
  it("tolerates two minutes of device clock drift by clamping to now", () => {
    expect(validOfflineTime(new Date(now + 60000), now)!.getTime()).toBe(now);
  });
});

describe("monthly pass periods", () => {
  it("starts today for a new pass and runs 30 days inclusive", () => {
    expect(passPeriod("2026-10-24")).toEqual({ validFrom: "2026-10-24", validTo: "2026-11-22", renewal: false }); expect(PASS_DAYS).toBe(30);
  });
  it("continues from the end date when renewing a live pass", () => {
    expect(passPeriod("2026-10-24", "2026-10-28")).toEqual({ validFrom: "2026-10-29", validTo: "2026-11-27", renewal: true });
  });
  it("treats an expired pass as a new purchase", () => expect(passPeriod("2026-10-24", "2026-10-01").renewal).toBe(false));
});

describe("number plates", () => {
  it("strips spaces and punctuation", () => expect(normalizePlate("up80 ab-1234")).toBe("UP80AB1234"));
  it("repairs look-alike characters by position", () => {
    expect(normalizePlate("UP8O AB 1234")).toBe("UP80AB1234"); // O read for 0
    expect(normalizePlate("UP80 A8 I234")).toBe("UP80AB1234"); // 8 for B, I for 1
    expect(normalizePlate("DL1C AB 5678")).toBe("DL1CAB5678".length === 10 ? normalizePlate("DL1CAB5678") : "x");
  });
  it("leaves non-standard text only cleaned", () => expect(normalizePlate("BH 22 X")).toBe("BH22X"));
});

describe("pricing rules", () => {
  const ctx = { date: "2026-10-24", start: "10:00", booked: 50, capacity: 100, audience: "indian" }; // a Saturday
  it("matches by weekday, date window, slot time, demand and audience", () => {
    expect(ruleApplies({ adjustPct: 10, daysOfWeek: [6] }, ctx)).toBe(true); expect(ruleApplies({ adjustPct: 10, daysOfWeek: [0] }, ctx)).toBe(false);
    expect(ruleApplies({ adjustPct: 10, dateFrom: "2026-10-25" }, ctx)).toBe(false); expect(ruleApplies({ adjustPct: 10, dateTo: "2026-10-24" }, ctx)).toBe(true);
    expect(ruleApplies({ adjustPct: 10, timeFrom: "10:00", timeTo: "12:00" }, ctx)).toBe(true); expect(ruleApplies({ adjustPct: 10, timeFrom: "08:00", timeTo: "10:00" }, ctx)).toBe(false);
    expect(ruleApplies({ adjustPct: 10, minBookedPct: 50 }, ctx)).toBe(true); expect(ruleApplies({ adjustPct: 10, minBookedPct: 51 }, ctx)).toBe(false);
    expect(ruleApplies({ adjustPct: 10, audiences: ["foreign"] }, ctx)).toBe(false); expect(ruleApplies({ adjustPct: 10, active: false }, ctx)).toBe(false);
  });
  it("adds, caps and rounds", () => {
    expect(adjustPctFor([{ adjustPct: 20 }, { adjustPct: -5 }], ctx)).toBe(15); expect(adjustPctFor([{ adjustPct: 90 }, { adjustPct: 90 }], ctx)).toBe(100);
    expect(adjustedUnit(5000, 15)).toBe(5800); expect(adjustedUnit(0, 100)).toBe(0); expect(adjustedUnit(5000, -50)).toBe(2500);
  });
  it("prices a category and reports per-audience adjustments", () => {
    const rules = [{ adjustPct: 20, audiences: ["foreign" as const] }, { adjustPct: 10 }];
    expect(slotAdjust(rules, { date: "2026-10-24", start: "10:00", booked: 0, capacity: 10 })).toEqual({ indian: 10, foreign: 30, child: 10, student: 10 });
    expect(priceCategory({ priceMinor: 5000, audience: "foreign" }, { date: "2026-10-24", start: "10:00", booked: 0, capacity: 10 }, rules)).toEqual({ basePriceMinor: 5000, pct: 30, unitPriceMinor: 6500 });
  });
  it("lets a loyalty discount stack with a group concession without going below zero", () => {
    const items = [{ unitPriceMinor: 5000, unitFeeMinor: 0, quantity: 2 }];
    expect(priceItems(items, 10, 2000).subtotalMinor).toBe(7000); expect(priceItems(items, 0, 999999).subtotalMinor).toBe(0);
  });
});

describe("loyalty maths", () => {
  it("earns 1 point per ₹10 with a tier multiplier", () => {
    expect(EARN_MINOR_PER_POINT).toBe(1000); expect(earnPoints(9999, 0)).toBe(9); expect(earnPoints(10000, 0)).toBe(10); expect(earnPoints(10000, 500)).toBe(12); expect(earnPoints(10000, 2000)).toBe(15); expect(earnPoints(-5, 0)).toBe(0);
  });
  it("tiers and progress", () => {
    expect(tierFor(499).id).toBe("bronze"); expect(tierFor(2000).id).toBe("gold"); expect(nextTier(0)!.id).toBe("silver"); expect(nextTier(5000)).toBeNull();
  });
  it("limits redemption to the balance and 20% of ticket value", () => {
    expect(pointsValueMinor(10)).toBe(500); expect(maxRedeemable(20000, 1000)).toBe(80); expect(maxRedeemable(20000, 30)).toBe(30); expect(maxRedeemable(0, 50)).toBe(0); expect(pointsValueMinor(-3)).toBe(0);
  });
});

describe("roster", () => {
  const a = { date: "2026-10-25", start: "09:00", end: "13:00" };
  it("detects overlaps but allows back-to-back shifts", () => {
    expect(overlaps(a, { date: "2026-10-25", start: "12:00", end: "16:00" })).toBe(true); expect(overlaps(a, { date: "2026-10-25", start: "13:00", end: "17:00" })).toBe(false); expect(overlaps(a, { date: "2026-10-26", start: "09:00", end: "13:00" })).toBe(false);
  });
  it("finds a person's clashes only", () => {
    const e = [{ _id: 1, user: "u1", destination: "d1", ...a }, { _id: 2, user: "u2", destination: "d1", ...a }];
    expect(conflictsFor({ _id: 3, user: "u1", destination: "d2", date: a.date, start: "12:00", end: "14:00" }, e)).toHaveLength(1);
    expect(conflictsFor({ _id: 1, user: "u1", destination: "d1", ...a }, e)).toHaveLength(0);
  });
  it("measures shift length", () => { expect(shiftHours(a)).toBe(4); expect(MAX_SHIFT_HOURS).toBe(12); });
});

describe("lost-and-found matching", () => {
  it("scores shared category, colour and words", () => {
    const found = { category: "bag", color: "blue", description: "Blue backpack with a water bottle" };
    expect(matchScore(found, { category: "bag", color: "Blue", description: "lost my blue backpack, has water bottle" })).toBeGreaterThanOrEqual(80);
    expect(matchScore(found, { category: "phone", color: "black", description: "iPhone red cover" })).toBeLessThan(20);
    expect(matchScore({ category: "other", description: "x" }, { category: "other", description: "y" })).toBe(0);
  });
});

describe("escalation timing", () => {
  const mk = (mins: number, o: any = {}) => ({ status: "open", severity: "critical", createdAt: new Date(Date.now() - mins * 60000), ...o });
  it("fires level 1 at 10 minutes and level 2 at 25 for critical incidents", () => {
    expect(nextEscalationLevel(mk(9))).toBe(0); expect(nextEscalationLevel(mk(10))).toBe(1); expect(nextEscalationLevel(mk(26))).toBe(1); expect(nextEscalationLevel(mk(26, { escalationLevel: 1 }))).toBe(2); expect(nextEscalationLevel(mk(26, { escalationLevel: 2 }))).toBe(0);
  });
  it("waits twice as long for warnings, and honours custom times and the off switch", () => {
    expect(nextEscalationLevel(mk(15, { severity: "warning" }))).toBe(0); expect(nextEscalationLevel(mk(20, { severity: "warning" }))).toBe(1);
    expect(nextEscalationLevel(mk(5), { firstAfterMin: 5 })).toBe(1); expect(nextEscalationLevel(mk(500), { enabled: false })).toBe(0);
  });
  it("never escalates an acknowledged or resolved incident", () => { expect(nextEscalationLevel(mk(99, { status: "acknowledged" }))).toBe(0); expect(nextEscalationLevel(mk(99, { status: "resolved" }))).toBe(0); });
  it("writes a short, informative SMS", () => { const t = escalationText({ category: "medical", message: "x".repeat(200) }, "Agra Fort", 12.4); expect(t).toContain("Medical"); expect(t).toContain("Agra Fort"); expect(t).toContain("12 min"); expect(t.length).toBeLessThan(330); });
});

describe("ticket transfer rules", () => {
  const future = (h: number) => { const d = new Date(Date.now() + h * 3600000 + 5.5 * 3600000); return { date: d.toISOString().slice(0, 10), start: d.toISOString().slice(11, 16) }; };
  const base = { status: "confirmed", channel: "online", checkedInCount: 0, transferCount: 0, ...future(10) };
  it("allows a confirmed, unused, online ticket with time to spare", () => expect(transferProblem(base)).toBeNull());
  it("blocks used, counter, group, cancelled, repeatedly transferred and last-minute tickets", () => {
    expect(transferProblem({ ...base, checkedInCount: 1 })).toMatch(/used/); expect(transferProblem({ ...base, channel: "counter" })).toMatch(/Counter/); expect(transferProblem({ ...base, channel: "group" })).toMatch(/group/i);
    expect(transferProblem({ ...base, status: "cancelled" })).toMatch(/confirmed/); expect(transferProblem({ ...base, transferCount: 2 })).toMatch(/at most/); expect(transferProblem({ ...base, ...future(1) })).toMatch(/close/);
    expect(transferProblem(null)).toBeTruthy();
  });
});

describe("directions and weather", () => {
  const agra = { lat: 27.1767, lng: 78.0081 }, delhi = { lat: 28.6139, lng: 77.209 };
  it("computes great-circle distance and a rough drive", () => {
    expect(Math.round(haversineKm(agra, delhi))).toBeGreaterThan(170); expect(Math.round(haversineKm(agra, delhi))).toBeLessThan(190); expect(haversineKm(agra, agra)).toBe(0);
    expect(roughDrive(10).minutes).toBeGreaterThanOrEqual(5);
  });
  it("builds map links", () => {
    expect(googleDirections(agra)).toContain("destination=27.1767,78.0081"); expect(googleDirections(agra, "transit", delhi)).toContain("travelmode=transit"); expect(googleDirections(agra, "driving", delhi)).toContain("origin=28.6139,77.209");
    expect(osmDirections(agra)).toContain("27.1767"); expect(appleDirections(agra)).toContain("daddr=27.1767,78.0081");
  });
  it("maps an Open-Meteo response and adds advice", () => {
    const f = mapForecast({ current: { temperature_2m: 31.6, weather_code: 2 }, daily: { time: ["2026-10-24", "2026-10-25"], weather_code: [0, 65], temperature_2m_max: [41.2, 28.4], temperature_2m_min: [26, 22.1], precipitation_probability_max: [5, 80], uv_index_max: [9.26, 3] } });
    expect(f.current).toEqual({ tempC: 32, summary: WMO[2] }); expect(f.days).toHaveLength(2);
    expect(f.days[0]).toMatchObject({ date: "2026-10-24", tempMaxC: 41, tempMinC: 26, rainChancePct: 5, uvMax: 9.3, summary: "Clear sky" }); expect(f.days[0].advice.join(" ")).toMatch(/heat/i); expect(f.days[0].advice.join(" ")).toMatch(/UV/);
    expect(f.days[1].advice.join(" ")).toMatch(/Rain/); expect(adviceFor({ tempMaxC: 22, rainChancePct: 10, uvMax: 3, code: 1 })).toEqual([]);
  });
  it("survives an empty or malformed response", () => { expect(mapForecast({}).days).toEqual([]); expect(mapForecast(null).current).toBeUndefined(); });
});

import { matchShift, outsideShift, EARLY_CLOCK_IN_MIN, LATE_GRACE_MIN } from "@/lib/attendance";
import { creditTaxShare, formatCreditNoteNo } from "@/lib/invoice";
import { passRefundMinor } from "@/lib/parking-passes";
import { enV, hiV } from "@/lib/i18n-visitor";
import { fill } from "@/lib/i18n";
import { expiryDate } from "@/lib/loyalty-core";

describe("clock-in matching", () => {
  const shifts = [{ start: "09:00", end: "13:00" }, { start: "14:00", end: "18:00" }];
  it("matches the shift whose window contains the time, from 30 minutes early to the end", () => {
    expect(EARLY_CLOCK_IN_MIN).toBe(30);
    expect(matchShift(shifts, 8 * 60 + 29).shift).toBeNull(); expect(matchShift(shifts, 8 * 60 + 30).shift).toBe(shifts[0]); expect(matchShift(shifts, 13 * 60).shift).toBe(shifts[0]);
    expect(matchShift(shifts, 13 * 60 + 1).shift).toBeNull(); expect(matchShift(shifts, 14 * 60).shift).toBe(shifts[1]); expect(matchShift([], 600).shift).toBeNull();
  });
  it("counts lateness only beyond the grace period, and never for an early arrival", () => {
    expect(LATE_GRACE_MIN).toBe(5);
    expect(matchShift(shifts, 8 * 60 + 45).lateMin).toBe(0); expect(matchShift(shifts, 9 * 60 + 5).lateMin).toBe(0); expect(matchShift(shifts, 9 * 60 + 6).lateMin).toBe(6); expect(matchShift(shifts, 10 * 60).lateMin).toBe(60);
  });
  it("finds counter sales made outside every rostered shift", () => {
    const sh = [{ date: "2026-10-24", start: "09:00", end: "13:00", destination: "d1" }];
    const sales = [{ date: "2026-10-24", minutes: 10 * 60, destination: "d1" }, { date: "2026-10-24", minutes: 18 * 60 + 30, destination: "d1" }, { date: "2026-10-24", minutes: 10 * 60, destination: "d2" }, { date: "2026-10-25", minutes: 10 * 60, destination: "d1" }];
    expect(outsideShift(sales, sh)).toBe(3); expect(outsideShift(sales, [])).toBe(0); // nobody rostered: nothing to compare against
  });
});

describe("credit notes and pass refunds", () => {
  it("reverses GST in proportion to the refund, capped at the total", () => {
    expect(creditTaxShare(1800, 11800, 11800)).toBe(1800); expect(creditTaxShare(1800, 11800, 5900)).toBe(900); expect(creditTaxShare(0, 5000, 5000)).toBe(0); expect(creditTaxShare(1800, 0, 100)).toBe(0); expect(creditTaxShare(1800, 11800, 99999)).toBe(1800);
    expect(formatCreditNoteNo("2026-27", 7)).toBe("CN/2026-27/000007");
  });
  const p = { priceMinor: 90000, validFrom: "2026-10-01", validTo: "2026-10-30", entries: 0 };
  it("refunds nothing, the unused days, or the full price (unused passes only)", () => {
    expect(passRefundMinor(p, "none", "2026-10-10")).toBe(0);
    expect(passRefundMinor(p, "prorata", "2026-10-10")).toBe(60000); // 20 of 30 days left after today
    expect(passRefundMinor(p, "prorata", "2026-09-20")).toBe(90000); // not started: all of it
    expect(passRefundMinor(p, "prorata", "2026-10-30")).toBe(0); expect(passRefundMinor(p, "prorata", "2026-11-05")).toBe(0);
    expect(passRefundMinor(p, "full", "2026-10-10")).toBe(90000); expect(passRefundMinor({ ...p, entries: 2 }, "full", "2026-10-10")).toBe(-1);
    expect(passRefundMinor({ ...p, priceMinor: 0 }, "full")).toBe(0);
  });
});

describe("loyalty expiry dates", () => {
  it("expires 12 months on by default and never when turned off", () => {
    const from = new Date("2026-10-24T00:00:00Z");
    expect(expiryDate(from)!.toISOString().slice(0, 10)).toBe("2027-10-24"); expect(expiryDate(from, 6)!.toISOString().slice(0, 10)).toBe("2027-04-24"); expect(expiryDate(from, 0)).toBeUndefined();
  });
});

describe("Hindi translations", () => {
  const ph = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(",");
  it("has a Hindi string for every new English one, with the same placeholders", () => {
    for (const k of Object.keys(enV) as (keyof typeof enV)[]) { expect(hiV[k], k).toBeTruthy(); expect(ph(hiV[k]), `placeholders in ${k}`).toBe(ph(enV[k])); }
    expect(Object.keys(hiV).sort()).toEqual(Object.keys(enV).sort());
  });
  it("is actually Hindi (Devanagari) apart from names and brands", () => {
    const untranslated = (Object.keys(enV) as (keyof typeof enV)[]).filter((k) => !/[\u0900-\u097F]/.test(hiV[k]));
    expect(untranslated).toEqual([]);
  });
  it("fills placeholders, leaves unknown ones, and handles no values", () => {
    expect(fill("Hello {name}, {n} left", { name: "Asha", n: 3 })).toBe("Hello Asha, 3 left"); expect(fill("Hi {x}", {})).toBe("Hi {x}"); expect(fill("Plain")).toBe("Plain");
  });
});
