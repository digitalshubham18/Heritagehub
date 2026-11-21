"use client";
import { useState } from "react";
import { Download } from "lucide-react";
import { useApi } from "@/lib/hooks";
import { Card, ErrorState, Field, Input, PageSkeleton, Select } from "@/components/ui";
import { addDays, inr, todayIST } from "@/lib/utils";

export default function Settlements() {
  const [to, setTo] = useState(todayIST()); const [from, setFrom] = useState(addDays(todayIST(), -29)); const [dest, setDest] = useState("");
  const dests = useApi<any>("/api/destinations?all=1");
  const q = `from=${from}&to=${to}${dest ? `&destination=${dest}` : ""}`;
  const { data, loading, error, reload } = useApi<any>(`/api/admin/settlements?${q}`);
  const T = data?.totals || {};
  const Cell = ({ v, strong }: { v: number; strong?: boolean }) => <td className={`p-3 text-right tabular-nums ${strong ? "font-semibold" : ""}`}>{inr(v || 0)}</td>;
  return (
    <div className="space-y-6">
      <h1 className="text-3xl">Settlements and GST</h1>
      <p className="max-w-2xl text-sm text-ink/70">Money movement by destination for payments made in the period. Online payments are collected by HeritageHub: ticket value is payable to the operator, the convenience fee is platform revenue, and GST on that fee is a tax liability. Counter takings are collected by the operator directly and shown for reconciliation only.</p>
      <Card className="flex flex-wrap items-end gap-3 p-4">
        <Field label="From"><Input type="date" value={from} onChange={(e) => e.target.value && setFrom(e.target.value)} /></Field>
        <Field label="To"><Input type="date" value={to} onChange={(e) => e.target.value && setTo(e.target.value)} /></Field>
        <Field label="Destination"><Select value={dest} onChange={(e) => setDest(e.target.value)}><option value="">All destinations</option>{dests.data?.items?.map((d: any) => <option key={d._id} value={d._id}>{d.name}</option>)}</Select></Field>
        <a href={`/api/admin/settlements?${q}&format=csv`} className="ml-auto inline-flex h-10 items-center gap-2 rounded-lg border border-forest/30 px-3 text-sm text-forest hover:bg-forest-50"><Download className="h-4 w-4" aria-hidden />Download CSV</a>
      </Card>
      {error ? <ErrorState message={error} onRetry={reload} /> : loading || !data ? <PageSkeleton /> : (<>
        {data.failedRefunds > 0 && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-900">{data.failedRefunds} refund(s) in this period failed at the gateway and need to be refunded manually.</p>}
        <div className="grid gap-4 sm:grid-cols-3">
          <Card className="p-4"><p className="text-sm text-ink/70">Payout to operators</p><p className="font-display text-3xl">{inr(T.payoutMinor || 0)}</p><p className="text-xs text-ink/55">After {inr(T.commissionMinor || 0)} commission</p></Card>
          <Card className="p-4"><p className="text-sm text-ink/70">Net platform fee</p><p className="font-display text-3xl">{inr(T.platformFeeNetMinor || 0)}</p></Card>
          <Card className="p-4"><p className="text-sm text-ink/70">Net GST on fees</p><p className="font-display text-3xl">{inr(T.gstNetMinor || 0)}</p></Card>
        </div>
        <Card className="overflow-x-auto"><table className="w-full min-w-[1180px] text-sm"><caption className="sr-only">Settlement by destination</caption>
          <thead className="bg-forest-50 text-left"><tr><th className="p-3 font-medium">Destination</th><th className="p-3 text-right font-medium">Online bookings</th><th className="p-3 text-right font-medium">Ticket value</th><th className="p-3 text-right font-medium">Ticket refunds</th><th className="p-3 text-right font-medium">Operator share</th><th className="p-3 text-right font-medium">Commission</th><th className="p-3 text-right font-medium">Payout</th><th className="p-3 text-right font-medium">Net fee</th><th className="p-3 text-right font-medium">Net GST</th><th className="p-3 text-right font-medium">Counter cash</th><th className="p-3 text-right font-medium">Counter UPI/card</th><th className="p-3 text-right font-medium">Parking (gate)</th></tr></thead>
          <tbody>{data.items.length === 0 && <tr><td colSpan={12} className="p-6 text-center text-ink/60">No payments in this period.</td></tr>}
            {data.items.map((i: any) => <tr key={i.destinationId} className="border-t border-forest/10"><td className="p-3"><p className="font-medium">{i.destination}</p><p className="text-xs text-ink/55">{i.operatorName}</p></td><td className="p-3 text-right">{i.bookingsOnline}</td><Cell v={i.onlineTicketMinor} /><Cell v={i.onlineRefundTicketMinor} /><Cell v={i.netPayableToOperatorMinor} /><Cell v={i.commissionMinor} /><Cell v={i.payoutMinor} strong /><Cell v={i.platformFeeNetMinor} /><Cell v={i.gstNetMinor} /><Cell v={i.counterCashMinor} /><Cell v={i.counterUpiMinor + i.counterCardMinor} /><Cell v={i.parkingCollectedMinor} /></tr>)}
            {data.items.length > 0 && <tr className="border-t-2 border-forest/20 font-semibold"><td className="p-3">Total</td><td className="p-3 text-right">{T.bookingsOnline}</td><Cell v={T.onlineTicketMinor} /><Cell v={T.onlineRefundTicketMinor} /><Cell v={T.netPayableToOperatorMinor} /><Cell v={T.commissionMinor} /><Cell v={T.payoutMinor} strong /><Cell v={T.platformFeeNetMinor} /><Cell v={T.gstNetMinor} /><Cell v={T.counterCashMinor} /><Cell v={(T.counterUpiMinor || 0) + (T.counterCardMinor || 0)} /><Cell v={T.parkingCollectedMinor} /></tr>}</tbody></table></Card>
        {data.passes?.length > 0 && <Card className="p-5"><h2 className="text-lg">Season pass sales</h2><table className="mt-3 w-full text-sm"><caption className="sr-only">Pass sales by operator</caption><thead className="text-left text-ink/60"><tr><th className="py-1 font-medium">Operator</th><th className="py-1 text-right font-medium">Passes</th><th className="py-1 text-right font-medium">Pass value</th><th className="py-1 text-right font-medium">Fees</th><th className="py-1 text-right font-medium">GST</th></tr></thead><tbody>{data.passes.map((p: any) => <tr key={p.operatorName} className="border-t border-forest/10"><td className="py-1.5">{p.operatorName}</td><td className="text-right">{p.count}</td><td className="text-right">{inr(p.valueMinor)}</td><td className="text-right">{inr(p.feesMinor)}</td><td className="text-right">{inr(p.gstMinor)}</td></tr>)}</tbody></table><p className="mt-2 text-xs text-ink/60">Pass value is attributed to the operator that issued the pass (not split by site) and is not included in the table above.</p></Card>}
        <p className="text-xs text-ink/60">Settlement figures follow payment dates (IST). A full refund returns ticket value, fee and GST; a late partial refund returns ticket value only. Have an accountant confirm the treatment before relying on these reports.</p>
      </>)}
    </div>
  );
}
