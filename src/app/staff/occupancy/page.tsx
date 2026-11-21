"use client";
import { useState } from "react";
import { Minus, Plus, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { api, useApi } from "@/lib/hooks";
import { Button, Card, Empty, ErrorState, Input, PageSkeleton } from "@/components/ui";
import { DensityBar } from "@/components/crowd";
import { classify } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";

/** Staff headcount: tap clicker-style +/- for people through a door, or set the exact number inside after a walk-round. */
function CountControls({ id, onDone }: { id: string; onDone: () => void }) {
  const [n, setN] = useState(""); const [busy, setBusy] = useState(false);
  async function send(body: any, msg: string) {
    setBusy(true);
    try { await api("/api/crowd/count", { body: { destinationId: id, ...body } }); toast.success(msg); onDone(); }
    catch (e: any) { toast.error(e.message); } finally { setBusy(false); }
  }
  return (
    <div className="space-y-2 rounded-xl border border-forest/10 bg-forest/5 p-3">
      <h3 className="text-base">Count people (no ticket needed)</h3>
      <div className="flex flex-wrap items-center gap-2">
        <Button disabled={busy} onClick={() => send({ in: 1 }, "+1 entered")}><Plus className="h-4 w-4" aria-hidden />1 in</Button>
        <Button variant="outline" disabled={busy} onClick={() => send({ in: 10 }, "+10 entered")}>+10 in</Button>
        <Button variant="outline" disabled={busy} onClick={() => send({ out: 1 }, "1 left")}><Minus className="h-4 w-4" aria-hidden />1 out</Button>
        <Button variant="outline" disabled={busy} onClick={() => send({ out: 10 }, "10 left")}>10 out</Button>
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <div className="text-sm"><label htmlFor={`inside-${id}`} className="block">Exact number inside now</label><Input id={`inside-${id}`} type="number" min={0} value={n} onChange={(e) => setN(e.target.value)} className="mt-1 w-40" /></div>
        <Button variant="outline" disabled={busy || n === ""} onClick={() => send({ inside: Number(n) }, "Headcount set")}>Set count</Button>
      </div>
    </div>
  );
}

export default function Occupancy() {
  const { t } = useI18n();
  const { data, loading, error, reload } = useApi<any>("/api/entries", { poll: 5000 });
  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between"><h1 className="text-3xl">{t("occ.title")}</h1><p className="flex items-center gap-1 text-sm text-ink/60"><RefreshCw className="h-3.5 w-3.5" aria-hidden />Updates every 5 seconds{data?.at && `, last ${new Date(data.at).toLocaleTimeString("en-IN")}`}</p></div>
      <p className="text-sm text-ink/70">The number inside is the real headcount when door people-counters or staff counts are reporting. Otherwise it only reflects tickets and passes scanned at the gate.</p>
      {error ? <ErrorState message={error} onRetry={reload} /> : loading ? <PageSkeleton /> : !data.items.length ? <Empty title="No sites assigned" /> : data.items.map((s: any) => (
        <Card key={s.id} className="space-y-4 p-5">
          <div className="flex flex-wrap items-end justify-between gap-2"><h2 className="text-xl">{s.name}</h2><p className="font-display text-4xl" aria-live="polite">{s.occupancy}<span className="text-lg text-ink/60"> / {s.limit}</span></p></div>
          <p className="text-xs text-ink/65">{s.source === "headcount" ? `Real headcount. Tickets scanned inside: ${s.ticketOccupancy}.` : "Ticket scans only. Use the counter below to record everyone else."}</p>
          <DensityBar pct={s.pct} level={classify(s.pct)} />
          <CountControls id={s.id} onDone={reload} />
          {s.overThreshold && <p role="alert" className="rounded bg-red-50 p-2 text-sm text-red-800">Above the alert threshold ({s.pct}% of limit).</p>}
          {s.alerts.map((a: any) => <p key={a._id} className="rounded bg-amber-50 p-2 text-sm text-amber-900">{a.message}</p>)}
          <div><h3 className="text-base">Recent entries and exits</h3>{s.recent.length ? <ul className="mt-2 divide-y divide-forest/10 text-sm">{s.recent.map((r: any) => <li key={r.id} className="flex justify-between py-1.5"><span>{r.type === "in" ? "Entered" : "Exited"} {r.quantity} <span className="font-mono text-xs text-ink/60">{r.reference}</span></span><span className="text-ink/60">{new Date(r.at).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}</span></li>)}</ul> : <p className="mt-1 text-sm text-ink/60">No movements recorded today.</p>}</div>
        </Card>))}
    </div>
  );
}
