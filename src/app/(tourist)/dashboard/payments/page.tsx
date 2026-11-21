"use client";
import Link from "next/link";
import { useMemo } from "react";
import { Printer } from "lucide-react";
import { useApi } from "@/lib/hooks";
import { Badge, Button, Card, Empty, ErrorState, PageSkeleton, Stat, StatusBadge } from "@/components/ui";
import { fmtDate, inr } from "@/lib/utils";

type Row = { id: string; at: string; kind: "Tickets" | "Parking"; what: string; ref: string; amountMinor: number; refundMinor: number; status: string; href?: string };
export default function Payments() {
  const b = useApi<any>("/api/bookings"), p = useApi<any>("/api/parking/reservations");
  const rows = useMemo<Row[]>(() => {
    const t: Row[] = (b.data?.items || []).filter((x: any) => ["confirmed", "completed", "cancelled"].includes(x.status) && x.paymentStatus !== "unpaid").map((x: any) => ({ id: x._id, at: x.createdAt, kind: "Tickets", what: `${x.destinationInfo?.name} · ${fmtDate(x.date)}`, ref: x.reference, amountMinor: x.totalMinor || 0, refundMinor: x.refundMinor || 0, status: x.paymentStatus, href: `/invoice/${x._id}` }));
    const k: Row[] = (p.data?.items || []).filter((x: any) => x.prepaidMinor > 0).map((x: any) => ({ id: x._id, at: x.createdAt, kind: "Parking", what: `${x.destinationInfo?.name} · ${fmtDate(x.date)} · ${x.vehicleNumber}`, ref: x.reference, amountMinor: x.prepaidMinor, refundMinor: x.refundMinor || 0, status: x.refundMinor >= x.prepaidMinor ? "refunded" : "paid" }));
    return [...t, ...k].sort((a, c) => +new Date(c.at) - +new Date(a.at));
  }, [b.data, p.data]);
  if (b.loading || p.loading) return <PageSkeleton />;
  if (b.error) return <ErrorState message={b.error} onRetry={b.reload} />;
  const paid = rows.reduce((a, r) => a + r.amountMinor, 0), refunded = rows.reduce((a, r) => a + r.refundMinor, 0);
  const tickets = rows.filter((r) => r.kind === "Tickets").reduce((a, r) => a + r.amountMinor - r.refundMinor, 0), parking = rows.filter((r) => r.kind === "Parking").reduce((a, r) => a + r.amountMinor - r.refundMinor, 0);
  return (
    <div className="space-y-6"><div className="flex flex-wrap items-center justify-between gap-3"><h1 className="text-3xl">Payments and receipts</h1><Button variant="outline" className="no-print" onClick={() => window.print()}><Printer className="h-4 w-4" aria-hidden />Print</Button></div>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4"><Stat label="Paid" value={inr(paid)} /><Stat label="Refunded" value={inr(refunded)} /><Stat label="Tickets (net)" value={inr(tickets)} /><Stat label="Parking prepaid (net)" value={inr(parking)} /></div>
      {rows.length === 0 ? <Empty title="No payments yet" action={<Link href="/destinations" className="rounded-lg bg-forest px-4 py-2 text-sm text-ivory">Book a visit</Link>}>Receipts for your tickets and parking will be listed here.</Empty> : (
        <Card className="overflow-hidden"><div className="overflow-x-auto"><table className="w-full min-w-[640px] text-sm"><caption className="sr-only">Payments</caption><thead className="bg-forest-50 text-left"><tr><th className="p-3 font-medium">Date</th><th className="p-3 font-medium">For</th><th className="p-3 font-medium">Reference</th><th className="p-3 text-right font-medium">Amount</th><th className="p-3 font-medium">Status</th><th className="p-3" /></tr></thead>
          <tbody>{rows.map((r) => <tr key={r.kind + r.id} className="border-t border-forest/10"><td className="p-3 whitespace-nowrap">{new Date(r.at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}</td><td className="p-3"><Badge className={r.kind === "Parking" ? "bg-amber-100 text-amber-900" : "bg-forest-50 text-forest"}>{r.kind}</Badge> <span className="ml-1">{r.what}</span></td><td className="p-3 font-mono text-xs">{r.ref}</td><td className="p-3 text-right font-medium">{inr(r.amountMinor)}{r.refundMinor > 0 && <span className="block text-xs font-normal text-ink/60">{inr(r.refundMinor)} refunded</span>}</td><td className="p-3"><StatusBadge s={r.status} /></td><td className="p-3 text-right">{r.href && <Link href={r.href} className="text-terracotta underline">Invoice</Link>}</td></tr>)}</tbody></table></div></Card>)}
      <p className="text-xs text-ink/60">Parking paid at the exit gate is settled on the spot with the car park staff and appears on your parking receipt there.</p>
    </div>
  );
}
