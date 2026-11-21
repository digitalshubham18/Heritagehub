"use client";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { api, useApi } from "@/lib/hooks";
import { Badge, Button, Card, Empty, ErrorState, Field, Input, Modal, PageSkeleton, Select, Stat, StatusBadge } from "@/components/ui";
import { cn, fmtDate, inr } from "@/lib/utils";

const TYPES: [string, string][] = [["car", "Cars"], ["two_wheeler", "Two-wheelers"], ["bus", "Buses and coaches"], ["ev", "EV charging bays (cars)"], ["accessible", "Accessible bays (cars)"]];
const POOLN: Record<string, string> = Object.fromEntries(TYPES);
const blank = () => ({ capacity: 0, freeMinutes: 15, firstHourMinor: 0, extraHourMinor: 0, dailyMaxMinor: 0 });
const rs = (m: number) => (m / 100).toString();
const TABS = [["setup", "Setup and rates"], ["overrides", "Special days"], ["passes", "Monthly passes"], ["reservations", "Reservations"], ["analytics", "Analytics"], ["payments", "Payments (UPI)"]] as const;
const VL: Record<string, string> = { car: "Car", two_wheeler: "Two-wheeler", bus: "Bus" };

function Setup({ d }: { d: string }) {
  const lot = useApi<any>(`/api/admin/parking?destination=${d}`);
  const NEW = { lostTicketFeeMinor: 0, gstPct: 0, monthlyPass: { car: 0, two_wheeler: 0, bus: 0, maxPerType: 0 } };
  const [f, setF] = useState<any>({ car: blank(), two_wheeler: blank(), bus: blank(), ev: blank(), accessible: blank(), active: true, reservablePct: 30, ...NEW });
  const [busy, setBusy] = useState(false);
  useEffect(() => { const l = lot.data?.lot; setF(l ? { car: { ...blank(), ...l.car }, two_wheeler: { ...blank(), ...l.two_wheeler }, bus: { ...blank(), ...l.bus }, ev: { ...blank(), ...l.ev }, accessible: { ...blank(), ...l.accessible }, active: l.active, reservablePct: l.reservablePct ?? 30, lostTicketFeeMinor: l.lostTicketFeeMinor || 0, gstPct: l.gstPct || 0, monthlyPass: { ...NEW.monthlyPass, ...(l.monthlyPass || {}) } } : { car: blank(), two_wheeler: blank(), bus: blank(), ev: blank(), accessible: blank(), active: true, reservablePct: 30, ...NEW }); // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lot.data]);
  const set = (t: string, k: string, v: number) => setF((p: any) => ({ ...p, [t]: { ...p[t], [k]: v } }));
  async function save() {
    setBusy(true);
    try { const strip = (x: any) => ({ capacity: x.capacity, freeMinutes: x.freeMinutes, firstHourMinor: x.firstHourMinor, extraHourMinor: x.extraHourMinor, dailyMaxMinor: x.dailyMaxMinor }); await api("/api/admin/parking", { method: "PUT", body: { destinationId: d, active: f.active, reservablePct: f.reservablePct, car: strip(f.car), two_wheeler: strip(f.two_wheeler), bus: strip(f.bus), ev: strip(f.ev), accessible: strip(f.accessible), lostTicketFeeMinor: f.lostTicketFeeMinor, gstPct: f.gstPct, monthlyPass: f.monthlyPass } }); toast.success("Parking saved"); lot.reload(); }
    catch (e: any) { toast.error(e.message); } finally { setBusy(false); }
  }
  if (lot.error) return <ErrorState message={lot.error} onRetry={lot.reload} />;
  if (lot.loading) return <PageSkeleton />;
  return (<>
    {!lot.data?.lot && <p className="rounded-xl bg-amber-50 p-4 text-sm text-amber-900">No parking is set up here yet. Enter capacity for at least one vehicle type (0 means not accepted) and save.</p>}
    <div className="grid gap-5 lg:grid-cols-3">{TYPES.map(([t, label]) => (
      <Card key={t} className="space-y-3 p-5"><h2 className="text-lg">{label}</h2>{lot.data?.lot && <p className="text-xs text-ink/60">{lot.data.lot[t]?.occupied || 0} parked now</p>}
        <Field label="Spaces"><Input type="number" min={0} value={f[t].capacity} onChange={(e) => set(t, "capacity", Number(e.target.value))} /></Field>
        <Field label="Free minutes"><Input type="number" min={0} value={f[t].freeMinutes} onChange={(e) => set(t, "freeMinutes", Number(e.target.value))} /></Field>
        <Field label="First hour (₹)"><Input type="number" min={0} value={rs(f[t].firstHourMinor)} onChange={(e) => set(t, "firstHourMinor", Math.round(Number(e.target.value) * 100))} /></Field>
        <Field label="Each extra hour (₹)"><Input type="number" min={0} value={rs(f[t].extraHourMinor)} onChange={(e) => set(t, "extraHourMinor", Math.round(Number(e.target.value) * 100))} /></Field>
        <Field label="Daily maximum (₹)" hint="0 for no cap"><Input type="number" min={0} value={rs(f[t].dailyMaxMinor)} onChange={(e) => set(t, "dailyMaxMinor", Math.round(Number(e.target.value) * 100))} /></Field>
        <p className="text-xs text-ink/60">Visitors can pre-book up to {Math.floor((f[t].capacity * f.reservablePct) / 100)} of {f[t].capacity} spaces a day.</p></Card>))}</div>
    <div className="grid gap-5 lg:grid-cols-2">
      <Card className="space-y-3 p-5"><h2 className="text-lg">Lost tickets and GST</h2>
        <Field label="Lost-ticket charge (₹)" hint="Added to the normal fee when a driver has lost their ticket. Staff must record the ID check. 0 = no extra charge."><Input type="number" min={0} value={rs(f.lostTicketFeeMinor)} onChange={(e) => setF({ ...f, lostTicketFeeMinor: Math.round(Number(e.target.value) * 100) })} /></Field>
        <Field label="GST included in parking rates (%)" hint="Rates are entered GST-inclusive. This only splits the GST out on the invoice (0 = no GST shown). Set your GSTIN on the operator."><Input type="number" min={0} max={40} step={0.5} value={f.gstPct} onChange={(e) => setF({ ...f, gstPct: Number(e.target.value) })} /></Field></Card>
      <Card className="space-y-3 p-5"><h2 className="text-lg">Monthly passes (30 days)</h2>
        <div className="grid grid-cols-3 gap-3">{([["car", "Car"], ["two_wheeler", "Two-wheeler"], ["bus", "Bus"]] as const).map(([k, l]) => <Field key={k} label={`${l} (₹)`}><Input type="number" min={0} value={rs(f.monthlyPass[k])} onChange={(e) => setF({ ...f, monthlyPass: { ...f.monthlyPass, [k]: Math.round(Number(e.target.value) * 100) } })} /></Field>)}</div>
        <Field label="Most passes per vehicle type" hint="0 = unlimited. Pass holders still occupy a space while parked."><Input type="number" min={0} value={f.monthlyPass.maxPerType} onChange={(e) => setF({ ...f, monthlyPass: { ...f.monthlyPass, maxPerType: Number(e.target.value) } })} /></Field>
        <p className="text-xs text-ink/60">A price of 0 means passes aren&apos;t sold for that vehicle type. Visitors can buy from their account; staff can sell at the gate.</p></Card>
    </div>
    <Card className="p-5"><Field label={`Share of spaces visitors can pre-book: ${f.reservablePct}%`} hint="The rest stay first come, first served at the gate. 0 turns pre-booking off."><input type="range" min={0} max={100} step={5} value={f.reservablePct} onChange={(e) => setF({ ...f, reservablePct: Number(e.target.value) })} className="w-full max-w-md accent-forest" aria-label="Pre-bookable share" /></Field></Card>
    <div className="flex items-center justify-between"><label className="flex items-center gap-2 text-sm"><input type="checkbox" className="accent-forest" checked={f.active} onChange={(e) => setF({ ...f, active: e.target.checked })} />Parking open</label><Button loading={busy} onClick={save}>Save parking</Button></div>
    <p className="text-xs text-ink/60">Capacity can&apos;t be set below the number of vehicles parked now. Fees are charged by time parked after the free period, per started hour. A pre-booked visitor can prepay the first-hour rate, which is credited at exit; a no-show forfeits it.</p></>);
}

function Overrides({ d }: { d: string }) {
  const o = useApi<any>(`/api/admin/parking/overrides?destination=${d}`);
  const [f, setF] = useState({ date: "", pool: "car", capacity: 0, reason: "" }), [busy, setBusy] = useState(false);
  async function save() { setBusy(true); try { await api("/api/admin/parking/overrides", { method: "PUT", body: { destinationId: d, ...f, reason: f.reason || undefined } }); toast.success("Capacity set for that day"); o.reload(); } catch (e: any) { toast.error(e.message); } finally { setBusy(false); } }
  async function del(id: string) { try { await api(`/api/admin/parking/overrides?id=${id}`, { method: "DELETE" }); o.reload(); } catch (e: any) { toast.error(e.message); } }
  if (o.error) return <ErrorState message={o.error} onRetry={o.reload} />;
  const items: any[] = o.data?.items || [];
  return (<div className="grid gap-5 lg:grid-cols-[1fr_1.2fr]">
    <Card className="space-y-3 p-5"><h2 className="text-lg">Change capacity for one day</h2><p className="text-sm text-ink/70">For festivals, events or works: open extra overflow space, or close part of the lot. It replaces the normal capacity for that date only, for both walk-ins and pre-booking.</p>
      <Field label="Date"><Input type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></Field>
      <Field label="Applies to"><Select value={f.pool} onChange={(e) => setF({ ...f, pool: e.target.value })}>{TYPES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select></Field>
      <Field label="Spaces that day" hint="0 closes it. It can't be below vehicles parked now (today) or spaces already pre-booked."><Input type="number" min={0} value={f.capacity} onChange={(e) => setF({ ...f, capacity: Number(e.target.value) })} /></Field>
      <Field label="Reason (optional)"><Input value={f.reason} maxLength={200} onChange={(e) => setF({ ...f, reason: e.target.value })} placeholder="e.g. Diwali crowd, overflow field open" /></Field>
      <Button loading={busy} disabled={!f.date} onClick={save}>Save for that day</Button></Card>
    <Card className="p-5"><h2 className="text-lg">Upcoming changes</h2>{o.loading ? <PageSkeleton /> : items.length === 0 ? <p className="mt-2 text-sm text-ink/60">No special days. Normal capacity applies.</p> : <ul className="mt-2 divide-y divide-forest/10 text-sm">{items.map((x) => <li key={x._id} className="flex items-center justify-between gap-2 py-2"><span><span className="font-medium">{fmtDate(x.date)}</span> · {POOLN[x.pool]}: <Badge className="bg-amber-100 text-amber-900">{x.capacity} spaces</Badge>{x.reason && <span className="block text-xs text-ink/60">{x.reason}</span>}</span><Button size="sm" variant="ghost" onClick={() => del(x._id)}>Remove</Button></li>)}</ul>}</Card></div>);
}

function Passes({ d }: { d: string }) {
  const r = useApi<any>(`/api/parking/passes?destination=${d}`);
  const [cx, setCx] = useState<any>(null), [mode, setMode] = useState("none"), [reason, setReason] = useState(""), [method, setMethod] = useState("cash"), [busy, setBusy] = useState(false);
  async function cancel() {
    setBusy(true);
    try { const res = await api("/api/parking/passes", { method: "PATCH", body: { id: cx._id, refund: mode, reason, method: mode !== "none" && cx.channel !== "online" ? method : undefined } }); toast.success(res.pass.creditNoteNo ? `Pass cancelled. Credit note ${res.pass.creditNoteNo}` : "Pass cancelled"); setCx(null); setMode("none"); setReason(""); r.reload(); }
    catch (e: any) { toast.error(e.message); } finally { setBusy(false); }
  }
  async function remind() { try { const x = await api("/api/parking/passes", { method: "PATCH", body: { action: "remind" } }); toast.success(`${x.reminded} reminder${x.reminded === 1 ? "" : "s"} sent${x.alreadyRenewed ? `, ${x.alreadyRenewed} already renewed` : ""}${x.noContact ? `, ${x.noContact} have no email or phone` : ""}`); r.reload(); } catch (e: any) { toast.error(e.message); } }
  if (r.error) return <ErrorState message={r.error} onRetry={r.reload} />;
  if (r.loading) return <PageSkeleton />;
  const items: any[] = r.data.items, soon = items.filter((p) => p.current && p.daysLeft <= 7 && !p.reminderSentAt);
  return items.length === 0 ? <Empty title="No monthly passes">Set a pass price on the Setup tab, then staff or visitors can buy one.</Empty> : (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm"><p className="text-ink/70">{soon.length > 0 ? `${soon.length} pass${soon.length === 1 ? " ends" : "es end"} within 7 days and ${soon.length === 1 ? "has" : "have"} not been reminded.` : "No passes are waiting for a reminder."} Holders are reminded once, by email and SMS, a week before their pass ends.</p><Button size="sm" variant="outline" onClick={remind}>Send reminders now</Button></div>
      <Card className="overflow-x-auto"><table className="w-full min-w-[820px] text-sm"><caption className="sr-only">Monthly parking passes</caption><thead className="bg-forest-50 text-left"><tr>{["Pass", "Vehicle", "Holder", "Valid", "Paid", "Visits", "Status", ""].map((h) => <th key={h} className="p-3 font-medium">{h}</th>)}</tr></thead>
        <tbody>{items.map((p) => <tr key={p._id} className="border-t border-forest/10"><td className="p-3 font-mono text-xs">{p.reference}<span className="block text-ink/55">{p.channel}</span></td><td className="p-3 font-mono">{p.vehicleNumber}<span className="block font-sans text-xs text-ink/60">{VL[p.vehicleType]}</span></td><td className="p-3">{p.holderName}<span className="block text-xs text-ink/60">{p.holderPhone}{p.holderEmail ? ` · ${p.holderEmail}` : ""}</span></td><td className="p-3">{p.validFrom} to {p.validTo}{p.current && p.daysLeft <= 7 && <span className="block text-xs font-medium text-amber-900">{p.daysLeft} day{p.daysLeft === 1 ? "" : "s"} left{p.reminderSentAt ? ", reminded" : ""}</span>}</td><td className="p-3">{inr(p.priceMinor)}{p.invoiceNo && <a className="block text-xs text-terracotta underline" href={`/invoice/parking/${p.reference}`} target="_blank">{p.invoiceNo}</a>}{p.refundMinor > 0 && <span className="block text-xs text-sky-900">Refunded {inr(p.refundMinor)}{p.creditNoteNo ? ` · ${p.creditNoteNo}` : ""}</span>}</td><td className="p-3">{p.entries}</td><td className="p-3"><Badge className={p.status === "cancelled" ? "bg-red-100 text-red-900" : p.current ? "bg-emerald-100 text-emerald-900" : "bg-stone-100"}>{p.status === "cancelled" ? "cancelled" : p.current ? "valid" : p.expired ? "expired" : "upcoming"}</Badge></td><td className="p-3 text-right">{p.status === "active" && !p.expired && <Button size="sm" variant="ghost" onClick={() => { setCx(p); setMode("none"); setReason(""); }}>Cancel</Button>}</td></tr>)}</tbody></table></Card>
      <Modal open={!!cx} onClose={() => setCx(null)} title={`Cancel pass ${cx?.reference || ""}`}>
        {cx && <div className="space-y-3"><p className="text-sm text-ink/75">{cx.vehicleNumber} · {cx.holderName} · valid {cx.validFrom} to {cx.validTo} · paid {inr(cx.priceMinor)} · {cx.entries} visit{cx.entries === 1 ? "" : "s"}</p>
          <fieldset><legend className="mb-1 text-sm font-medium">Refund</legend><div className="space-y-2 text-sm">
            {([["none", "No refund", 0], ["prorata", "Unused days", cx.refundOptions?.prorata ?? 0], ["full", "Full price (only for a pass nobody has used)", cx.refundOptions?.full]] as const).map(([k, l, amt]) => <label key={k} className={`flex cursor-pointer items-start gap-2 rounded-lg border p-2.5 ${mode === k ? "border-forest bg-forest-50" : "border-forest/20"} ${amt == null ? "opacity-50" : ""}`}><input type="radio" name="prf" className="mt-0.5 accent-forest" disabled={amt == null} checked={mode === k} onChange={() => setMode(k)} /><span>{l}{amt != null && k !== "none" ? `: ${inr(amt)}` : ""}</span></label>)}</div></fieldset>
          {mode !== "none" && (cx.channel === "online" ? <p className="rounded-lg bg-sky-50 p-3 text-sm text-sky-950">Paid online, so the refund goes back to the original payment method. A credit note is issued against the invoice.</p> : <Field label="Refund paid back by"><Select value={method} onChange={(e) => setMethod(e.target.value)}><option value="cash">Cash</option><option value="upi">UPI</option><option value="card">Card</option></Select></Field>)}
          <Field label="Reason"><Input value={reason} maxLength={200} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Vehicle sold, holder moved away" /></Field>
          <p className="text-xs text-ink/60">The pass stops working at once and the holder is told by email and SMS if we have their details. This can&apos;t be undone.</p>
          <div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setCx(null)}>Keep the pass</Button><Button variant="accent" loading={busy} disabled={reason.trim().length < 3} onClick={cancel}>Cancel pass{mode !== "none" ? " and refund" : ""}</Button></div></div>}
      </Modal>
    </div>);
}

function Reservations({ d }: { d: string }) {
  const [date, setDate] = useState("");
  const r = useApi<any>(`/api/parking/reservations?destination=${d}${date ? `&date=${date}` : ""}`, { poll: 30000 });
  async function cancel(id: string) { if (!confirm("Cancel this reservation? The visitor is refunded any prepayment.")) return; try { await api(`/api/parking/reservations?id=${id}`, { method: "DELETE" }); toast.success("Cancelled"); r.reload(); } catch (e: any) { toast.error(e.message); } }
  const items: any[] = r.data?.items || [];
  return (<div className="space-y-4">
    <Card className="p-4"><Field label="Date" hint="Leave empty for the latest reservations"><Input type="date" className="max-w-xs" value={date} onChange={(e) => setDate(e.target.value)} /></Field></Card>
    {r.error ? <ErrorState message={r.error} onRetry={r.reload} /> : r.loading ? <PageSkeleton /> : items.length === 0 ? <Empty title="No reservations">Nothing has been pre-booked for this selection.</Empty> : (
      <Card className="overflow-x-auto"><table className="w-full min-w-[720px] text-sm"><caption className="sr-only">Parking reservations</caption><thead className="bg-forest-50 text-left"><tr>{["Code", "Date", "Vehicle", "Visitor", "Prepaid", "Status", ""].map((h) => <th key={h} className="p-3 font-medium">{h}</th>)}</tr></thead>
        <tbody>{items.map((x) => <tr key={x._id} className="border-t border-forest/10"><td className="p-3 font-mono text-xs">{x.reference}</td><td className="p-3">{fmtDate(x.date)}<span className="block text-xs text-ink/60">from {x.arrivalFrom}</span></td><td className="p-3"><span className="font-mono">{x.vehicleNumber}</span><span className="block text-xs text-ink/60">{VL[x.vehicleType]}</span></td><td className="p-3">{x.user?.name}<span className="block text-xs text-ink/60">{x.user?.phone}</span></td><td className="p-3">{x.prepaidMinor ? inr(x.prepaidMinor) : "Pay at exit"}</td><td className="p-3"><StatusBadge s={x.status} /></td><td className="p-3 text-right">{x.status === "reserved" && <Button size="sm" variant="ghost" onClick={() => cancel(x._id)}>Cancel</Button>}</td></tr>)}</tbody></table></Card>)}
  </div>);
}

function Analytics({ d }: { d: string }) {
  const [range, setRange] = useState("14");
  const r = useApi<any>(`/api/admin/parking/report?destination=${d}&range=${range}`);
  if (r.error) return <ErrorState message={r.error} onRetry={r.reload} />;
  if (r.loading || !r.data) return <PageSkeleton />;
  const x = r.data, max = Math.max(1, ...x.daily.map((e: any) => e.revenueMinor)), hmax = Math.max(1, ...x.hours.map((h: any) => h.entries));
  return (<div className="space-y-5">
    <div className="flex items-center gap-3"><label htmlFor="rg" className="text-sm">Period</label><Select id="rg" className="w-40" value={range} onChange={(e) => setRange(e.target.value)}><option value="7">Last 7 days</option><option value="14">Last 14 days</option><option value="30">Last 30 days</option></Select></div>
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm"><span className="text-ink/60">Export CSV:</span>{[["daily", "Daily totals"], ["stays", "Every stay"], ["hours", "Entries by hour"], ["reservations", "Reservations"], ["passes", "Monthly passes"], ["lost", "Lost tickets"]].map(([k, l]) => <a key={k} className="text-terracotta underline" href={`/api/admin/parking/report?destination=${d}&range=${range}&format=csv&kind=${k}`}>{l}</a>)}</div>
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4"><Stat label="Parking revenue" value={inr(x.totals.revenueMinor)} /><Stat label="Vehicles in" value={x.totals.entered} /><Stat label="Average stay" value={`${Math.floor(x.totals.avgStayMin / 60)}h ${x.totals.avgStayMin % 60}m`} /><Stat label="Overstays (8h+)" value={x.totals.overstays} tone={x.totals.overstays ? "warn" : undefined} /></div>
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4"><Stat label="Lost tickets" value={x.totals.lostTickets} sub={`${inr(x.totals.penaltiesMinor)} in charges`} /><Stat label="Pass sales" value={inr(x.totals.passMinor)} sub={`${x.totals.passesSold} passes`} /><Stat label="GST in parking revenue" value={inr(x.totals.gstMinor)} /></div>
    <Card className="p-5"><h2 className="text-lg">Daily revenue</h2><div className="mt-4 flex h-40 items-end gap-1" role="img" aria-label="Daily parking revenue bars">{x.daily.map((e: any) => <div key={e.date} className="group relative flex-1"><div className="w-full rounded-t bg-forest/80 hover:bg-terracotta" style={{ height: `${Math.max(2, (e.revenueMinor / max) * 100)}%` }} /><span className="pointer-events-none absolute -top-7 left-1/2 hidden -translate-x-1/2 whitespace-nowrap rounded bg-ink px-1.5 py-0.5 text-[10px] text-white group-hover:block">{fmtDate(e.date)}: {inr(e.revenueMinor)}</span></div>)}</div>
      <p className="mt-3 text-sm text-ink/75">Cash {inr(x.totals.cash)} · UPI {inr(x.totals.upi)} · Card {inr(x.totals.card)} taken at exit. Prepaid credit applied on exits: {inr(x.daily.reduce((a: number, e: any) => a + e.prepaidCredit, 0))}.</p></Card>
    <div className="grid gap-5 lg:grid-cols-2">
      <Card className="p-5"><h2 className="text-lg">Busiest entry hours</h2><div className="mt-4 flex h-32 items-end gap-0.5" role="img" aria-label="Vehicle entries by hour">{x.hours.map((h: any) => <div key={h.hour} className="flex-1" title={`${h.hour}:00, ${h.entries} vehicles`}><div className="w-full rounded-t bg-terracotta/80" style={{ height: `${Math.max(2, (h.entries / hmax) * 100)}%` }} /></div>)}</div><div className="mt-1 flex justify-between text-[10px] text-ink/55"><span>12am</span><span>6am</span><span>12pm</span><span>6pm</span><span>11pm</span></div></Card>
      <Card className="space-y-2 p-5"><h2 className="text-lg">Pre-booking</h2><dl className="grid grid-cols-2 gap-2 text-sm"><dt className="text-ink/65">Arrived</dt><dd>{x.reservations.arrived}</dd><dt className="text-ink/65">Waiting</dt><dd>{x.reservations.reserved}</dd><dt className="text-ink/65">Cancelled</dt><dd>{x.reservations.cancelled}</dd><dt className="text-ink/65">No-shows</dt><dd>{x.reservations.expired} ({x.reservations.noShowRatePct}%)</dd><dt className="text-ink/65">Prepaid</dt><dd>{inr(x.reservations.prepaidMinor)}</dd><dt className="text-ink/65">Refunded</dt><dd>{inr(x.reservations.refundedMinor)}</dd></dl>
        <p className="text-xs text-ink/60">A high no-show rate means you could allow a smaller pre-bookable share, or require prepayment.</p></Card></div>
  </div>);
}

/** Shown on every parking tab while the site would show the DEMO QR to staff. */
function UpiBanner({ d, onFix }: { d: string; onFix: () => void }) {
  const p = useApi<any>(`/api/admin/payee?destination=${d}`);
  if (!p.data?.demo) return null;
  return (
    <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">
      <p><strong>No UPI ID is set for {p.data.operatorName || "this site"}.</strong> Gate staff are shown a DEMO QR that does not reach a real account.{p.data.blockDemoUpi ? " UPI is currently refused at the gate." : " Anyone who pays it by UPI would be paying nobody."}</p>
      <Button size="sm" variant="accent" onClick={onFix}>Set the UPI ID</Button>
    </div>
  );
}

function Payee({ d }: { d: string }) {
  const p = useApi<any>(`/api/admin/payee?destination=${d}`);
  const [vpa, setVpa] = useState(""), [name, setName] = useState(""), [block, setBlock] = useState(false), [busy, setBusy] = useState(false);
  useEffect(() => { if (p.data) { setVpa(p.data.upiId); setName(p.data.upiName); setBlock(!!p.data.blockDemoUpi); } }, [p.data]);
  async function save() { setBusy(true); try { await api("/api/admin/payee", { method: "PUT", body: { destinationId: d, upiId: vpa, upiName: name || undefined, blockDemoUpi: block } }); toast.success("Payee saved"); p.reload(); } catch (e: any) { toast.error(e.message); } finally { setBusy(false); } }
  if (p.loading) return <PageSkeleton />;
  return (<Card className="max-w-xl space-y-4 p-6"><div><h2 className="text-xl">UPI payee for gate payments</h2><p className="mt-1 text-sm text-ink/75">When a visitor pays by UPI at the parking exit or a counter sale, staff show a QR for the exact amount. It pays this account{p.data?.operatorName ? ` (${p.data.operatorName})` : ""}.</p></div>
    {!p.data?.configured && <p role="note" className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">No UPI ID is set. Staff will see a clearly marked demo QR that does not reach a real account.</p>}
    <Field label="UPI ID (VPA)" hint="For example: monument.trust@sbi"><Input value={vpa} onChange={(e) => setVpa(e.target.value.toLowerCase())} autoComplete="off" /></Field>
    <Field label="Name shown to the payer"><Input value={name} onChange={(e) => setName(e.target.value)} maxLength={40} /></Field>
    <label className="flex items-start gap-2 rounded-lg border border-forest/15 p-3 text-sm"><input type="checkbox" className="mt-0.5 accent-forest" checked={block} onChange={(e) => setBlock(e.target.checked)} /><span><strong>Refuse UPI at the gate until a UPI ID is set.</strong> Staff can still take cash and card. Recommended once you go live, so nobody pays a demo QR by mistake.</span></label>
    <Button loading={busy} onClick={save}>Save payee</Button>
    <p className="text-xs text-ink/60">The app creates the QR and records what staff confirm. It cannot see your bank, so staff must check the money arrived (SMS, soundbox or UPI app) before confirming.</p></Card>);
}

export default function AdminParking() {
  const dests = useApi<any>("/api/destinations?all=1");
  const [dest, setDest] = useState(""), [tab, setTab] = useState<(typeof TABS)[number][0]>("setup");
  const d = dest || dests.data?.items?.[0]?._id || "";
  return (
    <div className="space-y-6"><h1 className="text-3xl">Parking</h1>
      <Card className="p-4"><Field label="Destination"><Select value={d} onChange={(e) => setDest(e.target.value)}>{dests.data?.items?.map((x: any) => <option key={x._id} value={x._id}>{x.name}</option>)}</Select></Field></Card>
      {d && <UpiBanner d={d} onFix={() => setTab("payments")} />}
      <div role="tablist" aria-label="Parking sections" className="flex flex-wrap gap-1 rounded-xl bg-forest-50 p-1">{TABS.map(([id, l]) => <button key={id} role="tab" aria-selected={tab === id} onClick={() => setTab(id)} className={cn("rounded-lg px-4 py-2 text-sm", tab === id ? "bg-white font-medium shadow-sm" : "text-ink/70 hover:text-ink")}>{l}</button>)}</div>
      {d && (tab === "setup" ? <Setup key={d} d={d} /> : tab === "overrides" ? <Overrides key={d} d={d} /> : tab === "passes" ? <Passes key={d} d={d} /> : tab === "reservations" ? <Reservations key={d} d={d} /> : tab === "analytics" ? <Analytics key={d} d={d} /> : <Payee key={d} d={d} />)}
    </div>
  );
}
