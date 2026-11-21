"use client";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { BadgeCheck } from "lucide-react";
import Link from "next/link";
import { api, useApi } from "@/lib/hooks";
import { useI18n } from "@/lib/i18n";
import { Badge, Button, Card, Field, Input, Select } from "@/components/ui";
import { inr } from "@/lib/utils";

/** Monthly parking passes: the visitor's own passes, and a form to buy or renew one for the chosen destination. Payment is the same simulated gateway as other online payments. */
export function MyPasses({ destinationId, destinationName, types, userName }: { destinationId?: string; destinationName?: string; types: any[]; userName: string }) {
  const { t: tr } = useI18n();
  const mine = useApi<any>("/api/parking/passes?mine=1");
  const offered = types.filter((t) => t.monthlyPassMinor > 0 && ["car", "two_wheeler", "bus"].includes(t.pool));
  const [vt, setVt] = useState(""), [num, setNum] = useState(""), [name, setName] = useState(userName), [method, setMethod] = useState("upi"), [busy, setBusy] = useState(false);
  const key = useRef(crypto.randomUUID());
  const pick = vt || offered[0]?.pool || "", price = offered.find((t) => t.pool === pick)?.monthlyPassMinor || 0;
  async function buy(e: React.FormEvent) {
    e.preventDefault(); setBusy(true);
    try { const r = await api("/api/parking/passes", { body: { destinationId, vehicleType: pick, vehicleNumber: num, holderName: name, method, self: true, idempotencyKey: key.current } }); key.current = crypto.randomUUID(); toast.success(r.renewal ? tr("mp.renewed") : tr("mp.active", { ref: r.pass.reference })); setNum(""); mine.reload(); }
    catch (err: any) { toast.error(err.message); } finally { setBusy(false); }
  }
  const items: any[] = mine.data?.items || [];
  if (!offered.length && !items.length) return null;
  return (
    <section aria-labelledby="mp" className="space-y-3"><h2 id="mp" className="flex items-center gap-2 text-xl"><BadgeCheck className="h-5 w-5 text-forest" aria-hidden />{tr("mp.title")}</h2>
      <div className="grid gap-6 lg:grid-cols-2">
        {offered.length > 0 && destinationId && <Card className="p-5"><form onSubmit={buy} className="space-y-3"><p className="text-sm text-ink/75">{tr("mp.intro", { site: destinationName || "" })}</p>
          <div className="grid gap-3 sm:grid-cols-2"><Field label={tr("mp.vtype")}><Select value={pick} onChange={(e) => setVt(e.target.value)}>{offered.map((t) => <option key={t.pool} value={t.pool}>{tr(`mp.${t.pool}` as any)} · {inr(t.monthlyPassMinor)}</option>)}</Select></Field><Field label={tr("mp.vnum")}><Input value={num} onChange={(e) => setNum(e.target.value.toUpperCase())} className="font-mono" placeholder="UP80 AB 1234" autoComplete="off" /></Field></div>
          <Field label={tr("mp.holder")}><Input value={name} onChange={(e) => setName(e.target.value)} /></Field>
          <div className="flex gap-2 text-sm">{["upi", "card"].map((m) => <label key={m} className={`cursor-pointer rounded-full border px-3 py-1 ${method === m ? "border-forest bg-forest-50" : "border-forest/25"}`}><input type="radio" name="ppm" className="sr-only" checked={method === m} onChange={() => setMethod(m)} />{m.toUpperCase()}</label>)}</div>
          <Button type="submit" variant="accent" loading={busy} disabled={num.trim().length < 4 || name.trim().length < 2}>{tr("mp.pay", { amount: inr(price) })}</Button>
          <p className="text-xs text-ink/60">{tr("mp.note")}</p></form></Card>}
        <Card className="p-5"><h3 className="text-base">{tr("mp.yours")}</h3>{items.length === 0 ? <p className="mt-2 text-sm text-ink/60">{tr("mp.none")}</p> : <ul className="mt-2 divide-y divide-forest/10 text-sm">{items.map((p) => <li key={p._id} className="flex items-center justify-between gap-2 py-2"><span><span className="font-mono font-medium">{p.vehicleNumber}</span> <Badge className={p.status === "cancelled" ? "bg-red-100 text-red-900" : p.current ? "bg-emerald-100 text-emerald-900" : "bg-stone-100"}>{p.status === "cancelled" ? tr("mp.cancelled") : p.current ? tr("mp.valid") : p.expired ? tr("mp.expired") : tr("mp.upcoming")}</Badge><span className="block text-xs text-ink/60">{p.destination?.name} · {p.validFrom} {tr("vi.to")} {p.validTo} · {p.reference}</span>{p.current && p.daysLeft <= 7 && <span className="block text-xs font-medium text-amber-900">{tr("mp.expiresin", { n: p.daysLeft })}</span>}{p.refundMinor > 0 && <span className="block text-xs text-ink/60">{tr("mp.refund", { amount: inr(p.refundMinor) })}</span>}</span>{p.invoiceNo && <Link className="text-xs text-terracotta underline" target="_blank" href={`/invoice/parking/${p.reference}`}>{tr("mp.invoice")}</Link>}</li>)}</ul>}</Card>
      </div>
    </section>
  );
}
