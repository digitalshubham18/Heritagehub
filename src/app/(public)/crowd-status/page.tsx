"use client";
import Link from "next/link";
import { useState } from "react";
import { useApi } from "@/lib/hooks";
import { DensityBar, LevelBadge } from "@/components/crowd";
import { LiveDot, LiveStrip, ago, useLive } from "@/components/live";
import { SiteNotices } from "@/components/notices";
import { Empty, ErrorState, Field, Input, Skeleton } from "@/components/ui";
import { fmtDate, fmtTime, todayIST } from "@/lib/utils";

export default function CrowdStatus() {
  const [date, setDate] = useState(todayIST());
  const { data, loading, error, reload } = useApi<any>(`/api/crowd?date=${date}`, { poll: 60000 });
  const live = useLive(null, { all: true });
  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <h1 className="text-4xl">Crowd status</h1>
      <SiteNotices className="mt-4" />
      <section aria-labelledby="livenow" className="mt-6">
        <div className="flex flex-wrap items-center gap-3"><h2 id="livenow" className="flex items-center gap-2 text-2xl"><LiveDot />Live right now</h2>{live.data?.at && <span className="text-xs text-ink/60">Updated {ago(live.data.at)}, refreshes every 15 seconds</span>}</div>
        <p className="mt-1 max-w-2xl text-sm text-ink/75">Built from entries and exits that gate staff record as visitors pass through, so it changes within seconds. It is not a camera or sensor count. If a gate has been quiet for a while we show the forecast instead and say so.</p>
        {live.loading ? <Skeleton className="mt-4 h-28" /> : live.items.length === 0 ? null : <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{live.items.map((l) => <li key={l.id} className="rounded-xl border border-forest/10 bg-white p-4 shadow-card"><Link href={`/destinations/${l.slug}`} className="font-medium hover:text-terracotta">{l.name}</Link>{l.open && !l.paused && !(l.quiet && l.forecastLevel) && <div className="mt-2"><DensityBar pct={l.pct} level={l.level} /></div>}<LiveStrip s={l} className="mt-2" />{l.parking && l.parking.length > 0 && <p className="mt-2 text-xs text-ink/65">Parking free: {l.parking.map((p) => `${p.label} ${p.available}`).join(" · ")}</p>}</li>)}</ul>}
      </section>
      <h2 className="mt-10 text-2xl">Forecast</h2>
      <p className="mt-1 max-w-xl text-ink/80">Expected crowd levels for {fmtDate(date)}. These are model predictions based on history, weekday, season, holidays and current bookings. Use them to pick a day; use the live view above on the day.</p>
      <div className="mt-6 max-w-xs"><Field label="Date"><Input type="date" min={todayIST()} value={date} onChange={(e) => e.target.value && setDate(e.target.value)} /></Field></div>
      <div className="mt-6">
        {error ? <ErrorState message={error} onRetry={reload} /> : loading ? <Skeleton className="h-64" /> : !data?.items?.length ? <Empty title="No destinations yet" /> : (
          <div className="overflow-x-auto rounded-xl border border-forest/10 bg-white">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="bg-forest-50 text-left"><tr><th className="p-3 font-medium">Destination</th><th className="p-3 font-medium">Expected crowd</th><th className="p-3 font-medium">Density</th><th className="p-3 font-medium">Wait</th><th className="p-3 font-medium">Quietest windows</th></tr></thead>
              <tbody>{data.items.map((i: any) => (
                <tr key={i.id} className="border-t border-forest/10">
                  <td className="p-3"><Link href={`/destinations/${i.slug}`} className="font-medium hover:text-terracotta">{i.name}</Link><p className="text-xs text-ink/60">{i.city}</p></td>
                  {i.crowd.closed ? <td colSpan={4} className="p-3 text-ink/60">Closed on this date</td> : <>
                    <td className="p-3"><LevelBadge level={i.crowd.level} /></td>
                    <td className="w-48 p-3"><div className="flex items-center gap-2"><DensityBar pct={i.crowd.densityPct} level={i.crowd.level} /><span className="w-10 text-right text-xs">{i.crowd.densityPct}%</span></div></td>
                    <td className="p-3">{i.crowd.waitMin ? `~${i.crowd.waitMin} min` : "None expected"}</td>
                    <td className="p-3">{i.crowd.best.map((b: any) => fmtTime(b.start)).join(", ")}</td></>}
                </tr>))}</tbody>
            </table>
          </div>)}
      </div>
      <p className="mt-3 text-xs text-ink/60">For today, "expected crowd" is for the current or next time slot. For future dates it is the busiest slot of the day.</p>
    </div>
  );
}
