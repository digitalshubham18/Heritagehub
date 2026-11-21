"use client";
import Link from "next/link";
import { useMemo } from "react";
import { Award, Lock, MapPin } from "lucide-react";
import { useApi } from "@/lib/hooks";
import { Card, ErrorState, PageSkeleton } from "@/components/ui";
import { LiveStrip, useLive } from "@/components/live";
import { cn, fmtDate, todayIST } from "@/lib/utils";

const BADGES = [
  { id: "first", name: "First footsteps", desc: "Visit your first monument", need: (s: S) => s.sites >= 1, progress: (s: S) => `${Math.min(1, s.sites)}/1` },
  { id: "explorer", name: "Explorer", desc: "Visit 3 different sites", need: (s: S) => s.sites >= 3, progress: (s: S) => `${Math.min(3, s.sites)}/3` },
  { id: "hunter", name: "Heritage hunter", desc: "Visit 6 different sites", need: (s: S) => s.sites >= 6, progress: (s: S) => `${Math.min(6, s.sites)}/6` },
  { id: "wander", name: "Wanderer", desc: "Visit sites in 3 different cities", need: (s: S) => s.cities >= 3, progress: (s: S) => `${Math.min(3, s.cities)}/3 cities` },
  { id: "state", name: "Across borders", desc: "Visit sites in 2 different states", need: (s: S) => s.states >= 2, progress: (s: S) => `${Math.min(2, s.states)}/2 states` },
  { id: "return", name: "Returning guest", desc: "Visit the same site twice", need: (s: S) => s.repeat, progress: (s: S) => (s.repeat ? "1/1" : "0/1") },
];
type S = { sites: number; cities: number; states: number; repeat: boolean };

/** Stamps and badges are computed from completed visits. Nothing is stored separately, so they can never drift from real history. */
export default function Passport() {
  const b = useApi<any>("/api/bookings"), d = useApi<any>("/api/destinations"), live = useLive(null, { all: true });
  const { stamps, stats, next } = useMemo(() => {
    const dests: any[] = d.data?.items || [], today = todayIST();
    const visits: any[] = (b.data?.items || []).filter((x: any) => x.status === "completed" || (x.status === "confirmed" && x.date < today && x.checkedInCount > 0));
    const first = new Map<string, any>(), count = new Map<string, number>();
    for (const v of visits.sort((a, c) => a.date.localeCompare(c.date))) { const k = String(v.destination); if (!first.has(k)) first.set(k, v); count.set(k, (count.get(k) || 0) + 1); }
    const stamps = [...first.entries()].map(([k, v]) => { const dd = dests.find((x) => String(x._id || x.id) === k); return { id: k, name: v.destinationInfo?.name || dd?.name, slug: v.destinationInfo?.slug || dd?.slug, city: dd?.city, state: dd?.state, date: v.date, times: count.get(k) || 1 }; });
    const stats: S = { sites: stamps.length, cities: new Set(stamps.map((s) => s.city).filter(Boolean)).size, states: new Set(stamps.map((s) => s.state).filter(Boolean)).size, repeat: stamps.some((s) => s.times > 1) };
    const seen = new Set(stamps.map((s) => s.id));
    return { stamps, stats, next: dests.filter((x) => !seen.has(String(x._id || x.id))).slice(0, 4) };
  }, [b.data, d.data]);
  const bySlug = new Map(live.items.map((x) => [x.slug, x]));
  if (b.loading || d.loading) return <PageSkeleton />;
  if (b.error) return <ErrorState message={b.error} onRetry={b.reload} />;
  const earned = BADGES.filter((x) => x.need(stats)).length;
  return (
    <div className="space-y-8"><div><h1 className="text-3xl">Heritage passport</h1><p className="mt-1 text-ink/75">Every completed visit earns a stamp. {stats.sites} site{stats.sites === 1 ? "" : "s"} visited · {earned} of {BADGES.length} badges.</p></div>
      <section aria-labelledby="st"><h2 id="st" className="text-xl">Stamps</h2>
        {stamps.length === 0 ? <Card className="mt-3 p-6 text-ink/75">No stamps yet. Visit a site and check in at the gate to earn your first one.</Card> : <ul className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{stamps.map((s) => <li key={s.id} className="relative rounded-2xl border-2 border-dashed border-terracotta/50 bg-white p-4 text-center shadow-card"><MapPin className="mx-auto h-6 w-6 text-terracotta" aria-hidden /><p className="mt-1 font-display text-lg">{s.name}</p><p className="text-sm text-ink/70">{[s.city, s.state].filter(Boolean).join(", ")}</p><p className="mt-2 text-xs text-ink/60">First visited {fmtDate(s.date)}{s.times > 1 ? ` · ${s.times} visits` : ""}</p></li>)}</ul>}</section>
      <section aria-labelledby="bd"><h2 id="bd" className="text-xl">Badges</h2><ul className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{BADGES.map((x) => { const on = x.need(stats); return <li key={x.id} className={cn("flex items-start gap-3 rounded-xl border p-4", on ? "border-emerald-300 bg-emerald-50" : "border-forest/10 bg-white opacity-80")}>{on ? <Award className="mt-0.5 h-6 w-6 text-emerald-700" aria-hidden /> : <Lock className="mt-0.5 h-6 w-6 text-ink/40" aria-hidden />}<div><p className="font-medium">{x.name}{on && <span className="sr-only"> (earned)</span>}</p><p className="text-sm text-ink/70">{x.desc}</p>{!on && <p className="mt-1 text-xs text-ink/60">Progress {x.progress(stats)}</p>}</div></li>; })}</ul></section>
      {next.length > 0 && <section aria-labelledby="nx"><h2 id="nx" className="text-xl">Next stamps to collect</h2><div className="mt-3 grid gap-3 sm:grid-cols-2">{next.map((x) => <Link key={x.slug} href={`/destinations/${x.slug}`} className="rounded-xl border border-forest/10 bg-white p-4 hover:border-terracotta"><p className="font-medium">{x.name}</p><p className="text-sm text-ink/70">{x.city}, {x.state}</p>{bySlug.get(x.slug) && <LiveStrip s={bySlug.get(x.slug)!} className="mt-2" />}</Link>)}</div></section>}
    </div>
  );
}
