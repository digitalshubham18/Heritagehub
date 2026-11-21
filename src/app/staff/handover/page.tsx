"use client";
import { useState } from "react";
import { toast } from "sonner";
import { ArrowRight, TriangleAlert } from "lucide-react";
import { api, useApi } from "@/lib/hooks";
import { Badge, Button, Card, ErrorState, Field, Input, PageSkeleton, Select, Textarea } from "@/components/ui";
import { useTx } from "@/lib/i18n";
import { cn, inr } from "@/lib/utils";

const when = (d?: string) => (d ? new Date(d).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "");

export default function Handover() {
  const tx = useTx();
  const sites = useApi<any>("/api/entries");
  const [siteId, setSiteId] = useState("");
  const site = sites.data?.items?.find((s: any) => s.id === siteId) || sites.data?.items?.[0];
  const h = useApi<any>(site ? `/api/staff/handover?destination=${site.id}` : null, { poll: 20000 });
  const t = useApi<any>(site ? `/api/staff/shift?destination=${site.id}` : null);
  const [to, setTo] = useState(""), [counted, setCounted] = useState(""), [notes, setNotes] = useState(""), [busy, setBusy] = useState(false);
  const [recv, setRecv] = useState<Record<string, { cash: string; note: string }>>({});
  const countedMinor = Math.round(Number(counted || 0) * 100), variance = t.data ? countedMinor - t.data.expectedCashMinor : 0;
  async function send() {
    setBusy(true);
    try { await api("/api/staff/handover", { body: { destinationId: site.id, toUserId: to, countedCashMinor: countedMinor, notes: notes || undefined } }); toast.success("Handover sent. Your cash count is recorded."); setCounted(""); setNotes(""); setTo(""); h.reload(); t.reload(); }
    catch (e: any) { toast.error(e.message); } finally { setBusy(false); }
  }
  async function act(id: string, action: "accept" | "cancel") {
    const r = recv[id] || { cash: "", note: "" };
    try { await api("/api/staff/handover", { method: "PATCH", body: { id, action, receivedCashMinor: action === "accept" ? Math.round(Number(r.cash || 0) * 100) : undefined, notes: r.note || undefined } }); toast.success(action === "accept" ? "Handover accepted. The float is now in your drawer." : "Handover cancelled"); h.reload(); t.reload(); }
    catch (e: any) { toast.error(e.message); }
  }
  if (sites.loading) return <PageSkeleton />;
  if (sites.error) return <ErrorState message={sites.error} onRetry={sites.reload} />;
  if (!site) return <p>{tx("No sites assigned.")}</p>;
  const d = h.data, ex = t.data;
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3"><div><h1 className="text-3xl">{tx("Shift handover")}</h1><p className="mt-1 text-sm text-ink/70">{tx("Count your cash, brief the next person, and hand the drawer over. They count it again and accept.")}</p></div>{sites.data.items.length > 1 && <Select aria-label={tx("Site")} className="w-56" value={site.id} onChange={(e) => setSiteId(e.target.value)}>{sites.data.items.map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select>}</div>

      {(d?.incoming || []).map((x: any) => {
        const r = recv[x._id] || { cash: "", note: "" }, diff = Math.round(Number(r.cash || 0) * 100) - x.handedCashMinor;
        return (
          <Card key={x._id} className="space-y-4 border-2 border-terracotta/40 p-5" aria-label={`Handover from ${x.fromName}`}>
            <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-xl">{x.fromName} is handing over to you</h2><Badge className="bg-amber-100 text-amber-900">Waiting for you · {when(x.createdAt)}</Badge></div>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2 text-sm"><p>{tx("Cash handed over:")} <strong className="text-lg">{inr(x.handedCashMinor)}</strong></p>
                {x.varianceMinor !== 0 && <p className="flex items-center gap-1 text-red-800"><TriangleAlert className="h-4 w-4" aria-hidden />Their own count was {x.varianceMinor < 0 ? "short" : "over"} by {inr(Math.abs(x.varianceMinor))}</p>}
                <p>{x.snapshot?.vehiclesParked ?? 0} vehicles parked · {x.snapshot?.insideNow ?? 0} visitors inside</p>
                {x.snapshot?.entryPaused && <p className="font-medium text-red-800">Entry is paused{x.snapshot.entryPausedReason ? `: ${x.snapshot.entryPausedReason}` : ""}</p>}
                {x.snapshot?.openIncidents?.length > 0 && <div><p className="font-medium">{tx("Open incidents")}</p><ul className="list-disc pl-5">{x.snapshot.openIncidents.map((i: any) => <li key={i.id} className={i.severity === "critical" ? "text-red-800" : ""}>{i.message} ({i.status})</li>)}</ul></div>}
                {x.notes && <div className="rounded-lg bg-ivory-100 p-3"><p className="text-xs text-ink/60">Notes from {x.fromName}</p><p className="whitespace-pre-wrap">{x.notes}</p></div>}</div>
              <div className="space-y-3"><Field label={tx("Cash you counted in the drawer (₹)")}><Input inputMode="decimal" className="h-12 text-lg" value={r.cash} onChange={(e) => setRecv({ ...recv, [x._id]: { ...r, cash: e.target.value.replace(/[^\d.]/g, "") } })} /></Field>
                {r.cash !== "" && <p aria-live="polite" className={cn("rounded-lg p-2 text-sm font-medium", diff === 0 ? "bg-emerald-50 text-emerald-900" : "bg-amber-50 text-amber-900")}>{diff === 0 ? "Matches what was handed over." : `${diff > 0 ? "Over" : "Short"} by ${inr(Math.abs(diff))}. Add a note.`}</p>}
                {(diff !== 0 && r.cash !== "") && <Field label={tx("Note")}><Input value={r.note} onChange={(e) => setRecv({ ...recv, [x._id]: { ...r, note: e.target.value } })} maxLength={400} /></Field>}
                <Button variant="accent" className="w-full" disabled={r.cash === "" || (diff !== 0 && r.note.trim().length < 3)} onClick={() => act(x._id, "accept")}>{tx("Accept the handover")}</Button></div>
            </div>
          </Card>);
      })}

      <div className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
        <Card className="space-y-4 p-5"><h2 className="text-lg">{tx("Hand over your shift")}</h2>
          {(d?.outgoing || []).length > 0 ? (d.outgoing as any[]).map((x) => <div key={x._id} className="rounded-xl bg-ivory-100 p-4 text-sm"><p>{tx("Waiting for")} <strong>{x.toName}</strong> to accept: {inr(x.handedCashMinor)} sent {when(x.createdAt)}.</p><Button size="sm" variant="outline" className="mt-2" onClick={() => act(x._id, "cancel")}>{tx("Cancel handover")}</Button></div>) : (<>
            {ex && <div className="rounded-xl bg-ivory-100 p-4"><p className="text-sm text-ink/70">{tx("Cash you should be holding")}</p><p className="font-display text-3xl">{inr(ex.expectedCashMinor)}</p>{ex.openingFloatMinor > 0 && <p className="text-xs text-ink/60">Includes {inr(ex.openingFloatMinor)} opening float</p>}</div>}
            <Field label={tx("Hand over to")}><Select value={to} onChange={(e) => setTo(e.target.value)}><option value="">{tx("Choose a colleague…")}</option>{(d?.colleagues || []).map((c: any) => <option key={c._id} value={c._id}>{c.name}</option>)}</Select></Field>
            <Field label={tx("Cash counted in the drawer (₹)")}><Input inputMode="decimal" className="h-12 text-lg" value={counted} onChange={(e) => setCounted(e.target.value.replace(/[^\d.]/g, ""))} /></Field>
            {counted !== "" && ex && <p aria-live="polite" className={cn("rounded-lg p-3 text-sm font-medium", variance === 0 ? "bg-emerald-50 text-emerald-900" : variance < 0 ? "bg-red-50 text-red-900" : "bg-amber-50 text-amber-900")}>{variance === 0 ? "Matches the system." : `${variance > 0 ? "Over" : "Short"} by ${inr(Math.abs(variance))}. Explain it in the notes.`}</p>}
            <Field label={tx("Notes for the next person")} hint={tx("Anything unfinished: a jammed printer, a visitor coming back, a gate left closed")}><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={600} /></Field>
            <Button variant="accent" size="lg" className="w-full" loading={busy} disabled={!to || counted === "" || (variance !== 0 && notes.trim().length < 3)} onClick={send}>{tx("Count, record and hand over")} <ArrowRight className="h-4 w-4" aria-hidden /></Button>
            <p className="text-xs text-ink/60">{tx("This records your cash count, so you don't need to close it separately. Open incidents, parked vehicles and the entry status are attached automatically.")}</p></>)}
        </Card>
        <Card className="p-5"><h2 className="text-lg">{tx("Recent handovers")}</h2>
          {(d?.recent || []).length === 0 ? <p className="mt-2 text-sm text-ink/60">{tx("Nothing yet.")}</p> : <ul className="mt-2 divide-y divide-forest/10 text-sm">{d.recent.map((x: any) => <li key={x._id} className="py-2"><p>{x.fromName} → {x.toName} <Badge className={x.status === "accepted" ? "bg-emerald-100 text-emerald-900" : "bg-stone-100"}>{x.status}</Badge></p><p className="text-xs text-ink/60">{when(x.createdAt)} · {inr(x.handedCashMinor)}{x.status === "accepted" && x.receiveVarianceMinor ? ` · receiver counted ${x.receiveVarianceMinor < 0 ? "short" : "over"} ${inr(Math.abs(x.receiveVarianceMinor))}` : ""}</p></li>)}</ul>}
        </Card>
      </div>
    </div>
  );
}
