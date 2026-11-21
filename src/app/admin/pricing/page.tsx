"use client";
import { useState } from "react";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { api, useApi } from "@/lib/hooks";
import { Badge, Button, Card, Empty, ErrorState, Field, Input, PageSkeleton, Select, useConfirm } from "@/components/ui";
import { cn, inr } from "@/lib/utils";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const AUD: [string, string][] = [["indian", "Indian"], ["foreign", "Foreign"], ["child", "Child"], ["student", "Student"]];
const blank = { name: "", adjustPct: 20, daysOfWeek: [] as number[], dateFrom: "", dateTo: "", timeFrom: "", timeTo: "", minBookedPct: 0, audiences: [] as string[] };
const describe = (r: any) => [r.daysOfWeek?.length ? r.daysOfWeek.map((d: number) => DAYS[d]).join(", ") : "every day", r.dateFrom || r.dateTo ? `${r.dateFrom || "…"} to ${r.dateTo || "…"}` : "", r.timeFrom || r.timeTo ? `slots ${r.timeFrom || "open"}–${r.timeTo || "close"}` : "", r.minBookedPct ? `when slot ≥ ${r.minBookedPct}% booked` : "", r.audiences?.length ? r.audiences.join(", ") + " tickets" : "all tickets"].filter(Boolean).join(" · ");

export default function Pricing() {
  const [dest, setDest] = useState("");
  const rules = useApi<any>(`/api/admin/pricing${dest ? `?destination=${dest}` : ""}`);
  const [f, setF] = useState<any>(blank), [site, setSite] = useState(""), [busy, setBusy] = useState(false);
  const [pv, setPv] = useState({ date: "", start: "10:00", booked: 0, capacity: 100, price: 50, audience: "indian" }), [pvRes, setPvRes] = useState<any>(null);
  const { confirm, dialog } = useConfirm();
  const d = rules.data, siteId = site || dest || d?.destinations?.[0]?._id || "";
  const tog = (arr: any[], v: any) => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);
  async function add() {
    setBusy(true);
    try { await api("/api/admin/pricing", { body: { destinationId: siteId, ...f, dateFrom: f.dateFrom || undefined, dateTo: f.dateTo || undefined, timeFrom: f.timeFrom || undefined, timeTo: f.timeTo || undefined } }); toast.success("Rule added"); setF(blank); rules.reload(); }
    catch (e: any) { toast.error(e.issues?.[0]?.message || e.message); } finally { setBusy(false); }
  }
  async function toggle(r: any) { try { await api("/api/admin/pricing", { method: "PATCH", body: { id: r._id, active: !r.active } }); rules.reload(); } catch (e: any) { toast.error(e.message); } }
  async function del(r: any) { if (await confirm({ title: `Delete “${r.name}”?`, body: "Prices go back to normal for slots it applied to. Existing bookings keep the price they were sold at.", confirmLabel: "Delete rule", danger: true })) { try { await api(`/api/admin/pricing?id=${r._id}`, { method: "DELETE" }); rules.reload(); } catch (e: any) { toast.error(e.message); } } }
  async function preview() {
    try { setPvRes(await api(`/api/admin/pricing?destination=${siteId}&preview=1&date=${pv.date}&start=${pv.start}&booked=${pv.booked}&capacity=${pv.capacity}&price=${pv.price * 100}&audience=${pv.audience}`)); } catch (e: any) { toast.error(e.message); }
  }
  if (rules.loading) return <PageSkeleton />;
  if (rules.error || !d) return <ErrorState message={rules.error || "Could not load"} onRetry={rules.reload} />;
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3"><div><h1 className="text-3xl">Peak and off-peak pricing</h1><p className="mt-1 max-w-2xl text-sm text-ink/70">Raise or lower ticket prices for busy days, festival dates, or quiet slots. Visitors see the adjusted price before they pay. Matching rules add up, capped between −50% and +100%. Bookings already made keep their price.</p></div>
        <div className="flex items-center gap-3"><Select aria-label="Site" className="w-52" value={dest} onChange={(e) => setDest(e.target.value)}><option value="">All sites</option>{d.destinations.map((x: any) => <option key={x._id} value={x._id}>{x.name}</option>)}</Select><a className="text-sm text-terracotta underline" href="/api/admin/export?report=pricing">Export CSV</a></div></div>
      <div className="grid gap-6 lg:grid-cols-[1.3fr_1fr]">
        <Card className="space-y-3 p-5"><h2 className="text-lg">Rules</h2>
          {d.items.length === 0 ? <Empty title="No pricing rules">Tickets are sold at their normal price. Add a rule on the right.</Empty> : <ul className="divide-y divide-forest/10">{d.items.map((r: any) => (
            <li key={r._id} className="flex items-start justify-between gap-3 py-3"><div><p className="font-medium">{r.name} <Badge className={r.adjustPct > 0 ? "bg-amber-100 text-amber-900" : "bg-emerald-100 text-emerald-900"}>{r.adjustPct > 0 ? "+" : ""}{r.adjustPct}%</Badge> {!r.active && <Badge className="bg-stone-100">Off</Badge>}</p><p className="text-xs text-ink/65">{r.destination?.name} · {describe(r)}</p></div>
              <div className="flex shrink-0 gap-1"><Button size="sm" variant="outline" onClick={() => toggle(r)}>{r.active ? "Turn off" : "Turn on"}</Button><Button size="sm" variant="ghost" aria-label={`Delete ${r.name}`} onClick={() => del(r)}><Trash2 className="h-4 w-4" /></Button></div></li>))}</ul>}
        </Card>
        <div className="space-y-6">
          <Card className="space-y-3 p-5"><h2 className="text-lg">Add a rule</h2>
            <Field label="Site"><Select value={siteId} onChange={(e) => setSite(e.target.value)}>{d.destinations.map((x: any) => <option key={x._id} value={x._id}>{x.name}</option>)}</Select></Field>
            <Field label="Name"><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="e.g. Weekend peak" maxLength={80} /></Field>
            <Field label="Change in price (%)" hint="Positive raises the price, negative gives a discount"><Input type="number" min={-50} max={100} value={f.adjustPct} onChange={(e) => setF({ ...f, adjustPct: Math.round(Number(e.target.value)) })} /></Field>
            <fieldset><legend className="mb-1 text-sm font-medium">Days (none = every day)</legend><div className="flex flex-wrap gap-1.5">{DAYS.map((x, i) => <button key={x} type="button" aria-pressed={f.daysOfWeek.includes(i)} onClick={() => setF({ ...f, daysOfWeek: tog(f.daysOfWeek, i) })} className={cn("rounded-full border px-3 py-1 text-xs", f.daysOfWeek.includes(i) ? "border-forest bg-forest text-ivory" : "border-forest/25")}>{x}</button>)}</div></fieldset>
            <div className="grid grid-cols-2 gap-3"><Field label="From date"><Input type="date" value={f.dateFrom} onChange={(e) => setF({ ...f, dateFrom: e.target.value })} /></Field><Field label="To date"><Input type="date" value={f.dateTo} onChange={(e) => setF({ ...f, dateTo: e.target.value })} /></Field><Field label="Slots from"><Input type="time" value={f.timeFrom} onChange={(e) => setF({ ...f, timeFrom: e.target.value })} /></Field><Field label="Slots until"><Input type="time" value={f.timeTo} onChange={(e) => setF({ ...f, timeTo: e.target.value })} /></Field></div>
            <Field label="Only when the slot is at least this full (%)" hint="0 = always. Use 80 for demand-based peak pricing."><Input type="number" min={0} max={100} value={f.minBookedPct} onChange={(e) => setF({ ...f, minBookedPct: Math.round(Number(e.target.value)) })} /></Field>
            <fieldset><legend className="mb-1 text-sm font-medium">Ticket types (none = all)</legend><div className="flex flex-wrap gap-1.5">{AUD.map(([k, l]) => <button key={k} type="button" aria-pressed={f.audiences.includes(k)} onClick={() => setF({ ...f, audiences: tog(f.audiences, k) })} className={cn("rounded-full border px-3 py-1 text-xs", f.audiences.includes(k) ? "border-forest bg-forest text-ivory" : "border-forest/25")}>{l}</button>)}</div></fieldset>
            <Button className="w-full" loading={busy} disabled={f.name.trim().length < 2 || !f.adjustPct || !siteId} onClick={add}>Add rule</Button>
          </Card>
          <Card className="space-y-3 p-5"><h2 className="text-lg">Try it</h2><p className="text-sm text-ink/70">See what a ticket would cost for a given slot, using the rules that are on.</p>
            <div className="grid grid-cols-2 gap-3"><Field label="Date"><Input type="date" value={pv.date} onChange={(e) => setPv({ ...pv, date: e.target.value })} /></Field><Field label="Slot starts"><Input type="time" value={pv.start} onChange={(e) => setPv({ ...pv, start: e.target.value })} /></Field><Field label="Base price (₹)"><Input type="number" min={0} value={pv.price} onChange={(e) => setPv({ ...pv, price: Number(e.target.value) })} /></Field><Field label="Ticket type"><Select value={pv.audience} onChange={(e) => setPv({ ...pv, audience: e.target.value })}>{AUD.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select></Field><Field label="Booked"><Input type="number" min={0} value={pv.booked} onChange={(e) => setPv({ ...pv, booked: Number(e.target.value) })} /></Field><Field label="Capacity"><Input type="number" min={1} value={pv.capacity} onChange={(e) => setPv({ ...pv, capacity: Number(e.target.value) })} /></Field></div>
            <Button variant="outline" onClick={preview} disabled={!pv.date || !siteId}>Calculate</Button>
            {pvRes?.preview && <p role="status" className="rounded-lg bg-ivory-100 p-3 text-sm">Adjustment <strong>{pvRes.preview.pct > 0 ? "+" : ""}{pvRes.preview.pct}%</strong>. Ticket price <strong>{inr(pvRes.preview.unitPriceMinor)}</strong> (base {inr(pv.price * 100)}).</p>}
          </Card>
        </div>
      </div>
      {dialog}
    </div>
  );
}
