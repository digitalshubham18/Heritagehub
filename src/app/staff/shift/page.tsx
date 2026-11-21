"use client";
import { useState } from "react";
import { toast } from "sonner";
import { Printer } from "lucide-react";
import { api, useApi } from "@/lib/hooks";
import { Button, Card, ErrorState, Field, Input, PageSkeleton, Select, Textarea } from "@/components/ui";
import { useTx } from "@/lib/i18n";
import { cn, inr } from "@/lib/utils";

const when = (d?: string) => (d ? new Date(d).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "start of day");

export default function Shift() {
  const tx = useTx();
  const sites = useApi<any>("/api/entries");
  const [siteId, setSiteId] = useState("");
  const site = sites.data?.items?.find((s: any) => s.id === siteId) || sites.data?.items?.[0];
  const t = useApi<any>(site ? `/api/staff/shift?destination=${site.id}` : null, { poll: 30000 });
  const hist = useApi<any>("/api/staff/shift?history=1");
  const [counted, setCounted] = useState(""), [notes, setNotes] = useState(""), [busy, setBusy] = useState(false), [done, setDone] = useState<any>(null);
  const countedMinor = Math.round(Number(counted || 0) * 100);
  const variance = t.data ? countedMinor - t.data.expectedCashMinor : 0;
  async function close() {
    setBusy(true);
    try { const r = await api("/api/staff/shift", { body: { destinationId: site.id, countedCashMinor: countedMinor, notes: notes || undefined } }); setDone({ ...r.report, siteName: site.name }); setCounted(""); setNotes(""); t.reload(); hist.reload(); toast.success("Cash count recorded"); }
    catch (e: any) { toast.error(e.message); } finally { setBusy(false); }
  }
  if (sites.loading) return <PageSkeleton />;
  if (sites.error) return <ErrorState message={sites.error} onRetry={sites.reload} />;
  if (!site) return <p>{tx("No sites assigned.")}</p>;
  const d = t.data;
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3"><h1 className="text-3xl">{tx("Shift and cash")}</h1>{sites.data.items.length > 1 && <Select aria-label={tx("Site")} className="w-56" value={site.id} onChange={(e) => { setSiteId(e.target.value); setDone(null); }}>{sites.data.items.map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select>}</div>
      {done ? (
        <Card className="space-y-3 p-5 print-area"><h2 className="text-xl">{tx("Cash count recorded")}</h2><p className="text-sm text-ink/70">{done.siteName} · {done.userName} · {when(done.createdAt)}</p>
          <dl className="grid grid-cols-2 gap-2 text-sm sm:max-w-md"><dt className="text-ink/60">{tx("System expected")}</dt><dd>{inr(done.expectedCashMinor)}</dd><dt className="text-ink/60">{tx("You counted")}</dt><dd>{inr(done.countedCashMinor)}</dd><dt className="text-ink/60">{tx("Difference")}</dt><dd className={cn("font-medium", done.varianceMinor < 0 ? "text-red-800" : done.varianceMinor > 0 ? "text-amber-800" : "text-emerald-800")}>{done.varianceMinor === 0 ? "Matches" : `${done.varianceMinor > 0 ? "Over" : "Short"} by ${inr(Math.abs(done.varianceMinor))}`}</dd></dl>
          <div className="no-print flex gap-2"><Button variant="outline" onClick={() => window.print()}><Printer className="h-4 w-4" aria-hidden />{tx("Print")}</Button><Button onClick={() => setDone(null)}>{tx("Back")}</Button></div></Card>
      ) : d ? (
        <div className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
          <Card className="space-y-4 p-5"><div><h2 className="text-lg">Taken since {when(d.lastCountAt || d.since)}</h2><p className="text-sm text-ink/70">Your own counter sales and parking payments at {site.name}.</p></div>
            <table className="w-full text-sm"><caption className="sr-only">{tx("Takings by payment method")}</caption><thead className="text-left text-ink/60"><tr><th className="py-1 font-medium">{tx("Method")}</th><th className="py-1 text-right font-medium">{tx("Tickets")}</th><th className="py-1 text-right font-medium">{tx("Parking")}</th><th className="py-1 text-right font-medium">{tx("Total")}</th></tr></thead>
              <tbody>{(["cash", "upi", "card"] as const).map((m) => <tr key={m} className="border-t border-forest/10"><th scope="row" className="py-2 text-left font-normal capitalize">{m}</th><td className="text-right">{inr(d.counter[m] || 0)}</td><td className="text-right">{inr(d.parking[m] || 0)}</td><td className="text-right font-medium">{inr((d.counter[m] || 0) + (d.parking[m] || 0))}</td></tr>)}</tbody></table>
            {d.openingFloatMinor > 0 && <p className="text-sm text-ink/70">Includes {inr(d.openingFloatMinor)} opening float accepted in a handover.</p>}<p className="text-sm text-ink/70">{d.tickets} tickets in {d.sales} sales · {d.parkingExits} vehicles checked out</p>
            <div className="rounded-xl bg-ivory-100 p-4"><p className="text-sm text-ink/70">{tx("Cash you should be holding")}</p><p className="font-display text-4xl">{inr(d.expectedCashMinor)}</p></div></Card>
          <Card className="space-y-4 p-5"><h2 className="text-lg">{tx("Count your cash")}</h2>
            <Field label={tx("Cash counted in the drawer (₹)")}><Input inputMode="decimal" value={counted} onChange={(e) => setCounted(e.target.value.replace(/[^\d.]/g, ""))} className="h-12 text-lg" /></Field>
            {counted !== "" && <p aria-live="polite" className={cn("rounded-lg p-3 text-sm font-medium", variance === 0 ? "bg-emerald-50 text-emerald-900" : variance < 0 ? "bg-red-50 text-red-900" : "bg-amber-50 text-amber-900")}>{variance === 0 ? "Matches the system." : `${variance > 0 ? "Over" : "Short"} by ${inr(Math.abs(variance))}`}</p>}
            {counted !== "" && variance !== 0 && <Field label={tx("Why is there a difference?")} hint={tx("Required when the count doesn't match")}><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={500} /></Field>}
            <Button className="w-full" loading={busy} disabled={counted === "" || (variance !== 0 && notes.trim().length < 3)} onClick={close}>{tx("Record cash count")}</Button>
            <p className="text-xs text-ink/60">{tx("Recording a count starts a new tally from now. Managers can see every count.")}</p></Card>
        </div>) : <PageSkeleton />}
      <Card className="overflow-hidden"><h2 className="border-b border-forest/10 p-4 text-lg">{tx("Recent cash counts")}</h2>
        <div className="overflow-x-auto"><table className="w-full min-w-[520px] text-sm"><caption className="sr-only">{tx("Recent cash counts")}</caption><thead className="bg-forest-50 text-left"><tr><th className="p-3 font-medium">{tx("When")}</th><th className="p-3 font-medium">{tx("Site")}</th><th className="p-3 text-right font-medium">{tx("Expected")}</th><th className="p-3 text-right font-medium">{tx("Counted")}</th><th className="p-3 text-right font-medium">{tx("Difference")}</th></tr></thead>
          <tbody>{(hist.data?.items || []).length === 0 && <tr><td colSpan={5} className="p-6 text-center text-ink/60">{tx("No counts yet.")}</td></tr>}{(hist.data?.items || []).map((x: any) => <tr key={x._id} className="border-t border-forest/10"><td className="p-3">{when(x.createdAt)}</td><td className="p-3">{x.destination?.name}</td><td className="p-3 text-right">{inr(x.expectedCashMinor)}</td><td className="p-3 text-right">{inr(x.countedCashMinor)}</td><td className={cn("p-3 text-right font-medium", x.varianceMinor < 0 ? "text-red-800" : x.varianceMinor > 0 ? "text-amber-800" : "text-emerald-800")}>{x.varianceMinor === 0 ? "Matches" : inr(x.varianceMinor)}</td></tr>)}</tbody></table></div></Card>
    </div>
  );
}
