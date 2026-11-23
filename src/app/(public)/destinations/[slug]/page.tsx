"use client";
import dynamic from "next/dynamic";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Accessibility, Bike, Bus, CarFront, Clock, Heart, MapPin, Star, Timer } from "lucide-react";
import Link from "next/link";
import { api, useApi, useUser } from "@/lib/hooks";
import { BookingWidget } from "@/components/booking-widget";
import { VisitInfo } from "@/components/visit-info";
import { CrowdHeatmap, CrowdRibbon, LevelBadge, SlotChart } from "@/components/crowd";
import { SafeImg } from "@/components/media";
import { LivePanel } from "@/components/live";
import { SiteNotices } from "@/components/notices";
import { Badge, Button, Card, ErrorState, Field, PageSkeleton, Select, Textarea } from "@/components/ui";
import { fmtDate, fmtTime, inr, todayIST } from "@/lib/utils";

const LeafletMap = dynamic(() => import("@/components/map"), { ssr: false, loading: () => <div className="h-72 animate-pulse rounded-xl bg-forest/10" /> });
const DigitalTwin = dynamic(
  () => import("@/components/digital-twin").then((m) => m.DigitalTwin),
  { ssr: false, loading: () => <div className="h-[28rem] animate-pulse rounded-3xl bg-forest/10" aria-hidden /> }
);
const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export default function DestinationPage() {
  const { slug } = useParams<{ slug: string }>();
  const [date, setDate] = useState(todayIST());
  const [img, setImg] = useState(0);
  useEffect(() => { const q = new URLSearchParams(location.search).get("date"); if (q && /^\d{4}-\d{2}-\d{2}$/.test(q) && q >= todayIST()) setDate(q); }, []);
  const { user, reload: reloadUser } = useUser();
  const d = useApi<any>(`/api/destinations/${slug}`);
  const s = useApi<any>(`/api/slots?destination=${slug}&date=${date}`, { poll: 30000 }); // these only need the slug from the URL, so they load in parallel with the destination instead of after it
  const wk = useApi<any>(`/api/crowd?destination=${slug}&date=${todayIST()}&week=1`);
  const park = useApi<any>(`/api/parking?destination=${slug}`, { poll: 60000 });
  const passList = useApi<any>("/api/passes");
  const rv = useApi<any>(d.data ? `/api/reviews?destination=${d.data.destination._id}` : null);
  const [rating, setRating] = useState("5");
  const [comment, setComment] = useState("");

  if (d.loading) return <div className="mx-auto max-w-6xl p-4"><PageSkeleton /></div>;
  if (d.error || !d.data) return <div className="mx-auto max-w-xl p-8"><ErrorState message={d.error || "Destination not found"} onRetry={d.reload} /></div>;
  const { destination: x, categories } = d.data;
  const fav = user?.favorites?.includes(x._id);
  const open = s.data?.slots?.filter((p: any) => !p.closed && !p.past) || [];
  const best = [...open].sort((a: any, b: any) => a.densityPct - b.densityPct).slice(0, 3).sort((a: any, b: any) => a.start.localeCompare(b.start));
  const peak = open.length ? open.reduce((a: any, b: any) => (b.densityPct > a.densityPct ? b : a)) : null;

  async function toggleFav() {
    if (!user) return toast.info("Sign in to save favourites");
    try { const r = await api("/api/favorites", { body: { destinationId: x._id } }); toast.success(r.favorite ? "Saved to favourites" : "Removed from favourites"); reloadUser(); } catch (e: any) { toast.error(e.message); }
  }
  async function review() {
    try { await api("/api/reviews", { body: { destinationId: x._id, rating: Number(rating), comment } }); toast.success("Review saved"); setComment(""); rv.reload(); d.reload(); } catch (e: any) { toast.error(e.message); }
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <div className="grid gap-3 md:grid-cols-[2.2fr_1fr]">
        <SafeImg src={x.images[img]} alt={`${x.name}${img ? ` view ${img + 1}` : ""}`} art={{ slug: x.slug, type: x.type, variant: img }} className="h-72 w-full rounded-3xl shadow-lift md:h-[28rem]" />
        <div className="hidden grid-rows-3 gap-3 md:grid">{[1, 2, 3].map((i) => (
          <button key={i} onClick={() => setImg(img === i ? 0 : i)} aria-label={`Show view ${i + 1}`} aria-pressed={img === i} className={`overflow-hidden rounded-2xl ring-offset-2 transition focus-visible:ring-2 focus-visible:ring-terracotta ${img === i ? "ring-2 ring-terracotta" : "hover:opacity-90"}`}>
            <SafeImg src={x.images[i]} alt={`${x.name} view ${i + 1}`} art={{ slug: x.slug, type: x.type, variant: i }} className="h-full w-full" /></button>))}</div>
      </div>

      <div className="mt-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2"><Badge className="bg-forest-50 capitalize text-forest">{x.type}</Badge><Badge className="bg-amber-100 text-amber-900">{x.dataLabel}</Badge></div>
          <h1 className="mt-2 text-4xl sm:text-5xl">{x.name}</h1>
          <p className="mt-1 flex items-center gap-3 text-ink/70"><span className="flex items-center gap-1"><MapPin className="h-4 w-4" aria-hidden />{x.city}, {x.state}</span><span className="flex items-center gap-1"><Star className="h-4 w-4 fill-terracotta text-terracotta" aria-hidden />{x.rating || "New"} ({x.ratingCount})</span></p>
        </div>
        <Button variant={fav ? "accent" : "outline"} onClick={toggleFav} aria-pressed={!!fav}><Heart className={`h-4 w-4 ${fav ? "fill-current" : ""}`} aria-hidden />{fav ? "Saved" : "Save"}</Button>
      </div>

      <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_380px]">
        <div className="min-w-0 space-y-10">
          <section aria-labelledby="about"><h2 id="about" className="text-2xl">History and significance</h2><p className="mt-3 max-w-prose leading-relaxed">{x.history}</p><p className="mt-3 max-w-prose leading-relaxed">{x.significance}</p></section>

          <SiteNotices slug={slug} />
<DigitalTwin
  name={x.name}
  seed={x.slug}
  type={x.type}
  liveSlug={slug}
/>
<LivePanel slug={slug} />
          <section aria-labelledby="crowd">
            <h2 id="crowd" className="text-2xl">Expected crowd on {fmtDate(date)}</h2>
            {s.loading ? <div className="mt-3 h-40 animate-pulse rounded-xl bg-forest/10" /> : s.data?.closed ? <p className="mt-3 rounded-lg bg-amber-50 p-3 text-amber-900">Closed on this date.</p> : (<>
              <Card className="mt-3 p-4">
                <CrowdRibbon slots={s.data.slots} />
                <div className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
                  <div><p className="text-ink/60">Quietest windows</p><p className="mt-0.5 font-medium">{best.length ? best.map((b: any) => fmtTime(b.start)).join(", ") : "No upcoming slots"}</p></div>
                  <div><p className="text-ink/60">Busiest</p><p className="mt-0.5 flex items-center gap-2 font-medium">{peak ? <>{fmtTime(peak.start)} <LevelBadge level={peak.level} /></> : "None"}</p></div>
                  <div><p className="text-ink/60">Estimated queue at busiest</p><p className="mt-0.5 flex items-center gap-1 font-medium"><Timer className="h-4 w-4" aria-hidden />{peak ? (peak.waitMin ? `about ${peak.waitMin} min` : "no wait expected") : "n/a"}</p></div>
                </div>
              </Card>
              <div className="mt-4"><SlotChart slots={s.data.slots} /></div>
              <p className="mt-2 text-xs text-ink/60">Predicted by a rule-based model from sample history, weekday, season, holidays and current bookings. These are estimates, not live sensor readings. Dashed line shows slot capacity.</p>
            </>)}
          </section>

          {wk.data?.days && <section aria-labelledby="week"><h2 id="week" className="text-2xl">Best day this week</h2><Card className="mt-3 p-4"><CrowdHeatmap days={wk.data.days} onPick={(d) => { setDate(d); window.scrollTo({ top: 0, behavior: "smooth" }); }} /></Card></section>}

          <section aria-labelledby="info">
            <h2 id="info" className="text-2xl">Visitor information</h2>
            <div className="mt-3 grid gap-4 sm:grid-cols-2">
              <Card className="p-4"><h3 className="flex items-center gap-2 text-base"><Clock className="h-4 w-4" aria-hidden />Opening hours</h3><p className="mt-2 text-sm">{fmtTime(x.hours.open)} to {fmtTime(x.hours.close)}</p><p className="text-sm text-ink/70">{x.hours.closedDays.length ? `Closed on ${x.hours.closedDays.map((i: number) => DAYS[i]).join(", ")}` : "Open every day"}</p>{x.closures.length > 0 && <p className="mt-1 text-sm text-terracotta">Special closures: {x.closures.map((c: any) => `${c.date} (${c.reason})`).join(", ")}</p>}</Card>
              <Card className="p-4"><h3 className="text-base">Cancellation</h3><p className="mt-2 text-sm">Full refund up to {x.cancellationPolicy.freeUntilHours} hours before your slot. After that, {x.cancellationPolicy.lateRefundPercent}% of ticket value until {x.cancellationPolicy.noRefundHours} hours before. No cancellations after that.</p></Card>
            </div>
            <div className="mt-4 overflow-x-auto"><table className="w-full text-sm"><caption className="mb-2 text-left text-ink/70">Ticket prices (sample data; confirm with the managing authority)</caption><thead><tr className="border-b border-forest/20 text-left"><th className="py-2 pr-4 font-medium">Category</th><th className="py-2 pr-4 font-medium">Ticket</th><th className="py-2 pr-4 font-medium">Special fee</th><th className="py-2 font-medium">Notes</th></tr></thead>
              <tbody>{categories.map((c: any) => <tr key={c._id} className="border-b border-forest/10"><td className="py-2 pr-4">{c.name}</td><td className="py-2 pr-4">{c.priceMinor ? inr(c.priceMinor) : "Free"}</td><td className="py-2 pr-4">{c.feeMinor ? inr(c.feeMinor) : "None"}</td><td className="py-2 text-ink/70">{c.description || ""}</td></tr>)}</tbody></table></div>
            <p className="mt-2 text-xs text-ink/60">A 2% convenience fee plus 18% GST on that fee is added at checkout.</p>
          </section>

          {(park.data?.available || (passList.data?.items || []).some((p: any) => p.destinations.some((id: string) => id === x._id))) && (
            <section aria-labelledby="extras" className="grid gap-4 sm:grid-cols-2"><h2 id="extras" className="sr-only">Parking, passes and groups</h2>
              {park.data?.available && <Card className="p-5"><h3 className="flex items-center gap-2 text-base"><CarFront className="h-4 w-4 text-terracotta" aria-hidden />Parking</h3><ul className="mt-3 space-y-2 text-sm">{park.data.types.map((t: any) => { const Icon = t.type === "bus" ? Bus : t.type === "two_wheeler" ? Bike : CarFront; return <li key={t.pool || t.type} className="flex items-center justify-between"><span className="flex items-center gap-2"><Icon className="h-4 w-4 text-forest" aria-hidden />{t.label}</span><span className={t.available === 0 ? "font-medium text-red-700" : ""}>{t.available === 0 ? "Full" : `${t.available} free`} <span className="text-xs text-ink/55">of {t.capacity}</span></span></li>; })}</ul><p className="mt-3 text-xs text-ink/60">Counts come from gate staff recording vehicles in and out. First hour from {inr(Math.min(...park.data.types.filter((t: any) => (t.bay || "standard") === "standard").map((t: any) => t.firstHourMinor)))}.</p><Link href={`/dashboard/parking?destination=${slug}&date=${date}`} className="mt-4 inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-terracotta px-4 text-sm font-medium text-white hover:bg-terracotta-600"><CarFront className="h-4 w-4" aria-hidden />Reserve a parking space</Link></Card>}
              {(passList.data?.items || []).filter((p: any) => p.destinations.some((id: string) => id === x._id)).slice(0, 1).map((p: any) => <Card key={p._id} className="p-5"><h3 className="text-base">Season pass available</h3><p className="mt-2 text-sm">{p.name}: {inr(p.priceMinor)} for {p.validityDays} day{p.validityDays > 1 ? "s" : ""}, covering {p.destinationInfo.length} site{p.destinationInfo.length > 1 ? "s" : ""}.</p><Link href="/passes" className="mt-3 inline-block text-sm text-terracotta underline">See passes</Link></Card>)}
            </section>)}
          <p className="rounded-2xl bg-forest-50 p-4 text-sm">Visiting with a school or tour group of 10 or more? <Link href="/groups" className="font-medium text-terracotta underline">Request a group visit</Link> and the site will confirm a slot and any concession.</p>

          <section className="grid gap-6 sm:grid-cols-2" aria-label="Guidelines and facilities">
            <div><h2 className="text-xl">Visitor guidelines</h2><ul className="mt-2 list-disc space-y-1 pl-5 text-sm">{x.guidelines.map((g: string) => <li key={g}>{g}</li>)}</ul></div>
            <div><h2 className="text-xl">Facilities</h2><ul className="mt-2 list-disc space-y-1 pl-5 text-sm">{x.facilities.map((g: string) => <li key={g}>{g}</li>)}</ul>
              {x.accessibility.length > 0 && <><h3 className="mt-4 flex items-center gap-2 text-base"><Accessibility className="h-4 w-4" aria-hidden />Accessibility</h3><ul className="mt-1 list-disc space-y-1 pl-5 text-sm">{x.accessibility.map((g: string) => <li key={g}>{g}</li>)}</ul></>}</div>
          </section>

          <section aria-labelledby="map"><h2 id="map" className="text-2xl">Location and directions</h2><p className="mt-1 text-sm text-ink/70">{x.location.address}</p><div className="mt-3 overflow-hidden rounded-xl"><LeafletMap lat={x.location.lat} lng={x.location.lng} name={x.name} /></div>
            <div className="mt-4"><VisitInfo slug={slug} name={x.name} to={x.location} date={date && date <= new Date(Date.now() + 15 * 86400000).toISOString().slice(0, 10) ? date : undefined} /></div></section>

          {x.faqs.length > 0 && <section aria-labelledby="faq"><h2 id="faq" className="text-2xl">Frequently asked questions</h2><div className="mt-3 space-y-2">{x.faqs.map((f: any) => <details key={f.q} className="rounded-lg border border-forest/15 bg-white p-3"><summary className="cursor-pointer font-medium">{f.q}</summary><p className="mt-2 text-sm">{f.a}</p></details>)}</div></section>}

          <section aria-labelledby="reviews"><h2 id="reviews" className="text-2xl">Visitor reviews</h2>
            {user?.role === "tourist" && <Card className="mt-3 space-y-3 p-4"><Field label="Your rating"><Select value={rating} onChange={(e) => setRating(e.target.value)}>{[5, 4, 3, 2, 1].map((n) => <option key={n} value={n}>{n} out of 5</option>)}</Select></Field><Field label="Comment (optional)"><Textarea value={comment} onChange={(e) => setComment(e.target.value)} maxLength={1000} /></Field><Button onClick={review}>Save review</Button></Card>}
            <div className="mt-3 space-y-3">{rv.data?.items?.length ? rv.data.items.map((r: any) => <Card key={r.id} className="p-4"><p className="flex items-center gap-2 text-sm font-medium">{r.name}<span className="flex items-center text-terracotta" aria-label={`${r.rating} out of 5`}><Star className="h-3.5 w-3.5 fill-current" aria-hidden />{r.rating}</span></p>{r.comment && <p className="mt-1 text-sm">{r.comment}</p>}</Card>) : <p className="text-sm text-ink/60">No reviews yet.</p>}</div>
          </section>
        </div>
        <aside className="lg:sticky lg:top-20 lg:self-start"><BookingWidget destination={x} categories={categories} date={date} setDate={setDate} slots={s.data} loading={s.loading} error={s.error} /></aside>
      </div>
    </div>
  );
}
