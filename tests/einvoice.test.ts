import { describe, expect, it } from "vitest";
import { buildBatch, buildEInvoice, einvoiceIssues, gstinValid, validIrn } from "../src/lib/einvoice";

const S = { gstin: "27AAPFU0939F1ZV", legalName: "HeritageHub Pvt Ltd", address: "1 MG Road", loc: "Mumbai", pin: "400001", sac: "998599" };
const booking = (o: any = {}) => ({ _id: "b1", reference: "HH-1", invoiceNo: "HH/2026-27/000007", invoiceAt: new Date("2026-11-02T08:00:00Z"), feesMinor: 10000, taxMinor: 1800, totalMinor: 111800,
  buyer: { gstin: "29AABCT1332L1ZA", legalName: "Tour Co", address: "5 Brigade Rd", city: "Bengaluru", pin: "560001" }, ...o });

describe("GSTIN checksum", () => {
  it("accepts real-format GSTINs and rejects a changed character", () => {
    expect(gstinValid("27AAPFU0939F1ZV")).toBe(true);
    expect(gstinValid("27AAPFU0939F1ZW")).toBe(false);
    expect(gstinValid("27aapfu0939f1zv")).toBe(true);
    expect(gstinValid("short")).toBe(false);
  });
});
describe("e-invoice JSON", () => {
  it("uses CGST+SGST within a state and IGST across states, and the totals add up", () => {
    const inter = buildEInvoice(booking(), "INV", S);
    expect(inter.DocDtls).toEqual({ Typ: "INV", No: "HH/2026-27/000007", Dt: "02/11/2026" });
    expect(inter.ValDtls).toMatchObject({ AssVal: 100, IgstVal: 18, CgstVal: 0, SgstVal: 0, TotInvVal: 118 }); expect(inter.BuyerDtls.Pos).toBe("29");
    const intra = buildEInvoice(booking({ buyer: { ...booking().buyer, gstin: "27AAPFU0939F1ZV" }, taxMinor: 1801 }), "INV", S);
    expect(intra.ValDtls.CgstVal + intra.ValDtls.SgstVal).toBeCloseTo(18.01); expect(intra.ValDtls.IgstVal).toBe(0);
  });
  it("builds a credit note that points at the original invoice and reverses only the GST refunded", () => {
    const cn = buildEInvoice(booking({ creditNoteNo: "CN/2026-27/000002", creditNoteAt: new Date("2026-11-05T08:00:00Z"), creditNoteTaxMinor: 900, creditNoteMinor: 55900 }), "CRN", S);
    expect(cn.DocDtls.Typ).toBe("CRN"); expect(cn.PrecDocDtls![0]).toEqual({ InvNo: "HH/2026-27/000007", InvDt: "02/11/2026" });
    expect(cn.ValDtls).toMatchObject({ AssVal: 50, IgstVal: 9, TotInvVal: 59 });
  });
  it("says in plain words what is missing, and skips B2C", () => {
    expect(einvoiceIssues(booking({ buyer: undefined }), "INV", S)[0]).toMatch(/Not a business invoice/);
    expect(einvoiceIssues(booking({ buyer: { gstin: "27AAPFU0939F1ZV" } }), "INV", S)).toEqual(expect.arrayContaining(["Missing buyer legal name", "Missing buyer PIN code"]));
    expect(einvoiceIssues(booking(), "INV", { ...S, gstin: "", pin: "" })).toEqual(expect.arrayContaining(["Set a valid PLATFORM_GSTIN", "Set PLATFORM_PIN (6 digits)"]));
    expect(einvoiceIssues(booking({ feesMinor: 0, taxMinor: 0 }), "INV", S)[0]).toMatch(/nothing to report/);
    expect(einvoiceIssues(booking({ creditNoteNo: "CN/1", creditNoteTaxMinor: 0 }), "CRN", S)[0]).toMatch(/no GST/);
    expect(() => buildEInvoice(booking({ buyer: undefined }), "INV", S)).toThrow();
  });
  it("a batch reports bad documents without losing good ones", () => {
    const r = buildBatch([{ b: booking(), type: "INV" }, { b: booking({ _id: "b2", reference: "HH-2", buyer: undefined }), type: "INV" }], S);
    expect(r.docs).toHaveLength(1); expect(r.errors).toHaveLength(1); expect(r.ok).toEqual([{ id: "b1", type: "INV" }]);
  });
  it("accepts a 64-hex IRN only", () => { expect(validIrn("a".repeat(64))).toBe(true); expect(validIrn("abc")).toBe(false); });
});
