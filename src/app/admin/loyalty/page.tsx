"use client";
import { useState } from "react";
import { toast } from "sonner";
import { Search } from "lucide-react";
import { api } from "@/lib/hooks";
import { Badge, Button, Card, Field, Input } from "@/components/ui";

const label: Record<string, string> = { earn: "Earned", bonus: "Bonus", redeem: "Used", restore: "Returned", adjust: "Adjusted", expire: "Expired" };
export default function LoyaltyAdmin() {
  const [email, setEmail] = useState(""), [res, setRes] = useState<any>(null), [busy, setBusy] = useState(false);
  const [pts, setPts] = useState(""), [reason, setReason] = useState("");
  async function find(e?: React.FormEvent) { e?.preventDefault(); setBusy(true); try { setRes(await api(`/api/admin/loyalty?email=${encodeURIComponent(email)}`)); } catch (x: any) { setRes(null); toast.error(x.message); } finally { setBusy(false); } }
  async function adjust(sign: 1 | -1) {
    setBusy(true);
    try { const r = await api("/api/admin/loyalty", { body: { userId: res.user.id, points: sign * Math.abs(Number(pts)), reason } }); setRes({ ...res, summary: r.summary }); setPts(""); setReason(""); toast.success("Points updated"); }
    catch (x: any) { toast.error(x.issues?.[0]?.message || x.message); } finally { setBusy(false); }
  }
  const s = res?.summary;
  return (
    <div className="space-y-6">
      <div><h1 className="text-3xl">Loyalty points</h1><p className="mt-1 max-w-2xl text-sm text-ink/70">Look up a visitor to see their balance and history, or add or remove points with a reason (goodwill after a bad visit, fixing a mistake). Every change is recorded with your name and shows in the audit log. Operators can only reach visitors who have booked at their sites.</p></div>
      <Card className="p-5"><form onSubmit={find} className="flex flex-wrap items-end gap-3"><Field label="Visitor's email" className="min-w-[16rem] flex-1"><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="off" /></Field><Button type="submit" loading={busy} disabled={!email.includes("@")}><Search className="h-4 w-4" aria-hidden />Find</Button></form></Card>
      {s && (
        <div className="grid gap-6 lg:grid-cols-[1fr_1.3fr]">
          <div className="space-y-4">
            <Card className="p-5"><p className="text-sm text-ink/60">{res.user.name} · {res.user.email}</p><p className="font-display text-5xl text-forest">{s.balance}</p><p className="text-sm text-ink/70">points · <Badge className="bg-forest-50 text-forest">{s.tier.label}</Badge> · {s.lifetime} earned in total</p>{s.expiringSoon && <p className="mt-2 rounded-lg bg-amber-50 p-2 text-sm text-amber-900">{s.expiringSoon.points} points expire by {new Date(s.expiringSoon.by).toLocaleDateString("en-IN")}</p>}</Card>
            <Card className="space-y-3 p-5"><h2 className="text-lg">Add or remove points</h2>
              <Field label={`Points (up to ${res.maxAdjust})`}><Input inputMode="numeric" value={pts} onChange={(e) => setPts(e.target.value.replace(/[^\d]/g, ""))} /></Field>
              <Field label="Reason" hint="Kept in the visitor's history and the audit log"><Input value={reason} maxLength={160} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Gate was closed on arrival" /></Field>
              <div className="flex gap-2"><Button variant="accent" disabled={!Number(pts) || reason.trim().length < 5 || busy} onClick={() => adjust(1)}>Add points</Button><Button variant="outline" disabled={!Number(pts) || reason.trim().length < 5 || busy} onClick={() => adjust(-1)}>Remove points</Button></div></Card>
          </div>
          <Card className="p-5"><h2 className="text-lg">History</h2><ul className="mt-2 divide-y divide-forest/10 text-sm">{s.entries.map((e: any) => <li key={e._id} className="flex items-center justify-between gap-3 py-2"><span>{e.note || label[e.type]}<span className="block text-xs text-ink/55">{new Date(e.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })} · {label[e.type]}</span></span><span className={e.points > 0 ? "font-medium text-emerald-800" : "font-medium text-terracotta"}>{e.points > 0 ? "+" : ""}{e.points}</span></li>)}</ul></Card>
        </div>)}
    </div>
  );
}
