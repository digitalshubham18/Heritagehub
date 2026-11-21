"use client";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Printer } from "lucide-react";
import { useApi } from "@/lib/hooks";
import { Button, ErrorState, PageSkeleton } from "@/components/ui";
import { QR } from "@/components/qr";
import { fmtDate, fmtTime, inr } from "@/lib/utils";

export default function Invoice() {
  const { bookingId } = useParams<{ bookingId: string }>();
  const { data, loading, error, reload } = useApi<any>(`/api/bookings/${bookingId}`);
  if (loading) return <div className="mx-auto max-w-3xl p-6"><PageSkeleton /></div>;
  if (error || !data) return <div className="mx-auto max-w-xl p-8"><ErrorState message={error || "Invoice not found"} onRetry={reload} /></div>;
  const { booking: b, destination: x, platform: p, payments } = data;
  if (!b.invoiceNo) return <div className="mx-auto max-w-xl p-8"><p className="rounded-lg bg-amber-50 p-4 text-amber-900">An invoice is issued once the booking is paid and confirmed.</p></div>;
  const counter = b.channel === "counter";
  const refunds = payments.filter((q: any) => q.type === "refund" && q.status === "succeeded");
  const charge = payments.find((q: any) => q.type === "charge" && q.status === "succeeded");
  return (
    <div className="mx-auto max-w-3xl p-4 sm:p-8">
      <div className="no-print mb-4 flex items-center justify-between"><Link href="/" className="text-sm text-terracotta underline">Back to HeritageHub</Link><Button size="sm" onClick={() => window.print()}><Printer className="h-4 w-4" aria-hidden />Print or save as PDF</Button></div>
      <article className="rounded-xl border border-forest/15 bg-white p-6 sm:p-8" aria-label={`Invoice ${b.invoiceNo}`}>
        <header className="flex flex-wrap items-start justify-between gap-4 border-b border-forest/15 pb-4">
          <div><h1 className="text-2xl">{counter ? "Counter receipt and invoice" : "Tax invoice"}</h1><p className="mt-1 font-medium">{p.legalName}</p>{p.address && <p className="text-sm text-ink/70">{p.address}</p>}{p.gstin ? <p className="text-sm">GSTIN: {p.gstin}</p> : <p className="text-sm text-amber-800">GSTIN not configured</p>}</div>
          <dl className="text-sm"><div className="flex gap-2"><dt className="text-ink/60">Invoice no.</dt><dd className="font-mono">{b.invoiceNo}</dd></div><div className="flex gap-2"><dt className="text-ink/60">Date</dt><dd>{new Date(b.invoiceAt).toLocaleDateString("en-IN")}</dd></div><div className="flex gap-2"><dt className="text-ink/60">Booking</dt><dd className="font-mono">{b.reference}</dd></div></dl>
        </header>
        <section className="grid gap-4 py-4 text-sm sm:grid-cols-2"><div><h2 className="text-base">Billed to</h2><p>{counter ? "Walk-in visitor" : b.contact?.name}</p>{!counter && <p className="text-ink/70">{b.contact?.email}</p>}{b.buyer?.gstin && <div className="mt-1"><p className="font-medium">{b.buyer.legalName}</p><p className="text-ink/70">{b.buyer.address}, {b.buyer.city} {b.buyer.pin}</p><p>GSTIN: <span className="font-mono">{b.buyer.gstin}</span></p></div>}</div><div><h2 className="text-base">Visit</h2><p>{x.name}, {x.city}</p><p className="text-ink/70">{fmtDate(b.date)}, {fmtTime(b.start)} to {fmtTime(b.end)}</p></div></section>
        <table className="w-full text-sm"><thead><tr className="border-y border-forest/15 text-left"><th className="py-2 font-medium">Description</th><th className="py-2 text-right font-medium">Qty</th><th className="py-2 text-right font-medium">Rate</th><th className="py-2 text-right font-medium">Amount</th></tr></thead>
          <tbody>{b.items.map((i: any) => <tr key={i.name} className="border-b border-forest/10"><td className="py-2">Entry: {i.name}</td><td className="py-2 text-right">{i.quantity}</td><td className="py-2 text-right">{inr(i.unitPriceMinor + i.unitFeeMinor)}</td><td className="py-2 text-right">{inr((i.unitPriceMinor + i.unitFeeMinor) * i.quantity)}</td></tr>)}
            <tr><td colSpan={3} className="pt-3 text-right text-ink/70">Entry ticket value{counter ? "" : " (collected on behalf of the managing authority)"}</td><td className="pt-3 text-right">{inr(b.subtotalMinor)}</td></tr>
            {!counter && <><tr><td colSpan={3} className="text-right text-ink/70">Online convenience fee{p.sac ? ` (SAC ${p.sac})` : ""}</td><td className="text-right">{inr(b.feesMinor)}</td></tr><tr><td colSpan={3} className="text-right text-ink/70">GST @ 18% on convenience fee</td><td className="text-right">{inr(b.taxMinor)}</td></tr></>}
            <tr className="font-semibold"><td colSpan={3} className="pt-2 text-right">Total</td><td className="pt-2 text-right">{inr(b.totalMinor)}</td></tr></tbody></table>
        <section className="mt-5 text-sm"><p><span className="text-ink/60">Payment:</span> {charge ? `${charge.method} (${charge.provider === "counter" ? "taken at counter" : charge.provider})` : "n/a"}{charge?.providerRef ? <span className="font-mono text-xs text-ink/60"> {charge.providerRef}</span> : null}</p>
          {refunds.map((r: any) => <p key={r._id} className="text-sky-900">Refund: {inr(r.amountMinor)} on {new Date(r.createdAt).toLocaleDateString("en-IN")}{b.status === "cancelled" ? " (booking cancelled)" : ""}</p>)}</section>
        {b.creditNoteNo && <section aria-label={`Credit note ${b.creditNoteNo}`} className="mt-6 rounded-lg border-2 border-dashed border-sky-300 bg-sky-50 p-4 text-sm"><h2 className="text-lg">Credit note</h2>
          <dl className="mt-1 grid gap-1 sm:grid-cols-2"><div className="flex gap-2"><dt className="text-ink/60">Credit note no.</dt><dd className="font-mono">{b.creditNoteNo}</dd></div><div className="flex gap-2"><dt className="text-ink/60">Date</dt><dd>{new Date(b.creditNoteAt).toLocaleDateString("en-IN")}</dd></div><div className="flex gap-2"><dt className="text-ink/60">Against invoice</dt><dd className="font-mono">{b.invoiceNo}</dd></div><div className="flex gap-2"><dt className="text-ink/60">Reason</dt><dd>{b.cancelReason || "Booking cancelled"}</dd></div></dl>
          <table className="mt-3 w-full"><tbody><tr><td className="py-1 text-ink/70">Refunded to the customer</td><td className="py-1 text-right font-semibold">{inr(b.creditNoteMinor)}</td></tr>{b.creditNoteTaxMinor > 0 && <><tr><td className="py-1 text-ink/70">of which GST reversed</td><td className="py-1 text-right">{inr(b.creditNoteTaxMinor)}</td></tr><tr><td className="py-1 text-ink/70">Value before GST</td><td className="py-1 text-right">{inr(b.creditNoteMinor - b.creditNoteTaxMinor)}</td></tr></>}</tbody></table></section>}
        {b.einvoice?.status === "registered" && <section aria-label="E-invoice" className="mt-4 flex flex-wrap items-center gap-4 rounded-lg border border-forest/15 p-3 text-xs"><div className="min-w-0 flex-1"><p><span className="text-ink/60">IRN</span> <span className="break-all font-mono">{b.einvoice.irn}</span></p><p><span className="text-ink/60">Ack no.</span> {b.einvoice.ackNo} · <span className="text-ink/60">Ack date</span> {new Date(b.einvoice.ackDate).toLocaleDateString("en-IN")}</p></div>{b.einvoice.signedQr && <QR value={b.einvoice.signedQr} size={96} label="E-invoice QR code" />}</section>}
        <footer className="mt-6 border-t border-forest/15 pt-3 text-xs text-ink/60">{counter ? "No online convenience fee applies to counter sales." : "GST is shown on the convenience fee only; entry ticket value is collected on behalf of the managing authority."} Prototype document: tax treatment, SAC and GSTIN must be confirmed with a qualified accountant before real use.</footer>
      </article>
    </div>
  );
}
