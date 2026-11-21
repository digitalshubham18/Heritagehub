"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Minus, Plus, Users } from "lucide-react";
import { Button, Card, Field, Input, Skeleton } from "./ui";
import { LevelBadge } from "./crowd";
import { api, useApi, useUser } from "@/lib/hooks";
import { priceItems } from "@/lib/pricing";
import { adjustedUnit } from "@/lib/pricing-rules";
import { maxRedeemable, pointsValueMinor } from "@/lib/loyalty-core";
import { addDays, cn, fmtTime, inr, todayIST } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";

type Props = { destination: any; categories: any[]; date: string; setDate: (d: string) => void; slots: any; loading: boolean; error: string | null };

export function BookingWidget({ destination, categories, date, setDate, slots, loading, error }: Props) {
  const router = useRouter();
  const { t } = useI18n();
  const { user } = useUser();
  const [slotId, setSlotId] = useState<string | null>(null);
  const [qty, setQty] = useState<Record<string, number>>({});
  const [names, setNames] = useState<string[]>([]);
  const [contact, setContact] = useState({ name: "", email: "", phone: "" });
  const [gst, setGst] = useState({ on: false, gstin: "", legalName: "", address: "", city: "", pin: "" });
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const key = useRef(crypto.randomUUID());

  useEffect(() => { if (user) setContact((c) => ({ name: c.name || user.name, email: c.email || user.email, phone: c.phone || user.phone || "" })); }, [user]);
  const saved = useApi<any>(user ? "/api/me/saved" : null);
  useEffect(() => { setSlotId(null); }, [date]);
  const total = Object.values(qty).reduce((a, b) => a + b, 0);
  useEffect(() => { key.current = crypto.randomUUID(); setNames((n) => Array.from({ length: total }, (_, i) => n[i] || "")); }, [slotId, total]);

  const slot = slots?.slots?.find((s: any) => s.id === slotId);
  const adjPct = (c: any) => slot?.adjust?.[c.audience] ?? 0; // peak / off-peak pricing for the chosen slot
  const unit = (c: any) => adjustedUnit(c.priceMinor, adjPct(c));
  const items = useMemo(() => categories.filter((c) => qty[c._id]).map((c) => ({ unitPriceMinor: adjustedUnit(c.priceMinor, slot?.adjust?.[c.audience] ?? 0), unitFeeMinor: c.feeMinor || 0, quantity: qty[c._id] })), [categories, qty, slot]);
  const loyalty = useApi<any>(user?.role === "tourist" ? "/api/loyalty" : null);
  const [usePts, setUsePts] = useState(0);
  const gross = priceItems(items).subtotalMinor, canUse = maxRedeemable(gross, loyalty.data?.balance || 0), pts = Math.min(usePts, canUse);
  const price = priceItems(items, 0, pointsValueMinor(pts));
  const max = Math.min(destination.bookingPolicy.maxTicketsPerBooking, slot?.remaining ?? 99);
  const change = (id: string, d: number) => setQty((q) => { const n = Math.max(0, (q[id] || 0) + d); if (d > 0 && total >= max) return q; return { ...q, [id]: n }; });

  async function joinWaitlist(id: string) {
    if (!user) { toast.info("Sign in to join the waitlist"); router.push(`/login?next=${encodeURIComponent(location.pathname)}`); return; }
    try { await api("/api/waitlist", { body: { slotId: id, quantity: Math.max(1, total) } }); toast.success(`You're on the waitlist for ${Math.max(1, total)} seat(s). We'll email or text you if seats open.`); }
    catch (err: any) { toast.error(err.message); }
  }
  async function submit() {
    const e: Record<string, string> = {};
    if (!slotId) e.slot = "Choose a time slot";
    if (!total) e.tickets = "Add at least one ticket";
    if (gst.on && (!gst.gstin.trim() || gst.legalName.trim().length < 2 || gst.address.trim().length < 5 || gst.city.trim().length < 2 || !/^\d{6}$/.test(gst.pin))) e.gst = "Fill in all the GST invoice details (GSTIN, business name, address, city, 6-digit PIN), or untick the box";
    if (contact.name.trim().length < 2) e.name = "Enter your name";
    if (!/^\S+@\S+\.\S+$/.test(contact.email)) e.email = "Enter a valid email";
    if (contact.phone.trim().length < 7) e.phone = "Enter a phone number";
    if (names.some((n) => !n.trim())) e.visitors = "Enter a name for every visitor";
    setErrs(e);
    if (Object.keys(e).length) { toast.error(Object.values(e)[0]); return; }
    if (!user) { toast.info("Sign in to continue your booking"); router.push(`/login?next=${encodeURIComponent(location.pathname)}`); return; }
    setBusy(true);
    try {
      const r = await api("/api/bookings", { body: { destinationId: destination._id, slotId, items: Object.entries(qty).filter(([, v]) => v).map(([categoryId, quantity]) => ({ categoryId, quantity })), visitors: names.map((name) => ({ name })), contact, buyer: gst.on ? { gstin: gst.gstin, legalName: gst.legalName, address: gst.address, city: gst.city, pin: gst.pin } : undefined, redeemPoints: pts > 0 ? pts : undefined, idempotencyKey: key.current } });
      router.push(`/checkout/${r.booking._id}`);
    } catch (err: any) { toast.error(err.message); setBusy(false); }
  }

  return (
    <Card className="p-5">
      <h2 className="text-xl">{t("book.title")}</h2>
      <div className="mt-4 space-y-5">
        <Field label={t("book.date")}><Input type="date" min={todayIST()} max={addDays(todayIST(), destination.bookingPolicy.advanceDays)} value={date} onChange={(e) => e.target.value && setDate(e.target.value)} /></Field>

        <fieldset>
          <legend className="mb-2 text-sm font-medium">{t("book.slot")}</legend>
          {loading ? <div className="space-y-2"><Skeleton className="h-12" /><Skeleton className="h-12" /></div>
            : error ? <p role="alert" className="text-sm text-red-700">{error}</p>
            : slots?.closed ? <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">The site is closed on this date. Try another day.</p>
            : !slots.slots.some((s: any) => !s.past) ? <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">All of today's slots have ended. Pick another date.</p>
            : <div className="grid max-h-64 gap-2 overflow-y-auto pr-1">{slots.slots.filter((s: any) => !s.past).map((s: any) => {
              const dis = s.closed || s.past || s.remaining === 0;
              return (
                <label key={s.start} className={cn("flex cursor-pointer items-center justify-between gap-2 rounded-lg border p-2.5 text-sm", slotId === s.id ? "border-forest bg-forest-50 ring-1 ring-forest" : "border-forest/20", dis && "cursor-not-allowed", dis && !(s.remaining === 0 && !s.closed && !s.past) && "opacity-50")}>
                  <span className="flex items-center gap-2"><input type="radio" name="slot" className="accent-forest" disabled={dis} checked={slotId === s.id} onChange={() => setSlotId(s.id)} /><span className="font-medium">{fmtTime(s.start)} to {fmtTime(s.end)}</span>{s.adjust && s.adjust.indian !== 0 && <span className={cn("rounded-full px-1.5 py-0.5 text-[10px] font-medium", s.adjust.indian > 0 ? "bg-amber-100 text-amber-900" : "bg-emerald-100 text-emerald-900")}>{s.adjust.indian > 0 ? t("bw.peak") : t("bw.off")}</span>}</span>
                  <span className="flex items-center gap-2 text-xs"><span>{s.closed ? t("book.closed") : s.past ? t("book.ended") : s.remaining === 0 ? t("book.soldout") : `${s.remaining} ${t("book.left")}`}</span>{!dis && <LevelBadge level={s.level} />}{s.remaining === 0 && !s.closed && !s.past && <button type="button" onClick={(e) => { e.preventDefault(); joinWaitlist(s.id); }} className="rounded bg-terracotta px-2 py-0.5 text-white hover:bg-terracotta-600">{t("book.notify")}</button>}</span>
                </label>);
            })}</div>}
          {errs.slot && <p role="alert" className="mt-1 text-xs text-red-700">{errs.slot}</p>}
        </fieldset>

        <fieldset>
          <legend className="mb-2 text-sm font-medium">{t("book.tickets")}</legend>
          <div className="space-y-2">{categories.map((c) => (
            <div key={c._id} className="flex items-center justify-between gap-2 rounded-lg border border-forest/15 p-2.5">
              <div className="min-w-0"><p className="text-sm font-medium">{c.name}</p><p className="text-xs text-ink/70">{unit(c) + (c.feeMinor || 0) === 0 ? "Free" : inr(unit(c) + (c.feeMinor || 0))}{adjPct(c) !== 0 && <span className={cn("ml-1.5 rounded-full px-1.5 py-0.5 text-[10px] font-medium", adjPct(c) > 0 ? "bg-amber-100 text-amber-900" : "bg-emerald-100 text-emerald-900")}>{adjPct(c) > 0 ? t("bw.peak") : t("bw.off")} {adjPct(c) > 0 ? "+" : ""}{adjPct(c)}%</span>}{c.feeMinor ? ` (includes ${inr(c.feeMinor)} special-entry fee)` : ""}</p></div>
              <div className="flex items-center gap-1"><Button size="sm" variant="outline" aria-label={`Remove one ${c.name} ticket`} onClick={() => change(c._id, -1)} disabled={!qty[c._id]}><Minus className="h-3.5 w-3.5" /></Button><span className="w-6 text-center text-sm" aria-live="polite">{qty[c._id] || 0}</span><Button size="sm" variant="outline" aria-label={`Add one ${c.name} ticket`} onClick={() => change(c._id, 1)} disabled={total >= max}><Plus className="h-3.5 w-3.5" /></Button></div>
            </div>))}</div>
          <p className="mt-1 text-xs text-ink/60">Up to {destination.bookingPolicy.maxTicketsPerBooking} tickets per booking.</p>
          {errs.tickets && <p role="alert" className="mt-1 text-xs text-red-700">{errs.tickets}</p>}
        </fieldset>

        {total > 0 && (<div className="space-y-3">
          <h3 className="flex items-center gap-2 text-base"><Users className="h-4 w-4" aria-hidden />{t("book.visitors")}</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Your name" error={errs.name}><Input value={contact.name} onChange={(e) => setContact({ ...contact, name: e.target.value })} autoComplete="name" /></Field>
            <Field label="Phone" error={errs.phone}><Input value={contact.phone} onChange={(e) => setContact({ ...contact, phone: e.target.value })} inputMode="tel" autoComplete="tel" /></Field>
            <Field label="Email for tickets" error={errs.email} className="sm:col-span-2"><Input type="email" value={contact.email} onChange={(e) => setContact({ ...contact, email: e.target.value })} autoComplete="email" /></Field>
            <div className="sm:col-span-2">
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={gst.on} onChange={(e) => setGst({ ...gst, on: e.target.checked })} />I need a GST invoice for my business</label>
              {gst.on && (
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <Field label="GSTIN"><Input value={gst.gstin} onChange={(e) => setGst({ ...gst, gstin: e.target.value.toUpperCase() })} maxLength={15} autoComplete="off" /></Field>
                  <Field label="Business name"><Input value={gst.legalName} onChange={(e) => setGst({ ...gst, legalName: e.target.value })} autoComplete="organization" /></Field>
                  <Field label="Address" className="sm:col-span-2"><Input value={gst.address} onChange={(e) => setGst({ ...gst, address: e.target.value })} autoComplete="street-address" /></Field>
                  <Field label="City"><Input value={gst.city} onChange={(e) => setGst({ ...gst, city: e.target.value })} autoComplete="address-level2" /></Field>
                  <Field label="PIN code"><Input value={gst.pin} onChange={(e) => setGst({ ...gst, pin: e.target.value })} inputMode="numeric" maxLength={6} autoComplete="postal-code" /></Field>
                  <p className="text-xs text-ink/65 sm:col-span-2">This can't be added after you pay, because the invoice number is issued at payment.</p>
                </div>
              )}
            </div>
          </div>
          {names.map((n, i) => <Field key={i} label={`Visitor ${i + 1} name`} hint={i === 0 ? "As on photo ID" : undefined}><Input value={n} onChange={(e) => setNames((a) => a.map((x, j) => (j === i ? e.target.value : x)))} /></Field>)}
          {errs.visitors && <p role="alert" className="text-xs text-red-700">{errs.visitors}</p>}
          {(saved.data?.savedVisitors || []).length > 0 && <div><p className="mb-1 text-xs text-ink/65">Tap to fill a name from your saved companions:</p><div className="flex flex-wrap gap-1.5">{saved.data.savedVisitors.map((p: any) => <button key={p.name} type="button" className="rounded-full border border-forest/25 px-2.5 py-1 text-xs hover:bg-forest-50" onClick={() => setNames((a) => { const i = a.findIndex((x) => !x.trim()); return i < 0 || a.includes(p.name) ? a : a.map((x, j) => (j === i ? p.name : x)); })}>{p.name}</button>)}</div></div>}
        </div>)}

        {loyalty.data && loyalty.data.balance > 0 && gross > 0 && <div className="rounded-lg border border-forest/15 p-3 text-sm"><label htmlFor="pts" className="font-medium">{t("bw.usepts")} <span className="font-normal text-ink/60">{t("bw.have", { n: loyalty.data.balance })}</span></label>{canUse > 0 ? <div className="mt-2 flex items-center gap-3"><input id="pts" type="range" min={0} max={canUse} value={pts} onChange={(e) => setUsePts(Number(e.target.value))} className="flex-1 accent-forest" /><span className="w-24 text-right">{t("bw.ptseq", { pts, value: inr(pointsValueMinor(pts)) })}</span></div> : <p className="mt-1 text-xs text-ink/60">{t("bw.addtix")}</p>}</div>}
        <div className="rounded-lg bg-ivory-100 p-3 text-sm" aria-live="polite">
          <div className="flex justify-between"><span>Tickets</span><span>{inr(price.subtotalMinor)}</span></div>
          {pts > 0 && <div className="flex justify-between text-emerald-800"><span>{t("bw.loyline", { n: pts })}</span><span>− {inr(pointsValueMinor(pts))}</span></div>}
          <div className="flex justify-between text-ink/70"><span>Convenience fee</span><span>{inr(price.feesMinor)}</span></div>
          <div className="flex justify-between text-ink/70"><span>GST on fee</span><span>{inr(price.taxMinor)}</span></div>
          <div className="mt-1 flex justify-between border-t border-forest/15 pt-1 font-semibold"><span>{t("book.total")}</span><span>{inr(price.totalMinor)}</span></div>
        </div>
        <Button variant="accent" size="lg" className="w-full" loading={busy} onClick={submit}>{t("book.continue")}</Button>
        <p className="text-xs text-ink/60">Driving? Once booked, you can reserve a parking space from your ticket.</p>
        <p className="text-xs text-ink/60">Your seats are held for 10 minutes while you pay. Free cancellation up to {destination.cancellationPolicy.freeUntilHours} hours before the slot.</p>
      </div>
    </Card>
  );
}
