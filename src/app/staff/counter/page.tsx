"use client";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Banknote, CarFront, CreditCard, Minus, Plus, Printer, RotateCcw, Smartphone } from "lucide-react";
import { api, useApi } from "@/lib/hooks";
import { Button, Card, ErrorState, Field, Input, PageSkeleton, Select, StatusBadge, useConfirm } from "@/components/ui";
import { adjustedUnit } from "@/lib/pricing-rules";
import { isNetworkError, newId, useCachedApi, useOnline, useOutbox } from "@/lib/offline";
import { OfflineBar, useOfflineShell } from "@/components/offline-bar";
import { PaymentCollector, emptyPay, payDetails, payProblem, type PayValue, type UpiQr } from "@/components/pay-collect";
import { QR } from "@/components/qr";
import { fmtDate, fmtTime, inr, todayIST } from "@/lib/utils";
import { priceItems } from "@/lib/pricing";
import { useTx } from "@/lib/i18n";
import { useI18n } from "@/lib/i18n";

const METHODS = [{ id: "cash", label: "Cash", icon: Banknote }, { id: "upi", label: "UPI", icon: Smartphone }, { id: "card", label: "Card", icon: CreditCard }] as const;

export default function Counter() {
  const tx = useTx();
  const { t } = useI18n();
  useOfflineShell();
  const online = useOnline();
  const sites = useCachedApi<any>("/api/entries", "sites");
  const [siteId, setSiteId] = useState("");
  const site = sites.data?.items?.find((s: any) => s.id === siteId) || sites.data?.items?.[0];
  const detail = useCachedApi<any>(site ? `/api/destinations/${site.slug}` : null, `counter-dest:${site?.id}`);
  const slots = useCachedApi<any>(site ? `/api/slots?destination=${site.slug}&date=${todayIST()}` : null, `counter-slots:${site?.id}:${todayIST()}`, { poll: 30000 });
  const summary = useApi<any>(site ? `/api/counter/summary?destination=${site.id}` : null, { poll: 20000 });
  const [slotId, setSlotId] = useState("");
  const [qty, setQty] = useState<Record<string, number>>({});
  const [pay, setPay] = useState<PayValue>(emptyPay());
  const method = pay.method;
  const park = useCachedApi<any>(site ? `/api/parking?destination=${site.slug}` : null, `counter-park:${site?.id}`, { poll: 30000 });
  const outbox = useOutbox(`counter:${site?.id || ""}`, (it, r) => { toast.success(`Synced sale ${r.booking?.reference || ""}${r.booking?.invoiceNo ? ` (${r.booking.invoiceNo})` : ""}`); if (r.parkingError) toast.warning(`Sale ${r.booking?.reference}: parking was not issued (${r.parkingError})`); summary.reload(); slots.reload(); });
  const { confirm, dialog } = useConfirm();
  const [wantParking, setWantParking] = useState(false);
  const [pk, setPk] = useState({ vehicleType: "car", bay: "standard" as "standard" | "ev" | "accessible", badge: false, vehicleNumber: "", driverName: "", driverPhone: "", reservationRef: "", prepay: false });
  const [upi, setUpi] = useState<UpiQr>(null), [upiLoading, setUpiLoading] = useState(false);
  const [parkSale, setParkSale] = useState<{ ticket?: any; error?: string } | null>(null);
  const [checkIn, setCheckIn] = useState(true);
  const [busy, setBusy] = useState(false);
  const [sale, setSale] = useState<any>(null);
  const key = useRef(crypto.randomUUID());

  const open = useMemo(() => (slots.data?.slots || []).filter((s: any) => !s.closed && !s.past), [slots.data]);
  const nowMin = new Date().getHours() * 60 + new Date().getMinutes(); // device clock, used only to pre-select a slot
  const current = open.find((s: any) => { const [h, m] = s.start.split(":").map(Number); const [h2, m2] = s.end.split(":").map(Number); return h * 60 + m <= nowMin && nowMin < h2 * 60 + m2; }) || open[0];
  useEffect(() => { if (current && !open.some((s: any) => s.id === slotId)) setSlotId(current.id); }, [current, open, slotId]);
  const chosen = open.find((s: any) => s.id === slotId);
  const isCurrent = !!chosen && chosen.id === current?.id;
  const cats: any[] = detail.data?.categories || [];
  const total = Object.values(qty).reduce((a, b) => a + b, 0);
  const adjPct = (c: any) => chosen?.adjust?.[c.audience] ?? 0; // dynamic / peak pricing for the chosen slot
  const unit = (c: any) => adjustedUnit(c.priceMinor, adjPct(c));
  const price = priceItems(cats.filter((c) => qty[c._id]).map((c) => ({ unitPriceMinor: unit(c), unitFeeMinor: c.feeMinor || 0, quantity: qty[c._id] })));
  const change = (id: string, d: number) => setQty((q) => ({ ...q, [id]: Math.max(0, (q[id] || 0) + d) }));
  const pkType = (park.data?.types || []).find((x: any) => x.type === pk.vehicleType && x.bay === pk.bay);
  const parkingOffered = !!park.data?.available && (park.data?.types || []).length > 0;
  const prepayMinor = wantParking && pk.prepay && pkType ? pkType.firstHourMinor : 0;
  const dueMinor = price.subtotalMinor + prepayMinor;
  const qtyKey = JSON.stringify(qty);
  // A UPI QR for the exact total (tickets plus any parking prepayment). Refreshed whenever the total changes.
  useEffect(() => {
    if (method !== "upi" || dueMinor < 100 || !site) { setUpi(null); return; }
    let on = true; setUpiLoading(true);
    const id = setTimeout(() => { api("/api/pay/upi-qr", { body: { destinationId: site.id, amountMinor: dueMinor, note: "Heritage tickets" } }).then((r) => on && setUpi(r)).catch((e) => on && toast.error(e.message)).finally(() => on && setUpiLoading(false)); }, 250);
    return () => { on = false; clearTimeout(id); };
  }, [method, dueMinor, site]);
  useEffect(() => { key.current = crypto.randomUUID(); }, [slotId, qtyKey, method, checkIn, siteId, wantParking, pk.vehicleNumber, pk.prepay]);

  async function sell() {
    if (!total) return toast.error("Add at least one ticket");
    if (wantParking && pk.bay === "accessible" && !pk.reservationRef && !pk.badge) return toast.error("Confirm the disabled-parking badge was checked");
    if (chosen && total > chosen.remaining) return toast.error(`Only ${chosen.remaining} seat(s) left in this slot`);
    const prob = payProblem(pay, dueMinor); if (prob) return toast.error(prob);
    if (wantParking) {
      if (pk.vehicleNumber.trim().length < 4) return toast.error("Enter the vehicle number for parking");
      if (pk.driverName.trim().length < 2) return toast.error("Enter the driver's name");
      if (!/^[+\d][\d\s-]{6,17}$/.test(pk.driverPhone.trim())) return toast.error("Enter the driver's mobile number");
    }
    const body = { destinationId: site.id, slotId: slotId || undefined, items: Object.entries(qty).filter(([, v]) => v).map(([categoryId, quantity]) => ({ categoryId, quantity })), method, payment: payDetails(pay), checkIn: checkIn && isCurrent, idempotencyKey: key.current,
      parking: wantParking ? { vehicleType: pk.vehicleType, bay: pk.bay !== "standard" ? pk.bay : undefined, badgeChecked: pk.bay === "accessible" ? pk.badge : undefined, vehicleNumber: pk.vehicleNumber, driverName: pk.driverName, driverPhone: pk.driverPhone, reservationRef: pk.reservationRef || undefined, prepay: pk.prepay || undefined } : undefined };
    const saveOffline = () => {
      const at = new Date().toISOString(), id = newId();
      outbox.enqueue({ kind: "counter_sale", url: "/api/counter/sales", body: { ...body, offline: { at, id } }, label: `Sale of ${total} ticket${total > 1 ? "s" : ""} (${inr(dueMinor)})` });
      setSale({ offline: true, localId: id.slice(0, 8).toUpperCase(), totalMinor: dueMinor, date: todayIST(), start: chosen?.start, end: chosen?.end, items: cats.filter((c) => qty[c._id]).map((c) => ({ name: c.name, quantity: qty[c._id], unitPriceMinor: unit(c), unitFeeMinor: c.feeMinor || 0 })) }); setParkSale(null);
      setQty({}); setPay(emptyPay()); setWantParking(false); key.current = crypto.randomUUID(); toast.warning("Saved on this device. Tickets are issued when it uploads. Admit the visitors by hand.");
    };
    if (!online) return saveOffline();
    setBusy(true);
    try {
      const r = await api("/api/counter/sales", { body });
      setSale(r.booking); setParkSale(wantParking ? { ticket: r.parkingTicket, error: r.parkingError } : null);
      if (r.parkingError) toast.warning(`Tickets sold, but parking was not issued: ${r.parkingError}`); else if (r.checkInError) toast.warning(`Sold, but check-in failed: ${r.checkInError}`); else toast.success(`Sold ${total} ticket(s)${r.parkingTicket ? " and issued parking" : ""}`);
      setQty({}); setPay(emptyPay()); setWantParking(false); setPk({ vehicleType: "car", bay: "standard", badge: false, vehicleNumber: "", driverName: "", driverPhone: "", reservationRef: "", prepay: false }); key.current = crypto.randomUUID(); slots.reload(); summary.reload(); park.reload();
    } catch (e: any) { if (isNetworkError(e)) saveOffline(); else toast.error(e.message); } finally { setBusy(false); }
  }

  if (sites.loading) return <PageSkeleton />;
  if (sites.error) return <ErrorState message={sites.error} onRetry={sites.reload} />;
  if (!site) return <p>{tx("No sites assigned.")}</p>;

  return (
    <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
      <div className="space-y-5">
        <h1 className="text-3xl">{tx("Counter sales")}</h1>
        <OfflineBar pending={outbox.pending} conflicts={outbox.conflicts} onSync={outbox.flush} onDiscard={outbox.discard} onRetry={outbox.retry} />
        {sale ? (
          <Card className="space-y-3 p-5 print:border-0" aria-live="polite">
            <div className="flex items-start justify-between"><div><p className="font-display text-xl">{site.name}</p><p className="text-sm text-ink/70">{sale.offline ? "Offline receipt" : "Counter receipt"}</p></div>{sale.offline ? <span className="rounded bg-amber-100 px-2 py-1 text-xs font-bold text-amber-900">{tx("NOT YET UPLOADED")}</span> : <StatusBadge s="paid" />}</div>
            {sale.offline && <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">Money taken, sale saved on this device (ref {sale.localId}). The numbered ticket and invoice are created when the connection returns. Let the visitors in by hand and keep this receipt.</p>}
            <dl className="grid gap-2 text-sm sm:grid-cols-2"><div><dt className="text-ink/60">{tx("Invoice")}</dt><dd className="font-mono">{sale.offline ? "after upload" : sale.invoiceNo}</dd></div><div><dt className="text-ink/60">{tx("Reference")}</dt><dd className="font-mono">{sale.offline ? `OFFLINE-${sale.localId}` : sale.reference}</dd></div><div><dt className="text-ink/60">{tx("Visit")}</dt><dd>{fmtDate(sale.date)}, {fmtTime(sale.start)} to {fmtTime(sale.end)}</dd></div><div><dt className="text-ink/60">{tx("Total taken")}</dt><dd className="font-display text-2xl">{inr(sale.totalMinor)}</dd></div></dl>
            <ul className="text-sm">{sale.items.map((i: any) => <li key={i.name} className="flex justify-between"><span>{i.quantity} × {i.name}</span><span>{inr((i.unitPriceMinor + i.unitFeeMinor) * i.quantity)}</span></li>)}</ul>
            {parkSale?.ticket && <div className="rounded-xl border border-dashed border-forest/30 bg-ivory-100 p-3 text-center"><p className="flex items-center justify-center gap-1.5 text-xs text-ink/60"><CarFront className="h-4 w-4" aria-hidden />{tx("Parking ticket")}</p><p className="font-mono text-xl font-semibold tracking-widest text-forest">{parkSale.ticket.ticketNo}</p><p className="text-sm">{parkSale.ticket.vehicleNumber} · {parkSale.ticket.driverName}</p><div className="my-2 flex justify-center"><QR value={parkSale.ticket.ticketNo} size={110} /></div><p className="text-xs text-ink/70">{parkSale.ticket.prepaidMinor > 0 ? `${inr(parkSale.ticket.prepaidMinor)} prepaid, credited at exit.` : "Parking fee is paid at exit."}</p></div>}
            {parkSale?.error && <p role="alert" className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">Parking was not issued: {parkSale.error}. Admit the vehicle from the Parking page.</p>}
            <div className="no-print flex flex-wrap gap-2"><Button size="sm" onClick={() => window.print()}><Printer className="h-4 w-4" aria-hidden />{tx("Print receipt")}</Button>{!sale.offline && <Link href={`/invoice/${sale._id}`} className="inline-flex h-8 items-center rounded-lg border border-forest/30 px-3 text-sm text-forest hover:bg-forest-50">{tx("Open invoice")}</Link>}<Button size="sm" variant="accent" onClick={() => setSale(null)}>{tx("New sale")}</Button></div>
          </Card>
        ) : (
          <Card className="space-y-5 p-5">
            {sites.data.items.length > 1 && <Field label={tx("Site")}><Select value={site.id} onChange={(e) => { setSiteId(e.target.value); setQty({}); setSlotId(""); }}>{sites.data.items.map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select></Field>}
            <Field label={tx("Time slot")} hint={tx("Walk-ins count against the same slot capacity as online bookings")}>
              <Select value={slotId} onChange={(e) => setSlotId(e.target.value)} disabled={!open.length}>{open.length ? open.map((s: any) => <option key={s.id} value={s.id}>{fmtTime(s.start)} to {fmtTime(s.end)}{s.id === current?.id ? " (now)" : ""} - {s.remaining} left</option>) : <option>{tx("No open slots today")}</option>}</Select>
            </Field>
            <fieldset><legend className="mb-2 text-sm font-medium">{tx("Tickets")}</legend>
              <div className="space-y-2">{cats.map((c) => (
                <div key={c._id} className="flex items-center justify-between gap-2 rounded-lg border border-forest/15 p-3"><div><p className="font-medium">{c.name}</p><p className="text-sm text-ink/70">{unit(c) + (c.feeMinor || 0) === 0 ? "Free" : inr(unit(c) + (c.feeMinor || 0))}{adjPct(c) !== 0 && <span className={`ml-2 rounded-full px-2 py-0.5 text-xs font-medium ${adjPct(c) > 0 ? "bg-amber-100 text-amber-900" : "bg-emerald-100 text-emerald-900"}`}>{adjPct(c) > 0 ? "Peak" : "Off-peak"} {adjPct(c) > 0 ? "+" : ""}{adjPct(c)}%</span>}</p></div>
                  <div className="flex items-center gap-2"><Button variant="outline" aria-label={`Remove one ${c.name}`} disabled={!qty[c._id]} onClick={() => change(c._id, -1)}><Minus className="h-4 w-4" /></Button><span className="w-8 text-center text-lg" aria-live="polite">{qty[c._id] || 0}</span><Button variant="outline" aria-label={`Add one ${c.name}`} onClick={() => change(c._id, 1)}><Plus className="h-4 w-4" /></Button></div></div>))}</div>
            </fieldset>
            {parkingOffered && <fieldset className="rounded-xl border border-forest/15 p-4"><legend className="px-1 text-sm font-medium">{tx("Parking")}</legend>
              <label className="flex items-center gap-2 text-sm font-medium"><input type="checkbox" className="accent-forest" checked={wantParking} onChange={(e) => setWantParking(e.target.checked)} /><CarFront className="h-4 w-4 text-terracotta" aria-hidden />{tx("Does the visitor need parking?")}</label>
              {wantParking && <div className="mt-4 space-y-4">
                <div role="radiogroup" aria-label={tx("Vehicle type")} className="grid grid-cols-2 gap-2 sm:grid-cols-3">{(park.data?.types || []).map((x: any) => <label key={x.pool} className={`flex cursor-pointer flex-col items-center gap-0.5 rounded-lg border p-2.5 text-xs ${pk.vehicleType === x.type && pk.bay === x.bay ? "border-forest bg-forest-50 ring-1 ring-forest" : "border-forest/20"} ${x.available === 0 ? "opacity-50" : ""}`}><input type="radio" name="cvt" className="sr-only" checked={pk.vehicleType === x.type && pk.bay === x.bay} disabled={x.available === 0} onChange={() => setPk({ ...pk, vehicleType: x.type, bay: x.bay, badge: false })} /><span className="font-medium">{x.label}</span><span className={x.available === 0 ? "text-red-800" : "text-ink/65"}>{x.available === 0 ? "Full" : `${x.available} free`}</span></label>)}</div>
                {pk.bay === "accessible" && !pk.reservationRef && <label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-0.5 accent-forest" checked={pk.badge} onChange={(e) => setPk({ ...pk, badge: e.target.checked })} />{tx("I checked the driver's disabled-parking badge or permit")}</label>}
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label={tx("Vehicle number")}><Input value={pk.vehicleNumber} onChange={(e) => setPk({ ...pk, vehicleNumber: e.target.value.toUpperCase() })} placeholder="UP80 AB 1234" autoComplete="off" className="font-mono tracking-wider" /></Field>
                  <Field label={tx("Pre-booking code (if any)")}><Input value={pk.reservationRef} onChange={(e) => setPk({ ...pk, reservationRef: e.target.value.toUpperCase() })} placeholder="PR-XXXXXX" autoComplete="off" className="font-mono" /></Field>
                  <Field label={tx("Driver's name")}><Input value={pk.driverName} onChange={(e) => setPk({ ...pk, driverName: e.target.value })} autoComplete="off" /></Field>
                  <Field label={tx("Driver's mobile number")}><Input inputMode="tel" value={pk.driverPhone} onChange={(e) => setPk({ ...pk, driverPhone: e.target.value })} autoComplete="off" /></Field>
                </div>
                {pkType && pkType.firstHourMinor > 0 && !pk.reservationRef && <label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-0.5 accent-forest" checked={pk.prepay} onChange={(e) => setPk({ ...pk, prepay: e.target.checked })} /><span>Collect the first-hour fee now ({inr(pkType.firstHourMinor)}). It is credited against the final fee at exit.</span></label>}
                {pkType && <p className="text-xs text-ink/65">{pkType.freeMinutes ? `First ${pkType.freeMinutes} min free. ` : ""}{inr(pkType.firstHourMinor)} first hour, then {inr(pkType.extraHourMinor)} per hour{pkType.dailyMaxMinor ? `, capped at ${inr(pkType.dailyMaxMinor)} a day` : ""}. Otherwise the fee is paid when the vehicle leaves.</p>}
              </div>}
            </fieldset>}
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="accent-forest" checked={checkIn && isCurrent} disabled={!isCurrent} onChange={(e) => setCheckIn(e.target.checked)} />Check visitors in now{!isCurrent && " (only for the current slot)"}</label>
            <div className="rounded-lg bg-ivory-100 p-4"><div className="flex items-center justify-between"><span className="text-lg">Total ({total} ticket{total === 1 ? "" : "s"})</span><span className="font-display text-3xl">{inr(dueMinor)}</span></div>{prepayMinor > 0 && <p className="mt-1 text-sm text-ink/70">Tickets {inr(price.subtotalMinor)} + parking prepayment {inr(prepayMinor)}</p>}</div>
            {dueMinor > 0 ? <PaymentCollector amountMinor={dueMinor} value={pay} onChange={setPay} upi={upi} upiLoading={upiLoading} idPrefix="cs" /> : <p className="text-sm text-ink/70">{tx("Free tickets: nothing to collect.")}</p>}
            <Button variant="accent" size="lg" className="w-full" loading={busy} disabled={!open.length} onClick={sell}>{wantParking ? "Take payment, issue tickets and parking" : "Take payment and issue ticket"}{!online ? " (save offline)" : ""}</Button>
          </Card>)}
      </div>
      <aside className="space-y-4">
        <RefundCard siteId={site.id} online={online} confirm={confirm} onDone={() => { summary.reload(); slots.reload(); }} />
        {dialog}
        <Card className="p-5"><h2 className="text-lg">{tx("Today's counter takings")}</h2>
          {summary.data ? (<>
            <p className="mt-2 font-display text-3xl">{inr(summary.data.netMinor)}</p><p className="text-sm text-ink/70">{summary.data.tickets} tickets sold{summary.data.refundsMinor ? `, ${inr(summary.data.refundsMinor)} refunded` : ""}</p>
            <table className="mt-3 w-full text-sm"><caption className="sr-only">{tx("Takings by payment method")}</caption><tbody>{METHODS.map((m) => <tr key={m.id} className="border-t border-forest/10"><th scope="row" className="py-1.5 text-left font-normal">{m.label}</th><td className="py-1.5 text-right">{summary.data.byMethod[m.id]?.count || 0} sales</td><td className="py-1.5 text-right font-medium">{inr(summary.data.byMethod[m.id]?.amountMinor || 0)}</td></tr>)}</tbody></table>
            {summary.data.recent.length > 0 && <><h3 className="mt-4 text-base">{tx("Recent sales")}</h3><ul className="mt-1 divide-y divide-forest/10 text-sm">{summary.data.recent.map((r: any) => <li key={r.reference} className="flex justify-between py-1"><Link className="font-mono text-xs hover:text-terracotta" href={`/invoice/${r.id}`}>{r.reference}</Link><span>{r.quantity} · {inr(r.amountMinor)} · {r.method}</span></li>)}</ul></>}
          </>) : <p className="mt-2 text-sm text-ink/60">{tx("Loading…")}</p>}
        </Card>
      </aside>
    </div>
  );
}

/** Cancel a confirmed, unused booking and refund it. Walk-in sales made today are refunded in full; online bookings follow the cancellation policy. */
function RefundCard({ siteId, online, confirm, onDone }: { siteId: string; online: boolean; confirm: (o: any) => Promise<boolean>; onDone: () => void }) {
  const tx = useTx();
  const [ref, setRef] = useState(""), [reason, setReason] = useState(""), [method, setMethod] = useState("cash"), [busy, setBusy] = useState(false), [res, setRes] = useState<any>(null);
  async function go() {
    const ok = await confirm({ title: "Cancel this booking and refund it?", body: "The seats go back on sale and the ticket stops working. This can't be undone.", confirmLabel: "Cancel and refund", danger: true });
    if (!ok) return;
    setBusy(true);
    try { const r = await api("/api/counter/refund", { body: { reference: ref, reason, method } }); setRes(r); setRef(""); setReason(""); onDone(); toast.success(`Refund of ${inr(r.refundMinor)} recorded`); }
    catch (e: any) { toast.error(e.message); } finally { setBusy(false); }
  }
  return (
    <Card className="p-5"><h2 className="flex items-center gap-2 text-lg"><RotateCcw className="h-5 w-5 text-forest" aria-hidden />{tx("Cancel and refund")}</h2>
      {!online ? <p className="mt-2 text-sm text-ink/60">{tx("Refunds need a connection.")}</p> : (
        <div className="mt-3 space-y-3">
          <Field label={tx("Booking reference")} hint={tx("From the ticket or receipt (HH-XXXX-XXXX)")}><Input value={ref} onChange={(e) => setRef(e.target.value.toUpperCase())} className="font-mono" placeholder="HH-ABCD-2345" autoComplete="off" /></Field>
          <Field label={tx("Reason")}><Input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={200} placeholder={tx("e.g. Visitor changed plans")} /></Field>
          <Field label={tx("Hand the money back by")} hint={tx("Walk-in sales only. Online bookings are refunded to the original payment method.")}><Select value={method} onChange={(e) => setMethod(e.target.value)}><option value="cash">{tx("Cash")}</option><option value="upi">UPI</option><option value="card">{tx("Card")}</option></Select></Field>
          <Button variant="outline" className="w-full" loading={busy} disabled={ref.trim().length < 6 || reason.trim().length < 3} onClick={go}>{tx("Cancel and refund")}</Button>
          {res && <div role="status" className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-900"><p>{tx("Refunded")} <strong>{inr(res.refundMinor)}</strong> ({res.paidBack}).</p>{res.parkingWarning && <p className="mt-1 text-amber-900">{res.parkingWarning}</p>}</div>}
        </div>)}
    </Card>
  );
}
