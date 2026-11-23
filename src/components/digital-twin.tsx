"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { Box, Flame, RotateCcw, Siren, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLive } from "./live";
import type { TwinHandle, TwinType } from "./twin-scene";
import { modelFor } from "@/lib/site-models";

const TYPES: TwinType[] = ["monument", "fort", "museum", "temple", "archaeological", "palace"];
const MAX_FULL = 320, MAX_SMALL = 160;

/**
 * 3D digital twin of a heritage site, placed under the site's photo. It never replaces or alters the photo.
 * - With `liveSlug` (a bookable destination) the crowd layer follows the live occupancy from /api/crowd/live.
 * - Without it (directory-only sites) it is a plain, draggable 3D model with no crowd.
 * Surge and emergency are what-if simulations in the browser; they never write anything to the server.
 */
export function DigitalTwin({ name, seed, type, liveSlug, photoUrl, photoCredit, className }: { name: string; seed: string; type?: string; liveSlug?: string | null; photoUrl?: string | null; photoCredit?: { author?: string; license?: string; licenseUrl?: string; sourceUrl?: string } | null; className?: string }) {
  const kind: TwinType = TYPES.includes(type as TwinType) ? (type as TwinType) : "monument";
  const { items } = useLive(liveSlug || null);
  const s = items[0];

  // What the crowd layer should show: a live reading, a forecast (gates quiet) or nothing (closed / no data).
  const reading = useMemo(() => {
    if (!s || !s.open) return { mode: "none" as const, pct: 0, visitors: 0 };
    if (s.quiet && s.forecastLevel) return s.forecastPct != null ? { mode: "forecast" as const, pct: s.forecastPct, visitors: 0 } : { mode: "none" as const, pct: 0, visitors: 0 };
    return { mode: "live" as const, pct: s.pct, visitors: s.occupancy ?? 0 };
  }, [s]);

  const host = useRef<HTMLDivElement>(null);
  const twin = useRef<TwinHandle | null>(null);
  const [ready, setReady] = useState(false);
  const [unsupported, setUnsupported] = useState(false);
  const [surge, setSurge] = useState(false);
  const [emergency, setEmergency] = useState(false);
  const [speed, setSpeed] = useState("1");
  const [rotate, setRotate] = useState(false);
  const [zones, setZones] = useState<{ id: string; text: string }[]>([]);
  const reduced = useRef(false);
  const [photoOk, setPhotoOk] = useState(false);
  const [showPhoto, setShowPhoto] = useState(true);
  const model = useMemo(() => modelFor(seed), [seed]);
  const [mstate, setMstate] = useState<"none" | "loading" | "loaded" | "failed">(model ? "loading" : "none");

  const hasCrowd = reading.mode !== "none";
  const small = typeof window !== "undefined" && window.innerWidth < 640;
  const MAX = small ? MAX_SMALL : MAX_FULL;
  const base = hasCrowd ? Math.round((MAX * Math.min(100, reading.pct)) / 100) : 0;
  const avatars = Math.min(MAX, surge ? Math.round(base * 1.45) : base) || (hasCrowd && reading.pct > 0 ? 1 : 0);
  const effPct = Math.min(100, surge ? Math.round(reading.pct * 1.45) : reading.pct);

  useEffect(() => {
    reduced.current = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced.current) setSpeed("0");
  }, []);

  // Build the scene once per site; three.js is loaded on demand.
  useEffect(() => {
    const el = host.current; if (!el) return;
    let dead = false, handle: TwinHandle | null = null;
    const onZones = (e: Event) => setZones((e as CustomEvent).detail);
    el.addEventListener("twin-zones", onZones);
    import("./twin-scene").then(({ createTwin }) => createTwin(el, { seed, type: kind, photoUrl: photoUrl || null, onPhoto: (ok) => { if (!dead) setPhotoOk(ok); }, reducedMotion: reduced.current, small: window.innerWidth < 640, model, onModel: (st) => { if (!dead) setMstate(st); }, onSupport: (ok) => { if (!dead && !ok) setUnsupported(true); } }))
      .then((h) => { if (dead) { h.dispose(); return; } handle = h; twin.current = h; if (h.supported) setReady(true); })
      .catch(() => { if (!dead) setUnsupported(true); });
    return () => { dead = true; el.removeEventListener("twin-zones", onZones); handle?.dispose(); twin.current = null; setReady(false); };
  }, [seed, kind, model, photoUrl]);

  useEffect(() => { if (ready) twin.current?.setCrowd({ avatars, pct: effPct, speed: Number(speed), emergency }); }, [ready, avatars, effPct, speed, emergency]);
  useEffect(() => { if (ready) twin.current?.setAutoRotate(rotate); }, [ready, rotate]);
  useEffect(() => { if (ready) twin.current?.setPhoto(showPhoto); }, [ready, showPhoto, photoOk]);
  useEffect(() => { if (!hasCrowd) { setSurge(false); setEmergency(false); } }, [hasCrowd]);

  const badge = reading.mode === "live" ? (reading.visitors ? `${reading.visitors.toLocaleString("en-IN")} visitors` : `${reading.pct}% full`) : reading.mode === "forecast" ? `Forecast · ${reading.pct}% full` : "Drag to rotate";
  const title = hasCrowd ? `${name} — live crowd layer` : `${name} — 3D model`;

  return (
    <section aria-label={`3D digital twin of ${name}`} className={cn("overflow-hidden rounded-3xl bg-forest text-ivory shadow-lift", className)}>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 px-5 py-4">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-ivory/70">Digital twin · {mstate === "loaded" ? "photo-based 3D model" : "procedural model"}</p>
          <h2 className="mt-0.5 truncate font-display text-xl text-ivory sm:text-2xl">{title}</h2>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-2.5 py-1 font-medium">{hasCrowd ? <Users className="h-3.5 w-3.5 text-emerald-300" aria-hidden /> : <Box className="h-3.5 w-3.5" aria-hidden />}{badge}</span>
          {hasCrowd && <span className="hidden rounded-full bg-white/10 px-2.5 py-1 text-ivory/80 sm:inline">Instanced avatars</span>}
        </div>
      </div>

      <div className="relative h-[22rem] w-full bg-[#12372a] sm:h-[28rem]">
        <div ref={host} className="absolute inset-0" />
        {(!ready || mstate === "loading") && !unsupported && <div className="absolute inset-0 flex animate-pulse items-center justify-center text-sm text-ivory/70" aria-live="polite">{mstate === "loading" ? "Loading photo-based 3D model…" : "Loading 3D model…"}</div>}
        {unsupported && <div role="alert" className="absolute inset-0 flex items-center justify-center p-6 text-center text-sm text-ivory/85">3D view is not available in this browser (WebGL is off or unsupported). The photo and crowd details on this page still work.</div>}
        {ready && hasCrowd && (
          <div className="pointer-events-none absolute left-3 top-3 hidden rounded-xl border border-white/15 bg-forest-900/80 p-3 text-xs backdrop-blur sm:block">
            <p className="font-semibold">Zone load</p>
            <ul className="mt-1.5 space-y-1">
              <li className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-green-500" aria-hidden />Safe &lt; 50%</li>
              <li className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-amber-500" aria-hidden />Moderate 50–80%</li>
              <li className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-red-500" aria-hidden />Critical &gt; 80%</li>
            </ul>
          </div>
        )}
        {emergency && <p role="status" className="absolute inset-x-0 top-3 mx-auto w-fit rounded-full bg-red-600 px-3 py-1 text-xs font-semibold text-white shadow">Emergency simulation: visitors are heading to the exits</p>}
        <p className="sr-only" aria-live="polite">{zones.map((z) => z.text).join(". ")}</p>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-white/10 bg-forest-900/60 px-4 py-3 text-sm">
        <div className="flex flex-wrap items-center gap-2">
          {hasCrowd && <>
            <button type="button" aria-pressed={surge} onClick={() => setSurge((v) => !v)} className={cn("inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-terracotta", surge ? "border-amber-400 bg-amber-500/20 text-amber-100" : "border-white/25 hover:bg-white/10")}><Flame className="h-4 w-4" aria-hidden />Festival surge</button>
            <button type="button" aria-pressed={emergency} onClick={() => setEmergency((v) => !v)} className={cn("inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-terracotta", emergency ? "border-red-400 bg-red-500/25 text-red-100" : "border-white/25 hover:bg-white/10")}><Siren className="h-4 w-4" aria-hidden />Emergency mode</button>
          </>}
          <button type="button" aria-pressed={rotate} onClick={() => setRotate((v) => !v)} className={cn("rounded-lg border px-3 py-1.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-terracotta", rotate ? "border-ivory/60 bg-white/15" : "border-white/25 hover:bg-white/10")}>Auto-rotate</button>
          {photoOk && <button type="button" aria-pressed={showPhoto} onClick={() => setShowPhoto((v) => !v)} className={cn("rounded-lg border px-3 py-1.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-terracotta", showPhoto ? "border-ivory/60 bg-white/15" : "border-white/25 hover:bg-white/10")}>Real photo</button>}
          <button type="button" onClick={() => twin.current?.resetView()} className="inline-flex items-center gap-1.5 rounded-lg border border-white/25 px-3 py-1.5 transition-colors hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-terracotta"><RotateCcw className="h-4 w-4" aria-hidden />Reset view</button>
        </div>
        {hasCrowd && (
          <label className="flex items-center gap-2 text-ivory/85">Sim speed
            <select value={speed} onChange={(e) => setSpeed(e.target.value)} className="rounded-lg border border-white/25 bg-forest-700 px-2 py-1.5 text-ivory focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-terracotta">
              <option value="0">Paused</option><option value="0.5">0.5×</option><option value="1">1×</option><option value="2">2×</option><option value="4">4×</option>
            </select>
          </label>
        )}
      </div>
      <p className="bg-forest-900/60 px-5 pb-3 text-[11px] leading-snug text-ivory/65">
        {mstate === "loaded" && model ? <>Photogrammetry model: {model.credit} · {model.sourceUrl ? <a className="underline" href={model.sourceUrl} target="_blank" rel="noopener noreferrer">{model.licence}</a> : model.licence}.</> : "An illustrative model built from simple shapes, not a survey of the real structure."}{photoOk && photoCredit && <> Photo wall: {photoCredit.author || "unknown author"}{photoCredit.license && <> · {photoCredit.licenseUrl ? <a className="underline" href={photoCredit.licenseUrl} target="_blank" rel="noopener noreferrer">{photoCredit.license}</a> : photoCredit.license}</>}{photoCredit.sourceUrl && <> · <a className="underline" href={photoCredit.sourceUrl} target="_blank" rel="noopener noreferrer">Wikimedia Commons</a></>}.</>} Drag to rotate, scroll or pinch to zoom, or use the arrow keys when the model is focused.
        {hasCrowd && <> Avatar numbers follow {reading.mode === "live" ? "the live occupancy" : "today’s forecast"}; the split between zones is simulated. Festival surge and Emergency mode are what-if views and change no real data.</>}
      </p>
    </section>
  );
}
