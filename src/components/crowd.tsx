"use client";
import dynamic from "next/dynamic";
import { cn, fmtTime, Level, LEVEL_LABEL } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";

export const LEVEL_COLOR: Record<Level, string> = { low: "#3E8E6B", moderate: "#D9A441", high: "#D9722E", very_high: "#A8282B" };
const TONE: Record<Level, string> = { low: "bg-emerald-100 text-emerald-900", moderate: "bg-amber-100 text-amber-900", high: "bg-orange-100 text-orange-900", very_high: "bg-red-100 text-red-900" };
const BARS: Record<Level, number> = { low: 1, moderate: 2, high: 3, very_high: 4 };

/** Level is conveyed by text AND the number of filled bars, never colour alone. */
export function LevelBadge({ level, className }: { level: Level; className?: string }) {
  const { t } = useI18n();
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium", TONE[level], className)}>
      <svg width="14" height="12" viewBox="0 0 14 12" aria-hidden>{[0, 1, 2, 3].map((i) => <rect key={i} x={i * 3.6} y={9 - i * 3} width="2.4" height={3 + i * 3} rx="0.6" fill="currentColor" opacity={i < BARS[level] ? 1 : 0.25} />)}</svg>
      {t(`level.${level}` as any)}
    </span>
  );
}

type RSlot = { start: string; end: string; level: Level; densityPct?: number; closed?: boolean };
/** Signature element: one segment per time slot, coloured by expected crowd level. */
export function CrowdRibbon({ slots, className, highlight }: { slots: RSlot[]; className?: string; highlight?: string }) {
  if (!slots.length) return null;
  const label = slots.map((s) => `${fmtTime(s.start)} ${LEVEL_LABEL[s.level]}`).join(", ");
  return (
    <div className={className}>
      <div role="img" aria-label={`Expected crowd by time slot: ${label}`} className="flex h-3 gap-0.5 overflow-hidden rounded-full">
        {slots.map((s) => <div key={s.start} title={`${fmtTime(s.start)}–${fmtTime(s.end)}: ${LEVEL_LABEL[s.level]}${s.densityPct != null ? ` (${s.densityPct}%)` : ""}`} className={cn("flex-1", highlight === s.start && "ring-2 ring-ink ring-offset-1")} style={{ background: LEVEL_COLOR[s.level], opacity: s.closed ? 0.3 : 1 }} />)}
      </div>
      <div className="mt-1 flex justify-between text-[11px] text-ink/60"><span>{fmtTime(slots[0].start)}</span><span>{fmtTime(slots[slots.length - 1].end)}</span></div>
    </div>
  );
}

export function DensityBar({ pct, level }: { pct: number; level: Level }) {
  return (<div className="h-2 w-full rounded-full bg-forest/10" role="progressbar" aria-valuenow={Math.min(pct, 100)} aria-valuemin={0} aria-valuemax={100} aria-label="Crowd density"><div className="h-2 rounded-full" style={{ width: `${Math.min(pct, 100)}%`, background: LEVEL_COLOR[level] }} /></div>);
}

/** Expected visitors per slot (coloured by level) against slot capacity. The chart code loads on demand. */
const Chart = dynamic(() => import("./crowd-chart"), { ssr: false, loading: () => <div className="h-64 w-full animate-pulse rounded-xl bg-forest/10" aria-hidden /> });
export function SlotChart(props: { slots: { start: string; expected: number; capacity: number; level: Level; densityPct: number }[] }) { return <Chart {...props} />; }

/** Seven days by time slot. Each cell shows the density number so colour is never the only signal. */
export function CrowdHeatmap({ days, onPick }: { days: { date: string; closed: boolean; slots: { start: string; densityPct: number; level: Level }[] }[]; onPick?: (d: string) => void }) {
  const starts = Array.from(new Set(days.flatMap((d) => d.slots.map((s) => s.start)))).sort();
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[520px] border-separate border-spacing-0.5 text-center text-[11px]">
        <caption className="sr-only">Expected crowd density by day and time slot</caption>
        <thead><tr><th className="w-20 text-left font-medium text-ink/60">Day</th>{starts.map((t) => <th key={t} scope="col" className="font-normal text-ink/60">{fmtTime(t).replace(":00", "").replace(" ", "")}</th>)}</tr></thead>
        <tbody>{days.map((d) => (
          <tr key={d.date}>
            <th scope="row" className="text-left text-xs font-medium">{onPick ? <button className="text-left hover:text-terracotta" onClick={() => onPick(d.date)}>{new Date(d.date + "T00:00:00Z").toLocaleDateString("en-IN", { weekday: "short", day: "numeric", timeZone: "UTC" })}</button> : d.date}</th>
            {d.closed ? <td colSpan={starts.length} className="rounded bg-forest/5 py-1.5 text-ink/60">Closed</td> : starts.map((t) => { const c = d.slots.find((s) => s.start === t); return c ? <td key={t} title={`${LEVEL_LABEL[c.level]} (${c.densityPct}%)`} className="rounded py-1.5 font-medium text-white" style={{ background: LEVEL_COLOR[c.level] }}>{c.densityPct}</td> : <td key={t} />; })}
          </tr>))}</tbody>
      </table>
      <p className="mt-2 text-xs text-ink/60">Numbers are expected visitors as a percentage of slot capacity. Select a day to book it.</p>
    </div>
  );
}
