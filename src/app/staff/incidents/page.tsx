"use client";
import { useApi } from "@/lib/hooks";
import { Badge, Card, Empty, ErrorState, PageSkeleton, StatusBadge } from "@/components/ui";
import { useTx } from "@/lib/i18n";
import { cn } from "@/lib/utils";

const CAT: Record<string, string> = { medical: "Medical", lost_child: "Lost child or person", security: "Security", crowd: "Crowd", maintenance: "Maintenance", other: "Other" };
const when = (d: string) => new Date(d).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

export default function StaffIncidents() {
  const tx = useTx();
  const { data, loading, error, reload } = useApi<any>("/api/incidents?status=active", { poll: 20000 });
  const done = useApi<any>("/api/incidents?status=resolved");
  const row = (i: any) => <Card key={i._id} className={cn("p-4", i.severity === "critical" && i.status !== "resolved" && "border-red-300")}><div className="flex flex-wrap items-center justify-between gap-2"><span className="flex items-center gap-2"><Badge className={i.severity === "critical" ? "bg-red-100 text-red-900" : "bg-amber-100 text-amber-900"}>{CAT[i.category]}</Badge><span className="text-sm text-ink/70">{i.destination?.name}</span></span><StatusBadge s={i.status} /></div>
    <p className="mt-2 text-sm">{i.message}</p><p className="mt-1 text-xs text-ink/60">Reported by {i.reporterName} · {when(i.createdAt)}</p>{i.resolutionNote && <p className="mt-2 rounded bg-emerald-50 p-2 text-sm text-emerald-900">Resolved: {i.resolutionNote}</p>}</Card>;
  return (
    <div className="space-y-6"><div><h1 className="text-3xl">{tx("Incidents")}</h1><p className="mt-1 text-sm text-ink/70">{tx("Reports raised at your sites and what managers have done about them. Raise a new one from the Today page.")}</p></div>
      {error ? <ErrorState message={error} onRetry={reload} /> : loading ? <PageSkeleton /> : data.items.length === 0 ? <Empty title={tx("No open incidents")}>{tx("Everything reported at your sites has been resolved.")}</Empty> : <div className="grid gap-3 md:grid-cols-2">{data.items.map(row)}</div>}
      {(done.data?.items || []).length > 0 && <section><h2 className="mb-2 text-lg">{tx("Recently resolved")}</h2><div className="grid gap-3 md:grid-cols-2">{done.data.items.slice(0, 10).map(row)}</div></section>}
    </div>
  );
}
