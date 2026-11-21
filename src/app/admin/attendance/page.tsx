"use client";
import { useState } from "react";
import { TriangleAlert } from "lucide-react";
import { useApi } from "@/lib/hooks";
import { Badge, Card, Empty, ErrorState, Field, Input, PageSkeleton, Select } from "@/components/ui";
import { addDays, todayIST } from "@/lib/utils";

const tm = (d?: string) => (d ? new Date(d).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "");
export default function Attendance() {
  const [to, setTo] = useState(todayIST()), [from, setFrom] = useState(addDays(todayIST(), -6));
  const a = useApi<any>(`/api/admin/attendance?from=${from}&to=${to}`);
  if (a.loading) return <PageSkeleton />;
  if (a.error || !a.data) return <ErrorState message={a.error || "Could not load"} onRetry={a.reload} />;
  const d = a.data, rows: any[] = d.rows;
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3"><div><h1 className="text-3xl">Attendance</h1><p className="mt-1 max-w-2xl text-sm text-ink/70">Rostered hours against the hours staff clocked. Staff who sold at the counter outside their rostered shift are flagged, but only for people who have a roster.</p></div>
        <div className="flex flex-wrap items-end gap-3"><Field label="From"><Input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} /></Field><Field label="To"><Input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} /></Field><a className="pb-2 text-sm text-terracotta underline" href={`/api/admin/attendance?from=${from}&to=${to}&format=csv`}>Export CSV</a></div></div>
      {rows.length === 0 ? <Empty title="Nothing in this range">No shifts were rostered and nobody clocked in between these dates.</Empty> : (
        <Card className="overflow-x-auto"><table className="w-full min-w-[900px] text-sm"><caption className="sr-only">Attendance by staff member</caption><thead className="bg-forest-50 text-left"><tr>{["Staff", "Shifts", "Rostered", "Worked", "No-shows", "Late", "Unrostered", "Counter sales", "Outside shift"].map((h) => <th key={h} className="p-3 font-medium">{h}</th>)}</tr></thead>
          <tbody>{rows.map((x) => { const diff = Math.round((x.workedHours - x.rosteredHours) * 10) / 10; return (
            <tr key={x.userId} className="border-t border-forest/10"><td className="p-3 font-medium">{x.name}</td><td className="p-3">{x.shifts}</td><td className="p-3">{x.rosteredHours} h</td><td className="p-3">{x.workedHours} h <span className={diff < -1 ? "text-red-800" : "text-ink/50"}>({diff > 0 ? "+" : ""}{diff})</span></td>
              <td className="p-3">{x.noShows > 0 ? <Badge className="bg-red-100 text-red-900">{x.noShows}</Badge> : 0}</td><td className="p-3">{x.lateCount > 0 ? <span className="text-amber-900">{x.lateCount} ({x.lateMinutes} min)</span> : 0}</td><td className="p-3">{x.unrostered}{x.autoClosed > 0 && <span className="block text-xs text-ink/55">{x.autoClosed} not clocked out</span>}</td>
              <td className="p-3">{x.counterSales}</td><td className="p-3">{x.outsideShiftSales > 0 ? <span className="flex items-center gap-1 font-medium text-red-800"><TriangleAlert className="h-4 w-4" aria-hidden />{x.outsideShiftSales}</span> : 0}</td></tr>); })}</tbody></table></Card>)}
      <Card className="p-5"><h2 className="text-lg">Recent clock-ins</h2>{d.recent.length === 0 ? <p className="mt-2 text-sm text-ink/60">None in this range.</p> : <ul className="mt-2 divide-y divide-forest/10 text-sm">{d.recent.map((x: any) => <li key={x._id} className="flex flex-wrap items-center justify-between gap-2 py-2"><span>{x.userName}{x.unrostered && <Badge className="ml-2 bg-amber-100 text-amber-900">not rostered</Badge>}{x.lateMin > 0 && <Badge className="ml-2 bg-amber-100 text-amber-900">{x.lateMin} min late</Badge>}{x.autoClosed && <Badge className="ml-2 bg-stone-100">closed automatically</Badge>}</span><span className="text-ink/70">{tm(x.inAt)} to {x.outAt ? tm(x.outAt) : "still in"}</span></li>)}</ul>}</Card>
    </div>
  );
}
