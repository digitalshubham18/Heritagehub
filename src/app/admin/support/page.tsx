"use client";
import { useState } from "react";
import { toast } from "sonner";
import { api, useApi } from "@/lib/hooks";
import { Badge, Button, Card, Empty, ErrorState, Field, Input, PageSkeleton, Select, Stat, Textarea } from "@/components/ui";
import { SupportThread, supportTone } from "@/components/support-thread";

export default function AdminSupport() {
  const [status, setStatus] = useState("open"), [sel, setSel] = useState<string | null>(null);
  const list = useApi<any>(`/api/support?status=${status}`, { poll: 30000 });
  const one = useApi<any>(sel ? `/api/support?id=${sel}` : null);
  const [reply, setReply] = useState(""), [busy, setBusy] = useState(false);
  const sla = useApi<any>("/api/admin/support-sla", { poll: 60000 });
  const [tg, setTg] = useState<{ first: string; follow: string; digest: boolean } | null>(null);
  async function saveTargets() {
    if (!tg) return; setBusy(true);
    try { await api("/api/admin/support-sla", { method: "PUT", body: { operatorId: sla.data?.operator?.id, firstResponseHours: Number(tg.first), followUpHours: Number(tg.follow), digest: tg.digest } }); toast.success("Reply targets saved"); setTg(null); sla.reload(); list.reload(); } catch (e: any) { toast.error(e.message); } finally { setBusy(false); }
  }
  async function send(body: any) {
    setBusy(true);
    try { await api("/api/support", { method: "PATCH", body: { id: sel, ...body } }); setReply(""); one.reload(); list.reload(); toast.success("Saved"); } catch (e: any) { toast.error(e.message); } finally { setBusy(false); }
  }
  if (list.loading) return <PageSkeleton />;
  if (list.error) return <ErrorState message={list.error} onRetry={list.reload} />;
  const items: any[] = list.data.items, t = one.data?.ticket;
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3"><h1 className="text-3xl">Support</h1><div className="flex items-center gap-3"><Select aria-label="Status" className="w-44" value={status} onChange={(e) => { setStatus(e.target.value); setSel(null); }}><option value="open">Open</option><option value="in_progress">In progress</option><option value="resolved">Resolved</option><option value="closed">Closed</option><option value="all">All</option></Select><a className="text-sm text-terracotta underline" href="/api/admin/export?report=support&range=90">Export CSV</a></div></div>
      {sla.data && (
        <section aria-label="Reply targets" className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-4">
            <Stat label="Waiting for a reply" value={sla.data.summary.waiting} sub={sla.data.summary.oldestWaitingHours ? `oldest ${sla.data.summary.oldestWaitingHours} h` : undefined} />
            <Stat label="Past the target" value={sla.data.summary.overdue} tone={sla.data.summary.overdue ? "warn" : undefined} />
            <Stat label={`Median first reply (${sla.data.days} d)`} value={sla.data.summary.medianFirstResponseHours == null ? "n/a" : `${sla.data.summary.medianFirstResponseHours} h`} />
            <Stat label="Answered in time" value={sla.data.summary.withinTargetPct == null ? "n/a" : `${sla.data.summary.withinTargetPct}%`} sub={`target ${sla.data.targets.firstResponseHours} h first reply, ${sla.data.targets.followUpHours} h after`} />
          </div>
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <a className="text-terracotta underline" href="/api/admin/support-sla?format=csv&days=30">Download response-time report (CSV)</a>
            {sla.data.operator && !tg && <button className="text-terracotta underline" onClick={() => setTg({ first: String(sla.data.targets.firstResponseHours), follow: String(sla.data.targets.followUpHours), digest: sla.data.targets.digest !== false })}>Change targets</button>}
          </div>
          {tg && (
            <Card className="flex flex-wrap items-end gap-3 p-4">
              <Field label="First reply within (hours)"><Input type="number" min={1} max={720} value={tg.first} onChange={(e) => setTg({ ...tg, first: e.target.value })} className="w-28" /></Field>
              <Field label="Later replies within (hours)"><Input type="number" min={1} max={720} value={tg.follow} onChange={(e) => setTg({ ...tg, follow: e.target.value })} className="w-28" /></Field>
              <label className="flex items-center gap-2 pb-2 text-sm"><input type="checkbox" checked={tg.digest} onChange={(e) => setTg({ ...tg, digest: e.target.checked })} />Email managers a daily list of late tickets</label>
              <Button loading={busy} onClick={saveTargets}>Save</Button><Button variant="ghost" onClick={() => setTg(null)}>Cancel</Button>
            </Card>
          )}
        </section>
      )}
      <div className="grid gap-5 lg:grid-cols-[1fr_1.4fr]">
        <Card className="max-h-[70vh] overflow-auto">{items.length === 0 ? <Empty title="Nothing here">No {status === "all" ? "" : status.replace("_", " ")} tickets.</Empty> : <ul className="divide-y divide-forest/10">{items.map((x) => <li key={x._id}><button onClick={() => setSel(x._id)} className={`w-full p-4 text-left hover:bg-forest-50 ${sel === x._id ? "bg-forest-50" : ""}`}><div className="flex items-center justify-between gap-2"><span className="font-mono text-xs">{x.reference}</span><Badge className={supportTone[x.status]}>{x.status.replace("_", " ")}</Badge></div><p className="mt-1 font-medium">{x.subject}</p><p className="text-xs text-ink/60">{x.name} · {x.destination?.name || "No site"} · {x.category.replace("_", " ")}{x.lastFrom === "visitor" && x.status !== "closed" ? " · awaiting reply" : ""}</p>{x.sla?.overdue && <p className="mt-1 text-xs font-medium text-red-700">Past target by {x.sla.overdueByHours} h</p>}</button></li>)}</ul>}</Card>
        <Card className="p-5">{!sel ? <p className="text-sm text-ink/60">Choose a ticket to read and answer it.</p> : !t ? <p className="text-sm text-ink/60">Loading…</p> : (
          <div className="space-y-4"><div className="flex flex-wrap items-start justify-between gap-2"><div><h2 className="text-xl">{t.subject}</h2><p className="text-sm text-ink/65">{t.reference} · {t.name} ({t.email}){t.bookingRef ? ` · booking ${t.bookingRef}` : ""}</p></div><Badge className={supportTone[t.status]}>{t.status.replace("_", " ")}</Badge></div>
            <SupportThread messages={t.messages} />
            {t.status !== "closed" && <div className="space-y-2"><label htmlFor="sr" className="sr-only">Reply</label><Textarea id="sr" value={reply} onChange={(e) => setReply(e.target.value)} maxLength={2000} placeholder="Write a reply. The visitor gets it by email and sees it in their account." />
              <div className="flex flex-wrap justify-end gap-2"><Button variant="outline" disabled={busy} onClick={() => send({ status: "resolved" })}>Mark resolved</Button><Button variant="ghost" disabled={busy} onClick={() => send({ status: "closed" })}>Close</Button><Button loading={busy} disabled={reply.trim().length < 2} onClick={() => send({ body: reply })}>Send reply</Button></div></div>}
          </div>)}</Card>
      </div>
    </div>
  );
}
