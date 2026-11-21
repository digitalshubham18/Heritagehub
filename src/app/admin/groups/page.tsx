"use client";
import { useState } from "react";
import { toast } from "sonner";
import { api, useApi } from "@/lib/hooks";
import { Badge, Button, Card, Empty, ErrorState, Field, Input, Modal, PageSkeleton, Select, Textarea } from "@/components/ui";
import { fmtDate, fmtTime, inr } from "@/lib/utils";

const TONE: Record<string, string> = { requested: "bg-amber-100 text-amber-900", awaiting_payment: "bg-terracotta-50 text-terracotta-600", paid: "bg-emerald-100 text-emerald-900", rejected: "bg-red-100 text-red-900", cancelled: "bg-stone-200", expired: "bg-stone-200" };

function Decide({ req, onClose, onDone }: { req: any; onClose: () => void; onDone: () => void }) {
  const slug = req.destinationInfo?.slug;
  const slots = useApi<any>(`/api/slots?destination=${slug}&date=${req.date}`);
  const [slotId, setSlotId] = useState(""); const [pct, setPct] = useState(req.orgType === "school" ? 50 : 0); const [hold, setHold] = useState(48); const [note, setNote] = useState(""); const [busy, setBusy] = useState(false);
  const fits = (s: any) => !s.closed && s.remaining >= req.size;
  async function send(action: "approve" | "reject") {
    setBusy(true);
    try { await api(`/api/groups/${req._id}`, { method: "PATCH", body: { action, slotId: slotId || undefined, discountPct: Number(pct), holdHours: Number(hold), note: note || undefined } }); toast.success(action === "approve" ? "Approved. The requester can now pay." : "Request declined"); onDone(); }
    catch (e: any) { toast.error(e.message); } finally { setBusy(false); }
  }
  return (<div className="space-y-4">
    <p className="text-sm text-ink/80">{req.organisation} ({req.orgType.replace("_", " ")}) · {req.size} people · {fmtDate(req.date)}{req.preferredStart ? ` · prefers ${fmtTime(req.preferredStart)}` : ""}</p>
    {req.notes && <p className="rounded-lg bg-ivory-100 p-3 text-sm">{req.notes}</p>}
    <Field label="Slot" hint="Choose one that holds the whole group, or leave blank for the best fit">
      <Select value={slotId} onChange={(e) => setSlotId(e.target.value)} disabled={slots.loading}><option value="">Best fit near their preferred time</option>{(slots.data?.slots || []).map((s: any) => <option key={s.id} value={s.id} disabled={!fits(s)}>{fmtTime(s.start)} to {fmtTime(s.end)} · {s.remaining} left{fits(s) ? "" : " (too small)"}</option>)}</Select></Field>
    <div className="grid gap-3 sm:grid-cols-2"><Field label="Concession %" hint={`Per ticket ${inr(((req.categoryInfo?.priceMinor || 0) + (req.categoryInfo?.feeMinor || 0)))} before concession`}><div className="flex gap-1">{[0, 25, 50].map((v) => <Button key={v} type="button" size="sm" variant={Number(pct) === v ? "primary" : "outline"} onClick={() => setPct(v)}>{v}%</Button>)}<Input type="number" min={0} max={100} className="w-20" value={pct} onChange={(e) => setPct(e.target.value as any)} /></div></Field>
      <Field label="Hold seats for (hours)"><Input type="number" min={1} max={168} value={hold} onChange={(e) => setHold(e.target.value as any)} /></Field></div>
    <Field label="Note to the requester (optional)"><Textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} /></Field>
    <div className="flex justify-between gap-2"><Button variant="danger" loading={busy} onClick={() => send("reject")}>Decline</Button><div className="flex gap-2"><Button variant="outline" onClick={onClose}>Close</Button><Button variant="accent" loading={busy} onClick={() => send("approve")}>Approve and hold seats</Button></div></div></div>);
}

export default function AdminGroups() {
  const [status, setStatus] = useState("");
  const { data, loading, error, reload } = useApi<any>(`/api/groups${status ? `?status=${status}` : ""}`);
  const [dec, setDec] = useState<any>(null);
  return (
    <div className="space-y-6"><div className="flex flex-wrap items-center justify-between gap-3"><h1 className="text-3xl">Group and school requests</h1><Select aria-label="Filter by status" className="w-52" value={status} onChange={(e) => setStatus(e.target.value)}><option value="">All requests</option><option value="requested">Waiting for a decision</option><option value="approved">Approved</option><option value="rejected">Declined</option></Select></div>
      {error ? <ErrorState message={error} onRetry={reload} /> : loading ? <PageSkeleton /> : !data.items.length ? <Empty title="No requests here">Group requests from visitors appear in this queue.</Empty> : (
        <div className="space-y-4">{data.items.map((r: any) => (
          <Card key={r._id} className="p-5"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="font-display text-xl">{r.organisation}</p><p className="text-sm text-ink/70">{r.destinationInfo?.name} · {r.size} people · {fmtDate(r.date)}{r.preferredStart ? `, around ${fmtTime(r.preferredStart)}` : ""}</p><p className="mt-1 text-xs text-ink/60">{r.requester?.name} ({r.requester?.email}) · {r.orgType.replace("_", " ")}</p></div><Badge className={TONE[r.displayStatus] || "bg-stone-100"}>{r.displayStatus.replace("_", " ")}</Badge></div>
            {r.notes && <p className="mt-3 text-sm text-ink/80">“{r.notes}”</p>}
            {r.bookingInfo && <p className="mt-2 text-sm">Slot {fmtTime(r.bookingInfo.start)} · {inr(r.bookingInfo.totalMinor)}{r.discountPct ? ` after ${r.discountPct}% concession` : ""}</p>}
            {r.status === "requested" && <div className="mt-4"><Button onClick={() => setDec(r)}>Review request</Button></div>}</Card>))}</div>)}
      <Modal open={!!dec} onClose={() => setDec(null)} title="Review group request" wide>{dec && <Decide req={dec} onClose={() => setDec(null)} onDone={() => { setDec(null); reload(); }} />}</Modal>
    </div>
  );
}
