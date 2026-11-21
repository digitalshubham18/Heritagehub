"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { useApi } from "@/lib/hooks";
import { Button, Empty, ErrorState, PageSkeleton } from "@/components/ui";
import { TicketCard } from "@/components/ticket";
import { TransfersPanel } from "@/components/transfers-panel";
import { cn, todayIST } from "@/lib/utils";

const PAGE = 6;
export default function Tickets() {
  const { data, loading, error, reload } = useApi<any>("/api/bookings");
  const [tab, setTab] = useState<"upcoming" | "past">("upcoming");
  const [shown, setShown] = useState(PAGE);
  const today = todayIST();
  const { upcoming, past } = useMemo(() => {
    const live = (data?.items || []).filter((b: any) => ["confirmed", "completed"].includes(b.status));
    return {
      upcoming: live.filter((b: any) => b.status === "confirmed" && b.date >= today).sort((a: any, b: any) => a.date.localeCompare(b.date) || a.start.localeCompare(b.start)),
      past: live.filter((b: any) => !(b.status === "confirmed" && b.date >= today)).sort((a: any, b: any) => b.date.localeCompare(a.date)),
    };
  }, [data, today]);
  const list = tab === "upcoming" ? upcoming : past;
  return (
    <div className="space-y-6">
      <h1 className="text-3xl">My tickets</h1>
      <TransfersPanel onChanged={reload} />
      <div role="tablist" aria-label="Ticket filter" className="inline-flex rounded-full border border-forest/15 bg-white p-1 shadow-card">
        {([["upcoming", `Upcoming (${upcoming.length})`], ["past", `Past (${past.length})`]] as const).map(([k, l]) => <button key={k} role="tab" aria-selected={tab === k} onClick={() => { setTab(k); setShown(PAGE); }} className={cn("rounded-full px-4 py-1.5 text-sm transition-colors", tab === k ? "bg-forest text-ivory" : "hover:bg-forest-50")}>{l}</button>)}
      </div>
      {error ? <ErrorState message={error} onRetry={reload} /> : loading ? <PageSkeleton /> : !list.length ? <Empty title={tab === "upcoming" ? "No upcoming tickets" : "No past tickets"} action={<Link href="/destinations" className="rounded-lg bg-forest px-4 py-2 text-sm text-ivory">Book a visit</Link>}>Confirmed bookings show a QR ticket here.</Empty>
        : (<><div className="grid gap-6 xl:grid-cols-2">{list.slice(0, shown).map((b: any) => <TicketCard key={b._id} bookingId={b._id} />)}</div>
          {list.length > shown && <div className="text-center"><Button variant="outline" onClick={() => setShown(shown + PAGE)}>Show more ({list.length - shown} left)</Button></div>}</>)}
    </div>
  );
}
