"use client";
import { useState } from "react";
import { toast } from "sonner";
import { Megaphone } from "lucide-react";
import { api, useApi } from "@/lib/hooks";
import { Badge, Button, Card, Empty, ErrorState, Field, Input, PageSkeleton, Select, Textarea, useConfirm } from "@/components/ui";

const SEV: Record<string, string> = { info: "bg-sky-100 text-sky-900", warning: "bg-amber-100 text-amber-900", critical: "bg-red-100 text-red-900" };
const AUD: Record<string, string> = { all: "Visitors and staff", visitors: "Visitors only", staff: "Staff only" };
export default function Announcements() {
  const list = useApi<any>("/api/admin/announcements"), dests = useApi<any>("/api/destinations?all=1");
  const [f, setF] = useState({ title: "", body: "", severity: "info", audience: "all", destinationId: "", endsAt: "" }), [busy, setBusy] = useState(false);
  const { confirm, dialog } = useConfirm();
  async function publish() {
    setBusy(true);
    try { await api("/api/admin/announcements", { body: { title: f.title, body: f.body, severity: f.severity, audience: f.audience, destinationIds: f.destinationId ? [f.destinationId] : [], endsAt: f.endsAt ? new Date(f.endsAt).toISOString() : undefined } }); toast.success("Published"); setF({ ...f, title: "", body: "", endsAt: "" }); list.reload(); }
    catch (e: any) { toast.error(e.message); } finally { setBusy(false); }
  }
  async function toggle(a: any) { try { await api("/api/admin/announcements", { method: "PATCH", body: { id: a._id, active: !a.active } }); list.reload(); } catch (e: any) { toast.error(e.message); } }
  async function del(a: any) { if (!(await confirm({ title: "Delete this announcement?", body: a.title, confirmLabel: "Delete", danger: true }))) return; try { await api(`/api/admin/announcements?id=${a._id}`, { method: "DELETE" }); list.reload(); } catch (e: any) { toast.error(e.message); } }
  return (
    <div className="space-y-6">{dialog}<div><h1 className="text-3xl">Announcements</h1><p className="mt-1 max-w-2xl text-sm text-ink/70">Post a notice for visitors (shown on the destination page, the crowd page and in their dashboard) and/or staff (shown on their Today page). Use it for closures, delays, events and safety messages.</p></div>
      <Card className="space-y-4 p-5"><h2 className="flex items-center gap-2 text-lg"><Megaphone className="h-5 w-5 text-terracotta" aria-hidden />New announcement</h2>
        <div className="grid gap-4 md:grid-cols-2"><Field label="Title" className="md:col-span-2"><Input value={f.title} maxLength={120} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="e.g. Main hall closed for cleaning until 2 pm" /></Field>
          <Field label="Details (optional)" className="md:col-span-2"><Textarea value={f.body} maxLength={800} onChange={(e) => setF({ ...f, body: e.target.value })} /></Field>
          <Field label="Site"><Select value={f.destinationId} onChange={(e) => setF({ ...f, destinationId: e.target.value })}><option value="">All my sites</option>{dests.data?.items?.map((d: any) => <option key={d._id} value={d._id}>{d.name}</option>)}</Select></Field>
          <Field label="Audience"><Select value={f.audience} onChange={(e) => setF({ ...f, audience: e.target.value })}>{Object.entries(AUD).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Select></Field>
          <Field label="Importance"><Select value={f.severity} onChange={(e) => setF({ ...f, severity: e.target.value })}><option value="info">Information</option><option value="warning">Warning</option><option value="critical">Critical</option></Select></Field>
          <Field label="Hide automatically after (optional)"><Input type="datetime-local" value={f.endsAt} onChange={(e) => setF({ ...f, endsAt: e.target.value })} /></Field></div>
        <Button loading={busy} disabled={f.title.trim().length < 3} onClick={publish}>Publish</Button></Card>
      {list.error ? <ErrorState message={list.error} onRetry={list.reload} /> : list.loading ? <PageSkeleton /> : list.data.items.length === 0 ? <Empty title="No announcements yet" /> : <div className="space-y-3">{list.data.items.map((a: any) => (
        <Card key={a._id} className="flex flex-wrap items-start justify-between gap-3 p-4"><div className="min-w-0"><p className="flex flex-wrap items-center gap-2 font-medium">{a.title}<Badge className={SEV[a.severity]}>{a.severity}</Badge><Badge className="bg-stone-100">{AUD[a.audience]}</Badge>{!a.active && <Badge className="bg-stone-200">Hidden</Badge>}</p>{a.body && <p className="mt-1 text-sm text-ink/80">{a.body}</p>}<p className="mt-1 text-xs text-ink/60">{a.destinations?.length ? a.destinations.map((d: any) => d.name).join(", ") : "All sites"} · {new Date(a.createdAt).toLocaleDateString("en-IN")}{a.endsAt ? ` · until ${new Date(a.endsAt).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}` : ""}</p></div>
          <div className="flex gap-2"><Button size="sm" variant="outline" onClick={() => toggle(a)}>{a.active ? "Hide" : "Show"}</Button><Button size="sm" variant="ghost" onClick={() => del(a)}>Delete</Button></div></Card>))}</div>}
    </div>
  );
}
