"use client";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Printer } from "lucide-react";
import { useApi } from "@/lib/hooks";
import { Button, ErrorState, PageSkeleton } from "@/components/ui";
import { inr } from "@/lib/utils";

export default function ParkingInvoice() {
  const { ref } = useParams<{ ref: string }>();
  const { data: d, loading, error, reload } = useApi<any>(`/api/parking/invoice?ref=${encodeURIComponent(ref)}`);
  if (loading) return <div className="mx-auto max-w-3xl p-6"><PageSkeleton /></div>;
  if (error || !d) return <div className="mx-auto max-w-xl p-8"><ErrorState message={error || "Invoice not found"} onRetry={reload} /></div>;
  const gst = d.gstPct > 0;
  return (
    <div className="mx-auto max-w-3xl p-4 sm:p-8">
      <div className="no-print mb-4 flex items-center justify-between"><Link href="/" className="text-sm text-terracotta underline">Back to HeritageHub</Link><Button size="sm" onClick={() => window.print()}><Printer className="h-4 w-4" aria-hidden />Print or save as PDF</Button></div>
      <article className="rounded-xl border border-forest/15 bg-white p-6 sm:p-8" aria-label={`Invoice ${d.invoiceNo}`}>
        <header className="flex flex-wrap items-start justify-between gap-4 border-b border-forest/15 pb-4">
          <div><h1 className="text-2xl">{gst ? "Tax invoice: parking" : "Parking receipt"}</h1><p className="mt-1 font-medium">{d.seller.legalName}</p>{d.seller.address && <p className="text-sm text-ink/70">{d.seller.address}</p>}{d.seller.gstin ? <p className="text-sm">GSTIN: {d.seller.gstin}</p> : gst ? <p className="text-sm text-amber-800">GSTIN not configured: set it on the operator before using this as a tax invoice</p> : null}</div>
          <dl className="text-sm"><div className="flex gap-2"><dt className="text-ink/60">Invoice no.</dt><dd className="font-mono">{d.invoiceNo}</dd></div><div className="flex gap-2"><dt className="text-ink/60">Date</dt><dd>{new Date(d.invoiceAt).toLocaleDateString("en-IN")}</dd></div><div className="flex gap-2"><dt className="text-ink/60">Reference</dt><dd className="font-mono">{d.ref}</dd></div></dl>
        </header>
        <section className="grid gap-4 py-4 text-sm sm:grid-cols-2"><div><h2 className="text-base">Billed to</h2><p>{d.buyer}</p><p className="text-ink/70">Vehicle {d.vehicleNumber}</p></div><div><h2 className="text-base">Site</h2><p>{d.site.name}{d.site.city ? `, ${d.site.city}` : ""}</p></div></section>
        <table className="w-full text-sm"><thead><tr className="border-y border-forest/15 text-left"><th className="py-2 font-medium">Description</th><th className="py-2 text-right font-medium">Amount</th></tr></thead>
          <tbody>{d.lines.map((l: any, i: number) => <tr key={i} className="border-b border-forest/10"><td className="py-2">{l.description}</td><td className="py-2 text-right">{inr(l.amountMinor)}</td></tr>)}
            {gst && <><tr><td className="pt-3 text-right text-ink/70">Taxable value</td><td className="pt-3 text-right">{inr(d.taxableMinor)}</td></tr><tr><td className="text-right text-ink/70">GST @ {d.gstPct}% (included in the amount above)</td><td className="text-right">{inr(d.gstMinor)}</td></tr></>}
            <tr className="font-semibold"><td className="pt-2 text-right">Total</td><td className="pt-2 text-right">{inr(d.totalMinor)}</td></tr></tbody></table>
        {d.creditNote && <section aria-label={`Credit note ${d.creditNote.no}`} className="mt-6 rounded-lg border-2 border-dashed border-sky-300 bg-sky-50 p-4 text-sm"><h2 className="text-lg">Credit note</h2><dl className="mt-1 grid gap-1 sm:grid-cols-2"><div className="flex gap-2"><dt className="text-ink/60">Credit note no.</dt><dd className="font-mono">{d.creditNote.no}</dd></div><div className="flex gap-2"><dt className="text-ink/60">Date</dt><dd>{new Date(d.creditNote.at).toLocaleDateString("en-IN")}</dd></div><div className="flex gap-2"><dt className="text-ink/60">Against invoice</dt><dd className="font-mono">{d.invoiceNo}</dd></div><div className="flex gap-2"><dt className="text-ink/60">Reason</dt><dd>{d.creditNote.reason}</dd></div></dl><table className="mt-3 w-full"><tbody><tr><td className="py-1 text-ink/70">Refunded ({d.creditNote.method})</td><td className="py-1 text-right font-semibold">{inr(d.creditNote.refundMinor)}</td></tr>{d.creditNote.gstMinor > 0 && <><tr><td className="py-1 text-ink/70">of which GST reversed</td><td className="py-1 text-right">{inr(d.creditNote.gstMinor)}</td></tr><tr><td className="py-1 text-ink/70">Value before GST</td><td className="py-1 text-right">{inr(d.creditNote.refundMinor - d.creditNote.gstMinor)}</td></tr></>}</tbody></table></section>}
        <section className="mt-5 text-sm"><p><span className="text-ink/60">Payment:</span> {d.method === "pass" ? "Covered by monthly pass" : d.method === "prepaid" ? "Paid in advance when pre-booked" : d.method || "n/a"}{d.prepaidMinor > 0 ? ` (includes ${inr(d.prepaidMinor)} paid in advance)` : ""}</p></section>
        <footer className="mt-6 border-t border-forest/15 pt-3 text-xs text-ink/60">Parking rates include GST where shown. Prototype document: tax treatment, SAC and GSTIN must be confirmed with your accountant before this is used for filing.</footer>
      </article>
    </div>
  );
}
