import { describe, expect, it } from "vitest";
import { buildPaymentDetails, changeDue, payDetailsSchema, upiUri } from "@/lib/collect";
import { dueAfterCredit, parkingFee, reservableQuota, signQuote, verifyQuote } from "@/lib/parking";
import { flowTrend, isOpenNow } from "@/lib/live";

const card = { network: "visa", type: "debit", last4: "4242", authCode: "a1b2c3" } as const;

describe("exit quotes", () => {
  const p = { t: "PK-ABCDE", f: 5000, d: 3000, e: Date.now() + 60_000 };
  it("round-trips a valid quote", () => { expect(verifyQuote(signQuote(p))).toEqual(p); });
  it("rejects a quote whose amount was tampered with", () => {
    const [body, sig] = signQuote(p).split(".");
    const forged = Buffer.from(JSON.stringify({ ...p, d: 0 })).toString("base64url");
    expect(verifyQuote(`${forged}.${sig}`)).toBeNull();
    expect(verifyQuote(`${body}.${sig.slice(0, -1)}x`)).toBeNull();
  });
  it("rejects an expired quote and garbage", () => {
    expect(verifyQuote(signQuote({ ...p, e: Date.now() - 1 }))).toBeNull();
    expect(verifyQuote("nope")).toBeNull(); expect(verifyQuote(undefined)).toBeNull(); expect(verifyQuote("a.")).toBeNull();
  });
});

describe("parking credit and pre-booking quota", () => {
  it("credits prepayment against the fee and never goes negative", () => {
    expect(dueAfterCredit(8000, 3000)).toBe(5000); expect(dueAfterCredit(2000, 3000)).toBe(0); expect(dueAfterCredit(0, 0)).toBe(0);
  });
  it("prepaid first hour plus balance equals the plain fee", () => {
    const r = { freeMinutes: 15, firstHourMinor: 3000, extraHourMinor: 2000, dailyMaxMinor: 0 };
    const fee = parkingFee(r, 200); expect(3000 + dueAfterCredit(fee, 3000)).toBe(fee);
  });
  it("computes the pre-bookable share, defaulting to 30%", () => {
    expect(reservableQuota({ car: { capacity: 100 }, reservablePct: 30 }, "car")).toBe(30);
    expect(reservableQuota({ car: { capacity: 100 } }, "car")).toBe(30);
    expect(reservableQuota({ car: { capacity: 7 }, reservablePct: 30 }, "car")).toBe(2);
    expect(reservableQuota({ car: { capacity: 100 }, reservablePct: 0 }, "car")).toBe(0);
    expect(reservableQuota({ car: { capacity: 100 }, reservablePct: 500 }, "car")).toBe(100);
    expect(reservableQuota({}, "bus")).toBe(0);
  });
});

describe("UPI QR link", () => {
  it("encodes the exact amount to two decimals", () => {
    const u = new URL(upiUri({ vpa: "temple@sbi", name: "Temple Trust", amountMinor: 12550, note: "Parking PK-ABC", ref: "PK-ABC" }));
    expect(u.protocol).toBe("upi:"); expect(u.searchParams.get("pa")).toBe("temple@sbi"); expect(u.searchParams.get("am")).toBe("125.50"); expect(u.searchParams.get("cu")).toBe("INR"); expect(u.searchParams.get("tr")).toBe("PKABC");
  });
  it("never produces a QR for nothing or a fractional paisa", () => {
    expect(() => upiUri({ vpa: "a@b", name: "x", amountMinor: 0 })).toThrow();
    expect(() => upiUri({ vpa: "a@b", name: "x", amountMinor: 10.5 })).toThrow();
  });
});

describe("payment details", () => {
  it("requires card slip details for card payments", () => {
    expect(() => buildPaymentDetails("card", undefined, 5000)).toThrow(/card/i);
    expect(buildPaymentDetails("card", { card }, 5000)).toMatchObject({ method: "card", card: { last4: "4242" } });
  });
  it("validates card fields strictly and never accepts a full card number", () => {
    expect(payDetailsSchema.safeParse({ card: { ...card, last4: "4242424242424242" } }).success).toBe(false);
    expect(payDetailsSchema.safeParse({ card: { ...card, last4: "42" } }).success).toBe(false);
    expect(payDetailsSchema.safeParse({ card: { ...card, authCode: "ab" } }).success).toBe(false);
    expect(payDetailsSchema.safeParse({ card: { ...card, authCode: "a1b2c3" } }).success).toBe(true);
  });
  it("computes change for cash and rejects short tender", () => {
    expect(buildPaymentDetails("cash", { tenderedMinor: 20000 }, 12550)).toMatchObject({ tenderedMinor: 20000, changeMinor: 7450 });
    expect(() => buildPaymentDetails("cash", { tenderedMinor: 10000 }, 12550)).toThrow(/less than/);
    expect(changeDue(500, 700)).toBe(0);
  });
  it("needs nothing when nothing is due", () => { expect(buildPaymentDetails("card", undefined, 0)).toEqual({ method: "card" }); });
  it("accepts UPI with or without a reference", () => {
    expect(buildPaymentDetails("upi", undefined, 5000)).toEqual({ method: "upi" });
    expect(buildPaymentDetails("upi", { upiRef: "412345678901" }, 5000)).toMatchObject({ upiRef: "412345678901" });
  });
});

describe("live crowd", () => {
  it("calls a trend only outside a dead band that scales with the site limit", () => {
    expect(flowTrend(30, 10, 1000)).toBe("rising"); expect(flowTrend(10, 30, 1000)).toBe("easing"); expect(flowTrend(12, 10, 1000)).toBe("steady");
    expect(flowTrend(40, 0, 20000)).toBe("steady"); expect(flowTrend(150, 0, 20000)).toBe("rising");
  });
  it("knows when a site is open", () => {
    const dest = { hours: { open: "09:00", close: "17:00", closedDays: [1] }, closures: [{ date: "2026-10-22" }] };
    expect(isOpenNow(dest, { date: "2026-10-21", minutes: 600 } as any)).toBe(true);
    expect(isOpenNow(dest, { date: "2026-10-21", minutes: 17 * 60 } as any)).toBe(false);
    expect(isOpenNow(dest, { date: "2026-10-22", minutes: 600 } as any)).toBe(false); // listed closure
    expect(isOpenNow(dest, { date: "2026-10-26", minutes: 600 } as any)).toBe(false); // a Monday
  });
});
