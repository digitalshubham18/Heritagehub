"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { CalendarCheck, CarFront, Info } from "lucide-react";
import { api, useApi, useUser } from "@/lib/hooks";
import { Badge, Button, Card, Empty, ErrorState, Field, Input, PageSkeleton, Select, StatusBadge } from "@/components/ui";
import { LiveStrip, useLive } from "@/components/live";
import { cn, fmtDate, inr, todayIST, addDays } from "@/lib/utils";
import { useConfirmDialog } from "./use-confirm";
import { MyPasses } from "@/components/my-passes";

const VT = [["car", "Car"], ["two_wheeler", "Two-wheeler"], ["bus", "Bus or coach"], ["ev", "EV charging bay"], ["accessible", "Accessible bay"]] as const;
const TIMES = Array.from({ length: 22 }, (_, i) => { const m = 6 * 60 + i * 30; return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`; });

function PayChoice({ checked, onChange, title, desc }: { checked: boolean; onChange: () => void; title: string; desc: string }) {
  const id = `pc-${title.replace(/\W+/g, "-")}`;
  return <div className={cn("rounded-lg border p-3 text-sm", checked ? "border-forest bg-forest-50" : "border-forest/20")}><label className="flex cursor-pointer items-start gap-3 font-medium"><input type="radio" name="pm" className="mt-1 accent-forest" checked={checked} onChange={onChange} aria-describedby={id} />{title}</label><p id={id} className="pl-7 text-ink/70">{desc}</p></div>;
}

export default function ParkingBooking() {
  const dests = useApi<any>("/api/destinations");
  const saved = useApi<any>("/api/me/saved");
  const mine = useApi<any>("/api/parking/reservations");
  const [slug, setSlug] = useState(""), [date, setDate] = useState(todayIST()), [type, setType] = useState("car"), [num, setNum] = useState(""), [arrival, setArrival] = useState("09:00");
  const [mode, setMode] = useState<"prepay" | "at_exit">("at_exit"), [method, setMethod] = useState<"upi" | "card">("upi"), [bookingRef, setBookingRef] = useState(""), [busy, setBusy] = useState(false), [just, setJust] = useState<string | null>(null);
  const key = useRef(crypto.randomUUID());
  const { ask, dialog } = useConfirmDialog();
  useEffect(() => { const p = new URLSearchParams(window.location.search); if (p.get("destination")) setSlug(p.get("destination")!); if (p.get("date")) setDate(p.get("date")!); if (p.get("booking")) setBookingRef(p.get("booking")!); }, []);
  useEffect(() => { if (!slug && dests.data?.items?.length) setSlug(dests.data.items[0].slug); }, [dests.data, slug]);
  useEffect(() => { key.current = crypto.randomUUID(); }, [slug, date, type, num, arrival, mode, method]);
  const avail = useApi<any>(slug ? `/api/parking?destination=${slug}&date=${date}` : null);
  const live = useLive(slug || null).items[0];
  const dest = dests.data?.items?.find((d: any) => d.slug === slug);
  const t = avail.data?.types?.find((x: any) => x.pool === type), r = avail.data?.reservable?.find((x: any) => x.pool === type);
  const { user } = useUser();
  const vehicles: any[] = saved.data?.vehicles || [];
  const minDate = todayIST(), maxDate = addDays(minDate, avail.data?.reserveAheadDays || 30);
  const pick = (v: any) => { setType(v.type); setNum(v.number); };
  const fee = mode === "prepay" ? t?.firstHourMinor || 0 : 0;

  async function reserve(e: React.FormEvent) {
    e.preventDefault(); setBusy(true);
    try {
      const res = await api("/api/parking/reservations", { body: { destinationId: dest._id || dest.id, date, vehicleType: type === "ev" || type === "accessible" ? "car" : type, bay: type === "ev" || type === "accessible" ? type : undefined, vehicleNumber: num, arrivalFrom: arrival, paymentMode: fee > 0 ? "prepay" : "at_exit", method: fee > 0 ? method : undefined, bookingRef: bookingRef || undefined, idempotencyKey: key.current } });
      setJust(res.reservation._id); toast.success(`Parking reserved. Your code is ${res.reservation.reference}`); setNum(""); mine.reload(); avail.reload();
    } catch (err: any) { toast.error(err.message); } finally { setBusy(false); }
  }
  async function cancel(x: any) {
    const arrivalAt = new Date(`${x.date}T${x.arrivalFrom}:00+05:30`).getTime(), early = Date.now() <= arrivalAt - 2 * 3600000;
    const ok = await ask("Cancel this reservation?", x.prepaidMinor > 0 ? (early ? `Your ${inr(x.prepaidMinor)} prepayment will be refunded in full.` : `It is less than 2 hours before your arrival time, so the ${inr(x.prepaidMinor)} prepayment will not be refunded.`) : "The space will be released for other visitors.");
    if (!ok) return;
    try { const r = await api(`/api/parking/reservations?id=${x._id}`, { method: "DELETE" }); toast.success(r.refundMinor ? `Cancelled. ${inr(r.refundMinor)} refunded.` : "Reservation cancelled"); mine.reload(); avail.reload(); } catch (err: any) { toast.error(err.message); }
  }
  const { upcoming, past } = useMemo(() => { const all: any[] = mine.data?.items || []; return { upcoming: all.filter((x) => x.status === "reserved").sort((a, b) => a.date.localeCompare(b.date)), past: all.filter((x) => x.status !== "reserved") }; }, [mine.data]);
  if (dests.loading) return <PageSkeleton />;
  if (dests.error) return <ErrorState message={dests.error} onRetry={dests.reload} />;
  return (
    <div className="space-y-8">{dialog}
      <div><h1 className="text-3xl">Book parking</h1><p className="mt-1 text-ink/75">Reserve a space before you arrive so you are not circling a full car park. Your space is held all day.</p></div>
      <div className="grid gap-6 lg:grid-cols-[1.3fr_1fr]">
        <Card className="p-5"><form onSubmit={reserve} className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Destination"><Select value={slug} onChange={(e) => setSlug(e.target.value)}>{(dests.data?.items || []).map((d: any) => <option key={d.slug} value={d.slug}>{d.name}, {d.city}</option>)}</Select></Field>
            <Field label="Visit date"><Input type="date" min={minDate} max={maxDate} value={date} onChange={(e) => setDate(e.target.value)} /></Field>
          </div>
          {avail.data && !avail.data.available ? <p className="flex items-start gap-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-900"><Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />This destination has no managed parking, so there is nothing to reserve. Check the destination page for local options.</p> : <>
            {vehicles.length > 0 && <div><p className="mb-2 text-sm font-medium">Your saved vehicles</p><div className="flex flex-wrap gap-2">{vehicles.map((v, i) => <button key={i} type="button" onClick={() => pick(v)} className={cn("rounded-full border px-3 py-1.5 text-sm", num === v.number ? "border-forest bg-forest-50" : "border-forest/25 hover:bg-forest-50")}><span className="font-mono">{v.number}</span>{v.label ? ` · ${v.label}` : ""}</button>)}</div></div>}
            <div role="radiogroup" aria-label="Vehicle type" className="grid grid-cols-2 gap-2 sm:grid-cols-3">{VT.filter(([id]) => !["ev", "accessible"].includes(id) || avail.data?.types?.some((y: any) => y.pool === id)).map(([id, label]) => { const x = avail.data?.types?.find((y: any) => y.pool === id), rl = avail.data?.reservable?.find((y: any) => y.pool === id); const off = !x || !rl || rl.quota < 1; return <label key={id} className={cn("flex flex-col items-center gap-0.5 rounded-xl border p-3 text-sm", type === id ? "border-forest bg-forest-50 ring-1 ring-forest" : "border-forest/20", off ? "cursor-not-allowed opacity-45" : "cursor-pointer")}><input type="radio" name="vt" className="sr-only" disabled={off} checked={type === id} onChange={() => setType(id)} /><span className="font-medium">{label}</span><span className="text-xs text-ink/65">{off ? "Not offered" : rl.left === 0 ? "Fully booked" : `${rl.left} left to book`}</span></label>; })}</div>
            <div className="grid gap-4 sm:grid-cols-2"><Field label="Vehicle number"><Input value={num} onChange={(e) => setNum(e.target.value.toUpperCase())} placeholder="UP80 AB 1234" autoComplete="off" className="font-mono tracking-wider" /></Field>
              <Field label="Expected arrival" hint="Your space is held all day"><Select value={arrival} onChange={(e) => setArrival(e.target.value)}>{TIMES.map((x) => <option key={x}>{x}</option>)}</Select></Field></div>
            {t && <fieldset className="space-y-2"><legend className="mb-1 text-sm font-medium">Payment</legend>
              <PayChoice checked={mode === "at_exit"} onChange={() => setMode("at_exit")} title="Pay when you leave" desc="Reserve for free. Pay the parking fee at the exit gate by cash, UPI or card." />
              {t.firstHourMinor > 0 && <PayChoice checked={mode === "prepay"} onChange={() => setMode("prepay")} title={`Prepay the first hour (${inr(t.firstHourMinor)})`} desc="Credited against your final fee, so you only pay any balance at exit. Free cancellation until 2 hours before arrival." />}
              {mode === "prepay" && fee > 0 && <div className="flex gap-2 pl-1 text-sm">{(["upi", "card"] as const).map((m) => <label key={m} className={cn("cursor-pointer rounded-full border px-3 py-1", method === m ? "border-forest bg-forest-50" : "border-forest/25")}><input type="radio" name="mm" className="sr-only" checked={method === m} onChange={() => setMethod(m)} />{m.toUpperCase()}</label>)}</div>}
            </fieldset>}
            {t && <p className="rounded-lg bg-ivory-100 p-3 text-xs text-ink/75">Rates: {t.freeMinutes ? `first ${t.freeMinutes} min free, ` : ""}{inr(t.firstHourMinor)} for the first hour, then {inr(t.extraHourMinor)} per hour{t.dailyMaxMinor ? `, capped at ${inr(t.dailyMaxMinor)} a day` : ""}.</p>}
            {bookingRef && <p className="text-xs text-ink/65">Linked to your booking <span className="font-mono">{bookingRef}</span>.</p>}
            <Button type="submit" size="lg" className="w-full" loading={busy} disabled={!t || !r || r.left === 0 || num.trim().length < 4}>{fee > 0 ? `Pay ${inr(fee)} and reserve` : "Reserve my space"}</Button>
            {fee > 0 && <p className="text-xs text-ink/60">This version records the prepayment without charging a real card or UPI account.</p>}
          </>}
        </form></Card>
        <aside className="space-y-4">{slug && <Card className="p-5"><h2 className="text-lg">{dest?.name || "Live now"}</h2>{live ? <div className="mt-2 space-y-3"><LiveStrip s={live} />{live.parking && <ul className="space-y-1 text-sm">{live.parking.map((p) => <li key={p.type} className="flex justify-between"><span>{p.label}</span><span className={p.available === 0 ? "font-medium text-red-800" : "text-emerald-800"}>{p.available} free of {p.capacity}</span></li>)}</ul>}<p className="text-xs text-ink/60">Free spaces right now, after setting aside spaces for pre-booked vehicles.</p></div> : <p className="mt-2 text-sm text-ink/60">Loading…</p>}</Card>}
          <Card className="p-5 text-sm text-ink/80"><h2 className="text-lg">How it works</h2><ol className="mt-2 list-decimal space-y-1.5 pl-5"><li>Reserve your space and note your code.</li><li>At the car park gate, show the QR or give your vehicle number.</li><li>Staff admit you straight away. Any prepayment is credited.</li><li>Pay any balance at the exit gate.</li></ol></Card></aside>
      </div>

      <section aria-labelledby="mr"><h2 id="mr" className="text-xl">My reservations</h2>
        {mine.error ? <ErrorState message={mine.error} onRetry={mine.reload} /> : upcoming.length === 0 ? <div className="mt-3"><Empty title="No upcoming reservations">Reserve above. Your code and QR will appear here.</Empty></div> : <div className="mt-3 grid gap-4 md:grid-cols-2">{upcoming.map((x) => (
          <Card key={x._id} className={cn("p-4", just === x._id && "ring-2 ring-terracotta")}><div className="flex items-start justify-between gap-3"><div><p className="font-medium">{x.destinationInfo?.name}</p><p className="flex items-center gap-1.5 text-sm text-ink/75"><CalendarCheck className="h-4 w-4" aria-hidden />{fmtDate(x.date)}, from {x.arrivalFrom}</p><p className="mt-1 flex items-center gap-1.5 text-sm"><CarFront className="h-4 w-4 text-terracotta" aria-hidden /><span className="font-mono">{x.vehicleNumber}</span></p>
            <p className="mt-2 font-mono text-lg font-semibold tracking-widest text-forest">{x.reference}</p>{x.prepaidMinor > 0 ? <Badge className="mt-1 bg-emerald-100 text-emerald-900">{inr(x.prepaidMinor)} prepaid</Badge> : <Badge className="mt-1 bg-stone-100">Pay at exit</Badge>}</div>
            {x.qr && /* eslint-disable-next-line @next/next/no-img-element */ <img src={x.qr} alt={`QR code for reservation ${x.reference}`} className="h-28 w-28 rounded-lg border border-forest/10" />}</div>
            <div className="mt-3 flex justify-end"><Button size="sm" variant="ghost" onClick={() => cancel(x)}>Cancel reservation</Button></div></Card>))}</div>}
        {past.length > 0 && <details className="mt-6"><summary className="cursor-pointer text-sm font-medium text-forest">Past and cancelled ({past.length})</summary><ul className="mt-3 divide-y divide-forest/10 rounded-xl border border-forest/10 bg-white text-sm">{past.slice(0, 15).map((x) => <li key={x._id} className="flex flex-wrap items-center justify-between gap-2 p-3"><span><span className="font-mono">{x.reference}</span> · {x.destinationInfo?.name} · {fmtDate(x.date)}</span><span className="flex items-center gap-2">{x.refundMinor > 0 && <span className="text-xs text-ink/65">{inr(x.refundMinor)} refunded</span>}<StatusBadge s={x.status} /></span></li>)}</ul></details>}
      </section>
      {user && <MyPasses destinationId={dest?._id || dest?.id} destinationName={dest?.name} types={avail.data?.types || []} userName={user.name} />}
      <p className="text-sm text-ink/70">Need tickets as well? <Link href="/destinations" className="text-terracotta underline">Browse destinations</Link>.</p>
    </div>
  );
}
