"use client";
import Link from "next/link";
import { AlertTriangle, CarFront, Cpu, PauseCircle, Users } from "lucide-react";
import { useApi } from "@/lib/hooks";
import { Badge, Card, Empty, ErrorState, PageSkeleton, Stat } from "@/components/ui";
import { DensityBar, LevelBadge } from "@/components/crowd";
import { LiveDot, TrendChip, ago } from "@/components/live";
import { cn, inr } from "@/lib/utils";

const CAT: Record<string, string> = { medical: "Medical", lost_child: "Lost child or person", security: "Security", crowd: "Crowd", maintenance: "Maintenance", other: "Other" };
export default function LiveCommand() {
  const { data, loading, error, reload } = useApi<any>("/api/admin/command", { poll: 10000 });
  if (error) return <ErrorState message={error} onRetry={reload} />;
  if (loading || !data) return <PageSkeleton />;
  const t = data.totals;
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3"><h1 className="text-3xl">Live command centre</h1><span className="flex items-center gap-2 text-sm text-ink/70"><LiveDot />Updated {ago(data.at)} · refreshes every 10 s</span></div>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <Stat label="Inside right now" value={t.occupancy.toLocaleString("en-IN")} icon={Users} sub="across your sites" /><Stat label="Parking taken today" value={inr(t.parkingCollectedMinor)} icon={CarFront} /><Stat label="Gate devices online" value={`${t.devicesOnline}/${t.devicesTotal}`} icon={Cpu} tone={t.devicesTotal > t.devicesOnline ? "warn" : undefined} />
        <Stat label="Parking arrivals due" value={data.reservationsToday} icon={CarFront} sub="pre-booked, not arrived" /><Stat label="Entry paused" value={t.paused} icon={PauseCircle} tone={t.paused ? "warn" : undefined} /></div>
      {data.incidents.length > 0 && <section aria-labelledby="oi"><div className="flex items-center justify-between"><h2 id="oi" className="flex items-center gap-2 text-xl"><AlertTriangle className="h-5 w-5 text-red-700" aria-hidden />Open incidents ({data.incidents.length})</h2><Link href="/admin/incidents" className="text-sm text-terracotta underline">Manage</Link></div>
        <ul className="mt-3 grid gap-2 md:grid-cols-2">{data.incidents.map((i: any) => <li key={i._id} className={cn("rounded-xl border p-3 text-sm", i.severity === "critical" ? "border-red-300 bg-red-50" : "border-amber-300 bg-amber-50")}><p className="font-medium">{CAT[i.category]} · {i.destination?.name}</p><p>{i.message}</p><p className="mt-1 text-xs text-ink/65">{i.reporterName} · {new Date(i.createdAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}</p></li>)}</ul></section>}
      {data.sites.length === 0 ? <Empty title="No sites yet" /> : <div className="grid gap-5 xl:grid-cols-2">{data.sites.map((s: any) => (
        <Card key={s.id} className="space-y-3 p-5"><div className="flex flex-wrap items-start justify-between gap-2"><div><h2 className="text-xl"><Link href={`/destinations/${s.slug}`} className="hover:text-terracotta">{s.name}</Link></h2><p className="text-sm text-ink/70">{s.open ? "Open now" : "Closed"}{s.quiet ? " · gates quiet" : ""}</p></div><div className="flex flex-wrap items-center gap-2">{s.paused && <Badge className="bg-red-100 text-red-900"><PauseCircle className="h-3 w-3" aria-hidden />Entry paused</Badge>}{s.open && <LevelBadge level={s.level} />}<TrendChip trend={s.trend} /></div></div>
          {s.paused && <p className="rounded-lg bg-red-50 p-2 text-sm text-red-900">{s.pausedReason}</p>}
          <div><div className="mb-1 flex justify-between text-sm"><span>Inside <strong>{s.occupancy.toLocaleString("en-IN")}</strong> / {s.limit.toLocaleString("en-IN")}</span><span>{s.pct}%</span></div><DensityBar pct={s.pct} level={s.level} /><p className="mt-1 text-xs text-ink/65">Last 15 min: {s.entriesLast15} in, {s.exitsLast15} out{s.waitMin ? ` · ~${s.waitMin} min queue` : ""}</p><p className="mt-1 text-xs text-ink/65">{s.source === "headcount" ? <>Source: <strong>real headcount</strong> (people-counters / staff count){s.ticketOccupancy != null && s.headcount != null ? ` · tickets scanned inside: ${s.ticketOccupancy} · ${Math.max(0, s.headcount - s.ticketOccupancy)} without a scan` : ""}</> : <span className="text-amber-800">Source: ticket scans only. Connect a people-counter or enter a staff count for the real number.</span>}</p></div>
          <dl className="grid grid-cols-3 gap-2 border-t border-forest/10 pt-3 text-sm"><div><dt className="text-ink/60">Parking</dt><dd>{s.parking ? <><strong>{s.parking.occupied}</strong>/{s.parking.capacity}{s.parking.held > 0 && <span className="block text-xs text-ink/60">{s.parking.held} held</span>}</> : "n/a"}</dd></div><div><dt className="text-ink/60">Parking today</dt><dd>{s.parking ? inr(s.parkingCollectedMinor) : "n/a"}</dd></div><div><dt className="text-ink/60">Gate devices</dt><dd className={s.devices.total > s.devices.online ? "font-medium text-amber-800" : ""}>{s.devices.total ? `${s.devices.online}/${s.devices.total} online` : "None"}</dd></div></dl></Card>))}</div>}
      <Card className="overflow-hidden"><h2 className="border-b border-forest/10 p-4 text-lg">Latest gate activity today</h2>{data.feed.length === 0 ? <p className="p-6 text-center text-sm text-ink/60">No entries or exits recorded yet today.</p> : <ul className="divide-y divide-forest/10 text-sm">{data.feed.map((f: any) => <li key={f.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2"><span><Badge className={f.type === "in" ? "bg-emerald-100 text-emerald-900" : "bg-stone-200"}>{f.type === "in" ? "Entered" : "Exited"} {f.quantity}</Badge> <span className="ml-2">{f.destination}</span> <span className="font-mono text-xs text-ink/55">{f.reference}</span></span><span className="text-xs text-ink/60">{f.viaDevice ? "Gate device · " : ""}{new Date(f.at).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</span></li>)}</ul>}</Card>
    </div>
  );
}
