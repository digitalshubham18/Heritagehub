"use client";
import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useApi } from "@/lib/hooks";
import { HeritageCard } from "@/components/heritage-card";
import { Button, Empty, ErrorState, Field, Input, Select, Skeleton } from "@/components/ui";

const TYPES = ["monument", "fort", "museum", "temple", "archaeological", "palace"];

function Directory() {
  const sp = useSearchParams();
  const [q, setQ] = useState(sp.get("q") || "");
  const [dq, setDq] = useState(q); // debounced so we don't query on every keystroke
  const [f, setF] = useState({ state: "", type: "", category: sp.get("category") || "", hasPhoto: false });
  const [page, setPage] = useState(1);
  useEffect(() => { const t = setTimeout(() => { setDq(q); setPage(1); }, 250); return () => clearTimeout(t); }, [q]);
  const qs = new URLSearchParams({ ...(dq ? { q: dq } : {}), ...(f.state ? { state: f.state } : {}), ...(f.type ? { type: f.type } : {}), ...(f.category ? { category: f.category } : {}), ...(f.hasPhoto ? { hasPhoto: "true" } : {}), page: String(page), limit: "24" }).toString();
  const { data, loading, error, reload } = useApi<any>(`/api/heritage?${qs}`);
  const { data: facets } = useApi<any>("/api/heritage?limit=1&facets=1");
  const items: any[] = data?.items || [];
  const set = (k: string, v: any) => { setF((p) => ({ ...p, [k]: v })); setPage(1); };
  const fc = facets?.facets;
  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <h1 className="text-4xl">Heritage directory</h1>
      <p className="mt-2 max-w-2xl text-ink/75">{fc ? `${fc.totalSites.toLocaleString("en-IN")} UNESCO World Heritage Sites and ASI protected monuments across India. ` : ""}Search by name, old name, city or state. Tickets can be booked where the site is marked “Book tickets”.</p>
      <div className="mt-6 grid gap-6 lg:grid-cols-[260px_1fr]">
        <form aria-label="Filters" onSubmit={(e) => e.preventDefault()} className="space-y-4 rounded-xl border border-forest/10 bg-white p-4 lg:sticky lg:top-20 lg:self-start">
          <Field label="Search heritage sites"><Input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Qutub Minar, Hampi, Konark" autoFocus /></Field>
          <Field label="Listing"><Select value={f.category} onChange={(e) => set("category", e.target.value)}><option value="">All sites</option><option value="unesco">UNESCO World Heritage</option><option value="asi">ASI protected monuments</option></Select></Field>
          <Field label="State / UT"><Select value={f.state} onChange={(e) => set("state", e.target.value)}><option value="">All of India</option>{(fc?.states || []).map((s: any) => <option key={s.name} value={s.name}>{s.name} ({s.count})</option>)}</Select></Field>
          <Field label="Type"><Select value={f.type} onChange={(e) => set("type", e.target.value)}><option value="">All types</option>{TYPES.map((t) => <option key={t} value={t} className="capitalize">{t}</option>)}</Select></Field>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="accent-forest" checked={f.hasPhoto} onChange={(e) => set("hasPhoto", e.target.checked)} />Only sites with a photo</label>
          <Button type="button" variant="ghost" size="sm" onClick={() => { setQ(""); setF({ state: "", type: "", category: "", hasPhoto: false }); }}>Clear filters</Button>
        </form>
        <div>
          <p className="mb-4 text-sm text-ink/70" aria-live="polite">{loading ? "Loading…" : `${(data?.total ?? 0).toLocaleString("en-IN")} site${data?.total === 1 ? "" : "s"}`}</p>
          {error ? <ErrorState message={error} onRetry={reload} />
            : loading && !data ? <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">{Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-64" />)}</div>
            : items.length === 0 ? <Empty title={fc?.totalSites === 0 ? "The directory has not been imported yet" : "No heritage site matches"}>{fc?.totalSites === 0 ? "Run the heritage import (see README, “Heritage directory”) to load every UNESCO and ASI site." : <>Check the spelling, try the city or state, or <Link href="/contact" className="underline">tell us which site is missing</Link>.</>}</Empty>
            : <>
              {data?.exactSlug && dq && <p className="mb-3 text-sm">Best match: <Link className="font-medium underline" href={`/heritage/${data.exactSlug}`}>{items.find((i) => i.slug === data.exactSlug)?.name}</Link></p>}
              <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">{items.map((s) => <HeritageCard key={s.slug} s={s} />)}</div>
              {data.pages > 1 && <nav aria-label="Pages" className="mt-8 flex items-center justify-center gap-3"><Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</Button><span className="text-sm">Page {page} of {data.pages}</span><Button variant="outline" size="sm" disabled={page >= data.pages} onClick={() => setPage(page + 1)}>Next</Button></nav>}
            </>}
        </div>
      </div>
    </div>
  );
}
export default function Page() { return <Suspense><Directory /></Suspense>; }
