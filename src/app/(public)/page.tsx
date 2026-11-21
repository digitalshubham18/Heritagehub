"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowRight, BadgeCheck, Building2, CalendarHeart, CarFront, ClipboardCheck, Landmark, MapPin, QrCode, Search, Ticket, Timer, Users, WifiOff } from "lucide-react";
import { useApi } from "@/lib/hooks";
import { DestCard } from "@/components/dest-card";
import { CrowdRibbon, LevelBadge, SlotChart } from "@/components/crowd";
import { HeritageArt } from "@/components/art";
import { SafeImg } from "@/components/media";
import { Reveal } from "@/components/reveal";
import { Button, ErrorState, Skeleton } from "@/components/ui";
import { cn, fmtTime, todayIST } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";

const EVENTS = [
  { name: "Taj Mahotsav", place: "Agra", when: "Usually February", note: "Crafts, cuisine and performances", slug: "taj-mahal", type: "monument" },
  { name: "Qutub Festival", place: "New Delhi", when: "Usually autumn", note: "Classical music and dance at the Qutub complex", slug: "qutub-minar", type: "archaeological" },
  { name: "Hampi Utsav", place: "Hampi", when: "Usually November", note: "Cultural festival among the ruins", slug: "vittala-temple-hampi", type: "temple" },
];
const STEPS = [
  ["Choose a site and date", "Browse monuments, forts and museums, then check the week's heatmap for the calmest day."],
  ["Pick a quiet slot", "Every slot shows seats left, expected crowd and likely queue, so you choose the hour instead of guessing it."],
  ["Pay and get your QR ticket", "Seats are held for ten minutes while you pay. The ticket is saved to your account with a calendar file."],
  ["Scan at the gate", "Staff scan your QR and it is checked against the booking, date and slot in seconds."],
];
const FAQ = [
  ["Are the crowd levels live?", "No. They are predictions from a transparent model that uses seasonality, weekday, holidays and current bookings. Entries recorded by staff are shown separately as recorded."],
  ["Can I cancel?", "Yes, within each site's policy. Many sites give a full refund up to 24 hours before your slot. The rule is shown before you pay and again before you cancel."],
  ["Is this the official government ticketing service?", "No. HeritageHub is an independent prototype with its own design. Prices and data in this demo are samples."],
  ["Can a school or tour group book?", "Yes. Send a group request and the site's team confirms a slot and any concession, then you pay once for the whole group."],
];

export default function Landing() {
  const router = useRouter();
  const { t } = useI18n();
  const [q, setQ] = useState("");
  const [tab, setTab] = useState(0);
  const { data, loading, error, reload } = useApi<any>("/api/destinations");
  const items: any[] = data?.items || [];
  const cities = new Set(items.map((i) => i.city)).size;
  const hero = items.find((i) => i.slug === "taj-mahal") || items[0];
  const quiet = [...items].filter((i) => !i.crowd.closed).sort((a, b) => a.crowd.densityPct - b.crowd.densityPct).slice(0, 3);
  const demo = items.filter((i) => !i.crowd.closed).slice(0, 4);
  const cur = demo[Math.min(tab, Math.max(demo.length - 1, 0))];
  const slots = useApi<any>(cur ? `/api/slots?destination=${cur.slug}&date=${todayIST()}` : null);
  const heroSlots = useApi<any>(hero ? `/api/slots?destination=${hero.slug}&date=${todayIST()}` : null);
  const best = (slots.data?.slots || []).filter((s: any) => !s.closed && !s.past).sort((a: any, b: any) => a.densityPct - b.densityPct).slice(0, 3).sort((a: any, b: any) => a.start.localeCompare(b.start));

  return (
    <>
      {/* ---------- Hero ---------- */}
      <section className="relative overflow-hidden border-b border-forest/10 bg-ivory-100">
        <div className="bg-jali absolute inset-0 [mask-image:linear-gradient(to_bottom,black,transparent_85%)]" aria-hidden />
        <div className="relative mx-auto grid max-w-6xl items-center gap-14 px-4 pb-24 pt-14 lg:grid-cols-[1.05fr_1fr] lg:pb-28 lg:pt-20">
          <div>
            <p className="inline-flex items-center gap-2 rounded-full border border-forest/15 bg-white/70 px-3 py-1 text-sm text-forest backdrop-blur"><BadgeCheck className="h-4 w-4 text-terracotta" aria-hidden />Timed tickets with honest crowd forecasts</p>
            <h1 className="mt-5 text-[2.9rem] leading-[1.02] sm:text-6xl lg:text-[4.3rem]">
              {t("hero.title").split(/(history|इतिहास)/).map((part, i) => /^(history|इतिहास)$/.test(part)
                ? <span key={i} className="relative whitespace-nowrap text-terracotta">{part}<svg aria-hidden viewBox="0 0 200 12" className="absolute -bottom-2 left-0 h-3 w-full text-terracotta/50" preserveAspectRatio="none"><path d="M2 8C40 2 80 2 120 6S180 10 198 4" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" /></svg></span> : part)}
            </h1>
            <p className="mt-6 max-w-md text-lg leading-relaxed text-ink/80">{t("hero.sub")}</p>
            <form role="search" onSubmit={(e) => { e.preventDefault(); router.push(`/destinations${q ? `?q=${encodeURIComponent(q)}` : ""}`); }} className="mt-8 flex max-w-lg gap-2 rounded-2xl bg-white p-2 shadow-lift">
              <label htmlFor="hs" className="sr-only">Search monuments, museums or cities</label>
              <div className="relative flex-1"><Search className="absolute left-3 top-3.5 h-4 w-4 text-ink/50" aria-hidden /><input id="hs" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("hero.placeholder")} className="h-11 w-full rounded-xl bg-transparent pl-9 pr-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-terracotta" /></div>
              <Button type="submit" variant="accent" size="lg" className="h-11">{t("hero.search")}</Button>
            </form>
            <div className="mt-5 flex flex-wrap gap-2 text-sm">{["Agra", "Delhi", "Jaipur", "Hampi"].map((c) => <Link key={c} href={`/destinations?q=${c}`} className="flex items-center gap-1 rounded-full border border-forest/20 bg-white/60 px-3 py-1 hover:bg-forest hover:text-ivory"><MapPin className="h-3 w-3" aria-hidden />{c}</Link>)}<Link href="/plan" className="rounded-full bg-forest px-3 py-1 text-ivory hover:bg-forest-700">Plan a visit</Link></div>
          </div>

          <div className="relative mx-auto w-full max-w-md lg:max-w-none">
            <div className="arch absolute -inset-3 border border-terracotta/35" aria-hidden />
            <div className="arch relative overflow-hidden shadow-lift">
              {hero ? <SafeImg src={hero.image} alt={hero.name} art={{ slug: hero.slug, type: hero.type }} className="h-[26rem] w-full lg:h-[32rem]" /> : <Skeleton className="h-[26rem] w-full lg:h-[32rem]" />}
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/55 to-transparent p-5 pt-16 text-white"><p className="font-display text-2xl">{hero?.name}</p><p className="text-sm text-white/80">{hero?.city}, {hero?.state}</p></div>
            </div>
            {heroSlots.data && !heroSlots.data.closed && (
              <div className="absolute -left-4 top-10 hidden w-60 rounded-2xl bg-white p-4 shadow-lift sm:block lg:-left-10">
                <p className="flex items-center justify-between text-sm font-medium">Today's crowd {hero && <LevelBadge level={hero.crowd.level} />}</p>
                <CrowdRibbon className="mt-3" slots={heroSlots.data.slots} />
              </div>)}
            {quiet.length > 0 && (
              <div className="absolute -bottom-6 right-0 w-72 rounded-2xl bg-white p-4 shadow-lift lg:-right-6">
                <p className="flex items-center gap-2 text-sm font-medium"><Timer className="h-4 w-4 text-terracotta" aria-hidden />{t("hero.quiet")}</p>
                <ul className="mt-2 space-y-2 text-sm">{quiet.map((i) => <li key={i._id} className="flex items-center justify-between gap-2"><Link href={`/destinations/${i.slug}`} className="truncate hover:text-terracotta">{i.name.replace(/ \(.*\)| Complex/, "")}</Link><span className="flex items-center gap-2 whitespace-nowrap"><span className="text-xs text-ink/60">{i.crowd.best[0] && fmtTime(i.crowd.best[0].start)}</span><LevelBadge level={i.crowd.level} /></span></li>)}</ul>
              </div>)}
          </div>
        </div>
      </section>

      {/* ---------- Facts ---------- */}
      <section aria-label="At a glance" className="border-b border-forest/10 bg-white">
        <ul className="mx-auto grid max-w-6xl gap-6 px-4 py-9 sm:grid-cols-4">
          {([[Landmark, items.length || "…", "heritage sites to book"], [MapPin, cities || "…", "cities covered"], [Timer, "10 min", "seat hold while you pay"], [QrCode, "QR", "ticket checked at the gate"]] as const).map(([Icon, v, l]) => (
            <li key={l} className="flex items-center gap-4"><span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-forest-50 text-forest"><Icon className="h-5 w-5" aria-hidden /></span><div><p className="font-display text-3xl leading-none">{v}</p><p className="mt-1 text-sm text-ink/70">{l}</p></div></li>))}
        </ul>
      </section>

      {/* ---------- Day preview ---------- */}
      <section className="mx-auto max-w-6xl px-4 pt-24" aria-labelledby="see">
        <Reveal><h2 id="see" className="text-3xl sm:text-4xl">{t("land.see")}</h2><p className="mt-3 max-w-xl text-ink/80">Each coloured block is one time slot. Pick a site to see today's expected crowd, then book the quiet end of the ribbon.</p></Reveal>
        <Reveal delay={80} className="relative mt-8 overflow-hidden rounded-3xl bg-forest p-5 text-ivory shadow-lift sm:p-8">
          <div className="bg-jali-light absolute inset-0" aria-hidden />
          <div className="relative">
            {loading ? <Skeleton className="h-80 !bg-white/10" /> : error ? <ErrorState message={error} onRetry={reload} /> : (<>
              <div role="tablist" aria-label="Sites" className="flex flex-wrap gap-2">{demo.map((d, i) => <button key={d.slug} role="tab" aria-selected={i === tab} onClick={() => setTab(i)} className={cn("rounded-full px-4 py-1.5 text-sm transition-colors", i === tab ? "bg-ivory text-forest" : "border border-ivory/30 hover:bg-ivory/10")}>{d.name.replace(/ \(.*\)| Complex/, "")}</button>)}</div>
              {slots.data && !slots.data.closed ? (
                <div className="mt-6 grid gap-6 lg:grid-cols-[1.5fr_1fr]">
                  <div className="rounded-2xl bg-white p-4 text-ink"><CrowdRibbon slots={slots.data.slots} /><div className="mt-4"><SlotChart slots={slots.data.slots} /></div></div>
                  <div className="flex flex-col justify-between gap-5">
                    <div><p className="text-sm text-ivory/70">Quietest windows left today</p><p className="mt-1 font-display text-3xl">{best.length ? best.map((b: any) => fmtTime(b.start)).join(", ") : "None left today"}</p></div>
                    {cur && <div className="overflow-hidden rounded-2xl"><SafeImg src={cur.image} alt={cur.name} art={{ slug: cur.slug, type: cur.type, variant: 1 }} className="h-36 w-full" /></div>}
                    <div><Link href={`/destinations/${cur?.slug}`} className="inline-flex items-center gap-2 rounded-xl bg-terracotta px-5 py-3 font-medium text-white hover:bg-terracotta-600">Book {cur?.name.replace(/ \(.*\)| Complex/, "")}<ArrowRight className="h-4 w-4" aria-hidden /></Link><p className="mt-3 text-xs text-ivory/60">Predicted from sample data; not a live sensor reading.</p></div>
                  </div>
                </div>) : <p className="mt-6 text-ivory/80">{slots.loading ? "Loading…" : "This site is closed today. Try another."}</p>}
            </>)}
          </div>
        </Reveal>
      </section>

      {/* ---------- Steps ---------- */}
      <section className="mx-auto max-w-6xl px-4 pt-24" aria-labelledby="how">
        <Reveal><h2 id="how" className="text-3xl sm:text-4xl">{t("land.how")}</h2></Reveal>
        <ol className="relative mt-10 grid gap-8 md:grid-cols-4">
          <div className="absolute left-[12%] right-[12%] top-6 hidden border-t-2 border-dashed border-terracotta/30 md:block" aria-hidden />
          {STEPS.map(([h, d], i) => <Reveal as="li" key={h} delay={i * 90} className="relative"><span className="relative z-10 flex h-12 w-12 items-center justify-center rounded-full bg-terracotta font-display text-xl text-white shadow-card">{i + 1}</span><h3 className="mt-4 text-lg">{h}</h3><p className="mt-2 text-sm leading-relaxed text-ink/80">{d}</p></Reveal>)}
        </ol>
      </section>

      {/* ---------- Featured ---------- */}
      <section className="mx-auto max-w-6xl px-4 pt-24">
        <Reveal className="flex items-end justify-between"><h2 className="text-3xl sm:text-4xl">{t("land.featured")}</h2><Link href="/destinations" className="flex items-center gap-1 text-sm text-terracotta hover:underline">{t("land.all")}<ArrowRight className="h-4 w-4" aria-hidden /></Link></Reveal>
        {error ? <div className="mt-6"><ErrorState message={error} onRetry={reload} /></div> : <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">{loading ? Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-96" />) : items.slice(0, 6).map((d, i) => <Reveal key={d._id} delay={(i % 3) * 80}><DestCard d={d} /></Reveal>)}</div>}
        <p className="mt-4 text-xs text-ink/60">Prices, ratings and crowd levels shown are sample and demonstration data.</p>
      </section>

      {/* ---------- Features ---------- */}
      <section className="mx-auto max-w-6xl px-4 pt-24" aria-labelledby="more">
        <Reveal><h2 id="more" className="text-3xl sm:text-4xl">Everything a visit needs</h2><p className="mt-3 max-w-xl text-ink/80">From the first search to the car park, in one place.</p></Reveal>
        <div className="mt-10 grid gap-5 md:grid-cols-3 md:grid-rows-2">
          <Reveal className="relative overflow-hidden rounded-3xl bg-forest p-7 text-ivory shadow-lift md:col-span-2 md:row-span-1">
            <HeritageArt slug="national-museum-delhi" type="palace" variant={2} className="absolute inset-0 h-full w-full opacity-40" />
            <div className="relative max-w-sm"><Users className="h-7 w-7 text-terracotta" aria-hidden /><h3 className="mt-3 text-2xl">Group and school bookings</h3><p className="mt-2 text-ivory/85">Bringing a class or a tour party? Send one request. The site confirms a slot and any concession, then you pay once for everyone.</p><Link href="/groups" className="mt-5 inline-flex items-center gap-2 rounded-xl bg-ivory px-4 py-2.5 text-sm font-medium text-forest hover:bg-white">Request a group visit<ArrowRight className="h-4 w-4" aria-hidden /></Link></div>
          </Reveal>
          {[
            [Ticket, "Season passes", "Return as often as you like within the validity period, with one QR for the gate.", "/passes", "Browse passes"],
            [CarFront, "Parking, planned", "See free parking spaces for cars, two-wheelers and buses on each destination page.", "/destinations", "Find a site"],
            [WifiOff, "Gate staff stay online-or-not", "Counter sales, hardware scanners and offline-tolerant scanning keep queues moving.", "/login", "Staff sign in"],
            [Building2, "For heritage operators", "Run several sites from one dashboard, with your own staff, passes, settlements and invoices.", "/operators", "See operator tools"],
          ].map(([Icon, h, d, href, cta]: any, i) => (
            <Reveal key={h} delay={i * 70} className="flex flex-col rounded-3xl border border-forest/10 bg-white p-6 shadow-card card-lift">
              <span className="flex h-11 w-11 items-center justify-center rounded-full bg-terracotta-50 text-terracotta"><Icon className="h-5 w-5" aria-hidden /></span>
              <h3 className="mt-4 text-xl">{h}</h3><p className="mt-2 flex-1 text-sm leading-relaxed text-ink/80">{d}</p>
              <Link href={href} className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-terracotta hover:underline">{cta}<ArrowRight className="h-4 w-4" aria-hidden /></Link>
            </Reveal>))}
        </div>
      </section>

      {/* ---------- Events ---------- */}
      <section className="mx-auto max-w-6xl px-4 pt-24">
        <Reveal><h2 className="flex items-center gap-3 text-3xl sm:text-4xl"><CalendarHeart className="h-7 w-7 text-terracotta" aria-hidden />Cultural events</h2></Reveal>
        <div className="mt-8 grid gap-5 sm:grid-cols-3">{EVENTS.map((e, i) => (
          <Reveal key={e.name} delay={i * 80} className="overflow-hidden rounded-2xl border border-forest/10 bg-white shadow-card"><HeritageArt slug={e.slug} type={e.type} variant={1} className="block h-32 w-full" /><div className="p-5"><h3 className="text-lg">{e.name}</h3><p className="text-sm text-ink/70">{e.place}, {e.when}</p><p className="mt-2 text-sm">{e.note}</p></div></Reveal>))}</div>
        <p className="mt-3 text-xs text-ink/60">Event timings are indicative sample content. Check organisers' announcements for current dates.</p>
      </section>

      {/* ---------- FAQ ---------- */}
      <section className="mx-auto mt-24 max-w-3xl px-4" aria-labelledby="faq">
        <Reveal><h2 id="faq" className="text-3xl sm:text-4xl">Questions people ask</h2></Reveal>
        <div className="mt-8 space-y-3">{FAQ.map(([qq, a]) => <details key={qq} className="group rounded-2xl border border-forest/10 bg-white p-5 shadow-card open:shadow-lift"><summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-medium">{qq}<span className="text-xl text-terracotta transition-transform group-open:rotate-45" aria-hidden>+</span></summary><p className="mt-3 text-sm leading-relaxed text-ink/80">{a}</p></details>)}</div>
      </section>

      {/* ---------- CTA ---------- */}
      <section className="mx-auto mt-24 max-w-6xl px-4">
        <Reveal className="relative overflow-hidden rounded-3xl bg-forest text-ivory shadow-lift">
          <HeritageArt slug="agra-fort" type="fort" variant={2} className="absolute inset-0 h-full w-full opacity-50" />
          <div className="relative px-8 py-16 text-center sm:py-20"><h2 className="text-3xl sm:text-5xl">{t("land.cta")}</h2><p className="mx-auto mt-4 max-w-md text-ivory/85">Create a free account to book tickets, keep QR tickets in one place and save the sites you love.</p><div className="mt-8 flex flex-wrap justify-center gap-3"><Link href="/register" className="rounded-xl bg-terracotta px-6 py-3.5 font-medium text-white hover:bg-terracotta-600">{t("land.create")}</Link><Link href="/destinations" className="rounded-xl border border-ivory/50 bg-forest/40 px-6 py-3.5 backdrop-blur hover:bg-ivory hover:text-forest">{t("land.browse")}</Link></div></div>
        </Reveal>
      </section>
    </>
  );
}
