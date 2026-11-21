"use client";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Star } from "lucide-react";
import { api, useApi } from "@/lib/hooks";
import { Button, Card, Empty, ErrorState, PageSkeleton, Textarea } from "@/components/ui";
import { cn, fmtDate, todayIST } from "@/lib/utils";

function Stars({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  return <div role="radiogroup" aria-label="Rating" className="flex gap-1">{[1, 2, 3, 4, 5].map((n) => <button key={n} type="button" role="radio" aria-checked={value === n} aria-label={`${n} star${n > 1 ? "s" : ""}`} onClick={() => onChange(n)} className="rounded p-0.5 focus-visible:ring-2 focus-visible:ring-terracotta"><Star className={cn("h-7 w-7", n <= value ? "fill-amber-400 text-amber-500" : "text-ink/30")} /></button>)}</div>;
}
function Item({ v, mine, onSaved }: { v: any; mine?: any; onSaved: () => void }) {
  const [rating, setRating] = useState(mine?.rating || 0), [comment, setComment] = useState(mine?.comment || ""), [busy, setBusy] = useState(false);
  async function save() { setBusy(true); try { await api("/api/reviews", { body: { destinationId: v.id, rating, comment: comment || undefined } }); toast.success(mine ? "Review updated" : "Thanks for your review"); onSaved(); } catch (e: any) { toast.error(e.message); } finally { setBusy(false); } }
  return <Card className="space-y-3 p-5"><div><p className="font-medium">{v.name}</p><p className="text-sm text-ink/70">Visited {fmtDate(v.date)}</p></div><Stars value={rating} onChange={setRating} /><div><label htmlFor={`rv-${v.id}`} className="sr-only">Your comments about {v.name}</label><Textarea id={`rv-${v.id}`} value={comment} onChange={(e) => setComment(e.target.value)} maxLength={1000} placeholder="What should other visitors know? Queues, facilities, best time…" /></div><Button size="sm" loading={busy} disabled={!rating} onClick={save}>{mine ? "Update review" : "Post review"}</Button></Card>;
}
/** Visitors can review sites they have actually visited (a completed booking, or a past confirmed booking that was checked in). */
export default function Reviews() {
  const b = useApi<any>("/api/bookings"), r = useApi<any>("/api/reviews?mine=1");
  const visited = useMemo(() => { const today = todayIST(), m = new Map<string, any>(); for (const x of b.data?.items || []) if (x.status === "completed" || (x.status === "confirmed" && x.date < today && x.checkedInCount > 0)) { const k = String(x.destination); if (!m.has(k) || m.get(k).date < x.date) m.set(k, { id: k, name: x.destinationInfo?.name, date: x.date }); } return [...m.values()].sort((a, c) => c.date.localeCompare(a.date)); }, [b.data]);
  if (b.loading || r.loading) return <PageSkeleton />;
  if (b.error) return <ErrorState message={b.error} onRetry={b.reload} />;
  const mineBy = new Map<string, any>((r.data?.items || []).map((x: any) => [x.destination, x]));
  return (
    <div className="space-y-6"><div><h1 className="text-3xl">My reviews</h1><p className="mt-1 text-ink/75">Help other visitors plan. You can review sites you have visited.</p></div>
      {visited.length === 0 ? <Empty title="No visits to review yet">After you check in at a site, you can rate it here.</Empty> : <div className="grid gap-4 md:grid-cols-2">{visited.map((v) => <Item key={v.id + (mineBy.get(v.id)?.rating || 0)} v={v} mine={mineBy.get(v.id)} onSaved={r.reload} />)}</div>}
    </div>
  );
}
