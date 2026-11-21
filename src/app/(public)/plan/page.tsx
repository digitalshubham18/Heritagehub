"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { api, useApi } from "@/lib/hooks";
import { LevelBadge } from "@/components/crowd";
import { Button, Card, Empty, ErrorState, Field, Input, Skeleton } from "@/components/ui";
import { fmtDate, fmtTime, toHHMM, toMin, todayIST } from "@/lib/utils";

const VISIT_MIN = 120;
type Stop = { slug: string; name: string; start: string; end: string; level: any; densityPct: number; waitMin: number; travelMin: number; from?: string };
/** Rough road-time estimate from straight-line distance: ~25 km/h average plus a 10 min buffer, never under 15 min. */
function travelMin(a: any, b: any) {
  const R = 6371, rad = (x: number) => (x * Math.PI) / 180;
  const dLat = rad(b.location.lat - a.location.lat), dLng = rad(b.location.lng - a.location.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.location.lat)) * Math.cos(rad(b.location.lat)) * Math.sin(dLng / 2) ** 2;
  const km = 2 * R * Math.asin(Math.sqrt(h));
  return Math.max(15, Math.round((km / 25) * 60) + 10);
}

export default function Plan() {
  const [date, setDate] = useState(todayIST());
  const [picked, setPicked] = useState<string[]>([]);
  const [plan, setPlan] = useState<{ stops: Stop[]; skipped: string[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const { data, loading, error, reload } = useApi<any>("/api/destinations");
  const items: any[] = useMemo(() => data?.items || [], [data]);
  const cities = useMemo(() => Array.from(new Set(items.map((i) => i.city))).sort(), [items]);

  async function build() {
    if (!picked.length) return toast.error("Choose at least one site");
    setBusy(true);
    try {
      const results = await Promise.all(picked.map((slug) => api<any>(`/api/crowd?destination=${slug}&date=${date}`).then((r) => ({ slug, r, d: items.find((i) => i.slug === slug) }))));
      // Greedy: visit the site with the earliest quiet window first, keep each visit ~2h with a 30 min gap.
      const open = results.filter((x) => x.r.slots.length);
      const skipped = results.filter((x) => !x.r.slots.length).map((x) => x.d.name);
      const pool = [...open];
      const stops: Stop[] = []; let cursor = 0; let prev: any = null; const now = date === todayIST() ? new Date() : null;
      if (now) cursor = (Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", hour: "2-digit", hour12: false }).format(now)) * 60);
      while (pool.length) {
        let best: { i: number; slot: any; score: number } | null = null;
        pool.forEach((x, i) => {
          const close = toMin(x.d.hours.close);
          const arrive = cursor + (prev ? travelMin(prev.d, x.d) : 0);
          for (const s of x.r.slots) {
            if (toMin(s.start) < arrive || toMin(s.start) + VISIT_MIN > close || s.booked >= s.capacity) continue;
            const score = s.densityPct + toMin(s.start) / 60; // quiet first; tie-break to earlier
            if (!best || score < best.score) best = { i, slot: s, score };
          }
        });
        if (!best) { skipped.push(...pool.map((x) => x.d.name)); break; }
        const b: { i: number; slot: any } = best; const x = pool.splice(b.i, 1)[0];
        stops.push({ slug: x.slug, name: x.d.name, start: b.slot.start, end: toHHMM(toMin(b.slot.start) + VISIT_MIN), level: b.slot.level, densityPct: b.slot.densityPct, waitMin: b.slot.waitMin, travelMin: prev ? travelMin(prev.d, x.d) : 0, from: prev?.d.name });
        cursor = toMin(b.slot.start) + VISIT_MIN; prev = x;
      }
      stops.sort((a, b) => a.start.localeCompare(b.start));
      setPlan({ stops, skipped });
    } catch (e: any) { toast.error(e.message); } finally { setBusy(false); }
  }
  const toggle = (slug: string) => { setPicked((p) => (p.includes(slug) ? p.filter((x) => x !== slug) : [...p, slug])); setPlan(null); };

  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <h1 className="text-4xl">Plan a visit</h1>
      <p className="mt-2 max-w-xl text-ink/80">Choose the sites you want to see and a date. We'll suggest an order and arrival times that avoid the busiest slots, with about two hours at each site plus an estimated travel time between them.</p>
      <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_1.2fr]">
        <Card className="space-y-4 p-5">
          <Field label="Visit date"><Input type="date" min={todayIST()} value={date} onChange={(e) => { e.target.value && setDate(e.target.value); setPlan(null); }} /></Field>
          <fieldset><legend className="mb-2 text-sm font-medium">Sites to include</legend>
            {error ? <ErrorState message={error} onRetry={reload} /> : loading ? <Skeleton className="h-40" /> : cities.map((c) => (
              <div key={c} className="mb-3"><p className="text-sm text-ink/60">{c}</p>{items.filter((i) => i.city === c).map((i) => <label key={i.slug} className="flex items-center gap-2 py-1 text-sm"><input type="checkbox" className="accent-forest" checked={picked.includes(i.slug)} onChange={() => toggle(i.slug)} />{i.name}</label>)}</div>))}
          </fieldset>
          <Button variant="accent" loading={busy} onClick={build}>Build my plan</Button>
          <p className="text-xs text-ink/60">Travel time is a rough estimate from straight-line distance, not live traffic. Sites in different cities are rarely practical in one day, so check real travel options.</p>
        </Card>
        <div>
          {!plan ? <Empty title="Your plan appears here">Select sites and a date, then build the plan.</Empty> : (
            <div className="space-y-3" aria-live="polite">
              <h2 className="text-xl">{fmtDate(date)}</h2>
              {plan.stops.length === 0 && <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">None of the chosen sites has a free two-hour window on this date.</p>}
              <ol className="space-y-3">{plan.stops.map((s) => (
                <li key={s.slug}><Card className="flex flex-wrap items-center justify-between gap-3 p-4"><div><p className="font-display text-lg">{s.name}</p><p className="text-sm text-ink/70">Arrive {fmtTime(s.start)}, leave about {fmtTime(s.end)}</p>{s.from && <p className="text-xs text-ink/60">About {s.travelMin} min from {s.from} (straight-line estimate)</p>}</div>
                  <div className="flex items-center gap-3"><div className="text-right text-sm"><LevelBadge level={s.level} /><p className="mt-1 text-xs text-ink/60">{s.waitMin ? `~${s.waitMin} min queue` : "No queue expected"}</p></div><Link href={`/destinations/${s.slug}?date=${date}`} className="rounded-lg bg-forest px-3 py-2 text-sm text-ivory hover:bg-forest-700">Book this</Link></div></Card></li>))}</ol>
              {plan.skipped.length > 0 && <p className="text-sm text-ink/70">Couldn't fit: {plan.skipped.join(", ")} (closed or fully booked that day).</p>}
              <p className="text-xs text-ink/60">Based on predicted crowd levels (sample model), not live data.</p>
            </div>)}
        </div>
      </div>
    </div>
  );
}
