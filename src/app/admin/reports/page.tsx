"use client";
import { useState } from "react";
import { Download } from "lucide-react";
import { Bar, BarChart, CartesianGrid, ComposedChart, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useApi } from "@/lib/hooks";
import { Card, ErrorState, Field, PageSkeleton, Select } from "@/components/ui";
import { fmtTime, inr } from "@/lib/utils";

const Chart = ({ title, label, children, note }: { title: string; label: string; children: React.ReactElement; note?: string }) => (
  <Card className="p-5"><h2 className="text-lg">{title}</h2><div className="mt-3 h-56" role="img" aria-label={label}><ResponsiveContainer>{children}</ResponsiveContainer></div>{note && <p className="mt-2 text-xs text-ink/60">{note}</p>}</Card>
);
const grid = <CartesianGrid strokeDasharray="3 3" stroke="#1F4D3A22" vertical={false} />;

export default function Reports() {
  const [range, setRange] = useState("30"); const [dest, setDest] = useState("");
  const dests = useApi<any>("/api/destinations?all=1");
  const q = `range=${range}${dest ? `&destination=${dest}` : ""}`;
  const { data, loading, error, reload } = useApi<any>(`/api/admin/reports?${q}`);
  const a = data?.analytics;
  return (
    <div className="space-y-6">
      <h1 className="text-3xl">Analytics and reports</h1>
      <Card className="flex flex-wrap items-end gap-3 p-4">
        <Field label="Period"><Select value={range} onChange={(e) => setRange(e.target.value)}><option value="7">Last 7 days</option><option value="30">Last 30 days</option><option value="90">Last 90 days</option></Select></Field>
        <Field label="Destination"><Select value={dest} onChange={(e) => setDest(e.target.value)}><option value="">All destinations</option>{dests.data?.items?.map((d: any) => <option key={d._id} value={d._id}>{d.name}</option>)}</Select></Field>
        <div className="ml-auto flex flex-wrap gap-2">{[["bookings", "Bookings"], ["daily", "Daily summary"], ["slots", "Slot utilization"]].map(([k, l]) => <a key={k} href={`/api/admin/reports?${q}&format=csv&kind=${k}`} className="inline-flex h-10 items-center gap-2 rounded-lg border border-forest/30 px-3 text-sm text-forest hover:bg-forest-50"><Download className="h-4 w-4" aria-hidden />{l} CSV</a>)}</div>
      </Card>
      {error ? <ErrorState message={error} onRetry={reload} /> : loading || !a ? <PageSkeleton /> : (<>
        <div className="grid gap-4 sm:grid-cols-3"><Card className="p-4"><p className="text-sm text-ink/70">Net revenue</p><p className="font-display text-3xl">{inr(data.overview.revenueMinor)}</p></Card><Card className="p-4"><p className="text-sm text-ink/70">Cancellation rate</p><p className="font-display text-3xl">{data.overview.cancellationRatePct}%</p></Card><Card className="p-4"><p className="text-sm text-ink/70">Peak hours (avg visitors)</p><p className="mt-1 text-sm">{a.peakHours.length ? a.peakHours.map((p: any) => `${fmtTime(`${String(p.hour).padStart(2, "0")}:00`)} (${p.avgVisitors})`).join(", ") : "No data"}</p></Card></div>
        <div className="grid gap-6 lg:grid-cols-2">
          <Chart title="Daily bookings and visitors" label="Line chart of daily visitors and cancellations"><LineChart data={a.daily}>{grid}<XAxis dataKey="date" tickFormatter={(d) => d.slice(5)} tick={{ fontSize: 11 }} /><YAxis tick={{ fontSize: 11 }} /><Tooltip /><Legend /><Line dataKey="visitors" name="Visitors" stroke="#1F4D3A" dot={false} strokeWidth={2} /><Line dataKey="bookings" name="Bookings" stroke="#D9A441" dot={false} /><Line dataKey="cancelled" name="Cancellations" stroke="#B8532E" dot={false} /></LineChart></Chart>
          <Chart title="Revenue per day (₹)" label="Bar chart of daily revenue"><BarChart data={a.daily.map((d: any) => ({ ...d, revenue: d.revenueMinor / 100 }))}>{grid}<XAxis dataKey="date" tickFormatter={(d) => d.slice(5)} tick={{ fontSize: 11 }} /><YAxis tick={{ fontSize: 11 }} /><Tooltip /><Bar dataKey="revenue" fill="#B8532E" radius={[4, 4, 0, 0]} /></BarChart></Chart>
          <Chart title="Weekly visitors (week starting Monday)" label="Bar chart of weekly confirmed visitors"><BarChart data={a.weekly}>{grid}<XAxis dataKey="week" tickFormatter={(d) => d.slice(5)} tick={{ fontSize: 11 }} /><YAxis tick={{ fontSize: 11 }} /><Tooltip /><Bar dataKey="visitors" fill="#1F4D3A" radius={[4, 4, 0, 0]} /></BarChart></Chart>
          <Chart title="Monthly visitors" label="Bar chart of monthly confirmed visitors"><BarChart data={a.monthly}>{grid}<XAxis dataKey="month" tick={{ fontSize: 11 }} /><YAxis tick={{ fontSize: 11 }} /><Tooltip /><Bar dataKey="visitors" fill="#1F4D3A" radius={[4, 4, 0, 0]} /></BarChart></Chart>
          <Chart title="Average visitors by hour" label="Bar chart of average visitors per hour of day" note="From recorded check-ins and simulated sample history."><BarChart data={a.hourly.map((h: any) => ({ ...h, label: `${h.hour}:00` }))}>{grid}<XAxis dataKey="label" tick={{ fontSize: 11 }} /><YAxis tick={{ fontSize: 11 }} /><Tooltip /><Bar dataKey="avgVisitors" fill="#D9A441" radius={[4, 4, 0, 0]} /></BarChart></Chart>
          <Chart title="Slot utilization (% of capacity booked)" label="Bar chart of average slot utilization by start time"><BarChart data={a.slotUtilization.map((s: any) => ({ ...s, label: fmtTime(s.start).replace(":00", "") }))}>{grid}<XAxis dataKey="label" tick={{ fontSize: 11 }} /><YAxis unit="%" tick={{ fontSize: 11 }} /><Tooltip /><Bar dataKey="pct" fill="#1F4D3A" radius={[4, 4, 0, 0]} /></BarChart></Chart>
        </div>
        <Chart title="Predicted vs actual attendance (last days)" label="Chart comparing predicted and actual daily attendance" note={a.dataNote}><ComposedChart data={a.predVsActual}>{grid}<XAxis dataKey="date" tickFormatter={(d) => d.slice(5)} tick={{ fontSize: 11 }} /><YAxis tick={{ fontSize: 11 }} /><Tooltip /><Legend /><Bar dataKey="predicted" name="Predicted" fill="#1F4D3A" radius={[4, 4, 0, 0]} /><Line dataKey="actual" name="Actual (recorded or simulated)" stroke="#B8532E" strokeWidth={2} /></ComposedChart></Chart>
      </>)}
    </div>
  );
}
