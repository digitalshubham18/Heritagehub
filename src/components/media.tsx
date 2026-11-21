"use client";
import { useEffect, useRef, useState } from "react";
import { HeritageArt } from "./art";
import { cn } from "@/lib/utils";

type Art = { slug: string; type?: string; variant?: number };
/**
 * Illustrated scene underneath, real photo fading in on top once (and if) it loads. Looks designed either way.
 * The wrapper takes the sizing classes.
 */
export function SafeImg({ src, alt, className, art }: { src?: string; alt: string; className?: string; art?: Art }) {
  const [state, setState] = useState<"idle" | "ok" | "bad">("idle");
  const ref = useRef<HTMLImageElement>(null);
  useEffect(() => { if (ref.current?.complete && ref.current.naturalWidth > 0) setState("ok"); }, [src]);
  return (
    <div className={cn("relative overflow-hidden bg-forest", className)}>
      {art ? <HeritageArt {...art} className="absolute inset-0 h-full w-full" /> : <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-forest to-forest-700 p-4 text-center font-display text-xl text-ivory/90">{alt}</div>}
      {src && state !== "bad" && (
        // eslint-disable-next-line @next/next/no-img-element
        <img ref={ref} src={src} alt={alt} loading="lazy" onLoad={() => setState("ok")} onError={() => setState("bad")} className={cn("absolute inset-0 h-full w-full object-cover transition-opacity duration-700", state === "ok" ? "opacity-100" : "opacity-0")} />
      )}
    </div>
  );
}
