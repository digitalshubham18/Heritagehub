import { z } from "zod";
import { NextResponse } from "next/server";
import { handle, ok, ApiError } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { Booking } from "@/models";
import { buildBatch, einvoiceIssues, seller, validIrn, type DocType } from "@/lib/einvoice";
import { audit } from "@/lib/audit";

/** Platform admins only: the invoices are issued by the platform, so the platform files them. */
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const field = (t: DocType) => (t === "INV" ? "einvoice" : "einvoiceCn");

export const GET = handle(async (req) => {
  await requireUser(["admin"]);
  const sp = req.nextUrl.searchParams;
  const from = date.parse(sp.get("from") || "2000-01-01"), to = date.parse(sp.get("to") || "2999-12-31");
  const bs: any[] = await Booking.find({ "buyer.gstin": { $exists: true, $ne: "" }, invoiceNo: { $exists: true }, invoiceAt: { $gte: new Date(`${from}T00:00:00+05:30`), $lte: new Date(`${to}T23:59:59.999+05:30`) } }).sort({ invoiceAt: -1 }).limit(500).lean();
  const s = seller(), rows: any[] = [];
  for (const b of bs) for (const type of (["INV", ...(b.creditNoteNo ? ["CRN"] : [])] as DocType[])) {
    const e = b[field(type)] || {};
    rows.push({ id: b._id, type, reference: b.reference, docNo: type === "INV" ? b.invoiceNo : b.creditNoteNo, date: type === "INV" ? b.invoiceAt : b.creditNoteAt, buyer: b.buyer.legalName, gstin: b.buyer.gstin, status: e.status || "pending", irn: e.irn, ackNo: e.ackNo, issues: e.status === "registered" ? [] : einvoiceIssues(b, type, s) });
  }
  const sellerReady = einvoiceIssues({ buyer: { gstin: "27AAPFU0939F1ZV", legalName: "x", address: "x", city: "x", pin: "1" }, invoiceNo: "x", feesMinor: 1, taxMinor: 1 }, "INV", s).filter((i) => /^Set /.test(i));
  return ok({ rows, sellerSetup: sellerReady, enabled: process.env.EINVOICE_ENABLED === "true" });
});

const exportBody = z.object({ action: z.literal("export"), items: z.array(z.object({ id: z.string(), type: z.enum(["INV", "CRN"]) })).min(1).max(200) });
const regBody = z.object({ action: z.literal("register"), id: z.string(), type: z.enum(["INV", "CRN"]), irn: z.string().trim(), ackNo: z.string().trim().regex(/^\d{6,20}$/, "Acknowledgement number is digits only"), ackDate: date, signedQr: z.string().max(5000).optional() });

export const POST = handle(async (req) => {
  const me = await requireUser(["admin"]);
  const raw = await req.json();
  if (raw.action === "register") {
    const b = regBody.parse(raw);
    if (!validIrn(b.irn)) throw new ApiError(400, "An IRN is 64 letters and digits (0-9, a-f). Copy it from the portal.");
    const bk: any = await Booking.findById(b.id).lean();
    if (!bk?.buyer?.gstin) throw new ApiError(404, "Invoice not found");
    if (bk[field(b.type)]?.status === "registered") throw new ApiError(409, "This document already has an IRN");
    await Booking.updateOne({ _id: b.id }, { $set: { [field(b.type)]: { status: "registered", irn: b.irn.toLowerCase(), ackNo: b.ackNo, ackDate: new Date(`${b.ackDate}T00:00:00+05:30`), signedQr: b.signedQr, exportedAt: bk[field(b.type)]?.exportedAt, registeredAt: new Date() } } });
    await audit(me, "einvoice.register", "Booking", b.id, `Recorded IRN for ${b.type === "INV" ? bk.invoiceNo : bk.creditNoteNo}`);
    return ok({ ok: true });
  }
  const b = exportBody.parse(raw);
  const bks = new Map(((await Booking.find({ _id: { $in: b.items.map((i) => i.id) } }).lean()) as any[]).map((x) => [String(x._id), x]));
  const batch = buildBatch(b.items.filter((i) => bks.has(i.id)).map((i) => ({ b: bks.get(i.id), type: i.type })));
  if (!batch.docs.length) throw new ApiError(400, `Nothing could be exported: ${batch.errors.map((e) => `${e.reference}: ${e.issues.join(", ")}`).join(" | ")}`);
  for (const o of batch.ok) await Booking.updateOne({ _id: o.id, [`${field(o.type)}.status`]: { $ne: "registered" } }, { $set: { [`${field(o.type)}.status`]: "exported", [`${field(o.type)}.exportedAt`]: new Date() } });
  await audit(me, "einvoice.export", "Booking", "", `Exported ${batch.docs.length} e-invoice document(s)${batch.errors.length ? `, ${batch.errors.length} not ready` : ""}`);
  // The portal's bulk upload takes a JSON array of documents.
  return new NextResponse(JSON.stringify(batch.docs, null, 2), { headers: { "Content-Type": "application/json", "Content-Disposition": `attachment; filename="einvoice-batch.json"`, "X-Skipped": String(batch.errors.length) } });
});
export const dynamic = "force-dynamic";
