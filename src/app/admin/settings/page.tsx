"use client";
import { useState } from "react";
import { toast } from "sonner";
import { api, useApi } from "@/lib/hooks";
import { Button, Card, ErrorState, Field, Input, PageSkeleton } from "@/components/ui";
import { GST_PCT, PLATFORM_FEE_PCT } from "@/lib/pricing";

function SiteSettings({ d, onSaved }: { d: any; onSaved: () => void }) {
  const [t, setT] = useState(d.crowdThresholds); const [alert, setAlert] = useState(d.alertThresholdPct); const [lim, setLim] = useState(d.occupancyLimit);
  const [cp, setCp] = useState(d.cancellationPolicy); const [busy, setBusy] = useState(false); const [pub, setPub] = useState(d.publicHeadcount !== false);
  async function save() {
    setBusy(true);
    try { await api(`/api/destinations/${d._id}`, { method: "PATCH", body: { crowdThresholds: t, alertThresholdPct: alert, occupancyLimit: lim, cancellationPolicy: cp, publicHeadcount: pub } }); toast.success(`${d.name} updated`); onSaved(); }
    catch (e: any) { toast.error(e.issues?.crowdThresholds?.[0] || e.message); } finally { setBusy(false); }
  }
  const n = (f: (v: number) => void) => (e: React.ChangeEvent<HTMLInputElement>) => f(Number(e.target.value));
  return (
    <Card className="space-y-4 p-5"><h2 className="text-lg">{d.name}</h2>
      <div className="grid gap-3 sm:grid-cols-4"><Field label="Moderate from (%)"><Input type="number" value={t.moderate} onChange={n((v) => setT({ ...t, moderate: v }))} /></Field><Field label="High from (%)"><Input type="number" value={t.high} onChange={n((v) => setT({ ...t, high: v }))} /></Field><Field label="Very high from (%)"><Input type="number" value={t.veryHigh} onChange={n((v) => setT({ ...t, veryHigh: v }))} /></Field><Field label="Alert at (% of capacity)"><Input type="number" value={alert} onChange={n(setAlert)} /></Field></div>
      <div className="grid gap-3 sm:grid-cols-4"><Field label="Max inside at once"><Input type="number" value={lim} onChange={n(setLim)} /></Field><Field label="Full refund until (h)"><Input type="number" value={cp.freeUntilHours} onChange={n((v) => setCp({ ...cp, freeUntilHours: v }))} /></Field><Field label="Late refund (%)"><Input type="number" value={cp.lateRefundPercent} onChange={n((v) => setCp({ ...cp, lateRefundPercent: v }))} /></Field><Field label="No cancellation within (h)"><Input type="number" value={cp.noRefundHours} onChange={n((v) => setCp({ ...cp, noRefundHours: v }))} /></Field></div>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="accent-forest" checked={pub} onChange={(e) => setPub(e.target.checked)} />Show the live number of people inside to visitors (otherwise they see only the crowd level and percentage)</label>
      <Button loading={busy} onClick={save}>Save settings</Button></Card>
  );
}

export default function Settings() {
  const { data, loading, error, reload } = useApi<any>("/api/destinations?all=1");
  return (
    <div className="space-y-6"><h1 className="text-3xl">Settings</h1>
      <Card className="p-5 text-sm"><h2 className="text-lg">Platform charges</h2><p className="mt-2">Convenience fee: {PLATFORM_FEE_PCT}% of ticket value, plus {GST_PCT}% GST on that fee. Held seats are released after {10} minutes without payment. These values are set in <code>src/lib/pricing.ts</code> and the <code>BOOKING_HOLD_MINUTES</code> environment variable.</p></Card>
      <p className="text-sm text-ink/70">Crowd thresholds are the expected density (visitors as a percentage of slot capacity) at which a slot moves up a level. Alerts fire when bookings or occupancy reach the alert percentage.</p>
      {error ? <ErrorState message={error} onRetry={reload} /> : loading ? <PageSkeleton /> : data.items.map((d: any) => <SiteSettings key={d._id} d={d} onSaved={reload} />)}
    </div>
  );
}
