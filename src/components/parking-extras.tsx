"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { BadgeCheck, Camera, Printer, ScanLine, X } from "lucide-react";
import { api, useApi } from "@/lib/hooks";
import { Badge, Button, Card, Empty, Field, Input, Modal, Select } from "@/components/ui";
import { PaymentCollector, emptyPay, payDetails, payProblem, type PayValue } from "@/components/pay-collect";
import { cn, inr } from "@/lib/utils";

const when = (d?: string) => (d ? new Date(d).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "");

/* ---------------- Reprint: a clearly marked DUPLICATE ---------------- */
export function ReprintModal({ type, id, onClose }: { type: "booking" | "parking" | "reservation" | "pass"; id: string | null; onClose: () => void }) {
  const [d, setD] = useState<any>(null), [err, setErr] = useState("");
  useEffect(() => { if (!id) { setD(null); setErr(""); return; } api(`/api/staff/reprint?type=${type}&id=${id}`).then(setD).catch((e) => setErr(e.message)); }, [id, type]);
  const title = { booking: "Reprint ticket", parking: "Reprint parking ticket", reservation: "Reprint reservation", pass: "Reprint parking pass" }[type];
  return (
    <Modal open={!!id} onClose={onClose} title={title}>
      {err && <p role="alert" className="text-sm text-red-800">{err}</p>}
      {!d && !err && <p className="text-sm text-ink/60">Preparing the copy...</p>}
      {d && (
        <div className="space-y-3">
          <div className="print-area rounded-xl border-2 border-dashed border-forest/40 bg-ivory-100 p-4 text-center">
            <p className="mb-1 inline-block rounded bg-red-700 px-2 py-0.5 text-xs font-bold tracking-widest text-white">DUPLICATE{d.copy ? ` · COPY ${d.copy}` : ""}</p>
            <p className="text-xs text-ink/60">{d.site}</p>
            <p className="font-mono text-2xl font-semibold tracking-widest text-forest">{d.reference || d.ticketNo}</p>
            {d.vehicleNumber && <p className="text-sm">{d.vehicleNumber}{d.holder ? ` · ${d.holder}` : ""}</p>}
            {d.date && <p className="text-sm">{d.date}{d.start ? `, ${d.start} to ${d.end}` : d.arrivalFrom ? `, from ${d.arrivalFrom}` : ""}{d.quantity ? ` · ${d.quantity} visitor${d.quantity > 1 ? "s" : ""}` : ""}</p>}
            {d.validTo && <p className="text-sm">Valid {d.validFrom} to {d.validTo}</p>}
            {d.entryAt && <p className="text-sm">Entered {when(d.entryAt)}{d.exitAt ? `, left ${when(d.exitAt)}` : ""}</p>}
            {d.entered > 0 && <p className="text-xs font-medium text-amber-900">{d.entered} already entered on this ticket</p>}
            <div className="my-2 flex justify-center"><img src={d.qr} alt="QR code" width={140} height={140} /></div>
            <p className="text-[11px] text-ink/60">Reprinted by {d.printedBy} · {when(d.printedAt)}. The original may not be used again if this copy has been scanned.</p>
          </div>
          <div className="no-print flex justify-end gap-2"><Button variant="outline" onClick={onClose}>Close</Button><Button onClick={() => window.print()}><Printer className="h-4 w-4" aria-hidden />Print</Button></div>
        </div>
      )}
    </Modal>
  );
}

/* ---------------- Number-plate camera ---------------- */
type Sighting = { _id: string; plate: string; match: "pass" | "reservation" | "parked" | "none"; matchRef?: string; direction: string; confidence?: number; at: string; source: string };
const MATCH: Record<string, { label: string; cls: string }> = { pass: { label: "Monthly pass", cls: "bg-emerald-100 text-emerald-900" }, reservation: { label: "Pre-booked", cls: "bg-sky-100 text-sky-900" }, parked: { label: "Inside: exit", cls: "bg-amber-100 text-amber-900" }, none: { label: "New vehicle", cls: "bg-stone-100 text-stone-800" } };

/** Plate camera: a gate camera posts readings to /api/device/plate; staff can also photograph a plate. Either way the reading is only a suggestion until staff confirm. */
export function PlatePanel({ siteId, online, onUse }: { siteId: string; online: boolean; onUse: (s: { plate: string; match: string; ref?: string }) => void }) {
  const list = useApi<any>(online ? `/api/parking/plate?destination=${siteId}` : null, { poll: 5000 });
  const [open, setOpen] = useState(false), [busy, setBusy] = useState(false), [typed, setTyped] = useState(""), [camErr, setCamErr] = useState("");
  const video = useRef<HTMLVideoElement>(null), stream = useRef<MediaStream | null>(null);
  const stop = useCallback(() => { stream.current?.getTracks().forEach((t) => t.stop()); stream.current = null; }, []);
  useEffect(() => {
    if (!open) { stop(); return; }
    setCamErr("");
    navigator.mediaDevices?.getUserMedia({ video: { facingMode: "environment" } }).then((s) => { stream.current = s; if (video.current) { video.current.srcObject = s; video.current.play().catch(() => {}); } }).catch(() => setCamErr("Camera not available. Allow camera access, or type the number below."));
    return stop;
  }, [open, stop]);
  async function send(body: any) {
    setBusy(true);
    try { const r = await api("/api/parking/plate", { body: { destinationId: siteId, ...body } }); toast.success(`Read ${r.plate}`); setOpen(false); list.reload(); onUse({ plate: r.plate, match: r.match, ref: r.ref }); }
    catch (e: any) { toast.error(e.message); } finally { setBusy(false); }
  }
  function snap() {
    const v = video.current; if (!v || !v.videoWidth) return;
    const c = document.createElement("canvas"), w = Math.min(1280, v.videoWidth); c.width = w; c.height = Math.round((v.videoHeight / v.videoWidth) * w);
    c.getContext("2d")!.drawImage(v, 0, 0, c.width, c.height);
    send({ image: c.toDataURL("image/jpeg", 0.8) });
  }
  const items: Sighting[] = list.data?.items || [];
  return (
    <Card className="p-5">
      <div className="flex items-center justify-between gap-2"><h2 className="flex items-center gap-2 text-lg"><ScanLine className="h-5 w-5 text-forest" aria-hidden />Plate camera</h2><Button size="sm" variant="outline" disabled={!online} onClick={() => setOpen(true)}><Camera className="h-4 w-4" aria-hidden />Read a plate</Button></div>
      {!online ? <p className="mt-3 text-sm text-ink/60">Plate reading needs a connection. Type the number instead.</p> : items.length === 0 ? <p className="mt-3 text-sm text-ink/60">No camera sightings in the last 3 hours.</p> : (
        <ul className="mt-3 space-y-2">{items.slice(0, 6).map((s) => (
          <li key={s._id} className="flex items-center justify-between gap-2 rounded-lg border border-forest/10 p-2.5 text-sm">
            <span><span className="font-mono font-medium">{s.plate}</span> <Badge className={MATCH[s.match].cls}>{MATCH[s.match].label}</Badge><span className="block text-xs text-ink/60">{when(s.at)} · {s.direction === "out" ? "leaving" : "arriving"}{s.confidence != null ? ` · ${Math.round(s.confidence * 100)}% sure` : ""}</span></span>
            <Button size="sm" onClick={() => onUse({ plate: s.plate, match: s.match, ref: s.matchRef })}>{s.match === "parked" ? "Check out" : "Use"}</Button>
          </li>))}</ul>
      )}
      <p className="mt-3 text-xs text-ink/60">A reading is a suggestion. Check it against the vehicle before admitting or charging.</p>
      <Modal open={open} onClose={() => setOpen(false)} title="Read a number plate">
        <div className="space-y-3">
          {camErr ? <p role="alert" className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">{camErr}</p> : <video ref={video} playsInline muted className="aspect-video w-full rounded-xl bg-black object-cover" />}
          {!camErr && <Button className="w-full" size="lg" loading={busy} onClick={snap}><Camera className="h-5 w-5" aria-hidden />Capture and read</Button>}
          <form onSubmit={(e) => { e.preventDefault(); send({ text: typed }); }} className="flex items-end gap-2"><Field label="Or type the number to check it" className="flex-1"><Input value={typed} onChange={(e) => setTyped(e.target.value.toUpperCase())} placeholder="UP80 AB 1234" className="font-mono" /></Field><Button type="submit" variant="outline" loading={busy} disabled={typed.trim().length < 4}>Check</Button></form>
        </div>
      </Modal>
    </Card>
  );
}

/* ---------------- Monthly passes ---------------- */
export function PassPanel({ site, types, online, prefill }: { site: { id: string; name: string }; types: any[]; online: boolean; prefill?: { vehicleNumber?: string; vehicleType?: string } }) {
  const offered = types.filter((t) => t.monthlyPassMinor > 0 && ["car", "two_wheeler", "bus"].includes(t.pool));
  const [q, setQ] = useState(""), [open, setOpen] = useState(false), [reprint, setReprint] = useState<string | null>(null);
  const list = useApi<any>(`/api/parking/passes?destination=${site.id}${q.trim().length >= 3 ? `&q=${encodeURIComponent(q.trim())}` : ""}`);
  const [vt, setVt] = useState(offered[0]?.pool || "car"), [num, setNum] = useState(""), [name, setName] = useState(""), [phone, setPhone] = useState(""), [email, setEmail] = useState(""), [pay, setPay] = useState<PayValue>(emptyPay()), [busy, setBusy] = useState(false), [done, setDone] = useState<any>(null);
  useEffect(() => { if (prefill?.vehicleNumber) setNum(prefill.vehicleNumber); if (prefill?.vehicleType) setVt(prefill.vehicleType); }, [prefill?.vehicleNumber, prefill?.vehicleType]);
  const price = offered.find((t) => t.pool === vt)?.monthlyPassMinor || 0, problem = payProblem(pay, price);
  const key = useRef<string>("");
  async function sell() {
    if (!key.current) key.current = crypto.randomUUID();
    setBusy(true);
    try { const r = await api("/api/parking/passes", { body: { destinationId: site.id, vehicleType: vt, vehicleNumber: num, holderName: name, holderPhone: phone || undefined, holderEmail: email || undefined, method: pay.method, payment: payDetails(pay), idempotencyKey: key.current } }); key.current = ""; setDone(r); list.reload(); toast.success(r.renewal ? "Pass renewed" : "Pass sold"); }
    catch (e: any) { toast.error(e.message); } finally { setBusy(false); }
  }
  if (!offered.length && !(list.data?.items || []).length) return null;
  return (
    <Card className="p-5">
      <div className="flex items-center justify-between gap-2"><h2 className="flex items-center gap-2 text-lg"><BadgeCheck className="h-5 w-5 text-forest" aria-hidden />Monthly passes</h2>{offered.length > 0 && <Button size="sm" variant="outline" disabled={!online} onClick={() => { setDone(null); setOpen(true); }}>Sell or renew</Button>}</div>
      <div className="mt-3"><label className="sr-only" htmlFor="pq">Find a pass</label><Input id="pq" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find by vehicle, name or PP- code" className="h-9 text-sm" /></div>
      {list.data && ((list.data.items || []).length === 0 ? <p className="mt-3 text-sm text-ink/60">No passes found.</p> : (
        <ul className="mt-3 max-h-56 space-y-2 overflow-auto">{list.data.items.slice(0, 15).map((p: any) => (
          <li key={p._id} className="flex items-center justify-between gap-2 rounded-lg border border-forest/10 p-2.5 text-sm">
            <span><span className="font-mono font-medium">{p.vehicleNumber}</span> <Badge className={p.status === "cancelled" ? "bg-red-100 text-red-900" : p.current ? "bg-emerald-100 text-emerald-900" : "bg-stone-100 text-stone-700"}>{p.status === "cancelled" ? "Cancelled" : p.current ? "Valid" : p.expired ? "Expired" : "Starts " + p.validFrom}</Badge><span className="block text-xs text-ink/60">{p.holderName} · to {p.validTo} · {p.entries} visit{p.entries === 1 ? "" : "s"}</span></span>
            <span className="flex gap-1">{p.invoiceNo && <Link className="rounded px-2 py-1 text-xs text-terracotta underline" href={`/invoice/parking/${p.reference}`} target="_blank">Invoice</Link>}<Button size="sm" variant="ghost" onClick={() => setReprint(p._id)} aria-label={`Reprint pass ${p.reference}`}><Printer className="h-4 w-4" aria-hidden /></Button></span>
          </li>))}</ul>))}
      <ReprintModal type="pass" id={reprint} onClose={() => setReprint(null)} />
      <Modal open={open} onClose={() => setOpen(false)} title={done ? "Pass issued" : "Sell or renew a monthly pass"}>
        {done ? (
          <div className="space-y-3"><div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-center"><p className="font-mono text-2xl font-semibold text-forest">{done.pass.reference}</p><p className="text-sm">{done.pass.vehicleNumber} · {done.pass.holderName}</p><p className="text-sm">Valid {done.pass.validFrom} to {done.pass.validTo}</p><p className="mt-1 font-display text-2xl">{inr(done.pass.priceMinor)}</p></div>
            <div className="flex justify-end gap-2">{done.pass.invoiceNo && <Link href={`/invoice/parking/${done.pass.reference}`} target="_blank" className="inline-flex h-10 items-center rounded-lg border border-forest/30 px-4 text-sm">Open invoice</Link>}<Button onClick={() => { setOpen(false); setNum(""); setName(""); setPhone(""); setEmail(""); setPay(emptyPay()); }}>Done</Button></div></div>
        ) : (
          <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2"><Field label="Vehicle type"><Select value={vt} onChange={(e) => setVt(e.target.value)}>{offered.map((t) => <option key={t.pool} value={t.pool}>{t.label} · {inr(t.monthlyPassMinor)}</option>)}</Select></Field><Field label="Vehicle number"><Input value={num} onChange={(e) => setNum(e.target.value.toUpperCase())} className="font-mono" placeholder="UP80 AB 1234" /></Field></div>
            <div className="grid gap-3 sm:grid-cols-2"><Field label="Holder name"><Input value={name} onChange={(e) => setName(e.target.value)} /></Field><Field label="Mobile (for expiry reminders)"><Input inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} /></Field></div>
            <Field label="Email (optional)" hint="Used for the expiry reminder and the invoice"><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
            <p className="text-sm text-ink/70">30 days from today, or from the day after the current pass ends when renewing in its last 7 days.</p>
            <PaymentCollector amountMinor={price} value={pay} onChange={setPay} upi={null} idPrefix="pp" />
            {problem && <p role="alert" className="text-sm text-red-800">{problem}</p>}
            <div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button><Button variant="accent" loading={busy} disabled={!!problem || num.trim().length < 4 || name.trim().length < 2} onClick={sell}>Payment received, issue pass</Button></div>
          </div>)}
      </Modal>
    </Card>
  );
}
