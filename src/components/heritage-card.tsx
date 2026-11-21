"use client";
import Link from "next/link";
import { Landmark, MapPin, Ticket } from "lucide-react";
import { SafeImg } from "./media";
import { sizeThumb } from "@/lib/heritage-search";

export const CATEGORY_LABEL: Record<string, string> = { unesco: "UNESCO World Heritage", asi: "ASI protected monument" };

/** Card for a directory entry. A real photo fades in over the illustration; no photo means the illustration stays (never a wrong picture). */
export function HeritageCard({ s }: { s: any }) {
  const cat = s.categories?.includes("unesco") ? "unesco" : "asi";
  return (
    <Link href={`/heritage/${s.slug}`} className="group card-lift flex flex-col overflow-hidden rounded-2xl border border-forest/10 bg-white shadow-card hover:shadow-lift focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-terracotta">
      <div className="relative">
        <SafeImg src={sizeThumb(s.image?.url, 640)} alt={s.image ? `${s.name}` : `${s.name} (no photo yet)`} art={{ slug: s.slug, type: s.type }} className="h-44 w-full transition-transform duration-500 group-hover:scale-[1.03]" />
        <span className="pointer-events-none absolute left-3 top-3 flex items-center gap-1 rounded-full bg-white/90 px-2.5 py-1 text-xs font-medium text-forest shadow-sm backdrop-blur"><Landmark className="h-3 w-3" aria-hidden />{CATEGORY_LABEL[cat]}{cat === "unesco" && s.unescoYear ? ` · ${s.unescoYear}` : ""}</span>
        {s.bookableSlug && <span className="pointer-events-none absolute right-3 top-3 flex items-center gap-1 rounded-full bg-terracotta px-2.5 py-1 text-xs font-semibold text-white shadow-sm"><Ticket className="h-3 w-3" aria-hidden />Book tickets</span>}
      </div>
      <div className="flex flex-1 flex-col p-4">
        <h3 className="font-display text-lg leading-tight transition-colors group-hover:text-terracotta">{s.name}</h3>
        <p className="mt-1 flex items-center gap-1 text-sm text-ink/70"><MapPin className="h-3.5 w-3.5" aria-hidden />{[s.city, s.state].filter(Boolean).join(", ") || "India"}</p>
        {s.summary && <p className="mt-2 line-clamp-2 text-sm text-ink/80">{s.summary}</p>}
        {s.image?.author && <p className="mt-auto truncate pt-3 text-[11px] text-ink/50">Photo: {s.image.author}{s.image.license ? ` · ${s.image.license}` : ""}</p>}
      </div>
    </Link>
  );
}
