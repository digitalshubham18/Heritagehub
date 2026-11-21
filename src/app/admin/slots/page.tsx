"use client";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { api, useApi } from "@/lib/hooks";
import { Button, Card, ErrorState, Field, Input, PageSkeleton, Select } from "@/components/ui";
import { LevelBadge } from "@/components/crowd";
import { fmtTime, todayIST } from "@/lib/utils";

function Row({ s, onChange }: { s: any; onChange: () => void }) {
  const [cap, setCap] = useState(String(s.capacity));
  useEffect(() => setCap(String(s.capacity)), [s.capacity]);
  async function patch(body: any) { try { await api(`/api/slots/${s.id}`, { method: "PATCH", body }); toast.success("Slot updated"); onChange(); } catch (e: any) { toast.error(e.message); } }
  return (
    <tr className="border-t border-forest/10">
      <td className="p-3 font-medium">{fmtTime(s.start)} to {fmtTime(s.end)}</td>
      <td className="p-3"><div className="flex items-center gap-1"><label className="sr-only" htmlFor={`c${s.id}`}>Capacity</label><Input id={`c${s.id}`} className="h-8 w-24" type="number" min={s.booked} value={cap} onChange={(e) => setCap(e.target.value)} />{Number(cap) !== s.capacity && <Button size="sm" onClick={() => patch({ capacity: Number(cap) })}>Save</Button>}</div></td>
      <td className="p-3">{s.booked}</td><td className="p-3">{s.remaining}</td><td className="p-3"><LevelBadge level={s.level} /></td>
      <td className="p-3 text-right"><Button size="sm" variant={s.closed ? "primary" : "outline"} onClick={() => patch({ closed: !s.closed, closedReason: s.closed ? "" : "Temporarily closed by administrator" })}>{s.closed ? "Reopen" : "Close slot"}</Button></td>
    </tr>
  );
}

export default function AdminSlots() {
  const dests = useApi<any>("/api/destinations?all=1");
  const [dest, setDest] = useState(""); const [date, setDate] = useState(todayIST());
  const d = dest || dests.data?.items?.[0]?.slug || "";
  const slots = useApi<any>(d ? `/api/slots?destination=${d}&date=${date}` : null);
  const full = useApi<any>(d ? `/api/destinations/${d}` : null);
  const [ns, setNs] = useState({ start: "09:00", end: "10:00", capacity: 100 });
  const [cl, setCl] = useState({ date: todayIST(), reason: "Public holiday" });

  async function add() { try { await api("/api/slots", { body: { destinationId: full.data.destination._id, date, ...ns } }); toast.success("Slot added"); slots.reload(); } catch (e: any) { toast.error(e.message); } }
  async function saveClosures(closures: any[]) { try { await api(`/api/destinations/${full.data.destination._id}`, { method: "PATCH", body: { closures } }); toast.success("Closures updated"); full.reload(); slots.reload(); } catch (e: any) { toast.error(e.message); } }
  const closures: any[] = full.data?.destination?.closures || [];

  return (
    <div className="space-y-6">
      <h1 className="text-3xl">Slots and capacity</h1>
      <Card className="grid gap-3 p-4 sm:grid-cols-2"><Field label="Destination"><Select value={d} onChange={(e) => setDest(e.target.value)}>{dests.data?.items?.map((x: any) => <option key={x._id} value={x.slug}>{x.name}</option>)}</Select></Field><Field label="Date"><Input type="date" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} /></Field></Card>
      {slots.error ? <ErrorState message={slots.error} onRetry={slots.reload} /> : slots.loading || !slots.data ? <PageSkeleton /> : slots.data.closed ? <p className="rounded-lg bg-amber-50 p-4 text-amber-900">The site is closed on this date (weekly closure or exceptional closure).</p> : (
        <Card className="overflow-x-auto"><table className="w-full min-w-[640px] text-sm"><thead className="bg-forest-50 text-left"><tr>{["Slot", "Capacity", "Booked", "Remaining", "Expected crowd", ""].map((h) => <th key={h} className="p-3 font-medium">{h}</th>)}</tr></thead><tbody>{slots.data.slots.map((s: any) => <Row key={s.id} s={s} onChange={slots.reload} />)}</tbody></table>
          <p className="border-t border-forest/10 p-3 text-xs text-ink/60">Capacity can't go below seats already booked. Closing a slot stops new bookings; existing confirmed bookings remain valid.</p></Card>)}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="space-y-3 p-5"><h2 className="text-lg">Add a custom slot on {date}</h2><div className="grid gap-3 sm:grid-cols-3"><Field label="Starts"><Input type="time" value={ns.start} onChange={(e) => setNs({ ...ns, start: e.target.value })} /></Field><Field label="Ends"><Input type="time" value={ns.end} onChange={(e) => setNs({ ...ns, end: e.target.value })} /></Field><Field label="Capacity"><Input type="number" min={0} value={ns.capacity} onChange={(e) => setNs({ ...ns, capacity: Number(e.target.value) })} /></Field></div><Button onClick={add} disabled={!full.data}>Add slot</Button></Card>
        <Card className="space-y-3 p-5"><h2 className="text-lg">Holidays and exceptional closures</h2>
          <div className="flex flex-wrap items-end gap-2"><Field label="Date"><Input type="date" value={cl.date} onChange={(e) => setCl({ ...cl, date: e.target.value })} /></Field><Field label="Reason" className="flex-1"><Input value={cl.reason} onChange={(e) => setCl({ ...cl, reason: e.target.value })} /></Field><Button onClick={() => saveClosures([...closures.filter((c) => c.date !== cl.date), cl])} disabled={!full.data}>Add closure</Button></div>
          {closures.length ? <ul className="divide-y divide-forest/10 text-sm">{closures.map((c) => <li key={c.date} className="flex items-center justify-between py-1.5"><span>{c.date}: {c.reason}</span><button className="text-xs text-terracotta underline" onClick={() => saveClosures(closures.filter((x) => x.date !== c.date))}>Remove</button></li>)}</ul> : <p className="text-sm text-ink/60">No exceptional closures.</p>}
          <p className="text-xs text-ink/60">Closing a date with confirmed bookings does not cancel them; review those under Bookings.</p></Card>
      </div>
    </div>
  );
}
