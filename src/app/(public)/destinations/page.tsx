"use client";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { LayoutGrid, List } from "lucide-react";
import { useApi } from "@/lib/hooks";
import Link from "next/link";
import { DestCard } from "@/components/dest-card";
import { HeritageCard } from "@/components/heritage-card";
import { Button, Empty, ErrorState, Field, Input, Select, Skeleton } from "@/components/ui";
import { todayIST } from "@/lib/utils";

function Explore() {
  const sp = useSearchParams();
  const [f, setF] = useState({ q: sp.get("q") || "", type: "", crowd: "", maxPrice: "", accessible: false, openNow: false, sort: "popularity", date: todayIST() });
  const [view, setView] = useState<"grid" | "list">("grid");
  // Wait for a short pause in typing before searching, so "qutub minar" is one request, not eleven.
  const [dq, setDq] = useState(f.q.trim());
  useEffect(() => { const t = setTimeout(() => setDq(f.q.trim()), 250); return () => clearTimeout(t); }, [f.q]);
  const qs = new URLSearchParams(Object.entries({ ...f, q: dq, accessible: f.accessible ? "true" : "", openNow: f.openNow ? "true" : "" }).filter(([, v]) => v) as [string, string][]).toString();
  const { data, loading, error, reload } = useApi<any>(`/api/destinations?${qs}`);
  const items: any[] = data?.items || [];
  // Heritage directory: every UNESCO / ASI site, including ones we do not sell tickets for yet. Sites that are already bookable are shown above, so they are filtered out here.
  const dir = useApi<any>(dq ? `/api/heritage?q=${encodeURIComponent(dq)}&limit=9` : null);
  const bookable = new Set(items.map((d) => d.slug));
  const more: any[] = (dir.data?.items || []).filter((h: any) => !(h.bookableSlug && bookable.has(h.bookableSlug)));
  const set = (k: string, v: any) => setF((p) => ({ ...p, [k]: v }));
  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <h1 className="text-4xl">Explore destinations</h1>
      <div className="mt-6 grid gap-6 lg:grid-cols-[260px_1fr]">
        <form aria-label="Filters" onSubmit={(e) => e.preventDefault()} className="space-y-4 rounded-xl border border-forest/10 bg-white p-4 lg:sticky lg:top-20 lg:self-start">
          <Field label="Search by name or location"><Input type="search" value={f.q} onChange={(e) => set("q", e.target.value)} placeholder="Taj, Jaipur, museum" /></Field>
          <Field label="Visit date"><Input type="date" min={todayIST()} value={f.date} onChange={(e) => e.target.value && set("date", e.target.value)} /></Field>
          <Field label="Type"><Select value={f.type} onChange={(e) => set("type", e.target.value)}><option value="">All types</option>{["monument", "fort", "museum", "temple", "archaeological", "palace"].map((t) => <option key={t} value={t} className="capitalize">{t}</option>)}</Select></Field>
          <Field label="Maximum ticket price (₹)" hint="Lowest Indian-citizen ticket"><Input type="number" min={0} value={f.maxPrice} onChange={(e) => set("maxPrice", e.target.value)} placeholder="Any" /></Field>
          <Field label="Crowd level"><Select value={f.crowd} onChange={(e) => set("crowd", e.target.value)}><option value="">Any</option><option value="low">Low</option><option value="moderate">Moderate</option><option value="high">High</option><option value="very_high">Very High</option></Select></Field>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="accent-forest" checked={f.accessible} onChange={(e) => set("accessible", e.target.checked)} />Accessibility information available</label>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="accent-forest" checked={f.openNow} onChange={(e) => set("openNow", e.target.checked)} />Open now</label>
          <Button type="button" variant="ghost" size="sm" onClick={() => setF({ q: "", type: "", crowd: "", maxPrice: "", accessible: false, openNow: false, sort: "popularity", date: todayIST() })}>Clear filters</Button>
        </form>
        <div>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-ink/70" aria-live="polite">{loading ? "Loading…" : `${items.length} destination${items.length === 1 ? "" : "s"}`}</p>
            <div className="flex items-center gap-2">
              <label className="text-sm" htmlFor="sort">Sort by</label>
              <Select id="sort" className="w-44" value={f.sort} onChange={(e) => set("sort", e.target.value)}><option value="popularity">Popularity</option><option value="price">Price: low to high</option><option value="crowd">Crowd: quietest first</option></Select>
              <Button variant={view === "grid" ? "primary" : "outline"} size="sm" aria-label="Grid view" aria-pressed={view === "grid"} onClick={() => setView("grid")}><LayoutGrid className="h-4 w-4" /></Button>
              <Button variant={view === "list" ? "primary" : "outline"} size="sm" aria-label="List view" aria-pressed={view === "list"} onClick={() => setView("list")}><List className="h-4 w-4" /></Button>
            </div>
          </div>
          {error ? <ErrorState message={error} onRetry={reload} /> : loading ? <div className="grid gap-5 sm:grid-cols-2">{Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-72" />)}</div>
            : items.length === 0 ? <Empty title="No bookable destinations match">{more.length ? "None of these can be booked online yet, but they are in our heritage directory below." : "Try removing a filter or searching a different city."}</Empty>
            : <div className={view === "grid" ? "grid gap-5 sm:grid-cols-2 xl:grid-cols-3" : "space-y-4"}>{items.map((d) => <DestCard key={d._id} d={d} list={view === "list"} />)}</div>}
          {!error && !loading && (
            <section aria-labelledby="dir" className="mt-10">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 id="dir" className="text-2xl">{dq ? "Also in the heritage directory" : "Looking for another heritage site?"}</h2>
                <Link href={dq ? `/heritage?q=${encodeURIComponent(dq)}` : "/heritage"} className="text-sm font-medium underline">{dq && (dir.data?.total ?? 0) > more.length ? `See all ${dir.data.total} matches` : "Browse the full directory"}</Link>
              </div>
              {!dq && <p className="mt-1 text-sm text-ink/75">Every UNESCO World Heritage Site and ASI protected monument in India, with photos and facts. Booking is open where marked.</p>}
              {dq && dir.data && more.length === 0 && <p className="mt-2 text-sm text-ink/75">No other heritage sites match “{dq}”. Check the spelling, or <Link href="/contact" className="underline">tell us which site is missing</Link>.</p>}
              {more.length > 0 && <div className="mt-4 grid gap-5 sm:grid-cols-2 xl:grid-cols-3">{more.map((h) => <HeritageCard key={h.slug} s={h} />)}</div>}
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
export default function Page() { return <Suspense><Explore /></Suspense>; }
