"use client";
import { Info, TriangleAlert } from "lucide-react";
import { useApi } from "@/lib/hooks";
import { cn } from "@/lib/utils";

const STYLE = { info: "border-sky-200 bg-sky-50 text-sky-950", warning: "border-amber-300 bg-amber-50 text-amber-950", critical: "border-red-300 bg-red-50 text-red-950" } as const;
/** Notices published by site managers (closures, delays, events). Pass a destination slug to scope them to one site. */
export function SiteNotices({ slug, className }: { slug?: string; className?: string }) {
  const { data } = useApi<any>(`/api/announcements${slug ? `?destination=${slug}` : ""}`, { poll: 60000 });
  const items: any[] = data?.items || [];
  if (!items.length) return null;
  return <section aria-label="Notices" className={cn("space-y-2", className)}>{items.map((a) => { const I = a.severity === "info" ? Info : TriangleAlert; return <div key={a._id} role={a.severity === "critical" ? "alert" : "note"} className={cn("flex gap-3 rounded-xl border p-3 text-sm", STYLE[a.severity as keyof typeof STYLE])}><I className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /><div><p className="font-medium">{a.title}</p>{a.body && <p>{a.body}</p>}</div></div>; })}</section>;
}
