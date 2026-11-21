"use client";
import Link from "next/link";
import { Accessibility, Clock, MapPin, Star, Timer } from "lucide-react";
import { SafeImg } from "./media";
import { LevelBadge } from "./crowd";
import { cn, fmtTime, inr } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";

export function DestCard({ d, list }: { d: any; list?: boolean }) {
  const { t } = useI18n();
  const c = d.crowd;
  return (
    <Link href={`/destinations/${d.slug}`} className={cn("group card-lift flex overflow-hidden rounded-2xl border border-forest/10 bg-white shadow-card hover:shadow-lift focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-terracotta", list ? "flex-col sm:flex-row" : "flex-col")}>
      <div className={cn("relative", list ? "sm:w-72 sm:shrink-0" : "")}>
        <SafeImg src={d.image} alt={d.name} art={{ slug: d.slug, type: d.type }} className={cn("w-full transition-transform duration-500 group-hover:scale-[1.03]", list ? "h-52 sm:h-full" : "h-52")} />
        <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between p-3">
          <span className="rounded-full bg-white/90 px-2.5 py-1 text-xs font-medium capitalize text-forest shadow-sm backdrop-blur">{d.type}</span>
          <span className="flex items-center gap-1 rounded-full bg-white/90 px-2.5 py-1 text-xs font-semibold shadow-sm backdrop-blur"><Star className="h-3.5 w-3.5 fill-terracotta text-terracotta" aria-hidden /><span className="sr-only">Rating</span>{d.rating || "New"}</span>
        </div>
      </div>
      <div className="flex flex-1 flex-col p-5">
        <h3 className="font-display text-xl leading-tight transition-colors group-hover:text-terracotta">{d.name}</h3>
        <p className="mt-1 flex items-center gap-1 text-sm text-ink/70"><MapPin className="h-3.5 w-3.5" aria-hidden />{d.city}, {d.state}</p>
        <p className="mt-3 line-clamp-2 text-sm text-ink/80">{d.shortDescription}</p>
        <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-ink/75">
          <span className="flex items-center gap-1"><Clock className="h-3.5 w-3.5" aria-hidden />{fmtTime(d.hours.open)} to {fmtTime(d.hours.close)}</span>
          {d.accessible && <span className="flex items-center gap-1"><Accessibility className="h-3.5 w-3.5" aria-hidden />Accessible</span>}
        </div>
        <div className="mt-auto flex flex-wrap items-center justify-between gap-2 border-t border-forest/10 pt-4">
          <div><p className="text-xs text-ink/60">{t("card.from")}</p><p className="font-display text-xl leading-none">{inr(d.fromPriceMinor)}</p></div>
          {c.closed ? <span className="text-sm text-ink/60">{t("card.closed")}</span> : (
            <div className="text-right"><LevelBadge level={c.level} /><p className="mt-1 flex items-center justify-end gap-1 text-xs text-ink/65"><Timer className="h-3 w-3" aria-hidden />{t("card.quietest")} {c.best[0] ? fmtTime(c.best[0].start) : "n/a"}</p></div>)}
        </div>
      </div>
    </Link>
  );
}
