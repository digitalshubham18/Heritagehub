"use client";
import Link from "next/link";
import { useApi } from "@/lib/hooks";
import { HeritageArt } from "@/components/art";
import { Empty, ErrorState, PageSkeleton, Skeleton, StatusBadge } from "@/components/ui";
import { fmtDate, inr, todayIST } from "@/lib/utils";

function PassCard({ p }: { p: any }) {
  const { data } = useApi<any>(`/api/passes/${p._id}`);
  const today = todayIST();
  const state = today < p.validFrom ? "upcoming" : today > p.validTo ? "expired" : "active";
  return (
    <article aria-label={`Season pass ${p.reference}`} className="overflow-hidden rounded-3xl border border-forest/10 bg-white shadow-lift">
      <div className="relative h-28 overflow-hidden bg-forest"><HeritageArt slug={p.destinationNames[0]?.toLowerCase().replace(/\W+/g, "-") || "pass"} type="monument" variant={2} className="absolute inset-0 h-full w-full" /><div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" /><div className="absolute inset-x-0 bottom-0 flex items-end justify-between p-5 text-white"><div><p className="font-display text-xl leading-tight">Season pass</p><p className="text-sm text-white/80">{p.holderName}</p></div><StatusBadge s={state === "active" ? "confirmed" : state === "upcoming" ? "pending" : "expired"} /></div></div>
      <div className="sm:flex"><dl className="flex-1 space-y-3 p-5 text-sm">
        <div><dt className="text-ink/60">Valid</dt><dd className="font-display text-lg leading-tight">{fmtDate(p.validFrom)} to {fmtDate(p.validTo)}</dd></div>
        <div><dt className="text-ink/60">Covers</dt><dd>{p.destinationNames.join(", ")}</dd></div>
        <div><dt className="text-ink/60">Reference</dt><dd className="font-mono text-lg font-semibold tracking-widest text-forest">{p.reference}</dd></div>
        <div className="flex justify-between border-t border-dashed border-forest/20 pt-3"><dt className="text-ink/60">{p.maxEntriesPerDay} entr{p.maxEntriesPerDay > 1 ? "ies" : "y"}/site/day · {p.totalEntries || 0} used</dt><dd className="font-display text-xl">{inr(p.totalMinor)}</dd></div>
        {p.invoiceNo && <Link href={`/dashboard/passes`} className="hidden" aria-hidden />}</dl>
        <div className="relative flex flex-col items-center justify-center gap-2 border-t border-dashed border-forest/25 bg-ivory-100/60 p-5 before:absolute before:-left-3 before:-top-3 before:h-6 before:w-6 before:rounded-full before:bg-ivory after:absolute after:-right-3 after:-top-3 after:h-6 after:w-6 after:rounded-full after:bg-ivory sm:w-64 sm:border-l sm:border-t-0 sm:after:-bottom-3 sm:after:-left-3 sm:after:right-auto sm:after:top-auto">
          {data?.qr ? (<>{/* eslint-disable-next-line @next/next/no-img-element */}<img src={data.qr} alt={`QR code for pass ${p.reference}`} className="h-44 w-44 rounded-xl border border-forest/15 bg-white p-1.5" /><p className="text-center text-xs text-ink/65">Show at any covered site. {p.insideDestination ? "You are currently inside." : ""}</p></>) : <Skeleton className="h-44 w-44" />}
        </div></div>
    </article>
  );
}
export default function MyPasses() {
  const { data, loading, error, reload } = useApi<any>("/api/passes?mine=1");
  return (
    <div className="space-y-6"><div className="flex flex-wrap items-center justify-between gap-3"><h1 className="text-3xl">My passes</h1><Link href="/passes" className="rounded-lg border border-forest/30 px-3 py-2 text-sm text-forest hover:bg-forest-50">Browse passes</Link></div>
      {error ? <ErrorState message={error} onRetry={reload} /> : loading ? <PageSkeleton /> : !data.items.length ? <Empty title="No passes yet" action={<Link href="/passes" className="rounded-lg bg-forest px-4 py-2 text-sm text-ivory">See season passes</Link>}>A season pass gives you a QR for repeat visits within its dates.</Empty>
        : <div className="grid gap-6 xl:grid-cols-2">{data.items.map((p: any) => <PassCard key={p._id} p={p} />)}</div>}
    </div>
  );
}
