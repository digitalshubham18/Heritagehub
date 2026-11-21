"use client";
import { useState } from "react";
import { toast } from "sonner";
import { Clock, LogIn, LogOut, Repeat } from "lucide-react";
import { api, useApi } from "@/lib/hooks";
import { Badge, Button, Card, ErrorState, Field, Input, Modal, PageSkeleton, Select } from "@/components/ui";
import { useTx } from "@/lib/i18n";
import { fmtDate } from "@/lib/utils";

const POS: Record<string, string> = { gate: "Gate", counter: "Counter", parking: "Parking", floor: "Floor", supervisor: "Supervisor" };
const swapTone: Record<string, string> = { pending_colleague: "bg-amber-100 text-amber-900", pending_manager: "bg-sky-100 text-sky-900", approved: "bg-emerald-100 text-emerald-900", declined: "bg-stone-100", cancelled: "bg-stone-100", failed: "bg-red-100 text-red-900" };
const swapText: Record<string, string> = { pending_colleague: "waiting for your colleague", pending_manager: "waiting for your manager", approved: "approved", declined: "declined", cancelled: "cancelled", failed: "could not be applied" };
const tm = (d?: string) => (d ? new Date(d).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }) : "");

export default function MyRoster() {
  const tx = useTx();
  const r = useApi<any>("/api/staff/roster", { poll: 60000 });
  const att = useApi<any>("/api/staff/attendance", { poll: 60000 });
  const sw = useApi<any>("/api/staff/swaps", { poll: 30000 });
  const sites = useApi<any>("/api/entries");
  const [site, setSite] = useState(""), [busy, setBusy] = useState(false), [ask, setAsk] = useState<any>(null), [to, setTo] = useState(""), [note, setNote] = useState("");
  async function clock(action: "in" | "out") {
    setBusy(true);
    try {
      const res = await api("/api/staff/attendance", { body: { action, destinationId: action === "in" ? site || sites.data?.items?.[0]?.id : undefined } });
      if (action === "in") toast[res.unrostered ? "warning" : "success"](res.unrostered ? "Clocked in. You're not rostered at this time, so a manager will see it flagged." : res.lateMin ? `Clocked in, ${res.lateMin} minutes after the start of your shift.` : "Clocked in. Have a good shift.");
      else toast.success("Clocked out. Thank you.");
      att.reload(); r.reload();
    } catch (e: any) { toast.error(e.message); } finally { setBusy(false); }
  }
  async function send() {
    setBusy(true);
    try { await api("/api/staff/swaps", { body: { shiftId: ask._id, toUserId: to, note: note || undefined } }); toast.success("Request sent to your colleague. Your manager approves it last."); setAsk(null); setTo(""); setNote(""); sw.reload(); }
    catch (e: any) { toast.error(e.message); } finally { setBusy(false); }
  }
  async function act(id: string, action: string) { try { await api("/api/staff/swaps", { method: "PATCH", body: { id, action } }); sw.reload(); r.reload(); } catch (e: any) { toast.error(e.message); sw.reload(); } }
  if (r.loading) return <PageSkeleton />;
  if (r.error) return <ErrorState message={r.error} onRetry={r.reload} />;
  const d = r.data, a = att.data, open = a?.open, s = sw.data;
  const openSwap = (shiftId: string) => (s?.outgoing || []).some((x: any) => String(x.shift?._id) === shiftId && ["pending_colleague", "pending_manager"].includes(x.status));
  const colleagues = (s?.colleagues || []).filter((c: any) => !ask || (c.assignedDestinations || []).some((x: string) => String(x) === String(ask.destination?._id || ask.destination)));
  return (
    <div className="space-y-6">
      <div><h1 className="text-3xl">{tx("My roster")}</h1><p className="mt-1 text-sm text-ink/70">{tx("Your shifts for the next two weeks, set by your manager. Clock in when you arrive and out when you leave.")}</p></div>

      <Card className={`p-5 ${open ? "border-2 border-emerald-300 bg-emerald-50" : ""}`}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          {open ? (<><div><p className="flex items-center gap-2 font-medium text-emerald-900"><Clock className="h-5 w-5" aria-hidden />Clocked in at {open.destination?.name} since {tm(open.inAt)}{open.lateMin > 0 ? ` (${open.lateMin} min late)` : ""}</p>{open.unrostered && <p className="text-sm text-amber-900">{tx("Not on the roster for this time")}</p>}</div><Button variant="outline" loading={busy} onClick={() => clock("out")}><LogOut className="h-4 w-4" aria-hidden />{tx("Clock out")}</Button></>)
            : (<><div><p className="font-medium">{tx("You're not clocked in")}</p>{d.onNow ? <p className="text-sm text-ink/70">On the roster now: {POS[d.onNow.position]} at {d.onNow.destination?.name}, {d.onNow.start} to {d.onNow.end}</p> : <p className="text-sm text-ink/70">{tx("Clock-in opens 30 minutes before your shift.")}</p>}</div>
              <div className="flex items-center gap-2">{(sites.data?.items || []).length > 1 && <Select aria-label={tx("Site")} className="w-48" value={site || d.onNow?.destination?._id || ""} onChange={(e) => setSite(e.target.value)}>{sites.data.items.map((x: any) => <option key={x.id} value={x.id}>{x.name}</option>)}</Select>}<Button variant="accent" loading={busy} onClick={() => clock("in")}><LogIn className="h-4 w-4" aria-hidden />{tx("Clock in")}</Button></div></>)}
        </div>
      </Card>

      {(s?.incoming || []).length > 0 && <section aria-labelledby="inc" className="space-y-2"><h2 id="inc" className="text-xl">{tx("Colleagues asking you to cover")}</h2>
        {s.incoming.map((x: any) => <Card key={x._id} className="flex flex-wrap items-center justify-between gap-3 border-2 border-terracotta/40 p-4"><div><p className="font-medium">{x.fromName} asked you to cover {x.shift ? `${fmtDate(x.shift.date)}, ${x.shift.start} to ${x.shift.end}` : "a shift"}</p><p className="text-sm text-ink/70">{x.destination?.name}{x.note ? ` · “${x.note}”` : ""}</p>{x.status === "pending_manager" && <p className="text-xs text-sky-900">{tx("You agreed. Waiting for your manager to approve it.")}</p>}</div>
          {x.status === "pending_colleague" && <div className="flex gap-2"><Button variant="outline" onClick={() => act(x._id, "decline")}>{tx("Decline")}</Button><Button variant="accent" onClick={() => act(x._id, "accept")}>{tx("Cover it")}</Button></div>}</Card>)}</section>}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="p-5"><h2 className="text-lg">{tx("My shifts")}</h2>
          {d.mine.length === 0 ? <p className="mt-2 text-sm text-ink/60">{tx("No shifts rostered. Ask your manager.")}</p> : <ul className="mt-2 divide-y divide-forest/10 text-sm">{d.mine.map((x: any) => <li key={x._id} className="flex items-center justify-between gap-2 py-2"><span><span className="font-medium">{fmtDate(x.date)}</span><span className="block text-xs text-ink/60">{x.destination?.name}{x.notes ? ` · ${x.notes}` : ""}</span></span><span className="flex items-center gap-2 text-right"><span><span className="block">{x.start} to {x.end}</span><Badge className="bg-forest-50 text-forest">{POS[x.position]}</Badge></span>{!openSwap(x._id) ? <Button size="sm" variant="ghost" aria-label={`Ask a colleague to cover ${fmtDate(x.date)}`} onClick={() => { setAsk(x); setTo(""); }}><Repeat className="h-4 w-4" aria-hidden /></Button> : <Badge className="bg-amber-100 text-amber-900">{tx("swap requested")}</Badge>}</span></li>)}</ul>}
          {(s?.outgoing || []).length > 0 && <div className="mt-4 border-t border-forest/10 pt-3"><h3 className="text-sm font-medium">{tx("My swap requests")}</h3><ul className="mt-1 space-y-1.5 text-sm">{s.outgoing.slice(0, 6).map((x: any) => <li key={x._id} className="flex flex-wrap items-center justify-between gap-2"><span>{x.shift ? `${fmtDate(x.shift.date)} ${x.shift.start}` : "Shift"} → {x.toName} <Badge className={swapTone[x.status]}>{swapText[x.status]}</Badge>{x.reason && x.status !== "approved" && <span className="block text-xs text-ink/60">{x.reason}</span>}</span>{["pending_colleague", "pending_manager"].includes(x.status) && <Button size="sm" variant="ghost" onClick={() => act(x._id, "cancel")}>{tx("Cancel")}</Button>}</li>)}</ul></div>}
        </Card>
        <Card className="p-5"><h2 className="text-lg">{tx("Who is on today")}</h2>
          {d.team.length === 0 ? <p className="mt-2 text-sm text-ink/60">{tx("Nobody is rostered today.")}</p> : <ul className="mt-2 divide-y divide-forest/10 text-sm">{d.team.map((x: any) => <li key={x._id} className="flex items-center justify-between gap-2 py-2"><span>{x.userName}<span className="block text-xs text-ink/60">{x.destination?.name}</span></span><span className="text-right">{x.start} to {x.end}<span className="block text-xs text-ink/60">{POS[x.position]}</span></span></li>)}</ul>}</Card>
      </div>

      <Modal open={!!ask} onClose={() => setAsk(null)} title={tx("Ask a colleague to cover")}>
        {ask && <div className="space-y-3"><p className="text-sm">{fmtDate(ask.date)}, {ask.start} to {ask.end}, {ask.destination?.name}</p>
          <Field label={tx("Colleague")}><Select value={to} onChange={(e) => setTo(e.target.value)}><option value="">{tx("Choose…")}</option>{colleagues.map((c: any) => <option key={c._id} value={c._id}>{c.name}</option>)}</Select></Field>
          <Field label={tx("Note (optional)")}><Input value={note} maxLength={200} onChange={(e) => setNote(e.target.value)} placeholder={tx("e.g. Family function that day")} /></Field>
          <p className="text-xs text-ink/60">{tx("Your colleague has to agree, then your manager approves it. The shift stays yours until then.")}</p>
          <div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setAsk(null)}>{tx("Cancel")}</Button><Button loading={busy} disabled={!to} onClick={send}>{tx("Send request")}</Button></div></div>}
      </Modal>
    </div>
  );
}
