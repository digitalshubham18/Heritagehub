"use client";
import { useState } from "react";
import { useApi } from "@/lib/hooks";
import { ErrorState, PageSkeleton, Select } from "@/components/ui";
import { useTx } from "@/lib/i18n";
import { LostFoundBoard } from "@/components/lost-found-board";

export default function LostFound() {
  const tx = useTx();
  const sites = useApi<any>("/api/entries");
  const [siteId, setSiteId] = useState("");
  const site = sites.data?.items?.find((s: any) => s.id === siteId) || sites.data?.items?.[0];
  if (sites.loading) return <PageSkeleton />;
  if (sites.error) return <ErrorState message={sites.error} onRetry={sites.reload} />;
  if (!site) return <p>{tx("No sites assigned.")}</p>;
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3"><div><h1 className="text-3xl">{tx("Lost and found")}</h1><p className="mt-1 text-sm text-ink/70">{tx("Log what visitors hand in and what they report missing. Likely matches are suggested, and every return records who collected it.")}</p></div>{sites.data.items.length > 1 && <Select aria-label={tx("Site")} className="w-56" value={site.id} onChange={(e) => setSiteId(e.target.value)}>{sites.data.items.map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select>}</div>
      <LostFoundBoard siteId={site.id} canLog />
    </div>
  );
}
