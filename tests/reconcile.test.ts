import { describe, expect, it } from "vitest";
import { parseAmountMinor, parseBankDate, parseStatement, reconcile, type BankRow, type Recorded } from "../src/lib/reconcile";

describe("statement parsing", () => {
  it("reads dates the way Indian banks print them", () => {
    expect(parseBankDate("05/11/26")?.date).toBe("2026-11-05");
    expect(parseBankDate("05-Nov-2026")?.date).toBe("2026-11-05");
    expect(parseBankDate("5 Nov 2026 14:32")).toEqual({ date: "2026-11-05", time: "14:32" });
    expect(parseBankDate("2026-11-05")?.date).toBe("2026-11-05");
    expect(parseBankDate("hello")).toBeNull();
  });
  it("reads amounts", () => {
    expect(parseAmountMinor("1,234.50")).toBe(123450); expect(parseAmountMinor("₹ 500")).toBe(50000); expect(parseAmountMinor("500.00 Cr")).toBe(50000); expect(parseAmountMinor("")).toBeNull();
  });
  it("takes only credits from a Deposit/Withdrawal layout (HDFC style) and skips preamble", () => {
    const csv = `Account Statement,,,,,\nDate,Narration,Chq./Ref.No.,Value Dt,Withdrawal Amt.,Deposit Amt.,Closing Balance\n01/11/26,UPI-RAHUL-9876@ybl-HHABCD2345,0000123456789,01/11/26,,"1,180.00",5000\n01/11/26,ATM WDL,000111,01/11/26,2000.00,,3000\n02/11/26,UPI-ANITA-PKG,0000999,02/11/26,,300.00,3300\n`;
    const r = parseStatement(csv);
    expect(r.credits.map((c) => c.amountMinor)).toEqual([118000, 30000]);
    expect(r.credits[0].date).toBe("2026-11-01"); expect(r.credits[0].description).toContain("HHABCD2345");
  });
  it("handles an Amount + Dr/Cr layout and says what is missing otherwise", () => {
    const r = parseStatement(`Txn Date,Description,Amount,Dr/Cr\n03-Nov-2026,UPI/123/abc,250.00,CR\n03-Nov-2026,Fee,10.00,DR\n`);
    expect(r.credits).toHaveLength(1); expect(r.credits[0].amountMinor).toBe(25000);
    expect(() => parseStatement("a,b\n1,2")).toThrow(/column headings/);
    expect(() => parseStatement("Date,Narration\n01/11/26,x")).toThrow(/money-in/);
  });
});

const at = (d: string, t = "11:00") => new Date(`${d}T${t}:00+05:30`);
const rec = (o: Partial<Recorded>): Recorded => ({ source: "counter_sale", ref: "HH-AAAA-1111", amountMinor: 50000, at: at("2026-11-01"), staffName: "Ravi", destinationId: "d", destinationName: "Fort", ...o });
const bank = (o: Partial<BankRow>): BankRow => ({ date: "2026-11-01", description: "UPI-X", ref: "", amountMinor: 50000, ...o });

describe("matching", () => {
  it("matches by the reference carried in the QR, even when two payments have the same amount", () => {
    const r = reconcile([rec({ ref: "HH-AAAA-1111" }), rec({ ref: "HH-BBBB-2222", staffName: "Meena" })], [bank({ description: "UPI-PAYER-HHBBBB2222" }), bank({ description: "UPI-PAYER-HHAAAA1111" })]);
    expect(r.totals).toMatchObject({ matched: 2, unmatchedRecorded: 0, unmatchedBank: 0, matchedWeak: 0 });
  });
  it("matches by the UPI reference staff typed", () => {
    const r = reconcile([rec({ upiRef: "412345678901", ref: "X1" })], [bank({ description: "UPI/412345678901/PAYER" })]);
    expect(r.items[0]).toMatchObject({ kind: "matched", match: "UPI reference" });
  });
  it("flags a recorded payment the bank never received, and credits no one recorded", () => {
    const r = reconcile([rec({ amountMinor: 70000, staffName: "Ravi" })], [bank({ amountMinor: 12300 })]);
    expect(r.totals).toMatchObject({ unmatchedRecorded: 1, unmatchedRecordedMinor: 70000, unmatchedBank: 1, matched: 0 });
    expect(r.totals.byStaff[0]).toMatchObject({ staffName: "Ravi", unmatched: 1 });
  });
  it("flags a reference match whose amount differs", () => {
    const r = reconcile([rec({ ref: "HH-AAAA-1111", amountMinor: 50000 })], [bank({ description: "HHAAAA1111", amountMinor: 5000 })]);
    expect(r.totals.mismatch).toBe(1); expect(r.items[0].kind).toBe("amount_mismatch");
  });
  it("by amount and day: one credit covers one payment, the second equal payment is left unmatched, and the next day counts", () => {
    const r = reconcile([rec({ ref: "A1" }), rec({ ref: "A2", at: at("2026-11-01", "15:00") })], [bank({ date: "2026-11-02" })]);
    expect(r.totals).toMatchObject({ matched: 1, matchedWeak: 1, unmatchedRecorded: 1 });
    expect(reconcile([rec({})], [bank({ date: "2026-11-04" })]).totals.matched).toBe(0); // too far apart
  });
  it("never matches the same bank credit twice", () => {
    const r = reconcile([rec({ ref: "HH-AAAA-1111" }), rec({ ref: "HH-AAAA-1111", staffName: "Meena" })], [bank({ description: "HHAAAA1111" })]);
    expect(r.totals.matched).toBe(1); expect(r.totals.unmatchedRecorded).toBe(1);
  });
});
