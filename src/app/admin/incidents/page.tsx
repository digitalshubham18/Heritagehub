"use client";
import { useState } from "react";
import { toast } from "sonner";
import { api, useApi } from "@/lib/hooks";
import { Badge, Button, Card, Empty, ErrorState, Field, Input, PageSkeleton, StatusBadge } from "@/components/ui";
import { cn } from "@/lib/utils";

const CAT: Record<string, string> = { medical: "Medical", lost_child: "Lost child or person", security: "Security", crowd: "Crowd", maintenance: "Maintenance", other: "Other" };
const when = (d: string) => new Date(d).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

/** SMS escalation: if nobody acknowledges an open incident in time, managers' phones get a text; later, platform admins too. */
function Escalation() {
  const e = useApi<any>("/api/admin/escalation");
  const [f, setF] = useState<any>(null), [busy, setBusy] = useState(false);
  const cur = f || (e.data ? { enabled: e.data.enabled, firstAfterMin: e.data.firstAfterMin, secondAfterMin: e.data.secondAfterMin, phones: (e.data.phones || []).join(", ") } : null);
  if (e.error) return <p className="text-sm text-ink/60">SMS escalation settings: {e.error}</p>;
  if (!cur) return null;
  async function save() {
    setBusy(true);
    try { await api("/api/admin/escalation", { method: "PUT", body: { operatorId: e.data.operator?.id, enabled: cur.enabled, firstAfterMin: Number(cur.firstAfterMin), secondAfterMin: Number(cur.secondAfterMin), phones: String(cur.phones).split(/[,\n]/).map((x) => x.trim()).filter(Boolean) } }); toast.success("Escalation settings saved"); setF(null); e.reload(); }
    catch (x: any) { toast.error(x.issues?.[0]?.message || x.message); } finally { setBusy(false); }
  }
  return (
    <Card className="space-y-3 p-5"><div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-lg">SMS escalation</h2>{!e.data.smsConfigured && <Badge className="bg-amber-100 text-amber-900">SMS provider not configured: messages are only logged</Badge>}</div>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="accent-forest" checked={cur.enabled} onChange={(x) => setF({ ...cur, enabled: x.target.checked })} />Text managers when an incident isn&apos;t acknowledged</label>
      <div className="grid gap-3 sm:grid-cols-3"><Field label="First SMS after (minutes)" hint="Critical incidents. Warnings wait twice as long."><Input type="number" min={2} max={120} value={cur.firstAfterMin} onChange={(x) => setF({ ...cur, firstAfterMin: x.target.value })} /></Field><Field label="Second SMS after (minutes)" hint="Also goes to platform admins"><Input type="number" min={3} max={240} value={cur.secondAfterMin} onChange={(x) => setF({ ...cur, secondAfterMin: x.target.value })} /></Field><Field label="Extra phone numbers" hint="Comma separated, e.g. an on-call duty manager"><Input value={cur.phones} onChange={(x) => setF({ ...cur, phones: x.target.value })} /></Field></div>
      <div className="flex items-center justify-between gap-2"><p className="text-xs text-ink/60">Texts go to every manager account of this operator that has a phone number, plus the numbers above. Acknowledging an incident stops further texts.</p><Button loading={busy} disabled={!f} onClick={save}>Save</Button></div></Card>
  );
}

export default function Incidents() {
  const [st, setSt] = useState<"active" | "resolved">("active");
  const { data, loading, error, reload } = useApi<any>(`/api/incidents?status=${st}`, { poll: 15000 });
  const [note, setNote] = useState<Record<string, string>>({});
  async function act(id: string, status: string) { try { await api("/api/incidents", { method: "PATCH", body: { id, status, note: note[id] || undefined } }); toast.success(status === "resolved" ? "Marked resolved" : "Acknowledged"); setNote((n) => ({ ...n, [id]: "" })); reload(); } catch (e: any) { toast.error(e.message); } }
  return (
    <div className="space-y-6"><div><h1 className="text-3xl">Incidents</h1><p className="mt-1 text-sm text-ink/70">Reports raised by gate and counter staff. Acknowledge so staff know help is coming, then resolve with a note.</p></div>
      <Escalation />
      <div className="flex flex-wrap items-center justify-between gap-3"><div role="tablist" aria-label="Incident filter" className="inline-flex rounded-full border border-forest/15 bg-white p-1">{([["active", "Open"], ["resolved", "Resolved"]] as const).map(([k, l]) => <button key={k} role="tab" aria-selected={st === k} onClick={() => setSt(k)} className={cn("rounded-full px-4 py-1.5 text-sm", st === k ? "bg-forest text-ivory" : "text-forest")}>{l}</button>)}</div><a className="text-sm text-terracotta underline" href="/api/incidents?status=all&format=csv">Export all incidents (CSV)</a></div>
      {error ? <ErrorState message={error} onRetry={reload} /> : loading ? <PageSkeleton /> : data.items.length === 0 ? <Empty title={st === "active" ? "No open incidents" : "Nothing resolved yet"} /> : <div className="space-y-3">{data.items.map((i: any) => (
        <Card key={i._id} className={cn("space-y-3 p-4", i.severity === "critical" && i.status !== "resolved" && "border-red-300")}>
          <div className="flex flex-wrap items-center justify-between gap-2"><span className="flex flex-wrap items-center gap-2">{i.escalationLevel > 0 && <Badge className="bg-red-100 text-red-900">SMS sent (level {i.escalationLevel})</Badge>}<Badge className={i.severity === "critical" ? "bg-red-100 text-red-900" : "bg-amber-100 text-amber-900"}>{CAT[i.category]}</Badge><span className="text-sm font-medium">{i.destination?.name}</span></span><StatusBadge s={i.status} /></div>
          <p className="text-sm">{i.message}</p><p className="text-xs text-ink/60">Reported by {i.reporterName} · {when(i.createdAt)}</p>
          {i.history?.length > 1 && <ul className="space-y-0.5 text-xs text-ink/65">{i.history.map((h: any, k: number) => <li key={k}>{when(h.at)} · {h.event}{h.by ? ` by ${h.by}` : ""}{h.note ? `: ${h.note}` : ""}</li>)}</ul>}
          {i.status !== "resolved" ? <div className="flex flex-wrap items-center gap-2">{i.status === "open" && <Button size="sm" variant="outline" onClick={() => act(i._id, "acknowledged")}>Acknowledge</Button>}<label className="sr-only" htmlFor={`n${i._id}`}>Resolution note</label><Input id={`n${i._id}`} className="h-8 max-w-xs text-sm" placeholder="What was done?" value={note[i._id] || ""} onChange={(e) => setNote({ ...note, [i._id]: e.target.value })} /><Button size="sm" disabled={(note[i._id] || "").trim().length < 3} onClick={() => act(i._id, "resolved")}>Resolve</Button></div> : i.resolutionNote && <p className="rounded bg-emerald-50 p-2 text-sm text-emerald-900">Resolved: {i.resolutionNote}</p>}
        </Card>))}</div>}
    </div>
  );
}
