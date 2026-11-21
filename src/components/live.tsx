"use client";
import Link from "next/link";
import { ArrowDownRight, ArrowRight, ArrowUpRight, CarFront, PauseCircle } from "lucide-react";
import { useApi } from "@/lib/hooks";
import { cn, LEVEL_LABEL, type Level } from "@/lib/utils";
import { DensityBar, LevelBadge } from "./crowd";
import { Skeleton } from "./ui";

export const LIVE_POLL = 15000;
export type LiveItem = {
  id: string; slug: string; name: string; open: boolean; paused: boolean; pausedReason?: string; pct: number; level: Level; waitMin: number; trend: "rising" | "steady" | "easing";
  quiet: boolean; forecastLevel?: Level; forecastPct?: number; parking: { type: string; label: string; capacity: number; available: number }[] | null; updatedAt: string;
  occupancy?: number; limit?: number; entriesLast15: number; exitsLast15: number;
  source?: "headcount" | "tickets"; ticketOccupancy?: number; headcount?: number | null;
};
/** Polls live crowd for one site (slug) or all sites (null). */
export function useLive(slug: string | null | undefined, opts: { all?: boolean; detail?: boolean } = {}) {
  const url = slug ? `/api/crowd/live?destination=${slug}${opts.detail ? "&detail=1" : ""}` : opts.all ? "/api/crowd/live" : null;
  const r = useApi<{ items: LiveItem[]; at: string }>(url, { poll: LIVE_POLL });
  return { ...r, items: r.data?.items || [] };
}

export function LiveDot({ className }: { className?: string }) {
  return <span className={cn("relative inline-flex h-2.5 w-2.5", className)} aria-hidden><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500 opacity-60 motion-reduce:animate-none" /><span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-red-600" /></span>;
}
export const LiveTag = ({ quiet }: { quiet?: boolean }) => <span className="inline-flex items-center gap-1.5 text-xs font-medium text-ink/70">{quiet ? <span className="h-2.5 w-2.5 rounded-full bg-stone-400" aria-hidden /> : <LiveDot />}{quiet ? "Gates quiet" : "Live"}</span>;

const TREND = { rising: { Icon: ArrowUpRight, text: "Filling up", cls: "text-orange-700" }, steady: { Icon: ArrowRight, text: "Steady", cls: "text-ink/70" }, easing: { Icon: ArrowDownRight, text: "Easing", cls: "text-emerald-700" } };
export function TrendChip({ trend }: { trend: LiveItem["trend"] }) { const t = TREND[trend]; return <span className={cn("inline-flex items-center gap-1 text-xs font-medium", t.cls)}><t.Icon className="h-3.5 w-3.5" aria-hidden />{t.text}</span>; }
export const ago = (iso?: string) => { if (!iso) return ""; const s = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000)); return s < 60 ? `${s}s ago` : `${Math.round(s / 60)} min ago`; };

/** Compact live strip: level, percentage, wait, trend. Falls back to the forecast (clearly labelled) when the gates are quiet or closed. */
export function LiveStrip({ s, className }: { s: LiveItem; className?: string }) {
  if (!s.open) return <p className={cn("text-sm text-ink/60", className)}>Closed right now</p>;
  if (s.paused) return <p className={cn("flex items-center gap-2 rounded-lg bg-red-50 p-2 text-sm text-red-900", className)}><PauseCircle className="h-4 w-4" aria-hidden />Entry paused: {s.pausedReason}</p>;
  if (s.quiet && s.forecastLevel) return <div className={cn("flex flex-wrap items-center gap-2 text-sm", className)}><LiveTag quiet /><span className="text-ink/70">Forecast:</span><LevelBadge level={s.forecastLevel} /></div>;
  return <div className={cn("flex flex-wrap items-center gap-x-3 gap-y-1 text-sm", className)}><LiveTag /><LevelBadge level={s.level} />{s.occupancy != null && <span className="font-medium">{s.occupancy.toLocaleString("en-IN")} people inside</span>}<span className={s.occupancy != null ? "text-ink/70" : "font-medium"}>{s.pct}% full</span><TrendChip trend={s.trend} />{s.waitMin > 0 && <span className="text-ink/70">~{s.waitMin} min wait</span>}</div>;
}

/** Full live panel for a destination page or dashboard card. */
export function LivePanel({ slug, className, title }: { slug: string; className?: string; title?: string }) {
  const { items, loading, error } = useLive(slug);
  const s = items[0];
  if (loading) return <Skeleton className="h-36" />;
  if (error || !s) return null;
  const forecastOnly = s.quiet && s.forecastLevel;
  return (
    <section aria-label={title || "Live crowd"} className={cn("rounded-2xl border border-forest/10 bg-white p-5 shadow-card", className)}>
      <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-lg">{title || "Crowd right now"}</h2><span className="flex items-center gap-3"><LiveTag quiet={!!forecastOnly || !s.open} /><span className="text-xs text-ink/55">Updated {ago(s.updatedAt)}</span></span></div>
      {!s.open ? <p className="mt-3 text-sm text-ink/70">The site is closed right now. See the forecast below for your visit day.</p> : s.paused ? (
        <p role="alert" className="mt-3 flex items-center gap-2 rounded-xl bg-red-50 p-3 text-sm text-red-900"><PauseCircle className="h-5 w-5 shrink-0" aria-hidden /><span><strong>Entry is paused.</strong> {s.pausedReason}. Please wait; staff will resume entry shortly.</span></p>
      ) : forecastOnly ? (
        <div className="mt-3 space-y-2"><p className="text-sm text-ink/75">No gate activity recorded recently, so there is no live reading. The forecast for this hour is:</p><div className="flex items-center gap-2"><LevelBadge level={s.forecastLevel!} /><span className="text-sm">{s.forecastPct}% of slot capacity expected</span></div></div>
      ) : (
        <div className="mt-3 space-y-3">
          <div className="flex flex-wrap items-center gap-3"><LevelBadge level={s.level} className="text-sm" />{s.occupancy != null ? <span className="font-display text-3xl">{s.occupancy.toLocaleString("en-IN")}<span className="ml-1 text-base text-ink/60">people inside{s.limit ? ` of ${s.limit.toLocaleString("en-IN")}` : ""}</span></span> : null}<span className={s.occupancy != null ? "text-lg font-medium text-ink/70" : "font-display text-3xl"}>{s.pct}%</span><TrendChip trend={s.trend} /></div>
          <DensityBar pct={s.pct} level={s.level} />
          <p className="text-sm text-ink/75">{s.waitMin > 0 ? `Expect roughly ${s.waitMin} minutes at the entrance.` : "No queue expected at the entrance."} {LEVEL_LABEL[s.level]} crowd inside.</p>
        </div>
      )}
      {s.parking && s.parking.length > 0 && <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-forest/10 pt-3 text-xs"><CarFront className="h-4 w-4 text-terracotta" aria-hidden /><span className="font-medium">Parking free:</span>{s.parking.map((p) => <span key={p.type} className={cn("rounded-full px-2 py-0.5", p.available === 0 ? "bg-red-100 text-red-900" : "bg-emerald-100 text-emerald-900")}>{p.label} {p.available}</span>)}</div>}
      <p className="mt-3 text-[11px] leading-snug text-ink/55">{s.source === "headcount" ? "Real headcount from door people-counters and staff counts, refreshed every few seconds." : "Based on tickets and passes scanned at the gate, refreshed every few seconds. Walk-ins without a scan may not be included."}</p>
    </section>
  );
}
export const LiveLink = ({ slug, children }: { slug: string; children: React.ReactNode }) => <Link href={`/destinations/${slug}`} className="hover:text-terracotta">{children}</Link>;
