"use client";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { ChevronLeft, ChevronRight, Plus, TriangleAlert, Trash2 } from "lucide-react";
import { api, useApi } from "@/lib/hooks";
import { Badge, Button, Card, ErrorState, Field, Input, Modal, PageSkeleton, Select } from "@/components/ui";
import { addDays, fmtDate } from "@/lib/utils";

const POS: Record<string, string> = { gate: "Gate", counter: "Counter", parking: "Parking", floor: "Floor", supervisor: "Supervisor" };
const posTone: Record<string, string> = { gate: "bg-forest-50 text-forest", counter: "bg-terracotta/10 text-terracotta", parking: "bg-sky-100 text-sky-900", floor: "bg-stone-100 text-stone-800", supervisor: "bg-amber-100 text-amber-900" };

function Swaps({ onChanged }: { onChanged: () => void }) {
  const sw = useApi<any>("/api/admin/swaps", { poll: 30000 });
  async function decide(id: string, approve: boolean) {
    const reason = approve ? undefined : prompt("Reason for declining (optional)") || undefined;
    try { await api("/api/admin/swaps", { method: "PATCH", body: { id, approve, reason } }); toast.success(approve ? "Approved. The shift now belongs to the colleague." : "Declined"); sw.reload(); onChanged(); } catch (e: any) { toast.error(e.message); sw.reload(); }
  }
  const p: any[] = sw.data?.pending || [];
  if (!p.length) return null;
  return (
    <Card className="space-y-2 border-2 border-sky-300 p-4"><h2 className="text-lg">Shift swaps waiting for you</h2>
      {p.map((x) => <div key={x._id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-sky-50 p-3 text-sm"><span><strong>{x.fromName}</strong> → <strong>{x.toName}</strong>: {x.shift ? `${fmtDate(x.shift.date)}, ${x.shift.start} to ${x.shift.end}` : "shift"} at {x.destination?.name}{x.note ? <span className="block text-xs text-ink/65">“{x.note}”. {x.toName} has agreed.</span> : <span className="block text-xs text-ink/65">{x.toName} has agreed.</span>}</span><span className="flex gap-2"><Button size="sm" variant="outline" onClick={() => decide(x._id, false)}>Decline</Button><Button size="sm" variant="accent" onClick={() => decide(x._id, true)}>Approve</Button></span></div>)}
    </Card>
  );
}

export default function Roster() {
  const [from, setFrom] = useState<string>(""), [dest, setDest] = useState("");
  const r = useApi<any>(`/api/admin/roster?${from ? `from=${from}&` : ""}${dest ? `destination=${dest}` : ""}`);
  const [open, setOpen] = useState<string | null>(null), [busy, setBusy] = useState(false);
  const [f, setF] = useState({ destinationId: "", userId: "", start: "09:00", end: "17:00", position: "gate", notes: "", repeatDays: 1 });
  const d = r.data;
  const days = useMemo(() => (d ? Array.from({ length: 7 }, (_, i) => addDays(d.from, i)) : []), [d]);
  const eligible = useMemo(() => (d?.staff || []).filter((u: any) => !f.destinationId || (u.assignedDestinations || []).some((x: string) => String(x) === f.destinationId)), [d, f.destinationId]);
  async function add() {
    setBusy(true);
    try { const res = await api("/api/admin/roster", { body: { ...f, date: open, notes: f.notes || undefined, repeatDays: f.repeatDays > 1 ? f.repeatDays : undefined } }); toast.success(`${res.shifts.length} shift${res.shifts.length > 1 ? "s" : ""} added${res.skipped ? `, ${res.skipped} skipped (clash)` : ""}`); setOpen(null); r.reload(); }
    catch (e: any) { toast.error(e.message); } finally { setBusy(false); }
  }
  async function del(id: string) { try { await api(`/api/admin/roster?id=${id}`, { method: "DELETE" }); r.reload(); } catch (e: any) { toast.error(e.message); } }
  if (r.loading) return <PageSkeleton />;
  if (r.error || !d) return <ErrorState message={r.error || "Could not load"} onRetry={r.reload} />;
  const destName = (id: string) => d.destinations.find((x: any) => String(x._id) === String(id))?.name || "";
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3"><div><h1 className="text-3xl">Staff roster</h1><p className="mt-1 text-sm text-ink/70">Plan who works where. Staff see their own shifts and who else is on. Nobody can be rostered at two places at once.</p></div>
        <div className="flex flex-wrap items-center gap-2"><Select aria-label="Site" className="w-52" value={dest} onChange={(e) => setDest(e.target.value)}><option value="">All sites</option>{d.destinations.map((x: any) => <option key={x._id} value={x._id}>{x.name}</option>)}</Select>
          <Button variant="outline" size="sm" aria-label="Previous week" onClick={() => setFrom(addDays(d.from, -7))}><ChevronLeft className="h-4 w-4" /></Button><span className="text-sm">{fmtDate(d.from)} to {fmtDate(d.to)}</span><Button variant="outline" size="sm" aria-label="Next week" onClick={() => setFrom(addDays(d.from, 7))}><ChevronRight className="h-4 w-4" /></Button>
          <a className="text-sm text-terracotta underline" href={`/api/admin/export?report=roster&from=${d.from}&to=${d.to}`}>Export CSV</a></div></div>
      <Swaps onChanged={r.reload} />
      {d.conflicts.length > 0 && <p role="alert" className="flex items-center gap-2 rounded-lg bg-red-50 p-3 text-sm text-red-900"><TriangleAlert className="h-4 w-4" aria-hidden />{d.conflicts.length} shifts overlap for the same person. Remove one.</p>}
      <div className="grid gap-3 md:grid-cols-7">{days.map((day) => {
        const shifts = d.shifts.filter((s: any) => s.date === day);
        return (
          <Card key={day} className="flex min-h-[9rem] flex-col p-3"><div className="flex items-center justify-between"><h2 className="text-sm font-medium">{fmtDate(day)}</h2><button className="rounded p-1 hover:bg-forest-50" aria-label={`Add a shift on ${fmtDate(day)}`} onClick={() => { setOpen(day); setF({ ...f, destinationId: dest || d.destinations[0]?._id || "", userId: "" }); }}><Plus className="h-4 w-4" /></button></div>
            <ul className="mt-2 flex-1 space-y-2">{shifts.length === 0 && <li className="text-xs text-ink/50">No shifts</li>}{shifts.map((s: any) => (
              <li key={s._id} className={`rounded-lg border p-2 text-xs ${d.conflicts.includes(String(s._id)) ? "border-red-400 bg-red-50" : "border-forest/15"}`}><div className="flex items-start justify-between gap-1"><span className="font-medium">{s.userName}</span><button className="text-ink/45 hover:text-red-700" aria-label={`Remove ${s.userName}'s shift`} onClick={() => del(s._id)}><Trash2 className="h-3.5 w-3.5" /></button></div><p>{s.start} to {s.end}</p><Badge className={posTone[s.position]}>{POS[s.position]}</Badge>{!dest && <p className="mt-1 text-ink/60">{destName(s.destination)}</p>}</li>))}</ul></Card>);
      })}</div>
      <Card className="p-4"><h2 className="text-lg">Hours this week</h2><ul className="mt-2 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2 lg:grid-cols-3">{d.staff.filter((u: any) => d.hoursByUser[u._id]).map((u: any) => <li key={u._id} className="flex justify-between"><span>{u.name}</span><span className={d.hoursByUser[u._id] > 48 ? "font-medium text-red-800" : ""}>{d.hoursByUser[u._id]}h</span></li>)}{!Object.keys(d.hoursByUser).length && <li className="text-ink/60">No shifts this week.</li>}</ul></Card>
      <Modal open={!!open} onClose={() => setOpen(null)} title={`Add a shift: ${open ? fmtDate(open) : ""}`}>
        <div className="space-y-3">
          <Field label="Site"><Select value={f.destinationId} onChange={(e) => setF({ ...f, destinationId: e.target.value, userId: "" })}>{d.destinations.map((x: any) => <option key={x._id} value={x._id}>{x.name}</option>)}</Select></Field>
          <Field label="Staff member"><Select value={f.userId} onChange={(e) => setF({ ...f, userId: e.target.value })}><option value="">Choose…</option>{eligible.map((u: any) => <option key={u._id} value={u._id}>{u.name}</option>)}</Select></Field>
          <div className="grid grid-cols-2 gap-3"><Field label="Start"><Input type="time" value={f.start} onChange={(e) => setF({ ...f, start: e.target.value })} /></Field><Field label="End"><Input type="time" value={f.end} onChange={(e) => setF({ ...f, end: e.target.value })} /></Field></div>
          <div className="grid grid-cols-2 gap-3"><Field label="Position"><Select value={f.position} onChange={(e) => setF({ ...f, position: e.target.value })}>{Object.entries(POS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></Field><Field label="Repeat for days" hint="1 = just this day"><Input type="number" min={1} max={14} value={f.repeatDays} onChange={(e) => setF({ ...f, repeatDays: Math.max(1, Math.min(14, Number(e.target.value) || 1)) })} /></Field></div>
          <Field label="Note (optional)"><Input value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} maxLength={200} /></Field>
          <div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setOpen(null)}>Cancel</Button><Button loading={busy} disabled={!f.userId} onClick={add}>Add shift</Button></div>
        </div>
      </Modal>
    </div>
  );
}
