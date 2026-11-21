"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import Link from "next/link";
import { AlertTriangle, BadgeCheck, Bike, Bus, CarFront, CalendarCheck, Printer, Search, Zap, Accessibility } from "lucide-react";
import { api, useApi } from "@/lib/hooks";
import { Button, Card, ErrorState, Field, Input, Modal, PageSkeleton, Select } from "@/components/ui";
import { PaymentCollector, emptyPay, payDetails, payProblem, type PayValue, type UpiQr } from "@/components/pay-collect";
import { QR } from "@/components/qr";
import { cn, inr } from "@/lib/utils";
import { cacheGet, cacheSet, isNetworkError, newId, useOnline, useOutbox } from "@/lib/offline";
import { OfflineBar, useOfflineShell } from "@/components/offline-bar";
import { PassPanel, PlatePanel, ReprintModal } from "@/components/parking-extras";
import { parkingFee } from "@/lib/parking-fee";
import { useTx } from "@/lib/i18n";
import { useI18n } from "@/lib/i18n";

const TYPES = [{ id: "car", label: "Car", icon: CarFront }, { id: "two_wheeler", label: "Two-wheeler", icon: Bike }, { id: "bus", label: "Bus or coach", icon: Bus }] as const;
const dur = (m: number) => (m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`);
const tLabel = (id: string) => TYPES.find((x) => x.id === id)?.label || id;

export default function Parking() {
  const tx = useTx();
  const { t } = useI18n();
  useOfflineShell();
  const online = useOnline();
  const sitesApi = useApi<any>("/api/entries");
  useEffect(() => { if (sitesApi.data) cacheSet("sites", sitesApi.data); }, [sitesApi.data]);
  const sites = { ...sitesApi, data: sitesApi.data || (typeof window !== "undefined" ? cacheGet("sites")?.data : null), loading: sitesApi.loading && !(typeof window !== "undefined" && cacheGet("sites")), error: sitesApi.data || (typeof window !== "undefined" && cacheGet("sites")) ? null : sitesApi.error };
  const [siteId, setSiteId] = useState("");
  const site = sites.data?.items?.find((s: any) => s.id === siteId) || sites.data?.items?.[0];
  const actApi = useApi<any>(site ? `/api/parking/active?destination=${site.id}` : null, { poll: 10000 });
  useEffect(() => { if (actApi.data && site) cacheSet(`parking:${site.id}`, actApi.data); }, [actApi.data, site]);
  const cachedAct = site && typeof window !== "undefined" ? cacheGet(`parking:${site.id}`) : null;
  const act = { ...actApi, data: actApi.data || cachedAct?.data || null, error: actApi.data || cachedAct ? null : actApi.error };
  const outbox = useOutbox(`parking:${site?.id || ""}`, (it, r) => { toast.success(it.kind === "parking_entry" ? `Synced entry ${r.ticket?.vehicleNumber || ""}` : `Synced exit ${r.ticket?.vehicleNumber || ""}`); actApi.reload(); });
  const sum = useApi<any>(site ? `/api/parking/summary?destination=${site.id}` : null, { poll: 20000 });
  const [mode, setMode] = useState<"walkin" | "prebooked">("walkin");
  const [bay, setBay] = useState<"standard" | "ev" | "accessible">("standard"), [badge, setBadge] = useState(false), [lost, setLost] = useState(false), [lostNote, setLostNote] = useState(""), [lostId, setLostId] = useState(false), [reprint, setReprint] = useState<string | null>(null);
  const [type, setType] = useState("car"), [num, setNum] = useState(""), [driver, setDriver] = useState(""), [phone, setPhone] = useState(""), [code, setCode] = useState("");
  const [busy, setBusy] = useState(false), [issued, setIssued] = useState<any>(null), [find, setFind] = useState(""), [filter, setFilter] = useState("");
  const [plateRead, setPlateRead] = useState<any>(null), [exit, setExit] = useState<any>(null), [pay, setPay] = useState<PayValue>(emptyPay()), [q, setQ] = useState<any>(null), [qLoading, setQLoading] = useState(false), [done, setDone] = useState<any>(null);
  const refresh = () => { actApi.reload(); sum.reload(); };

  function admitOffline(body: any) {
    const at = new Date().toISOString(), offlineId = newId();
    outbox.enqueue({ kind: "parking_entry", url: "/api/parking/entry", body: { destinationId: site.id, ...body, at, offlineId }, label: `Entry ${body.vehicleNumber || body.reservationRef}` });
    setIssued({ offline: true, ticketNo: "OFFLINE", vehicleNumber: body.vehicleNumber || body.reservationRef, vehicleType: body.vehicleType || "car", entryAt: at, driverName: body.driverName });
    setNum(""); setDriver(""); setPhone(""); setCode(""); setBadge(false); toast.warning("Saved on this device. It uploads when the connection returns.");
  }
  async function admit(body: any) {
    if (!online) return admitOffline(body);
    setBusy(true);
    try { const r = await api("/api/parking/entry", { body: { destinationId: site.id, ...body } }); setIssued(r.ticket); setNum(""); setDriver(""); setPhone(""); setCode(""); toast.success(r.ticket.passApplied ? `Monthly pass vehicle ${r.ticket.vehicleNumber} admitted` : r.ticket.reservationApplied ? `Pre-booked vehicle ${r.ticket.vehicleNumber} admitted` : `Admitted ${r.ticket.vehicleNumber}`); setBay("standard"); setBadge(false); refresh(); }
    catch (err: any) { if (isNetworkError(err)) admitOffline(body); else toast.error(err.message); } finally { setBusy(false); }
  }
  const onWalkin = (e: React.FormEvent) => { e.preventDefault(); admit({ vehicleType: type, bay: type === "car" ? bay : undefined, badgeChecked: bay === "accessible" ? badge : undefined, vehicleNumber: num, driverName: driver || undefined, driverPhone: phone || undefined, plate: plateRead || undefined }); setPlateRead(null); };

  /** Fixes the amount due and, for UPI, builds a QR for exactly that amount. */
  const lostRef = useRef(false);
  /** The amount from cached rates, for when there is no connection. Priced at the real exit time when it syncs; any difference is flagged to a manager. */
  const localQuote = useCallback((v: any, isLost: boolean) => {
    const data = act.data, pool = v.bay && v.bay !== "standard" ? v.bay : v.vehicleType, rate = data?.rates?.[pool];
    if (!rate) return null;
    const minutes = Math.max(1, Math.ceil((Date.now() - new Date(v.entryAt).getTime()) / 60000)), feeMinor = v.passRef ? 0 : parkingFee(rate, minutes), penaltyMinor = isLost && !v.passRef ? data.lostTicketFeeMinor || 0 : 0, prepaidMinor = v.prepaidMinor || 0;
    return { offline: true, minutes, feeMinor, penaltyMinor, prepaidMinor, dueMinor: Math.max(0, feeMinor - prepaidMinor) + penaltyMinor, quote: null, upi: null, expiresAt: null };
  }, [act.data]);
  const pendingExits = new Set(outbox.items.filter((i) => i.kind === "parking_exit" && i.status === "pending").map((i) => String(i.body.vehicleNumber).toUpperCase().replace(/[^A-Z0-9]/g, "")));
  const refreshAge = (v: any) => { if (online && !v.offline) return v; const lq = localQuote(v, false); return lq ? { ...v, minutes: lq.minutes, dueMinor: lq.dueMinor } : v; };
  const localIn = outbox.items.filter((i) => i.kind === "parking_entry" && i.status === "pending" && i.body.vehicleNumber).map((i) => refreshAge({ id: `off-${i.id}`, offline: true, ticketNo: "OFFLINE", vehicleNumber: String(i.body.vehicleNumber).toUpperCase().replace(/[^A-Z0-9]/g, ""), vehicleType: i.body.vehicleType || "car", bay: i.body.bay || "standard", entryAt: i.at, driverName: i.body.driverName, driverPhone: i.body.driverPhone, minutes: 1, dueMinor: 0, prepaidMinor: 0, source: "staff" }));
  const allItems: any[] = [...localIn, ...(act.data?.items || []).filter((v: any) => !pendingExits.has(v.vehicleNumber)).map(refreshAge)];
  const requote = useCallback(async (v: any, method: string, isLost = lostRef.current) => {
    if (!navigator.onLine || v.offline) { const lq = localQuote(v, isLost); if (!lq) toast.error("Rates aren't saved on this device yet. Open this page once while online."); setQ(lq); return lq; }
    setQLoading(true);
    try { const r = await api(`/api/parking/quote?ticketNo=${v.ticketNo}${method === "upi" ? "&method=upi" : ""}${isLost ? "&lost=1" : ""}`); setQ(r); return r; }
    catch (err: any) { if (isNetworkError(err)) { const lq = localQuote(v, isLost); setQ(lq); return lq; } toast.error(err.message); setQ(null); return null; } finally { setQLoading(false); }
  }, [localQuote]);
  function startExit(v: any) { setPay(emptyPay()); setQ(null); setDone(null); setLost(false); lostRef.current = false; setLostNote(""); setLostId(false); setExit(v); requote(v, "cash", false); }
  function pickMethod(v: PayValue) { const changed = v.method !== pay.method; setPay(v); if (changed && exit && !q?.offline && (v.method === "upi" || q?.upi)) requote(exit, v.method); }
  function toggleLost(on: boolean) { setLost(on); lostRef.current = on; if (exit) requote(exit, pay.method, on); }
  // Re-quote automatically when a quote runs out, so staff never charge a stale amount.
  useEffect(() => {
    if (!exit || !q || q.offline || done) return;
    const ms = new Date(q.expiresAt).getTime() - Date.now();
    const id = setTimeout(async () => { const old = q.dueMinor; const r = await requote(exit, pay.method); if (r && r.dueMinor !== old) toast.warning(`Amount updated to ${inr(r.dueMinor)}. Show the new QR if the visitor hasn't paid yet.`); }, Math.max(1000, ms - 5000));
    return () => clearTimeout(id);
  }, [exit, q, done, pay.method, requote]);

  function exitOffline() {
    const method = q.dueMinor > 0 ? pay.method : undefined, lostBody = lost ? { note: lostNote, idChecked: lostId } : undefined;
    outbox.enqueue({ kind: "parking_exit", url: "/api/parking/exit", body: { destinationId: site.id, vehicleNumber: exit.vehicleNumber, method, details: q.dueMinor > 0 ? payDetails(pay) : undefined, at: new Date().toISOString(), collectedMinor: q.dueMinor, lost: lostBody, offlineId: newId() }, label: `Exit ${exit.vehicleNumber}` });
    setDone({ offline: true, dueMinor: q.dueMinor, feeMinor: q.feeMinor, penaltyMinor: q.penaltyMinor, prepaidMinor: q.prepaidMinor, minutes: q.minutes, method: q.dueMinor > 0 ? pay.method : q.prepaidMinor > 0 ? "prepaid" : "free", vehicleNumber: exit.vehicleNumber, ticket: { ticketNo: exit.ticketNo }, tendered: pay.tendered });
  }
  async function confirmExit() {
    if (!exit || !q) return;
    if (q.offline) return exitOffline();
    setBusy(true);
    try { const r = await api("/api/parking/exit", { body: { ticketNo: exit.ticketNo, method: q.dueMinor > 0 ? pay.method : undefined, details: q.dueMinor > 0 ? payDetails(pay) : undefined, quote: q.quote, expectedDueMinor: q.dueMinor, lost: lost ? { note: lostNote, idChecked: lostId } : undefined } }); setDone({ ...r, method: q.dueMinor > 0 ? pay.method : r.prepaidMinor > 0 ? "prepaid" : r.ticket.method === "pass" ? "pass" : "free", vehicleNumber: exit.vehicleNumber, tendered: pay.tendered }); refresh(); }
    catch (err: any) { if (isNetworkError(err)) { toast.warning("Connection lost. Saving this check-out on the device."); exitOffline(); } else { toast.error(err.message); if (/changed|lost-ticket status/i.test(err.message)) requote(exit, pay.method); } } finally { setBusy(false); }
  }
  const lookup = () => { const k = find.trim().toUpperCase().replace(/[^A-Z0-9-]/g, ""); const m = allItems.find((v: any) => v.ticketNo === k || v.vehicleNumber === k.replace(/-/g, "")); if (m) { startExit(m); setFind(""); } else toast.error("No parked vehicle matches that ticket or number"); };

  if (sites.loading) return <PageSkeleton />;
  if (sites.error) return <ErrorState message={sites.error} onRetry={sites.reload} />;
  if (!site) return <p>{tx("No sites assigned.")}</p>;
  const items: any[] = allItems.filter((v: any) => !filter || `${v.vehicleNumber} ${v.ticketNo} ${v.driverName || ""} ${v.driverPhone || ""}`.toUpperCase().includes(filter.toUpperCase()));
  const upiQr: UpiQr = q?.upi || null;
  const problem = q ? payProblem(pay, q.dueMinor) : "loading";
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3"><h1 className="text-3xl">{t("d.parking")}</h1>{sites.data.items.length > 1 && <Select aria-label={tx("Site")} className="w-56" value={site.id} onChange={(e) => setSiteId(e.target.value)}>{sites.data.items.map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select>}</div>
      <OfflineBar pending={outbox.pending} conflicts={outbox.conflicts} onSync={outbox.flush} onDiscard={outbox.discard} onRetry={outbox.retry} />
      {act.error && !act.data && <ErrorState message={act.error} onRetry={actApi.reload} />}
      {act.data && !act.data.configured ? <Card className="p-6 text-ink/80">Parking isn&apos;t set up for {site.name}. A manager can configure spaces and rates.</Card> : (<>
        <div className="grid gap-4 sm:grid-cols-3 xl:grid-cols-5">{(act.data?.types || []).map((x: any) => { const pct = x.capacity ? Math.round(((x.occupied + x.held) / x.capacity) * 100) : 100, Icon = x.pool === "ev" ? Zap : x.pool === "accessible" ? Accessibility : TYPES.find((tt) => tt.id === x.type)?.icon || CarFront; return (
          <Card key={x.pool} className="p-5"><div className="flex items-center justify-between"><span className="flex items-center gap-2 font-medium"><Icon className="h-5 w-5 text-forest" aria-hidden />{x.label}</span><span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", x.available === 0 ? "bg-red-100 text-red-900" : "bg-emerald-100 text-emerald-900")}>{x.available} free</span></div>
            {x.overridden && <p className="mt-1 text-xs font-medium text-amber-900">Today&apos;s capacity changed from {x.normalCapacity} to {x.capacity}</p>}
            <p className="mt-3 font-display text-3xl">{x.occupied}<span className="text-lg text-ink/55"> / {x.capacity}</span></p>
            {x.held > 0 && <p className="mt-1 text-xs text-ink/65">{x.held} space{x.held > 1 ? "s" : ""} held for pre-booked vehicles</p>}
            <div className="mt-3 h-2 rounded-full bg-forest/10" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={`${x.label} occupancy`}><div className={cn("h-2 rounded-full", pct >= 100 ? "bg-red-600" : pct >= 85 ? "bg-terracotta" : "bg-forest")} style={{ width: `${Math.min(100, pct)}%` }} /></div></Card>); })}</div>

        <div className="grid gap-6 lg:grid-cols-[1fr_1.5fr]">
          <div className="space-y-6">
            <Card className="p-5"><h2 className="text-lg">{tx("Admit a vehicle")}</h2>
              <div role="tablist" aria-label={tx("Admission type")} className="mt-3 grid grid-cols-2 gap-1 rounded-lg bg-forest-50 p-1 text-sm">{([["walkin", "Walk-in"], ["prebooked", `Pre-booked${act.data?.expected?.length ? ` (${act.data.expected.length})` : ""}`]] as const).map(([id, l]) => <button key={id} role="tab" aria-selected={mode === id} onClick={() => setMode(id)} className={cn("rounded-md py-1.5", mode === id ? "bg-white font-medium shadow-sm" : "text-ink/70")}>{l}</button>)}</div>
              {mode === "walkin" ? (
                <form onSubmit={onWalkin} className="mt-4 space-y-4"><div role="radiogroup" aria-label={tx("Vehicle type")} className="grid grid-cols-3 gap-2">{TYPES.map((x) => <label key={x.id} className={cn("flex cursor-pointer flex-col items-center gap-1 rounded-xl border p-3 text-xs", type === x.id ? "border-forest bg-forest-50 ring-1 ring-forest" : "border-forest/20")}><input type="radio" name="vt" className="sr-only" checked={type === x.id} onChange={() => setType(x.id)} /><x.icon className="h-6 w-6" aria-hidden />{x.label}</label>)}</div>
                  {type === "car" && (act.data?.types || []).some((x: any) => x.pool === "ev" || x.pool === "accessible") && <Field label={tx("Bay")}><Select value={bay} onChange={(e) => setBay(e.target.value as any)}><option value="standard">{tx("Standard car bay")}</option>{(act.data.types as any[]).filter((x) => x.pool === "ev").map((x) => <option key="ev" value="ev">EV charging bay ({x.available} free)</option>)}{(act.data.types as any[]).filter((x) => x.pool === "accessible").map((x) => <option key="ac" value="accessible">Accessible bay ({x.available} free)</option>)}</Select></Field>}
                  {type === "car" && bay === "accessible" && <label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1" checked={badge} onChange={(e) => setBadge(e.target.checked)} />{tx("I checked the driver's disabled-parking badge or permit")}</label>}
                  <Field label={tx("Vehicle number")} hint={tx("If this vehicle was pre-booked or holds a monthly pass it is recognised automatically")}><Input value={num} onChange={(e) => setNum(e.target.value.toUpperCase())} placeholder="UP80 AB 1234" autoComplete="off" className="h-12 font-mono text-lg tracking-wider" /></Field>
                  <div className="grid gap-3 sm:grid-cols-2"><Field label={tx("Driver name (optional)")}><Input value={driver} onChange={(e) => setDriver(e.target.value)} autoComplete="off" /></Field><Field label={tx("Mobile (optional)")}><Input inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} autoComplete="off" /></Field></div>
                  <Button type="submit" size="lg" className="w-full" loading={busy} disabled={num.trim().length < 4 || (type === "car" && bay === "accessible" && !badge)}>{online ? "Admit and issue ticket" : "Admit (save offline)"}</Button></form>
              ) : (
                <div className="mt-4 space-y-4">
                  <form onSubmit={(e) => { e.preventDefault(); admit({ reservationRef: code }); }} className="flex gap-2"><label htmlFor="rc" className="sr-only">{tx("Reservation code")}</label><Input id="rc" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="PR-XXXXXX" className="font-mono tracking-wider" autoComplete="off" /><Button type="submit" loading={busy} disabled={code.trim().length < 6}>{tx("Admit")}</Button></form>
                  <div><p className="mb-2 flex items-center gap-1.5 text-sm font-medium"><CalendarCheck className="h-4 w-4 text-forest" aria-hidden />{tx("Expected today")}</p>
                    {(act.data?.expected || []).length === 0 ? <p className="text-sm text-ink/60">{tx("No pre-booked vehicles are waiting.")}</p> : <ul className="max-h-64 space-y-2 overflow-auto">{act.data.expected.map((r: any) => <li key={r.id} className="flex items-center justify-between gap-2 rounded-lg border border-forest/10 p-2.5 text-sm"><span><span className="font-mono font-medium">{r.vehicleNumber}</span><span className="block text-xs text-ink/60">{tLabel(r.vehicleType)} · {r.reference} · from {r.arrivalFrom}{r.prepaidMinor > 0 ? ` · ${inr(r.prepaidMinor)} prepaid` : ""}</span></span><Button size="sm" loading={busy} onClick={() => admit({ reservationRef: r.reference })}>{tx("Admit")}</Button></li>)}</ul>}</div>
                </div>)}
              {issued && <div role="status" className="mt-4 rounded-xl border border-dashed border-forest/30 bg-ivory-100 p-4 text-center print-area"><p className="text-xs text-ink/60">Parking ticket · {site.name}</p><p className="font-mono text-2xl font-semibold tracking-widest text-forest">{issued.ticketNo}</p><p className="text-sm">{issued.vehicleNumber} · {tLabel(issued.vehicleType)}</p>
                <div className="my-2 flex justify-center"><QR value={issued.offline ? issued.vehicleNumber : issued.ticketNo} size={120} /></div>
                <p className="text-xs text-ink/70">Entry {new Date(issued.entryAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}{issued.driverName ? ` · ${issued.driverName}` : ""}{issued.prepaidMinor > 0 ? ` · ${inr(issued.prepaidMinor)} credit` : ""}</p>
                <p className="mt-1 text-xs text-ink/60">{tx("Keep this ticket. The fee is paid at exit.")}</p>{issued.offline && <p className="mt-1 text-xs font-medium text-amber-900">{tx("Saved offline. The ticket number is issued when this uploads. Use the vehicle number to check out.")}</p>}<div className="no-print mt-3 flex justify-center gap-2"><Button variant="outline" size="sm" onClick={() => window.print()}><Printer className="h-4 w-4" aria-hidden />{tx("Print")}</Button>{issued._id && <Button variant="ghost" size="sm" onClick={() => setReprint(issued._id)}>{tx("Reprint copy")}</Button>}</div></div>}
            </Card>
            <Card className="p-5"><h2 className="text-lg">{tx("Quick exit")}</h2><form onSubmit={(e) => { e.preventDefault(); lookup(); }} className="mt-3 flex gap-2"><label className="sr-only" htmlFor="qe">{tx("Ticket number or vehicle number")}</label><Input id="qe" value={find} onChange={(e) => setFind(e.target.value)} placeholder={tx("PK-… or vehicle number")} autoComplete="off" className="font-mono" /><Button type="submit" variant="outline">{tx("Find")}</Button></form></Card>
            <PlatePanel siteId={site.id} online={online} onUse={(r) => { if (r.match === "parked") { const m = allItems.find((v: any) => v.vehicleNumber === r.plate); if (m) startExit(m); } else { setMode("walkin"); setNum(r.plate); setPlateRead({ read: r.plate, source: "staff_camera" }); toast.info(r.match === "pass" ? "Monthly pass holder. Choose Admit." : r.match === "reservation" ? "Pre-booked today. Choose Admit." : "Check the plate against the vehicle, then Admit."); } }} />
            <PassPanel site={site} types={act.data?.types || []} online={online} prefill={{ vehicleNumber: num || undefined, vehicleType: type }} />
            {sum.data && <Card className="p-5"><h2 className="text-lg">{tx("Today")}</h2><dl className="mt-3 grid grid-cols-3 gap-2 text-sm"><div><dt className="text-ink/60">{tx("In")}</dt><dd className="font-display text-2xl">{sum.data.entered}</dd></div><div><dt className="text-ink/60">{tx("Out")}</dt><dd className="font-display text-2xl">{sum.data.exited}</dd></div><div><dt className="text-ink/60">{tx("Avg stay")}</dt><dd className="font-display text-2xl">{dur(sum.data.avgMinutes)}</dd></div></dl>
              <p className="mt-3 text-sm">{tx("Collected at the gate:")} <strong>{inr(sum.data.collectedMinor)}</strong></p><p className="text-xs text-ink/65">Cash {inr(sum.data.byMethod.cash)} · UPI {inr(sum.data.byMethod.upi)} · Card {inr(sum.data.byMethod.card)}</p>{sum.data.reservationArrivals > 0 && <p className="mt-1 text-xs text-ink/65">{sum.data.reservationArrivals} pre-booked arrival{sum.data.reservationArrivals > 1 ? "s" : ""} · {inr(sum.data.creditedMinor)} prepaid credit applied</p>}</Card>}
          </div>
          <Card className="overflow-hidden"><div className="flex flex-wrap items-center justify-between gap-2 border-b border-forest/10 p-4"><h2 className="text-lg">Parked now ({allItems.length})</h2>
            <div className="relative"><Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-ink/45" aria-hidden /><label className="sr-only" htmlFor="pf">{tx("Filter parked vehicles")}</label><Input id="pf" value={filter} onChange={(e) => setFilter(e.target.value)} placeholder={tx("Filter by number, ticket, driver")} className="h-9 w-56 pl-8 text-sm" /></div></div>
            <div className="max-h-[40rem] overflow-auto"><table className="w-full min-w-[520px] text-sm"><caption className="sr-only">{tx("Vehicles currently parked")}</caption><thead className="sticky top-0 bg-forest-50 text-left"><tr><th className="p-3 font-medium">{tx("Vehicle")}</th><th className="p-3 font-medium">{tx("Parked")}</th><th className="p-3 font-medium">{tx("Due now")}</th><th className="p-3" /></tr></thead>
              <tbody>{items.length === 0 && <tr><td colSpan={4} className="p-8 text-center text-ink/60">{filter ? "No match." : "No vehicles parked."}</td></tr>}
                {items.map((v) => <tr key={v.id} className="border-t border-forest/10"><td className="p-3"><p className="font-mono font-medium">{v.vehicleNumber}</p><p className="text-xs text-ink/60">{tLabel(v.vehicleType)}{v.bay && v.bay !== "standard" ? ` (${v.bay === "ev" ? "EV bay" : "accessible bay"})` : ""} · {v.ticketNo}{v.driverName ? ` · ${v.driverName}` : ""}</p>{v.source === "reservation" && <span className="text-xs text-emerald-800">{tx("Pre-booked")} </span>}{v.passRef && <span className="inline-flex items-center gap-1 text-xs text-emerald-800"><BadgeCheck className="h-3 w-3" aria-hidden />{tx("Monthly pass")} </span>}{v.offline && <span className="text-xs font-medium text-amber-800">{tx("Waiting to upload")}</span>}</td>
                  <td className="p-3">{dur(v.minutes)}{v.overstay && <span className="mt-1 flex items-center gap-1 text-xs font-medium text-red-800"><AlertTriangle className="h-3 w-3" aria-hidden />{tx("Overstay")}</span>}</td>
                  <td className="p-3 font-medium">{v.dueMinor > 0 ? inr(v.dueMinor) : "Free"}{v.prepaidMinor > 0 && <span className="block text-xs font-normal text-ink/60">{inr(v.prepaidMinor)} prepaid</span>}</td><td className="p-3 text-right"><span className="inline-flex gap-1">{!v.offline && <Button size="sm" variant="ghost" onClick={() => setReprint(v.id)} aria-label={`Reprint ticket ${v.ticketNo}`}><Printer className="h-4 w-4" aria-hidden /></Button>}<Button size="sm" onClick={() => startExit(v)}>{tx("Check out")}</Button></span></td></tr>)}</tbody></table></div></Card>
        </div></>)}

      <ReprintModal type="parking" id={reprint} onClose={() => setReprint(null)} />
      <Modal open={!!exit} onClose={() => { setExit(null); setDone(null); }} title={done ? "Vehicle checked out" : "Check out vehicle"} wide>
        {exit && !done && <div className="space-y-4">
          <div className="rounded-xl bg-ivory-100 p-4"><p className="font-mono text-xl font-semibold">{exit.vehicleNumber}</p><p className="text-sm text-ink/70">{tLabel(exit.vehicleType)} · {exit.ticketNo}{q ? ` · parked ${dur(q.minutes)}` : ""}</p>
            {q ? <dl className="mt-3 grid grid-cols-3 gap-2 text-sm"><div><dt className="text-ink/60">{tx("Parking fee")}</dt><dd className="font-medium">{inr(q.feeMinor)}</dd></div>{q.penaltyMinor > 0 && <div><dt className="text-ink/60">{tx("Lost-ticket charge")}</dt><dd className="font-medium">{inr(q.penaltyMinor)}</dd></div>}<div><dt className="text-ink/60">{tx("Prepaid credit")}</dt><dd className="font-medium">{q.prepaidMinor ? `− ${inr(q.prepaidMinor)}` : "None"}</dd></div><div><dt className="text-ink/60">{tx("Amount due")}</dt><dd className="font-display text-3xl">{q.dueMinor > 0 ? inr(q.dueMinor) : "Nil"}</dd></div></dl> : <p className="mt-2 text-sm text-ink/60">{tx("Calculating the fee…")}</p>}</div>
          {q?.upiBlocked && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-900">{tx("UPI is switched off for this site because no UPI ID has been set. Take cash or card, or ask your manager to set the UPI ID.")}</p>}
          {q?.offline && <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">{tx("Offline. The amount is worked out from the rates saved on this device. When this uploads the server prices it at the exact exit time and a manager sees any difference.")}</p>}
          {!exit.passRef && <div className="rounded-lg border border-forest/15 p-3"><label className="flex items-start gap-2 text-sm font-medium"><input type="checkbox" className="mt-1" checked={lost} onChange={(e) => toggleLost(e.target.checked)} />Driver has lost the parking ticket{(act.data?.lostTicketFeeMinor || 0) > 0 ? ` (adds ${inr(act.data.lostTicketFeeMinor)})` : ""}</label>
            {lost && <div className="mt-3 space-y-3"><label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1" checked={lostId} onChange={(e) => setLostId(e.target.checked)} />{tx("I checked the driver's ID and the vehicle's papers (RC) match this vehicle")}</label><Field label={tx("What did you check?")}><Input value={lostNote} onChange={(e) => setLostNote(e.target.value)} placeholder={tx("e.g. RC book and driving licence, name matches")} maxLength={200} /></Field></div>}</div>}
          {q?.upiBlocked && <p role="alert" className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">{tx("UPI is switched off for this site until your manager sets a UPI ID. Take cash or card.")}</p>}
          {q && q.dueMinor > 0 && <PaymentCollector amountMinor={q.dueMinor} value={pay} onChange={pickMethod} upi={upiQr} upiLoading={qLoading && pay.method === "upi"} idPrefix="px" />}
          {q && q.dueMinor === 0 && <p className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-900">{tx("Nothing to collect. This vehicle can leave.")}</p>}
          <p className="text-xs text-ink/60">{tx("The amount shown is held for 5 minutes, so the visitor pays exactly what is on screen. It refreshes by itself after that.")}</p>
          {problem && problem !== "loading" && <p role="alert" className="text-sm text-red-800">{problem}</p>}
          <div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setExit(null)}>{tx("Back")}</Button><Button variant="accent" loading={busy} disabled={!q || !!problem || (lost && (!lostId || lostNote.trim().length < 3))} onClick={confirmExit}>{q && q.dueMinor > 0 ? (pay.method === "cash" ? "Cash received, open gate" : pay.method === "upi" ? "UPI received, open gate" : "Card approved, open gate") : "Open gate"}</Button></div></div>}
        {exit && done && <div className="space-y-3 print-area"><div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-center"><p className="text-sm text-emerald-900">{tx("Gate open. Receipt")}</p><p className="font-display text-4xl text-forest">{inr(done.dueMinor)}</p><p className="text-sm text-ink/75">{done.dueMinor > 0 ? `Paid by ${done.method.toUpperCase()}` : done.prepaidMinor > 0 ? "Covered by prepaid credit" : "No fee"}</p></div>
          <dl className="grid grid-cols-2 gap-2 text-sm"><dt className="text-ink/60">{tx("Vehicle")}</dt><dd className="font-mono">{done.vehicleNumber}</dd><dt className="text-ink/60">{tx("Ticket")}</dt><dd className="font-mono">{done.ticket.ticketNo}</dd><dt className="text-ink/60">{tx("Time parked")}</dt><dd>{dur(done.minutes)}</dd><dt className="text-ink/60">{tx("Parking fee")}</dt><dd>{inr(done.feeMinor)}</dd>{done.penaltyMinor > 0 && <><dt className="text-ink/60">{tx("Lost-ticket charge")}</dt><dd>{inr(done.penaltyMinor)}</dd></>}{done.prepaidMinor > 0 && <><dt className="text-ink/60">{tx("Prepaid credit")}</dt><dd>− {inr(done.prepaidMinor)}</dd></>}{done.method === "cash" && done.tendered && Number(done.tendered) * 100 >= done.dueMinor && <><dt className="text-ink/60">{tx("Change returned")}</dt><dd className="font-medium">{inr(Math.round(Number(done.tendered) * 100) - done.dueMinor)}</dd></>}</dl>
          {done.offline && <p className="rounded-lg bg-amber-50 p-2 text-xs text-amber-900">{tx("Saved offline. It uploads when the connection returns.")}</p>}{done.ticket?.invoiceNo && <p className="text-xs text-ink/70">Invoice {done.ticket.invoiceNo}{done.ticket.gstMinor > 0 ? ` (includes GST ${inr(done.ticket.gstMinor)})` : ""}</p>}
          <div className="no-print flex flex-wrap justify-end gap-2">{done.ticket?.invoiceNo && <Link href={`/invoice/parking/${done.ticket.ticketNo}`} target="_blank" className="inline-flex h-10 items-center rounded-lg border border-forest/30 px-4 text-sm">{tx("Invoice")}</Link>}<Button variant="outline" onClick={() => window.print()}><Printer className="h-4 w-4" aria-hidden />{tx("Print receipt")}</Button><Button onClick={() => { setExit(null); setDone(null); }}>{tx("Done")}</Button></div></div>}
      </Modal>
    </div>
  );
}
