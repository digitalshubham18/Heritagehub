"use client";
import { toast } from "sonner";
import { Gift } from "lucide-react";
import { api, useApi } from "@/lib/hooks";
import { useI18n } from "@/lib/i18n";
import { Badge, Button, Card } from "@/components/ui";
import { fmtDate, fmtTime } from "@/lib/utils";

const tone: Record<string, string> = { pending: "bg-amber-100 text-amber-900", accepted: "bg-emerald-100 text-emerald-900", declined: "bg-stone-100", cancelled: "bg-stone-100", expired: "bg-stone-100", failed: "bg-red-100 text-red-900" };
/** Tickets other visitors have offered you, and the offers you sent. */
export function TransfersPanel({ onChanged }: { onChanged: () => void }) {
  const { t: tr } = useI18n();
  const t = useApi<any>("/api/transfers", { poll: 30000 });
  async function act(id: string, action: string) {
    try { const r = await api("/api/transfers", { method: "PATCH", body: { id, action } }); toast.success(action === "accept" ? tr("xf.accepted", { ref: r.reference }) : action === "decline" ? tr("xf.declined") : tr("xf.withdrawn")); t.reload(); onChanged(); }
    catch (e: any) { toast.error(e.message); t.reload(); }
  }
  const inc: any[] = (t.data?.incoming || []).filter((x: any) => x.status === "pending"), out: any[] = (t.data?.outgoing || []).filter((x: any) => x.status === "pending");
  const hist: any[] = [...(t.data?.incoming || []), ...(t.data?.outgoing || [])].filter((x) => x.status !== "pending").sort((a, b) => +new Date(b.updatedAt) - +new Date(a.updatedAt)).slice(0, 5);
  if (!t.data || (!inc.length && !out.length && !hist.length)) return null;
  const line = (x: any) => `${x.booking?.destination?.name || "Tickets"} · ${x.booking ? `${fmtDate(x.booking.date)}, ${fmtTime(x.booking.start)}` : ""} · ${x.booking?.quantity || ""} ticket${x.booking?.quantity > 1 ? "s" : ""}`;
  return (
    <section aria-labelledby="xfer" className="space-y-3"><h2 id="xfer" className="flex items-center gap-2 text-xl"><Gift className="h-5 w-5 text-terracotta" aria-hidden />{tr("xf.title")}</h2>
      {inc.map((x) => <Card key={x._id} className="flex flex-wrap items-center justify-between gap-3 border-2 border-terracotta/40 p-4"><div><p className="font-medium">{tr("xf.sent", { name: x.fromName })}</p><p className="text-sm text-ink/70">{line(x)}</p>{x.message && <p className="mt-1 text-sm italic">“{x.message}”</p>}<p className="text-xs text-ink/55">{tr("xf.until", { when: new Date(x.expiresAt).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) })}</p></div><div className="flex gap-2"><Button variant="outline" onClick={() => act(x._id, "decline")}>{tr("xf.decline")}</Button><Button variant="accent" onClick={() => act(x._id, "accept")}>{tr("xf.accept")}</Button></div></Card>)}
      {out.map((x) => <Card key={x._id} className="flex flex-wrap items-center justify-between gap-3 p-4"><div><p className="font-medium">{tr("xf.waiting", { name: x.toName || x.toEmail })}</p><p className="text-sm text-ink/70">{line(x)}</p></div><Button size="sm" variant="outline" onClick={() => act(x._id, "cancel")}>{tr("xf.withdraw")}</Button></Card>)}
      {hist.length > 0 && <details className="text-sm"><summary className="cursor-pointer text-ink/70">{tr("xf.earlier")}</summary><ul className="mt-2 space-y-1">{hist.map((x) => <li key={x._id}><Badge className={tone[x.status]}>{x.status}</Badge> {x.fromName} → {x.toName || x.toEmail} · {line(x)}</li>)}</ul></details>}
    </section>
  );
}
