"use client";
import { useState } from "react";
import { useApi } from "@/lib/hooks";
import { Card, Empty, ErrorState, PageSkeleton, Select } from "@/components/ui";
import { cn, inr } from "@/lib/utils";

export default function StaffActivity() {
  const [range, setRange] = useState("1");
  const { data, loading, error, reload } = useApi<any>(`/api/admin/staff-activity?range=${range}`, { poll: 60000 });
  return (
    <div className="space-y-6"><div className="flex flex-wrap items-center justify-between gap-3"><div><h1 className="text-3xl">Staff activity</h1><p className="mt-1 text-sm text-ink/70">Counter sales, gate scans, parking handled and cash-count differences for each staff member.</p></div>
      <Select aria-label="Period" className="w-44" value={range} onChange={(e) => setRange(e.target.value)}><option value="1">Today</option><option value="7">Last 7 days</option><option value="30">Last 30 days</option></Select></div>
      <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm"><span className="text-ink/60">Export CSV:</span><a className="text-terracotta underline" href={`/api/admin/staff-activity?range=${range}&format=csv`}>Staff activity</a><a className="text-terracotta underline" href="/api/admin/export?report=shifts&range=30">Cash counts (30 days)</a><a className="text-terracotta underline" href="/api/admin/export?report=handovers&range=30">Shift handovers (30 days)</a></p>
      {error ? <ErrorState message={error} onRetry={reload} /> : loading ? <PageSkeleton /> : data.items.length === 0 ? <Empty title="No staff accounts yet">Add staff under Users.</Empty> : (
        <Card className="overflow-x-auto"><table className="w-full min-w-[860px] text-sm"><caption className="sr-only">Staff activity</caption><thead className="bg-forest-50 text-left"><tr>{["Staff", "Counter sales", "Counter takings", "Scanned in / out", "Parking in / out", "Parking collected", "Cash counts", "Difference"].map((h) => <th key={h} className="p-3 font-medium">{h}</th>)}</tr></thead>
          <tbody>{data.items.map((s: any) => <tr key={s.id} className="border-t border-forest/10"><td className="p-3"><p className="font-medium">{s.name}</p><p className="text-xs text-ink/60">{s.email}{!s.active && " · disabled"}</p></td><td className="p-3">{s.counterSales}</td><td className="p-3">{inr(s.counterMinor)}</td><td className="p-3">{s.checkedIn} / {s.checkedOut}</td><td className="p-3">{s.parkingAdmitted} / {s.parkingExited}</td><td className="p-3">{inr(s.parkingCollectedMinor)}</td><td className="p-3">{s.shifts}{s.shortCounts > 0 && <span className="block text-xs text-red-800">{s.shortCounts} short</span>}</td><td className={cn("p-3 font-medium", s.varianceMinor < 0 ? "text-red-800" : s.varianceMinor > 0 ? "text-amber-800" : "text-ink/60")}>{s.shifts ? (s.varianceMinor === 0 ? "Matches" : inr(s.varianceMinor)) : "-"}</td></tr>)}</tbody></table></Card>)}
      {data?.recentShifts?.length > 0 && <Card className="overflow-hidden"><h2 className="border-b border-forest/10 p-4 text-lg">Recent cash counts</h2><ul className="divide-y divide-forest/10 text-sm">{data.recentShifts.map((x: any) => <li key={x._id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2"><span>{x.userName} · {new Date(x.createdAt).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</span><span>Expected {inr(x.expectedCashMinor)} · counted {inr(x.countedCashMinor)} · <strong className={x.varianceMinor < 0 ? "text-red-800" : ""}>{x.varianceMinor === 0 ? "matches" : inr(x.varianceMinor)}</strong>{x.notes ? ` · “${x.notes}”` : ""}</span></li>)}</ul></Card>}
    </div>
  );
}
