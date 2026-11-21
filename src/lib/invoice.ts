import { Booking, Counter } from "@/models";
import { istParts } from "./utils";

/** Indian financial year label for a YYYY-MM-DD date, e.g. 2026-10-12 -> "2026-27". */
export function financialYear(date: string) {
  const [y, m] = date.split("-").map(Number);
  const start = m >= 4 ? y : y - 1;
  return `${start}-${String((start + 1) % 100).padStart(2, "0")}`;
}
export const formatInvoiceNo = (fy: string, seq: number) => `HH/${fy}/${String(seq).padStart(6, "0")}`;

async function nextSeq(key: string): Promise<number> {
  for (let i = 0; i < 3; i++) {
    try { return ((await Counter.findOneAndUpdate({ key }, { $inc: { seq: 1 } }, { upsert: true, new: true }).lean()) as any).seq; }
    catch (e: any) { if (e?.code !== 11000) throw e; } // two first-ever upserts raced: retry the increment
  }
  throw new Error("Could not allocate invoice number");
}

/** One invoice number per booking, sequential per financial year. Called once, when a booking is confirmed. */
export async function assignInvoice(booking: any, model: any = Booking) {
  if (booking.invoiceNo) return booking;
  const fy = financialYear(istParts().date);
  const invoiceNo = formatInvoiceNo(fy, await nextSeq(`invoice:${fy}`));
  const upd = await model.findOneAndUpdate({ _id: booking._id, invoiceNo: { $exists: false } }, { invoiceNo, invoiceAt: new Date() }, { new: true }).lean();
  return upd || (await model.findById(booking._id).lean());
}

/** Seller details printed on invoices. Configure with PLATFORM_* env vars; verify tax treatment with an accountant. */
export const platformInfo = () => ({
  legalName: process.env.PLATFORM_LEGAL_NAME || "HeritageHub (demo, not a registered business)",
  gstin: process.env.PLATFORM_GSTIN || "",
  address: process.env.PLATFORM_ADDRESS || "",
  sac: process.env.PLATFORM_SAC || "",
});

/** GST contained in a tax-inclusive amount (parking rates are entered GST-inclusive). */
export const gstFromInclusive = (totalMinor: number, pct: number) => (pct > 0 && totalMinor > 0 ? Math.round((totalMinor * pct) / (100 + pct)) : 0);
export const formatParkingInvoiceNo = (fy: string, seq: number) => `HP/${fy}/${String(seq).padStart(6, "0")}`;
/** One invoice number per parking ticket or parking pass (series HP), sequential per financial year. Allocated once; a replay returns the stored number. */
export async function assignParkingInvoice(doc: any, model: any) {
  if (doc.invoiceNo) return doc;
  const fy = financialYear(istParts().date);
  const invoiceNo = formatParkingInvoiceNo(fy, await nextSeq(`pinvoice:${fy}`));
  const upd = await model.findOneAndUpdate({ _id: doc._id, invoiceNo: { $exists: false } }, { invoiceNo, invoiceAt: new Date() }, { new: true }).lean();
  return upd || (await model.findById(doc._id).lean());
}

export const formatCreditNoteNo = (fy: string, seq: number) => `CN/${fy}/${String(seq).padStart(6, "0")}`;
/** GST reversed by a refund: the booking's tax in proportion to how much of the total is refunded. */
export const creditTaxShare = (taxMinor: number, totalMinor: number, refundMinor: number) => (totalMinor > 0 && taxMinor > 0 ? Math.round((taxMinor * Math.min(refundMinor, totalMinor)) / totalMinor) : 0);
/**
 * Issues a credit note against an invoice, once. `fields` are stored with the number (amount, tax). A second call returns the note already issued, so a retry never
 * creates a second number. Numbers are sequential per financial year in their own series (CN).
 */
export async function issueCreditNote(model: any, id: any, fields: Record<string, unknown>) {
  const cur: any = await model.findById(id).lean();
  if (!cur || cur.creditNoteNo) return cur;
  const fy = financialYear(istParts().date), creditNoteNo = formatCreditNoteNo(fy, await nextSeq(`creditnote:${fy}`));
  const upd = await model.findOneAndUpdate({ _id: id, creditNoteNo: { $exists: false } }, { ...fields, creditNoteNo, creditNoteAt: new Date() }, { new: true }).lean();
  return upd || (await model.findById(id).lean());
}
