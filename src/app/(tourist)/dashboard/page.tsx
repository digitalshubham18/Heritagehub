"use client";
import { useMemo } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { AlertTriangle, Bell, CarFront, CalendarCheck, Info, MapPinned, Ticket, Wallet } from "lucide-react";
import { api, useApi, useUser } from "@/lib/hooks";
import { Button, Card, Empty, PageSkeleton, Stat, StatusBadge } from "@/components/ui";
import { LiveStrip, useLive } from "@/components/live";
import { cn, fmtDate, fmtTime, inr, todayIST } from "@/lib/utils";

const SEV = { critical: "border-red-300 bg-red-50 text-red-950", warning: "border-amber-300 bg-amber-50 text-amber-950", info: "border-sky-200 bg-sky-50 text-sky-950" } as const;
const SEV_ICON = { critical: AlertTriangle, warning: AlertTriangle, info: Info } as const;

export default function Dashboard() {
  const { user } = useUser();
  const b = useApi<any>("/api/bookings");
  const f = useApi<any>("/api/favorites");
  const w = useApi<any>("/api/waitlist");
  const alerts = useApi<any>("/api/me/alerts", { poll: 60000 });
  const res = useApi<any>("/api/parking/reservations");
  const live = useLive(null, { all: true });
  const bySlug = useMemo(() => new Map(live.items.map((x) => [x.slug, x])), [live.items]);
  async function leave(id: string) { try { await api(`/api/waitlist?id=${id}`, { method: "DELETE" }); toast.success("Removed from waitlist"); w.reload(); } catch (e: any) { toast.error(e.message); } }
  if (b.loading) return <PageSkeleton />;
  const today = todayIST(), all: any[] = b.data?.items || [];
  const upcoming = all.filter((x) => x.status === "confirmed" && x.date >= today).sort((a, c) => a.date.localeCompare(c.date) || a.start.localeCompare(c.start));
  const todays = upcoming.filter((x) => x.date === today);
  const visited = new Set(all.filter((x) => x.status === "completed" || (x.status === "confirmed" && x.date < today && x.checkedInCount > 0)).map((x) => String(x.destination)));
  const spent = all.filter((x) => ["confirmed", "completed"].includes(x.status)).reduce((a, x) => a + (x.totalMinor || 0) - (x.refundMinor || 0), 0);
  const parkNext = (res.data?.items || []).filter((x: any) => x.status === "reserved");
  const parkFor = (x: any) => parkNext.find((p: any) => String(p.destination) === String(x.destination) && p.date === x.date);
  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-3"><h1 className="text-3xl">Hello, {user?.name?.split(" ")[0] || "traveller"}</h1>
        <nav aria-label="Quick actions" className="flex flex-wrap gap-2 text-sm"><Link href="/destinations" className="rounded-lg bg-forest px-3 py-2 text-ivory">Book a visit</Link><Link href="/dashboard/parking" className="rounded-lg border border-forest/30 px-3 py-2 text-forest hover:bg-forest-50">Book parking</Link><Link href="/crowd-status" className="rounded-lg border border-forest/30 px-3 py-2 text-forest hover:bg-forest-50">Live crowd</Link></nav></div>

      {(alerts.data?.items || []).length > 0 && <section aria-labelledby="al"><h2 id="al" className="flex items-center gap-2 text-xl"><Bell className="h-5 w-5 text-terracotta" aria-hidden />For you right now</h2>
        <div className="mt-3 space-y-2">{alerts.data.items.slice(0, 6).map((a: any) => { const I = SEV_ICON[a.severity as keyof typeof SEV_ICON]; return <div key={a.id} role={a.severity === "critical" ? "alert" : "note"} className={cn("flex gap-3 rounded-xl border p-3 text-sm", SEV[a.severity as keyof typeof SEV])}><I className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /><div><p className="font-medium">{a.title}</p><p>{a.body}</p>{a.href && <Link href={a.href} className="mt-1 inline-block underline">Open</Link>}</div></div>; })}</div></section>}

      <section aria-label="Your travel summary" className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Upcoming visits" value={upcoming.length} icon={CalendarCheck} /><Stat label="Places visited" value={visited.size} icon={MapPinned} sub={visited.size ? "See your passport" : "Your first stamp awaits"} />
        <Stat label="Spent on visits" value={inr(spent)} icon={Wallet} /><Stat label="Parking reserved" value={parkNext.length} icon={CarFront} />
      </section>

      {todays.length > 0 && <section aria-labelledby="td"><h2 id="td" className="text-xl">Today&apos;s visit</h2>
        <div className="mt-3 space-y-3">{todays.map((x) => { const l = bySlug.get(x.destinationInfo?.slug); const p = parkFor(x); return (
          <Card key={x._id} className="space-y-3 border-terracotta/40 p-5"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="font-display text-xl">{x.destinationInfo?.name}</p><p className="text-sm text-ink/75">{fmtTime(x.start)} to {fmtTime(x.end)} · {x.quantity} ticket(s) · <span className="font-mono">{x.reference}</span></p></div><Link href="/dashboard/tickets" className="inline-flex h-10 items-center gap-2 rounded-lg bg-terracotta px-4 text-sm font-medium text-white hover:bg-terracotta-600"><Ticket className="h-4 w-4" aria-hidden />Show my QR</Link></div>
            {l && <LiveStrip s={l} />}
            {p ? <p className="flex items-center gap-2 rounded-lg bg-emerald-50 p-2 text-sm text-emerald-900"><CarFront className="h-4 w-4" aria-hidden />Parking reserved: code <span className="font-mono font-semibold">{p.reference}</span> · {p.vehicleNumber}</p> : <Link href={`/dashboard/parking?destination=${x.destinationInfo?.slug}&date=${x.date}&booking=${x.reference}`} className="inline-flex items-center gap-2 text-sm text-terracotta underline"><CarFront className="h-4 w-4" aria-hidden />Still need parking? Reserve a space</Link>}</Card>); })}</div></section>}

      <section aria-labelledby="up"><h2 id="up" className="text-xl">Upcoming visits</h2>
        <div className="mt-3 space-y-3">{upcoming.filter((x) => x.date !== today).length === 0 ? (todays.length ? <p className="text-sm text-ink/60">Nothing else planned.</p> : <Empty title="No upcoming visits" action={<Link href="/destinations" className="rounded-lg bg-forest px-4 py-2 text-sm text-ivory">Find a destination</Link>}>Book a timed ticket and it will show up here with its QR code.</Empty>)
          : upcoming.filter((x) => x.date !== today).slice(0, 4).map((x) => { const p = parkFor(x); return <Card key={x._id} className="space-y-2 p-4"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="font-medium">{x.destinationInfo?.name}</p><p className="text-sm text-ink/70">{fmtDate(x.date)}, {fmtTime(x.start)} • {x.quantity} ticket(s)</p></div><div className="flex items-center gap-3"><StatusBadge s={x.status} /><Link href="/dashboard/tickets" className="text-sm text-terracotta underline">View ticket</Link></div></div>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">{bySlug.get(x.destinationInfo?.slug) && <span className="text-ink/70">Right now: <LiveStrip s={bySlug.get(x.destinationInfo.slug)!} className="inline-flex" /></span>}{p ? <span className="text-emerald-800">Parking reserved ({p.reference})</span> : <Link href={`/dashboard/parking?destination=${x.destinationInfo?.slug}&date=${x.date}&booking=${x.reference}`} className="text-terracotta underline">Reserve parking</Link>}</div></Card>; })}</div></section>

      {w.data?.items?.length > 0 && <section aria-labelledby="wl"><h2 id="wl" className="text-xl">Waitlist</h2><div className="mt-3 space-y-3">{w.data.items.map((x: any) => <Card key={x._id} className="flex flex-wrap items-center justify-between gap-3 p-4"><div><p className="font-medium">{x.destinationInfo?.name}</p><p className="text-sm text-ink/70">{fmtDate(x.date)}, {x.slotInfo && fmtTime(x.slotInfo.start)} • {x.quantity} seat(s)</p></div><div className="flex items-center gap-3">{x.status === "notified" ? <Link href={`/destinations/${x.destinationInfo?.slug}?date=${x.date}`} className="rounded-lg bg-terracotta px-3 py-1.5 text-sm text-white">Seats open: book now</Link> : <span className="text-sm text-ink/70">Waiting for seats</span>}<Button size="sm" variant="ghost" onClick={() => leave(x._id)}>Leave</Button></div></Card>)}</div></section>}

      <section aria-labelledby="fav"><h2 id="fav" className="text-xl">Saved destinations</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">{f.data?.items?.length ? f.data.items.map((d: any) => { const l = bySlug.get(d.slug); return <Link key={d._id} href={`/destinations/${d.slug}`} className="rounded-xl border border-forest/10 bg-white p-4 hover:border-terracotta"><p className="font-medium">{d.name}</p><p className="text-sm text-ink/70">{d.city}</p>{l && <LiveStrip s={l} className="mt-2" />}</Link>; }) : <p className="text-sm text-ink/60">Tap Save on a destination page to keep it here, with its live crowd.</p>}</div></section>
    </div>
  );
}
