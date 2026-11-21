"use client";
import { useState } from "react";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { api, useApi } from "@/lib/hooks";
import { useI18n } from "@/lib/i18n";
import { Badge, Button, Card, Empty, ErrorState, Field, Input, Modal, PageSkeleton, Select, Textarea } from "@/components/ui";
import { SupportThread, supportTone } from "@/components/support-thread";

const CATS = ["booking", "payment", "parking", "accessibility", "lost_property", "other"] as const;
export default function Support() {
  const { t: tr } = useI18n();
  const list = useApi<any>("/api/support?mine=1", { poll: 30000 });
  const [sel, setSel] = useState<string | null>(null);
  const one = useApi<any>(sel ? `/api/support?mine=1&id=${sel}` : null, { poll: 20000 });
  const [open, setOpen] = useState(false), [busy, setBusy] = useState(false), [reply, setReply] = useState("");
  const [f, setF] = useState({ category: "booking", subject: "", message: "", bookingRef: "" });
  async function create() {
    setBusy(true);
    try { const r = await api("/api/support", { body: { ...f, bookingRef: f.bookingRef || undefined } }); toast.success(tr("sup.sent", { ref: r.ticket.reference })); setOpen(false); setF({ category: "booking", subject: "", message: "", bookingRef: "" }); list.reload(); setSel(r.ticket._id); }
    catch (e: any) { toast.error(e.issues?.[0]?.message || e.message); } finally { setBusy(false); }
  }
  async function send(body: any) {
    setBusy(true);
    try { await api("/api/support", { method: "PATCH", body: { id: sel, ...body } }); setReply(""); one.reload(); list.reload(); } catch (e: any) { toast.error(e.message); } finally { setBusy(false); }
  }
  if (list.loading) return <PageSkeleton />;
  if (list.error) return <ErrorState message={list.error} onRetry={list.reload} />;
  const items: any[] = list.data.items, t = one.data?.ticket;
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3"><div><h1 className="text-3xl">{tr("sup.title")}</h1><p className="mt-1 text-sm text-ink/70">{tr("sup.sub")}</p></div><Button onClick={() => setOpen(true)}><Plus className="h-4 w-4" aria-hidden />{tr("sup.new")}</Button></div>
      {items.length === 0 ? <Empty title={tr("sup.empty")} action={<Button onClick={() => setOpen(true)}>{tr("sup.ask")}</Button>}>{tr("sup.emptysub")}</Empty> : (
        <div className="grid gap-5 lg:grid-cols-[1fr_1.4fr]">
          <Card className="max-h-[70vh] overflow-auto"><ul className="divide-y divide-forest/10">{items.map((x) => <li key={x._id}><button onClick={() => setSel(x._id)} className={`w-full p-4 text-left hover:bg-forest-50 ${sel === x._id ? "bg-forest-50" : ""}`}><div className="flex items-center justify-between gap-2"><span className="font-mono text-xs">{x.reference}</span><Badge className={supportTone[x.status]}>{tr(`sup.s.${x.status}` as any)}</Badge></div><p className="mt-1 font-medium">{x.subject}</p><p className="text-xs text-ink/60">{new Date(x.lastMessageAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}{x.lastFrom === "staff" && x.status !== "closed" ? ` · ${tr("sup.newreply")}` : ""}</p></button></li>)}</ul></Card>
          <Card className="p-5">{!sel ? <p className="text-sm text-ink/60">{tr("sup.choose")}</p> : !t ? <p className="text-sm text-ink/60">{tr("sup.loading")}</p> : (
            <div className="space-y-4"><div><h2 className="text-xl">{t.subject}</h2><p className="text-sm text-ink/65">{t.reference}{t.destination?.name ? ` · ${t.destination.name}` : ""}{t.bookingRef ? ` · booking ${t.bookingRef}` : ""}</p></div><SupportThread messages={t.messages} />
              {t.status === "closed" ? <p className="text-sm text-ink/60">{tr("sup.closedmsg")}</p> : <div className="space-y-2"><label htmlFor="rep" className="sr-only">Your reply</label><Textarea id="rep" value={reply} onChange={(e) => setReply(e.target.value)} maxLength={2000} placeholder={t.status === "resolved" ? tr("sup.reopenph") : tr("sup.replyph")} /><div className="flex justify-end gap-2"><Button variant="ghost" disabled={busy} onClick={() => send({ status: "closed" })}>{tr("sup.close")}</Button><Button loading={busy} disabled={reply.trim().length < 2} onClick={() => send({ body: reply })}>{tr("sup.send")}</Button></div></div>}</div>)}</Card>
        </div>)}
      <Modal open={open} onClose={() => setOpen(false)} title={tr("sup.modal")}>
        <div className="space-y-3"><Field label={tr("sup.about")}><Select value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}>{CATS.map((k) => <option key={k} value={k}>{tr(`sup.c.${k}` as any)}</option>)}</Select></Field>
          <Field label={tr("sup.subject")}><Input value={f.subject} maxLength={140} onChange={(e) => setF({ ...f, subject: e.target.value })} /></Field>
          <Field label={tr("sup.bookref")}><Input value={f.bookingRef} className="font-mono" placeholder="HH-ABCD-2345" onChange={(e) => setF({ ...f, bookingRef: e.target.value.toUpperCase() })} /></Field>
          <Field label={tr("sup.what")}><Textarea value={f.message} maxLength={2000} onChange={(e) => setF({ ...f, message: e.target.value })} /></Field>
          <div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setOpen(false)}>{tr("sup.cancel")}</Button><Button loading={busy} disabled={f.subject.trim().length < 4 || f.message.trim().length < 10} onClick={create}>{tr("sup.send")}</Button></div></div>
      </Modal>
    </div>
  );
}
