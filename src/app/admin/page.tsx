"use client";
import Link from "next/link";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { toast } from "sonner";
import { api, useApi } from "@/lib/hooks";
import { Activity, Banknote, Building2, DoorOpen, TicketCheck, Undo2 } from "lucide-react";
import { Card, ErrorState, PageSkeleton, Stat } from "@/components/ui";
import { LevelBadge } from "@/components/crowd";
import { fmtTime, inr } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";

export default function AdminHome() {
  const { t } = useI18n();
  const { data, loading, error, reload } = useApi<any>("/api/admin/reports?range=14", { poll: 15000 });
  if (loading) return <PageSkeleton />;
  if (error || !data) return <ErrorState message={error || "No data"} onRetry={reload} />;
  const o = data.overview, a = data.analytics;
  async function read(id: string) { try { await api("/api/notifications", { method: "PATCH", body: { id } }); reload(); } catch (e: any) { toast.error(e.message); } }
  return (
    <div className="space-y-8">
      <div className="flex items-baseline justify-between"><h1 className="text-3xl">{t("adm.overview")}</h1><p className="text-xs text-ink/60">Refreshes every 15 seconds</p></div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Stat icon={Building2} label={t("adm.dest")} value={o.destinations} />
        <Stat icon={TicketCheck} label={t("adm.visits")} value={o.visitsToday} sub={`${o.visitorsToday} visitors`} />
        <Stat icon={DoorOpen} label={t("adm.checkedin")} value={o.checkedIn} sub="Recorded entries minus exits" />
        <Stat icon={Activity} label={t("adm.capacity")} value={o.availableCapacity.toLocaleString("en-IN")} sub="Open slots still to run" />
        <Stat icon={Banknote} label={t("adm.revenue")} value={inr(o.revenueMinor)} sub={`Gross ${inr(o.grossMinor)}, refunds ${inr(o.refundsMinor)}`} />
        <Stat icon={Undo2} label={t("adm.cancel")} value={`${o.cancellationRatePct}%`} sub="Past visits, last 14 days" tone={o.cancellationRatePct > 20 ? "warn" : undefined} />
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="p-5"><h2 className="text-lg">Visitors per day</h2>
          <div className="mt-3 h-56" role="img" aria-label="Bar chart of confirmed visitors per day"><ResponsiveContainer><BarChart data={a.daily}><CartesianGrid strokeDasharray="3 3" stroke="#1F4D3A22" vertical={false} /><XAxis dataKey="date" tickFormatter={(d) => d.slice(5)} tick={{ fontSize: 11 }} /><YAxis tick={{ fontSize: 11 }} /><Tooltip /><Bar dataKey="visitors" fill="#1F4D3A" radius={[4, 4, 0, 0]} /></BarChart></ResponsiveContainer></div></Card>
        <Card className="p-5"><h2 className="text-lg">Busiest upcoming slots</h2>
          <table className="mt-3 w-full text-sm"><thead className="text-left text-ink/60"><tr><th className="py-1 font-medium">Site</th><th className="py-1 font-medium">When</th><th className="py-1 font-medium">Density</th></tr></thead><tbody>{o.busySlots.map((s: any, i: number) => <tr key={i} className="border-t border-forest/10"><td className="py-1.5">{s.destination}</td><td>{s.date.slice(5)} {fmtTime(s.start)}</td><td className="flex items-center gap-2 py-1.5"><LevelBadge level={s.level} />{s.densityPct}%</td></tr>)}</tbody></table></Card>
      </div>
      <Card className="p-5"><h2 className="text-lg">{t("adm.alerts")}</h2>
        {o.alerts.length === 0 ? <p className="mt-2 text-sm text-ink/60">No unread alerts.</p> : <ul className="mt-3 divide-y divide-forest/10">{o.alerts.map((n: any) => <li key={n._id} className="flex items-center justify-between gap-3 py-2 text-sm"><span><span className={`mr-2 rounded px-1.5 py-0.5 text-xs ${n.severity === "critical" ? "bg-red-100 text-red-900" : "bg-amber-100 text-amber-900"}`}>{n.type.replace("_", " ")}</span>{n.message}</span><button onClick={() => read(n._id)} className="shrink-0 text-xs text-terracotta underline">Mark read</button></li>)}</ul>}</Card>
      <div className="flex flex-wrap gap-3 text-sm"><Link className="rounded-lg bg-forest px-4 py-2 text-ivory" href="/admin/destinations">Manage destinations</Link><Link className="rounded-lg border border-forest/30 px-4 py-2" href="/admin/reports">Open reports</Link></div>
    </div>
  );
}
