"use client";
import { Gift, Sparkles, Clock } from "lucide-react";
import { useApi } from "@/lib/hooks";
import { useI18n } from "@/lib/i18n";
import { Badge, Card, Empty, ErrorState, PageSkeleton } from "@/components/ui";
import { inr } from "@/lib/utils";

const tierTone: Record<string, string> = { bronze: "bg-amber-100 text-amber-900", silver: "bg-slate-200 text-slate-900", gold: "bg-yellow-200 text-yellow-900" };
export default function Loyalty() {
  const { t } = useI18n();
  const l = useApi<any>("/api/loyalty");
  if (l.loading) return <PageSkeleton />;
  if (l.error || !l.data) return <ErrorState message={l.error || "Could not load"} onRetry={l.reload} />;
  const d = l.data, r = d.rules;
  return (
    <div className="space-y-6">
      <div><h1 className="text-3xl">{t("loy.title")}</h1><p className="mt-1 text-sm text-ink/70">{t("loy.sub")}</p></div>
      {d.expiringSoon?.points > 0 && <p role="status" className="flex items-center gap-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-950"><Clock className="h-4 w-4 shrink-0" aria-hidden />{t("loy.expiring", { n: d.expiringSoon.points, date: new Date(d.expiringSoon.by).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) })}</p>}
      <div className="grid gap-4 md:grid-cols-3">
        <Card className="p-5"><p className="text-sm text-ink/60">{t("loy.balance")}</p><p className="font-display text-5xl text-forest">{d.balance}</p><p className="text-sm text-ink/70">{t("loy.worth", { value: inr(d.valueMinor) })}</p></Card>
        <Card className="p-5"><p className="text-sm text-ink/60">{t("loy.tier")}</p><p className="mt-1"><Badge className={`${tierTone[d.tier.id]} text-base`}><Sparkles className="h-4 w-4" aria-hidden />{d.tier.label}</Badge></p><p className="mt-2 text-sm text-ink/70">{t("loy.mult", { mult: d.tier.mult })}</p>{d.next ? <><div className="mt-3 h-2 rounded-full bg-forest/10" role="progressbar" aria-valuenow={d.lifetime} aria-valuemin={d.tier.from} aria-valuemax={d.next.from} aria-label={d.next.label}><div className="h-2 rounded-full bg-forest" style={{ width: `${Math.min(100, Math.round(((d.lifetime - d.tier.from) / (d.next.from - d.tier.from)) * 100))}%` }} /></div><p className="mt-1 text-xs text-ink/60">{t("loy.togo", { n: d.next.pointsToGo, tier: d.next.label })}</p></> : <p className="mt-2 text-xs text-ink/60">{t("loy.top")}</p>}</Card>
        <Card className="p-5"><p className="text-sm text-ink/60">{t("loy.total")}</p><p className="font-display text-4xl">{d.lifetime}</p><p className="text-sm text-ink/70">{t("loy.totalsub")}</p></Card>
      </div>
      <Card className="space-y-2 p-5"><h2 className="flex items-center gap-2 text-lg"><Gift className="h-5 w-5 text-terracotta" aria-hidden />{t("loy.how")}</h2>
        <ul className="list-disc space-y-1 pl-5 text-sm text-ink/80"><li>{t("loy.h1", { amount: inr(r.earnMinorPerPoint) })}</li><li>{t("loy.h2", { n: r.newSiteBonus })}</li><li>{t("loy.h3", { value: inr(r.redeemMinorPerPoint), pct: r.maxRedeemPct })}</li><li>{t("loy.h4")}</li>{r.expiryMonths > 0 && <li>{t("loy.h6", { months: r.expiryMonths })}</li>}<li>{t("loy.h5")}</li></ul></Card>
      <section aria-labelledby="hist"><h2 id="hist" className="mb-2 text-xl">{t("loy.history")}</h2>
        {d.entries.length === 0 ? <Empty title={t("loy.none")}>{t("loy.nonesub")}</Empty> : <Card><ul className="divide-y divide-forest/10">{d.entries.map((e: any) => <li key={e._id} className="flex items-center justify-between gap-3 p-3 text-sm"><span>{e.note || e.type}<span className="block text-xs text-ink/55">{new Date(e.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })} · {e.type}</span></span><span className={e.points > 0 ? "font-medium text-emerald-800" : "font-medium text-terracotta"}>{e.points > 0 ? "+" : ""}{e.points}</span></li>)}</ul></Card>}</section>
    </div>
  );
}
