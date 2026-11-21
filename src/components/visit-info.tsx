"use client";
import { useState } from "react";
import { CloudRain, Compass, LocateFixed, Navigation, Sun, Thermometer } from "lucide-react";
import { useApi } from "@/lib/hooks";
import { useI18n } from "@/lib/i18n";
import { Button } from "@/components/ui";
import { appleDirections, googleDirections, haversineKm, osmDirections, roughDrive } from "@/lib/geo";
import { fmtDate } from "@/lib/utils";

type Pt = { lat: number; lng: number };
/** Directions links, distance from where the visitor is (only if they allow location), and the weather: a 7-day outlook, or the visit day when `date` is given. */
export function VisitInfo({ slug, name, to, date, compact }: { slug: string; name: string; to: Pt; date?: string; compact?: boolean }) {
  const { t: tr } = useI18n();
  const w = useApi<any>(`/api/weather?slug=${encodeURIComponent(slug)}${date ? `&date=${date}` : ""}`);
  const [from, setFrom] = useState<Pt | null>(null), [geoErr, setGeoErr] = useState("");
  const km = from ? haversineKm(from, to) : null, drive = km != null ? roughDrive(km) : null;
  function locate() {
    setGeoErr("");
    if (!navigator.geolocation) return setGeoErr(tr("vi.nogeo"));
    navigator.geolocation.getCurrentPosition((p) => setFrom({ lat: p.coords.latitude, lng: p.coords.longitude }), () => setGeoErr(tr("vi.blocked")), { timeout: 8000, maximumAge: 300000 });
  }
  const d = w.data;
  return (
    <div className={compact ? "space-y-2 text-sm" : "grid gap-4 sm:grid-cols-2"}>
      <div className="space-y-2 rounded-xl border border-forest/15 bg-white p-4">
        <h3 className="flex items-center gap-2 text-base"><Navigation className="h-4 w-4 text-terracotta" aria-hidden />{tr("vi.directions", { name })}</h3>
        <div className="flex flex-wrap gap-2"><a className="inline-flex h-9 items-center rounded-lg bg-forest px-3 text-sm text-ivory hover:bg-forest-700" target="_blank" rel="noreferrer" href={googleDirections(to, "driving", from || undefined)}>{tr("vi.gmaps")}</a><a className="inline-flex h-9 items-center rounded-lg border border-forest/30 px-3 text-sm" target="_blank" rel="noreferrer" href={googleDirections(to, "transit", from || undefined)}>{tr("vi.transit")}</a><a className="inline-flex h-9 items-center rounded-lg border border-forest/30 px-3 text-sm" target="_blank" rel="noreferrer" href={osmDirections(to, from || undefined)}>{tr("vi.osm")}</a><a className="inline-flex h-9 items-center rounded-lg border border-forest/30 px-3 text-sm" target="_blank" rel="noreferrer" href={appleDirections(to)}>{tr("vi.apple")}</a></div>
        {km == null ? <Button size="sm" variant="ghost" onClick={locate}><LocateFixed className="h-4 w-4" aria-hidden />{tr("vi.how")}</Button> : <p className="text-sm" role="status"><Compass className="mr-1 inline h-4 w-4 text-forest" aria-hidden />{tr("vi.dist", { km: Math.round(km), road: drive!.roadKm, time: drive!.minutes >= 60 ? tr("vi.hm", { h: Math.floor(drive!.minutes / 60), m: drive!.minutes % 60 }) : tr("vi.m", { m: drive!.minutes }) })}</p>}
        {geoErr && <p role="alert" className="text-xs text-amber-900">{geoErr}</p>}
        <p className="text-xs text-ink/55">{tr("vi.priv")}</p>
      </div>
      <div className="space-y-2 rounded-xl border border-forest/15 bg-white p-4">
        <h3 className="flex items-center gap-2 text-base"><Sun className="h-4 w-4 text-terracotta" aria-hidden />{date ? tr("vi.weatheron", { date: fmtDate(date) }) : tr("vi.weather")}</h3>
        {w.loading ? <p className="text-sm text-ink/60">{tr("vi.checking")}</p> : !d?.available ? <p className="text-sm text-ink/60">The forecast isn&apos;t available right now.</p> : date ? (
          d.day ? <div className="space-y-1"><p className="text-lg"><Thermometer className="mr-1 inline h-5 w-5 text-terracotta" aria-hidden />{d.day.tempMinC}° to {d.day.tempMaxC}°C · {d.day.summary}</p><p className="text-sm text-ink/70"><CloudRain className="mr-1 inline h-4 w-4" aria-hidden />{tr("vi.rain", { pct: d.day.rainChancePct, uv: d.day.uvMax })}</p>{d.day.advice.map((a: string) => <p key={a} className="rounded-lg bg-amber-50 p-2 text-sm text-amber-950">{a}</p>)}</div>
          : <p className="text-sm text-ink/60">{tr("vi.nodata")}</p>
        ) : (<>
          {d.current && <p className="text-sm">{tr("vi.now", { temp: d.current.tempC })}{d.current.summary ? `, ${d.current.summary.toLowerCase()}` : ""}</p>}
          <ul className="divide-y divide-forest/10 text-sm">{d.days.map((x: any) => <li key={x.date} className="flex items-center justify-between gap-2 py-1.5"><span>{fmtDate(x.date)}</span><span className="text-ink/70">{x.summary}</span><span className="whitespace-nowrap">{x.tempMinC}° {tr("vi.to")} {x.tempMaxC}° · {tr("vi.rainshort", { pct: x.rainChancePct })}</span></li>)}</ul>
          {d.days[0]?.advice?.length > 0 && <p className="rounded-lg bg-amber-50 p-2 text-sm text-amber-950">{d.days[0].advice[0]}</p>}
        </>)}
        <p className="text-xs text-ink/55">{tr("vi.credit")}</p>
      </div>
    </div>
  );
}
