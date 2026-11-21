import crypto from "crypto";
import { describe, expect, it } from "vitest";
import { cancellationInfo, priceItems } from "@/lib/pricing";
import { addDays, classify, daysBetween, dow, istParts, toHHMM, toMin } from "@/lib/utils";
import { baselineDaily, bookedFraction, predictDay, SEASON, waitMinutes } from "@/lib/crowd";
import { slotTemplate } from "@/lib/slots";
import { parseCode, ticketCode } from "@/lib/booking";
import { verifySignature, verifyWebhook } from "@/lib/razorpay";
import { normalizePhone } from "@/lib/notify";
import { financialYear, formatInvoiceNo } from "@/lib/invoice";
import { normalizeVehicle, parkingFee } from "@/lib/parking";
import { isPassCode, parsePassCode, passCode } from "@/lib/passes";
import { hashKey, newDeviceKey } from "@/lib/devices";
import { createBookingSchema, destinationSchema, registerSchema } from "@/lib/validators";

const policy = { freeUntilHours: 24, lateRefundPercent: 50, noRefundHours: 2 };
const future = (hours: number) => { const d = new Date(Date.now() + hours * 3600000); const p = istParts(d); return { date: p.date, start: `${String(Math.floor(p.minutes / 60)).padStart(2, "0")}:${String(p.minutes % 60).padStart(2, "0")}` }; };
const booking = (hours: number, extra = {}) => ({ status: "confirmed", ...future(hours), subtotalMinor: 10000, totalMinor: 10250, ...extra });

describe("pricing", () => {
  it("adds 2% fee and 18% GST on the fee, in integer paise", () => {
    expect(priceItems([{ unitPriceMinor: 5000, unitFeeMinor: 20000, quantity: 2 }, { unitPriceMinor: 0, unitFeeMinor: 0, quantity: 1 }])).toMatchObject({ subtotalMinor: 50000, feesMinor: 1000, taxMinor: 180, totalMinor: 51180, discountMinor: 0 });
  });
  it("free tickets cost nothing", () => expect(priceItems([{ unitPriceMinor: 0, unitFeeMinor: 0, quantity: 3 }]).totalMinor).toBe(0));
});

describe("cancellation policy", () => {
  it("refunds everything in the free window", () => expect(cancellationInfo(booking(48), policy)).toMatchObject({ eligible: true, refundMinor: 10250 }));
  it("refunds a share of ticket value (fees kept) in the late window", () => expect(cancellationInfo(booking(10), policy)).toMatchObject({ eligible: true, refundMinor: 5000 }));
  it("blocks cancellation close to the slot", () => expect(cancellationInfo(booking(1), policy).eligible).toBe(false));
  it("blocks cancellation after check-in or for non-confirmed bookings", () => {
    expect(cancellationInfo(booking(48, { checkedInAt: new Date() }), policy).eligible).toBe(false);
    expect(cancellationInfo(booking(48, { status: "cancelled" }), policy).eligible).toBe(false);
  });
});

describe("dates and levels", () => {
  it("adds days across month ends", () => { expect(addDays("2026-02-27", 3)).toBe("2026-03-02"); expect(daysBetween("2026-10-12", "2026-10-19")).toBe(7); expect(dow("2026-10-12")).toBe(1); });
  it("converts times", () => { expect(toMin("09:30")).toBe(570); expect(toHHMM(570)).toBe("09:30"); });
  it("classifies density by thresholds", () => {
    expect([10, 40, 70, 90, 120].map((x) => classify(x))).toEqual(["low", "moderate", "high", "very_high", "very_high"]);
    expect(classify(55, { moderate: 60, high: 80, veryHigh: 95 })).toBe("low");
  });
});

const dest = { avgDailyVisitors: 9000, hours: { open: "06:00", close: "18:00", closedDays: [5] }, slotDurationMin: 60, defaultSlotCapacity: 2000, closures: [], crowdThresholds: { moderate: 40, high: 70, veryHigh: 90 } };
const slotsFor = (d: any, date: string) => slotTemplate(d, date).map((t) => ({ _id: null, ...t, capacity: d.defaultSlotCapacity, booked: 0, closed: false }));

describe("slots", () => {
  it("builds slots from opening hours", () => expect(slotTemplate(dest, "2026-10-17")).toHaveLength(12));
  it("handles 30-minute slots", () => expect(slotTemplate({ ...dest, hours: { open: "08:00", close: "17:30", closedDays: [] }, slotDurationMin: 30 }, "2026-10-17")).toHaveLength(19));
  it("is empty on weekly closures and holidays", () => {
    expect(slotTemplate(dest, "2026-10-16")).toHaveLength(0); // Friday
    expect(slotTemplate({ ...dest, closures: [{ date: "2026-10-17", reason: "x" }] }, "2026-10-17")).toHaveLength(0);
  });
});

describe("crowd model", () => {
  it("season factors average to 1", () => expect(SEASON.reduce((a, b) => a + b, 0) / 12).toBeCloseTo(1, 5));
  it("distributes the whole day's baseline across slots", () => {
    const p = predictDay(dest, "2026-10-17", slotsFor(dest, "2026-10-17"), 1, true);
    const total = p.reduce((s, x) => s + x.baseline, 0);
    expect(Math.abs(total - baselineDaily(dest, "2026-10-17"))).toBeLessThan(12);
  });
  it("weekends are busier than midweek", () => expect(baselineDaily(dest, "2026-10-17")).toBeGreaterThan(baselineDaily(dest, "2026-10-14")));
  it("holidays are busier", () => expect(baselineDaily(dest, "2026-01-26")).toBeGreaterThan(baselineDaily({ ...dest }, "2026-01-27") * 1.2));
  it("never predicts fewer visitors than confirmed bookings", () => {
    const s = slotsFor(dest, "2026-10-17"); s[3].booked = 1900;
    expect(predictDay(dest, "2026-10-17", s)[3].expected).toBeGreaterThanOrEqual(1900);
  });
  it("level and wait time rise with density", () => {
    expect(waitMinutes(50)).toBe(0); expect(waitMinutes(100)).toBe(60); expect(waitMinutes(80)).toBeGreaterThan(waitMinutes(70));
    expect(bookedFraction(0)).toBe(1); expect(bookedFraction(10)).toBeLessThan(bookedFraction(2));
  });
});

describe("ticket codes", () => {
  it("round-trips a signed code", () => expect(parseCode(ticketCode("HH-ABCD-2345"))).toEqual({ ref: "HH-ABCD-2345", signed: true }));
  it("rejects tampered signatures", () => { const c = ticketCode("HH-ABCD-2345"); expect(parseCode(c.slice(0, -1) + (c.endsWith("x") ? "y" : "x"))).toBeNull(); expect(parseCode(ticketCode("HH-ABCD-2345").replace("2345", "2346"))).toBeNull(); });
  it("accepts a typed reference as unsigned and rejects junk", () => { expect(parseCode("hh-abcd-2345")).toEqual({ ref: "HH-ABCD-2345", signed: false }); expect(parseCode("nonsense")).toBeNull(); });
});

describe("razorpay signatures", () => {
  const hmac = (secret: string, data: string) => crypto.createHmac("sha256", secret).update(data).digest("hex");
  it("verifies checkout callbacks", () => { expect(verifySignature("o1", "p1", hmac("k", "o1|p1"), "k")).toBe(true); expect(verifySignature("o1", "p2", hmac("k", "o1|p1"), "k")).toBe(false); expect(verifySignature("o1", "p1", "", "k")).toBe(false); expect(verifySignature("o1", "p1", hmac("k", "o1|p1"), "")).toBe(false); });
  it("verifies webhooks over the raw body", () => { const b = '{"event":"payment.captured"}'; expect(verifyWebhook(b, hmac("w", b), "w")).toBe(true); expect(verifyWebhook(b + " ", hmac("w", b), "w")).toBe(false); });
});

describe("misc helpers and validation", () => {
  it("normalises phone numbers", () => { expect(normalizePhone("98765 43210")).toBe("+919876543210"); expect(normalizePhone("+447700900123")).toBe("+447700900123"); expect(normalizePhone("123")).toBe(""); });
  it("rejects weak registrations", () => { expect(registerSchema.safeParse({ name: "A B", email: "a@b.in", password: "short" }).success).toBe(false); expect(registerSchema.safeParse({ name: "A B", email: "A@B.IN", password: "longenough1" })).toMatchObject({ success: true, data: { email: "a@b.in" } }); });
  it("requires ticket quantities and contact details", () => {
    const base = { destinationId: "d", slotId: "s", visitors: [{ name: "A" }], contact: { name: "Al", email: "a@b.in", phone: "9876543210" } };
    expect(createBookingSchema.safeParse({ ...base, items: [{ categoryId: "c", quantity: 1 }] }).success).toBe(true);
    expect(createBookingSchema.safeParse({ ...base, items: [{ categoryId: "c", quantity: 0 }] }).success).toBe(false);
    expect(createBookingSchema.safeParse({ ...base, items: [], }).success).toBe(false);
  });
  it("requires increasing crowd thresholds", () => {
    const d = { name: "Fort", city: "Agra", state: "Uttar Pradesh", type: "fort", shortDescription: "A fine old fort here", location: { lat: 1, lng: 2 }, hours: { open: "09:00", close: "17:00" }, defaultSlotCapacity: 10 };
    expect(destinationSchema.safeParse(d).success).toBe(true);
    expect(destinationSchema.safeParse({ ...d, crowdThresholds: { moderate: 80, high: 70, veryHigh: 90 } }).success).toBe(false);
  });
});

describe("invoice numbering helpers", () => {
  it("uses the Indian financial year (April to March)", () => { expect(financialYear("2026-03-31")).toBe("2025-26"); expect(financialYear("2026-04-01")).toBe("2026-27"); expect(financialYear("2026-12-31")).toBe("2026-27"); expect(financialYear("2099-04-01")).toBe("2099-00"); });
  it("zero-pads the sequence", () => expect(formatInvoiceNo("2026-27", 42)).toBe("HH/2026-27/000042"));
});

describe("group concession pricing", () => {
  it("applies the concession before the convenience fee and GST", () => {
    const r = priceItems([{ unitPriceMinor: 10000, unitFeeMinor: 0, quantity: 30 }], 50);
    expect(r).toMatchObject({ grossMinor: 300000, discountMinor: 150000, subtotalMinor: 150000, feesMinor: 3000, taxMinor: 540, totalMinor: 153540 });
  });
  it("ignores nonsense percentages", () => { expect(priceItems([{ unitPriceMinor: 100, unitFeeMinor: 0, quantity: 1 }], 500).subtotalMinor).toBe(0); expect(priceItems([{ unitPriceMinor: 100, unitFeeMinor: 0, quantity: 1 }], -5).subtotalMinor).toBe(100); });
});

describe("parking fees", () => {
  const car = { freeMinutes: 15, firstHourMinor: 5000, extraHourMinor: 3000, dailyMaxMinor: 20000 };
  it("is free inside the free period", () => { expect(parkingFee(car, 1)).toBe(0); expect(parkingFee(car, 15)).toBe(0); });
  it("charges the first hour then each started hour", () => { expect(parkingFee(car, 16)).toBe(5000); expect(parkingFee(car, 60)).toBe(5000); expect(parkingFee(car, 61)).toBe(8000); expect(parkingFee(car, 190)).toBe(5000 + 3 * 3000); });
  it("caps at the daily maximum per 24 hours", () => { expect(parkingFee(car, 600)).toBe(20000); expect(parkingFee(car, 1500)).toBe(40000); });
  it("works without a cap and normalises vehicle numbers", () => { expect(parkingFee({ ...car, dailyMaxMinor: 0 }, 600)).toBe(5000 + 9 * 3000); expect(normalizeVehicle(" up-80 ab 1234 ")).toBe("UP80AB1234"); });
});

describe("pass codes and device keys", () => {
  it("signs and verifies pass codes, separately from booking codes", () => {
    const c = passCode("HP-ABC1234"); expect(isPassCode(c)).toBe(true); expect(parsePassCode(c)).toBe("HP-ABC1234");
    expect(parsePassCode(c.slice(0, -1) + "!")).toBeNull(); expect(parsePassCode(ticketCode("HP-ABC1234"))).toBeNull(); expect(parseCode(c)).toBeNull();
  });
  it("hashes device keys and never stores the raw key", () => { const k = newDeviceKey(); expect(k.raw.startsWith("hhd_")).toBe(true); expect(k.hash).toBe(hashKey(k.raw)); expect(k.hash).not.toContain(k.raw); expect(newDeviceKey().raw).not.toBe(k.raw); });
});
