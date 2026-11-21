"use client";
import { useState } from "react";
import { toast } from "sonner";
import { Bar, BarChart, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { api, useApi } from "@/lib/hooks";
import { Button, Card, ErrorState, Field, Input, PageSkeleton, Select } from "@/components/ui";
import { CrowdRibbon, LevelBadge, SlotChart } from "@/components/crowd";
import { LivePanel, useLive } from "@/components/live";
import { fmtTime, todayIST } from "@/lib/utils";

function AdminLive({ slug }: { slug: string }) {
  const l = useLive(slug, { detail: true }).items[0];
  return (
    <div className="grid gap-4 lg:grid-cols-[1.2fr_1fr]">
      <LivePanel slug={slug} title="Live crowd" />
      {l && <Card className="space-y-2 p-5"><h2 className="text-lg">Live detail</h2><dl className="grid grid-cols-2 gap-2 text-sm"><dt className="text-ink/65">Inside now</dt><dd className="font-medium">{l.occupancy} of {l.limit}</dd><dt className="text-ink/65">Last 15 min</dt><dd>{l.entriesLast15} in, {l.exitsLast15} out</dd><dt className="text-ink/65">Queue estimate</dt><dd>{l.waitMin ? `~${l.waitMin} min` : "None"}</dd>{l.forecastPct != null && <><dt className="text-ink/65">Forecast this hour</dt><dd>{l.forecastPct}% ({l.forecastLevel?.replace("_", " ")})</dd></>}<dt className="text-ink/65">Entry</dt><dd>{l.paused ? <span className="font-medium text-red-800">Paused: {l.pausedReason}</span> : "Open"}</dd></dl>
        <p className="text-xs text-ink/60">Live comes from recorded gate scans. The forecast below is the model; compare them to see how well it is doing today.</p></Card>}
    </div>
  );
}

export default function AdminCrowd() {
  const dests = useApi<any>("/api/destinations?all=1");
  const [dest, setDest] = useState(""); const [date, setDate] = useState(todayIST());
  const d = dest || dests.data?.items?.[0]?.slug || "";
  const c = useApi<any>(d ? `/api/crowd?destination=${d}&date=${date}&trends=1` : null, { poll: 30000 });
  async function simulate() { try { const r = await api("/api/crowd", { body: { destinationId: c.data.destination.id } }); toast.success(`Generated ${r.generated} simulated hourly counts`); c.reload(); } catch (e: any) { toast.error(e.message); } }
  const x = c.data;
  const alerts = x?.slots?.filter((s: any) => s.booked / (s.capacity || 1) * 100 >= 85) || [];
  return (
    <div className="space-y-6">
      <h1 className="text-3xl">Crowd management</h1>
      <Card className="grid gap-3 p-4 sm:grid-cols-2"><Field label="Destination"><Select value={d} onChange={(e) => setDest(e.target.value)}>{dests.data?.items?.map((i: any) => <option key={i._id} value={i.slug}>{i.name}</option>)}</Select></Field><Field label="Date"><Input type="date" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} /></Field></Card>
      {d && <AdminLive slug={d} />}
      {c.error ? <ErrorState message={c.error} onRetry={c.reload} /> : !x ? <PageSkeleton /> : (<>
        <div className="grid gap-4 sm:grid-cols-3">
          <Card className="p-4"><p className="text-sm text-ink/70">Recommended windows</p><p className="mt-1 font-display text-xl">{x.recommended.length ? x.recommended.map((r: any) => fmtTime(r.start)).join(", ") : "None"}</p></Card>
          <Card className="p-4"><p className="text-sm text-ink/70">Inside right now</p><p className="mt-1 font-display text-xl">{x.occupancyNow ?? "n/a (not today)"}</p></Card>
          <Card className="p-4"><p className="text-sm text-ink/70">Model calibration</p><p className="mt-1 font-display text-xl">×{x.calibration.toFixed(2)}</p><p className="text-xs text-ink/60">Actual vs model, last 28 days</p></Card>
        </div>
        {alerts.length > 0 && <div role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-900">Approaching capacity: {alerts.map((a: any) => `${fmtTime(a.start)} (${a.booked}/${a.capacity})`).join(", ")}</div>}
        <Card className="space-y-4 p-5"><h2 className="text-lg">Predicted crowd by slot</h2><CrowdRibbon slots={x.slots} /><SlotChart slots={x.slots} />
          <div className="overflow-x-auto"><table className="w-full min-w-[520px] text-sm"><thead className="text-left text-ink/60"><tr>{["Slot", "Booked", "Expected visitors", "Density", "Level", "Est. wait"].map((h) => <th key={h} className="py-1 font-medium">{h}</th>)}</tr></thead><tbody>{x.slots.map((s: any) => <tr key={s.start} className="border-t border-forest/10"><td className="py-1.5">{fmtTime(s.start)}</td><td>{s.booked}</td><td>{s.expected}</td><td>{s.densityPct}%</td><td><LevelBadge level={s.level} /></td><td>{s.waitMin ? `${s.waitMin} min` : "none"}</td></tr>)}</tbody></table></div></Card>
        <Card className="p-5"><div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-lg">Predicted vs actual by hour</h2><Button size="sm" variant="outline" onClick={simulate}>Generate simulated counts for today</Button></div>
          <div className="mt-3 h-64" role="img" aria-label="Chart comparing predicted, recorded and simulated visitors by hour"><ResponsiveContainer><ComposedChart data={x.hourly.map((h: any) => ({ ...h, label: `${h.hour}:00` }))}><CartesianGrid strokeDasharray="3 3" stroke="#1F4D3A22" vertical={false} /><XAxis dataKey="label" tick={{ fontSize: 11 }} /><YAxis tick={{ fontSize: 11 }} /><Tooltip /><Legend /><Bar dataKey="predicted" name="Predicted" fill="#1F4D3A" radius={[4, 4, 0, 0]} /><Bar dataKey="recorded" name="Recorded check-ins" fill="#B8532E" radius={[4, 4, 0, 0]} /><Line dataKey="simulated" name="Simulated" stroke="#D9A441" strokeWidth={2} /></ComposedChart></ResponsiveContainer></div>
          <p className="mt-2 text-xs text-ink/60">Predicted = model estimate. Recorded = staff check-ins. Simulated = sample data, not real visitors.</p></Card>
        {x.trends && <div className="grid gap-6 lg:grid-cols-2">
          <Card className="p-5"><h2 className="text-lg">Average visitors by day of week</h2><div className="mt-3 h-52"><ResponsiveContainer><BarChart data={x.trends.byDow}><CartesianGrid strokeDasharray="3 3" stroke="#1F4D3A22" vertical={false} /><XAxis dataKey="day" /><YAxis tick={{ fontSize: 11 }} /><Tooltip /><Bar dataKey="avg" fill="#1F4D3A" radius={[4, 4, 0, 0]} /></BarChart></ResponsiveContainer></div></Card>
          <Card className="p-5"><h2 className="text-lg">Visitors by month</h2><div className="mt-3 h-52"><ResponsiveContainer><BarChart data={x.trends.byMonth}><CartesianGrid strokeDasharray="3 3" stroke="#1F4D3A22" vertical={false} /><XAxis dataKey="month" tick={{ fontSize: 11 }} /><YAxis tick={{ fontSize: 11 }} /><Tooltip /><Bar dataKey="visitors" fill="#B8532E" radius={[4, 4, 0, 0]} /></BarChart></ResponsiveContainer></div><p className="mt-2 text-xs text-ink/60">{x.trends.note}</p></Card></div>}
        <Card className="p-5 text-sm"><h2 className="text-lg">How the prediction works</h2><p className="mt-2 max-w-prose">Expected visitors per slot = site daily average × season × weekday × holiday × calibration, shared across slots by a typical hourly pattern. When bookings exist, they are blended in with more weight as the visit date nears, and the forecast never drops below confirmed bookings. Density is expected visitors divided by slot capacity; levels use this site's thresholds. Waiting time starts above 60% density. Full details are in the README.</p></Card>
      </>)}
    </div>
  );
}
