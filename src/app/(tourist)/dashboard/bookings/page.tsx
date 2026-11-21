"use client";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import { api, useApi } from "@/lib/hooks";
import { Button, Card, Empty, ErrorState, PageSkeleton, StatusBadge, useConfirm } from "@/components/ui";
import { cancellationInfo } from "@/lib/pricing";
import { fmtDate, fmtTime, inr } from "@/lib/utils";

const TABS = [["", "All"], ["confirmed", "Confirmed"], ["pending", "Awaiting payment"], ["completed", "Completed"], ["cancelled", "Cancelled"]];
export default function Bookings() {
  const [tab, setTab] = useState("");
  const { data, loading, error, reload } = useApi<any>(`/api/bookings${tab ? `?status=${tab}` : ""}`);
  const { confirm, dialog } = useConfirm();
  async function cancel(b: any, refund: number) {
    if (!(await confirm({ title: `Cancel ${b.reference}?`, body: refund > 0 ? `You'll be refunded ${inr(refund)} (test mode). This can't be undone.` : "No refund applies. This can't be undone.", confirmLabel: "Cancel booking", danger: true }))) return;
    try { await api(`/api/bookings/${b._id}`, { method: "DELETE" }); toast.success("Booking cancelled"); reload(); } catch (e: any) { toast.error(e.message); }
  }
  return (
    <div className="space-y-5">{dialog}
      <h1 className="text-3xl">Booking history</h1>
      <div role="tablist" aria-label="Filter bookings" className="flex flex-wrap gap-2">{TABS.map(([v, l]) => <button key={v} role="tab" aria-selected={tab === v} onClick={() => setTab(v)} className={`rounded-full px-3 py-1.5 text-sm ${tab === v ? "bg-forest text-ivory" : "border border-forest/20 hover:bg-forest-50"}`}>{l}</button>)}</div>
      {error ? <ErrorState message={error} onRetry={reload} /> : loading ? <PageSkeleton /> : !data.items.length ? <Empty title="No bookings here" action={<Link href="/destinations" className="rounded-lg bg-forest px-4 py-2 text-sm text-ivory">Explore destinations</Link>}>Bookings you make will appear in this list.</Empty> : (
        <div className="space-y-3">{data.items.map((b: any) => {
          const info = cancellationInfo(b, b.destinationInfo.cancellationPolicy);
          return (<Card key={b._id} className="p-4"><div className="flex flex-wrap items-start justify-between gap-3">
            <div><p className="font-medium">{b.destinationInfo.name}</p><p className="text-sm text-ink/70">{fmtDate(b.date)}, {fmtTime(b.start)} to {fmtTime(b.end)}</p><p className="mt-1 text-sm">{b.quantity} ticket(s), {inr(b.totalMinor)} <span className="font-mono text-xs text-ink/60">{b.reference}</span></p></div>
            <div className="flex flex-col items-end gap-2"><div className="flex gap-1"><StatusBadge s={b.status} /><StatusBadge s={b.paymentStatus} /></div>
              {b.status === "pending" && <Link href={`/checkout/${b._id}`} className="text-sm text-terracotta underline">Finish payment</Link>}
              {b.status === "confirmed" && (info.eligible ? <Button size="sm" variant="outline" onClick={() => cancel(b, info.refundMinor)}>Cancel booking</Button> : <p className="max-w-[14rem] text-right text-xs text-ink/60">{info.reason}</p>)}
              {b.status === "cancelled" && b.refundMinor > 0 && <p className="text-xs text-ink/70">Refunded {inr(b.refundMinor)}</p>}</div></div>
            {b.status === "confirmed" && info.eligible && <p className="mt-2 text-xs text-ink/60">If cancelled now: {info.reason.toLowerCase()} ({inr(info.refundMinor)}).</p>}</Card>);
        })}</div>)}
    </div>
  );
}
