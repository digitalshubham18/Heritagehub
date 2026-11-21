import { ApiError } from "./api";
import { GST_PCT } from "./pricing";

/**
 * GST e-invoicing support (IRN). READ THIS FIRST:
 *  - Only business-to-business invoices (a buyer with a GSTIN) need an IRN, and only if the SELLER is over the e-invoicing turnover threshold. Whether that
 *    is you, and which threshold applies this year, is for your accountant to confirm. Ordinary visitors are B2C: no IRN.
 *  - This app builds the invoice JSON in the government's schema (INV-01, version 1.1) for upload to the Invoice Registration Portal, and records the IRN
 *    you get back. It does NOT talk to the portal itself: that needs your GSP/IRP credentials and a sandbox run. Validate the first files in the
 *    government sandbox before relying on them.
 *  - The invoice's taxable supply is the platform's convenience fee. Ticket value is collected on the authority's behalf and is not reported as this supply.
 */
const CHARS = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";
export function gstinValid(g: string) {
  const s = String(g || "").trim().toUpperCase();
  if (!/^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(s)) return false;
  let sum = 0;
  for (let i = 0; i < 14; i++) { const p = CHARS.indexOf(s[i]) * (i % 2 === 0 ? 1 : 2); sum += Math.floor(p / 36) + (p % 36); }
  return CHARS[(36 - (sum % 36)) % 36] === s[14];
}
export const validBuyer = <T extends { gstin: string }>(b: T): T => {
  const gstin = b.gstin.trim().toUpperCase();
  if (!gstinValid(gstin)) throw new ApiError(400, "That GSTIN doesn't look right. Check the 15 characters, or leave the GST invoice details empty.");
  return { ...b, gstin };
};

const rs = (minor: number) => Math.round(minor) / 100;
const ddmmyyyy = (d: Date | string) => { const p = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(d)); return p; };
export const seller = () => ({ gstin: (process.env.PLATFORM_GSTIN || "").trim().toUpperCase(), legalName: process.env.PLATFORM_LEGAL_NAME || "", address: process.env.PLATFORM_ADDRESS || "", loc: process.env.PLATFORM_LOC || "", pin: process.env.PLATFORM_PIN || "", sac: process.env.PLATFORM_SAC || "" });

export type DocType = "INV" | "CRN";
/** Everything that stops this document being filed, in plain words. Empty = ready. */
export function einvoiceIssues(b: any, type: DocType, s = seller()): string[] {
  const out: string[] = [];
  if (!b.buyer?.gstin) return ["Not a business invoice (no buyer GSTIN), so no e-invoice is needed"];
  if (!gstinValid(b.buyer.gstin)) out.push("Buyer GSTIN is not valid");
  for (const [k, l] of [["legalName", "buyer legal name"], ["address", "buyer address"], ["city", "buyer city"], ["pin", "buyer PIN code"]] as const) if (!b.buyer[k]) out.push(`Missing ${l}`);
  if (!gstinValid(s.gstin)) out.push("Set a valid PLATFORM_GSTIN");
  if (!s.legalName) out.push("Set PLATFORM_LEGAL_NAME"); if (!s.address) out.push("Set PLATFORM_ADDRESS"); if (!s.loc) out.push("Set PLATFORM_LOC (seller city)"); if (!/^\d{6}$/.test(s.pin)) out.push("Set PLATFORM_PIN (6 digits)"); if (!s.sac) out.push("Set PLATFORM_SAC");
  if (!b.invoiceNo) out.push("No invoice number yet (booking not confirmed)");
  if (type === "INV" && !(b.feesMinor > 0 && b.taxMinor > 0)) out.push("No taxable convenience fee on this booking, so there is nothing to report");
  if (type === "CRN") { if (!b.creditNoteNo) out.push("No credit note issued"); else if (!(b.creditNoteTaxMinor > 0)) out.push("This refund reverses no GST, so no credit note is reported"); }
  return out;
}

/** One invoice (INV) or credit note (CRN) in schema INV-01 v1.1. Throws a 400 listing what is missing. */
export function buildEInvoice(b: any, type: DocType, s = seller()) {
  const issues = einvoiceIssues(b, type, s);
  if (issues.length) throw new ApiError(400, issues.join("; "));
  const taxMinor = type === "INV" ? b.taxMinor : b.creditNoteTaxMinor;
  const rate = GST_PCT;
  const assMinor = type === "INV" ? b.feesMinor : Math.round((taxMinor * 100) / rate);
  const sellerState = s.gstin.slice(0, 2), buyerState = String(b.buyer.gstin).slice(0, 2), intra = sellerState === buyerState;
  const cg = intra ? Math.floor(taxMinor / 2) : 0, sg = intra ? taxMinor - cg : 0, ig = intra ? 0 : taxMinor;
  const total = assMinor + taxMinor;
  return {
    Version: "1.1",
    TranDtls: { TaxSch: "GST", SupTyp: "B2B", RegRev: "N", IgstOnIntra: "N" },
    DocDtls: { Typ: type, No: type === "INV" ? b.invoiceNo : b.creditNoteNo, Dt: ddmmyyyy(type === "INV" ? b.invoiceAt : b.creditNoteAt) },
    SellerDtls: { Gstin: s.gstin, LglNm: s.legalName.slice(0, 100), Addr1: s.address.slice(0, 100), Loc: s.loc.slice(0, 50), Pin: Number(s.pin), Stcd: sellerState },
    BuyerDtls: { Gstin: b.buyer.gstin, LglNm: String(b.buyer.legalName).slice(0, 100), Pos: buyerState, Addr1: String(b.buyer.address).slice(0, 100), Loc: String(b.buyer.city).slice(0, 50), Pin: Number(b.buyer.pin), Stcd: buyerState },
    ItemList: [{ SlNo: "1", PrdDesc: "Online convenience fee for heritage-site ticket booking", IsServc: "Y", HsnCd: s.sac, Qty: 1, Unit: "OTH", UnitPrice: rs(assMinor), TotAmt: rs(assMinor), AssAmt: rs(assMinor), GstRt: rate, IgstAmt: rs(ig), CgstAmt: rs(cg), SgstAmt: rs(sg), TotItemVal: rs(total) }],
    ValDtls: { AssVal: rs(assMinor), CgstVal: rs(cg), SgstVal: rs(sg), IgstVal: rs(ig), TotInvVal: rs(total) },
    ...(type === "CRN" ? { PrecDocDtls: [{ InvNo: b.invoiceNo, InvDt: ddmmyyyy(b.invoiceAt) }] } : {}),
  };
}

/** Builds a batch for upload. Documents that cannot be built are returned with their reasons instead of failing the whole batch. */
export function buildBatch(rows: { b: any; type: DocType }[], s = seller()) {
  const docs: any[] = [], errors: { reference: string; type: DocType; issues: string[] }[] = [], ok: { id: string; type: DocType }[] = [];
  for (const { b, type } of rows) {
    const issues = einvoiceIssues(b, type, s);
    if (issues.length) errors.push({ reference: b.reference, type, issues }); else { docs.push(buildEInvoice(b, type, s)); ok.push({ id: String(b._id), type }); }
  }
  return { docs, errors, ok };
}
export const validIrn = (irn: string) => /^[0-9a-f]{64}$/i.test(irn.trim());
