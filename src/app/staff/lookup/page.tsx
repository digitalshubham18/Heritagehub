"use client";
import { useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Printer, Search } from "lucide-react";
import { api } from "@/lib/hooks";
import { Badge, Button, Card, Empty, Input, StatusBadge } from "@/components/ui";
import { fmtDate, fmtTime, inr } from "@/lib/utils";
import { useTx } from "@/lib/i18n";
import { ReprintModal } from "@/components/parking-extras";

const when = (d?: string) => (d ? new Date(d).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "");

export default function Lookup() {
  const tx = useTx();
  const [q, setQ] = useState(""), [r, setR] = useState<any>(null), [busy, setBusy] = useState(false), [rp, setRp] = useState<{ type: "booking" | "parking" | "reservation" | "pass"; id: string } | null>(null);
  const reprintBtn = (type: "booking" | "parking" | "reservation" | "pass", id: string) => <button onClick={() => setRp({ type, id })} className="ml-3 inline-flex items-center gap-1 text-sm text-terracotta underline"><Printer className="h-3.5 w-3.5" aria-hidden />{tx("Reprint")}</button>;
  async function go(e: React.FormEvent) {
    e.preventDefault(); setBusy(true);
    try { setR(await api(`/api/staff/lookup?q=${encodeURIComponent(q.trim())}`)); } catch (err: any) { toast.error(err.message); } finally { setBusy(false); }
  }
  const none = r && !r.bookings.length && !r.parking.length && !r.reservations.length && !(r.passes || []).length;
  return (
    <div className="space-y-6">
      <div><h1 className="text-3xl">{tx("Visitor lookup")}</h1><p className="mt-1 text-sm text-ink/70">{tx("Find a visitor by booking reference, name, phone number, vehicle number, parking ticket or parking reservation code.")}</p></div>
      <form onSubmit={go} className="flex max-w-xl gap-2"><label htmlFor="lq" className="sr-only">{tx("Search")}</label><Input id="lq" value={q} onChange={(e) => setQ(e.target.value)} placeholder={tx("HH-XXXX-XXXX, phone, vehicle number…")} autoComplete="off" className="h-12" /><Button type="submit" size="lg" loading={busy} disabled={q.trim().length < 3}><Search className="h-4 w-4" aria-hidden />{tx("Search")}</Button></form>
      {none && <Empty title={tx("No match")}>Nothing found for &ldquo;{q}&rdquo; at your sites. Check the spelling, or try the reference on the visitor&apos;s ticket.</Empty>}
      {r?.bookings.length > 0 && <section aria-labelledby="lb"><h2 id="lb" className="mb-2 text-lg">{tx("Bookings")}</h2><div className="grid gap-3 md:grid-cols-2">{r.bookings.map((b: any) => <Card key={b._id} className="p-4"><div className="flex items-start justify-between gap-2"><div><p className="font-mono text-sm font-medium">{b.reference}</p><p className="text-sm text-ink/75">{b.contact?.name} · {b.contact?.phone}</p></div><StatusBadge s={b.status} /></div>
        <p className="mt-2 text-sm">{b.destinationName}</p><p className="text-sm text-ink/70">{fmtDate(b.date)}, {fmtTime(b.start)} to {fmtTime(b.end)} · {b.quantity} ticket{b.quantity > 1 ? "s" : ""}</p>
        <p className="mt-1 text-sm">{tx("Inside:")} <strong>{(b.checkedInCount || 0) - (b.checkedOutCount || 0)}</strong> · Entered: {b.checkedInCount || 0} · Left: {b.checkedOutCount || 0} {b.channel === "counter" && <Badge className="bg-stone-100">{tx("Counter")}</Badge>}</p>
        <Link href={`/staff/scan?code=${b.reference}`} className="mt-2 inline-block text-sm text-terracotta underline">{tx("Open in scanner")}</Link>{["confirmed", "completed"].includes(b.status) && reprintBtn("booking", b._id)}</Card>)}</div></section>}
      {r?.parking.length > 0 && <section aria-labelledby="lp"><h2 id="lp" className="mb-2 text-lg">{tx("Parking tickets")}</h2><div className="grid gap-3 md:grid-cols-2">{r.parking.map((t: any) => <Card key={t._id} className="p-4"><div className="flex items-start justify-between gap-2"><div><p className="font-mono font-medium">{t.vehicleNumber}</p><p className="font-mono text-xs text-ink/65">{t.ticketNo}</p></div><Badge className={t.status === "parked" ? "bg-amber-100 text-amber-900" : "bg-stone-100"}>{t.status}</Badge></div>
        <p className="mt-2 text-sm">{t.destinationName}{t.driverName ? ` · ${t.driverName}` : ""}{t.driverPhone ? ` · ${t.driverPhone}` : ""}</p><p className="text-sm text-ink/70">In {when(t.entryAt)}{t.exitAt ? ` · Out ${when(t.exitAt)}` : ""}{t.status === "exited" ? ` · Fee ${inr(t.feeMinor)}` : ""}</p>{t.penaltyMinor > 0 && <p className="text-sm text-amber-900">Lost-ticket charge {inr(t.penaltyMinor)}</p>}{t.status === "parked" && <Link href="/staff/parking" className="mt-2 inline-block text-sm text-terracotta underline">{tx("Go to parking to check out")}</Link>}{t.invoiceNo && <Link href={`/invoice/parking/${t.ticketNo}`} target="_blank" className="mt-2 inline-block text-sm text-terracotta underline">Invoice {t.invoiceNo}</Link>}{reprintBtn("parking", t._id)}{t.reprints > 0 && <span className="ml-2 text-xs text-ink/60">{t.reprints} reprint{t.reprints > 1 ? "s" : ""}</span>}</Card>)}</div></section>}
      {r?.reservations.length > 0 && <section aria-labelledby="lr"><h2 id="lr" className="mb-2 text-lg">{tx("Parking reservations")}</h2><div className="grid gap-3 md:grid-cols-2">{r.reservations.map((x: any) => <Card key={x._id} className="p-4"><div className="flex items-start justify-between gap-2"><div><p className="font-mono font-medium">{x.vehicleNumber}</p><p className="font-mono text-xs text-ink/65">{x.reference}</p></div><StatusBadge s={x.status} /></div><p className="mt-2 text-sm">{x.destinationName} · {fmtDate(x.date)} from {x.arrivalFrom}{x.prepaidMinor ? ` · ${inr(x.prepaidMinor)} prepaid` : ""}</p>{x.status === "reserved" && reprintBtn("reservation", x._id)}</Card>)}</div></section>}
      {(r?.passes || []).length > 0 && <section aria-labelledby="lm"><h2 id="lm" className="mb-2 text-lg">{tx("Monthly parking passes")}</h2><div className="grid gap-3 md:grid-cols-2">{r.passes.map((x: any) => <Card key={x._id} className="p-4"><div className="flex items-start justify-between gap-2"><div><p className="font-mono font-medium">{x.vehicleNumber}</p><p className="font-mono text-xs text-ink/65">{x.reference}</p></div><StatusBadge s={x.status} /></div><p className="mt-2 text-sm">{x.destinationName} · {x.holderName}{x.holderPhone ? ` · ${x.holderPhone}` : ""}</p><p className="text-sm text-ink/70">Valid {x.validFrom} to {x.validTo}</p>{reprintBtn("pass", x._id)}</Card>)}</div></section>}
      <ReprintModal type={rp?.type || "booking"} id={rp?.id || null} onClose={() => setRp(null)} />
    </div>
  );
}
