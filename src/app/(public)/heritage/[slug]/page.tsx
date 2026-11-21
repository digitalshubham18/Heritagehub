"use client";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { ExternalLink, Landmark, MapPin, Ticket } from "lucide-react";
import { useApi, useUser } from "@/lib/hooks";
import { SafeImg } from "@/components/media";
import { HeritageCard, CATEGORY_LABEL } from "@/components/heritage-card";
import { Badge, Button, Card, ErrorState, PageSkeleton } from "@/components/ui";

const LeafletMap = dynamic(() => import("@/components/map"), { ssr: false, loading: () => <div className="h-72 animate-pulse rounded-xl bg-forest/10" /> });

export default function HeritagePage() {
  const { slug } = useParams<{ slug: string }>();
  const { data, loading, error, reload } = useApi<any>(`/api/heritage/${slug}`);
  const [i, setI] = useState(0);
  const { user } = useUser();
  const canEnable = user?.role === "admin" || user?.role === "operator";
  if (loading) return <div className="mx-auto max-w-5xl p-4"><PageSkeleton /></div>;
  if (error || !data) return <div className="mx-auto max-w-xl p-8"><ErrorState message={error || "Heritage site not found"} onRetry={reload} /></div>;
  const { site: s, nearby } = data;
  const im = s.images?.[i];
  const loc = s.location?.lat != null && s.location?.lng != null ? s.location : null;
  const wiki = s.wikipediaTitle ? `https://en.wikipedia.org/wiki/${encodeURIComponent(s.wikipediaTitle.replace(/ /g, "_"))}` : null;
  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <nav aria-label="Breadcrumb" className="mb-4 text-sm text-ink/70"><Link href="/heritage" className="underline">Heritage directory</Link>{s.state && <> / <Link href={`/heritage?q=${encodeURIComponent(s.state)}`} className="underline">{s.state}</Link></>}</nav>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="mb-2 flex flex-wrap gap-2">{(s.categories || []).map((c: string) => <Badge key={c} className="bg-forest/10 text-forest"><Landmark className="mr-1 h-3 w-3" aria-hidden />{CATEGORY_LABEL[c] || c}{c === "unesco" && s.unesco?.year ? ` · inscribed ${s.unesco.year}` : ""}</Badge>)}<Badge className="bg-sand capitalize">{s.type}</Badge></div>
          <h1 className="text-4xl">{s.name}</h1>
          <p className="mt-1 flex items-center gap-1 text-ink/75"><MapPin className="h-4 w-4" aria-hidden />{[s.city, s.state].filter(Boolean).join(", ") || "India"}</p>
        </div>
        {s.bookableSlug && <Link href={`/destinations/${s.bookableSlug}`}><Button variant="accent" size="lg"><Ticket className="mr-2 h-4 w-4" aria-hidden />Book tickets</Button></Link>}
      </div>

      <figure className="mt-6">
        <SafeImg src={im?.url} alt={im ? `Photograph of ${s.name}` : `Illustration standing in for ${s.name}`} art={{ slug: s.slug, type: s.type }} className="h-72 w-full rounded-2xl sm:h-[26rem]" />
        {im ? (
          <figcaption className="mt-2 text-xs text-ink/65">
            Photo: {im.author || "Unknown author"}{im.license && <> · {im.licenseUrl ? <a className="underline" href={im.licenseUrl} target="_blank" rel="noopener noreferrer">{im.license}</a> : im.license}</>}{im.sourceUrl && <> · <a className="underline" href={im.sourceUrl} target="_blank" rel="noopener noreferrer">Wikimedia Commons</a></>}
          </figcaption>
        ) : <figcaption className="mt-2 text-xs text-ink/65">We have not yet verified a licensed photograph of this site, so an illustration is shown instead.</figcaption>}
        {s.images?.length > 1 && <div className="mt-3 flex gap-2 overflow-x-auto" role="group" aria-label="More photos">{s.images.map((x: any, k: number) => <button key={x.url} onClick={() => setI(k)} aria-label={`Show photo ${k + 1}`} aria-pressed={k === i} className={`h-16 w-24 shrink-0 overflow-hidden rounded-lg border-2 ${k === i ? "border-terracotta" : "border-transparent"}`}><SafeImg src={x.thumbUrl || x.url} alt="" className="h-full w-full" /></button>)}</div>}
      </figure>

      <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_320px]">
        <div className="space-y-8">
          <section aria-labelledby="about"><h2 id="about" className="text-2xl">About</h2><p className="mt-2 leading-relaxed text-ink/85">{s.summary || "A detailed description for this site has not been added yet."}</p>
            {s.aliases?.length > 0 && <p className="mt-3 text-sm text-ink/70">Also known as: {s.aliases.slice(0, 8).join(", ")}</p>}</section>
          {loc && <section aria-labelledby="map"><h2 id="map" className="text-2xl">Location</h2><div className="mt-3 overflow-hidden rounded-xl"><LeafletMap lat={loc.lat} lng={loc.lng} name={s.name} zoom={13} /></div><a className="mt-2 inline-flex items-center gap-1 text-sm underline" target="_blank" rel="noopener noreferrer" href={`https://www.google.com/maps/dir/?api=1&destination=${loc.lat},${loc.lng}`}>Directions <ExternalLink className="h-3 w-3" aria-hidden /></a></section>}
        </div>
        <aside className="space-y-4">
          <Card className="p-4 text-sm">
            <h2 className="font-display text-lg">Facts</h2>
            <dl className="mt-2 space-y-2">
              {s.unesco?.id && <div><dt className="text-ink/60">UNESCO reference</dt><dd><a className="underline" href={`https://whc.unesco.org/en/list/${s.unesco.id}`} target="_blank" rel="noopener noreferrer">No. {s.unesco.id}</a>{s.unesco.criteria ? ` · criteria ${s.unesco.criteria}` : ""}</dd></div>}
              {s.asiId && <div><dt className="text-ink/60">ASI monument ID</dt><dd>{s.asiId}</dd></div>}
              <div><dt className="text-ink/60">Source</dt><dd>{[s.dataSource, wiki && "Wikipedia"].filter(Boolean).join(" · ") || "Public records"}</dd></div>
            </dl>
            {wiki && <a className="mt-3 inline-flex items-center gap-1 underline" href={wiki} target="_blank" rel="noopener noreferrer">Read more on Wikipedia <ExternalLink className="h-3 w-3" aria-hidden /></a>}
          </Card>
          {!s.bookableSlug && (
            <Card className="border-terracotta/30 bg-terracotta/5 p-4 text-sm">
              <h2 className="font-display text-lg">Tickets</h2>
              <p className="mt-1 text-ink/80">Online tickets for this site are not on sale yet. Timings and prices change, so please check the Archaeological Survey of India or the site’s official page before you travel.</p>
              {canEnable
                ? <Link href={`/admin/destinations?heritage=${s.slug}`}><Button variant="accent" size="sm" className="mt-3"><Ticket className="mr-2 h-4 w-4" aria-hidden />Open online booking for this site</Button></Link>
                : <Link href="/contact" className="mt-3 inline-block underline">Want to book here? Tell us</Link>}
            </Card>
          )}
        </aside>
      </div>

      {nearby?.length > 0 && <section aria-labelledby="near" className="mt-12"><h2 id="near" className="text-2xl">More in {s.city || s.state}</h2><div className="mt-4 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{nearby.map((n: any) => <HeritageCard key={n.slug} s={n} />)}</div></section>}
    </div>
  );
}
