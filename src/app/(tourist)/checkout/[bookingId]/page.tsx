"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { toast } from "sonner";
import { CheckCircle2, CreditCard, Landmark, Smartphone, Timer } from "lucide-react";
import { api, useApi, useUser } from "@/lib/hooks";
import { Button, Card, ErrorState, PageSkeleton, useConfirm } from "@/components/ui";
import { TicketCard } from "@/components/ticket";
import { fmtDate, fmtTime, inr } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";

const METHODS = [{ id: "upi", label: "UPI", icon: Smartphone }, { id: "card", label: "Card", icon: CreditCard }, { id: "netbanking", label: "Net banking", icon: Landmark }];

export default function Checkout() {
  const { bookingId } = useParams<{ bookingId: string }>();
  const { data, error, loading, reload } = useApi<any>(`/api/bookings/${bookingId}`);
  const [method, setMethod] = useState("upi");
  const [fail, setFail] = useState(false);
  const [busy, setBusy] = useState(false);
  const [left, setLeft] = useState<number | null>(null);
  const [done, setDone] = useState(false);
  const key = useRef(crypto.randomUUID()); // one key per payment attempt: double-clicks and retries can't double-charge
  const { confirm, dialog } = useConfirm();
  const { t } = useI18n();
  const cfg = useApi<any>("/api/payments");
  const { user } = useUser();
  const live = cfg.data?.provider === "razorpay";

  const b = data?.booking;
  useEffect(() => {
    if (!b?.holdExpiresAt || b.status !== "pending") return;
    const t = setInterval(() => setLeft(Math.max(0, Math.round((new Date(b.holdExpiresAt).getTime() - Date.now()) / 1000))), 1000);
    return () => clearInterval(t);
  }, [b?.holdExpiresAt, b?.status]);

  if (loading) return <PageSkeleton />;
  if (error || !data) return <ErrorState message={error || "Booking not found"} onRetry={reload} />;
  const x = data.destination;
  const confirmed = b.status === "confirmed" || done;

  function loadRazorpay() {
    return new Promise<void>((res, rej) => {
      if ((window as any).Razorpay) return res();
      const sc = document.createElement("script"); sc.src = "https://checkout.razorpay.com/v1/checkout.js"; sc.onload = () => res(); sc.onerror = () => rej(new Error("Could not load Razorpay. Check your connection.")); document.body.appendChild(sc);
    });
  }
  async function openRazorpay(order: any) {
    await loadRazorpay();
    const rz = new (window as any).Razorpay({
      key: order.keyId, amount: order.amount, currency: order.currency, order_id: order.id, name: "HeritageHub", description: `${x.name} tickets`,
      prefill: { name: b.contact?.name, email: b.contact?.email, contact: b.contact?.phone }, theme: { color: "#1F4D3A" },
      handler: async (resp: any) => {
        try { await api("/api/payments/verify", { body: resp }); toast.success("Payment received. Your ticket is ready."); setDone(true); reload(); }
        catch (e: any) { toast.error(e.message); reload(); }
      },
      modal: { ondismiss: () => setBusy(false) },
    });
    rz.on("payment.failed", (r: any) => { toast.error(r?.error?.description || "Payment failed. You can try again."); key.current = crypto.randomUUID(); });
    rz.open();
  }
  async function pay() {
    setBusy(true);
    try {
      const r = await api("/api/payments", { body: { bookingId, method, idempotencyKey: key.current, simulateFailure: live ? undefined : fail } });
      if (r.requiresAction) { await openRazorpay(r.order); return; }
      toast.success("Payment received. Your ticket is ready."); setDone(true); reload(); }
    catch (e: any) { toast.error(e.message); key.current = crypto.randomUUID(); reload(); } finally { setBusy(false); }
  }
  async function cancel() {
    if (!(await confirm({ title: "Release your held seats?", body: "Your booking will be cancelled and the seats go back on sale.", confirmLabel: "Release seats", danger: true }))) return;
    try { await api(`/api/bookings/${bookingId}`, { method: "DELETE" }); toast.success("Booking released"); reload(); } catch (e: any) { toast.error(e.message); }
  }

  if (confirmed) return (
    <div className="space-y-6">
      <div className="flex items-center gap-3"><CheckCircle2 className="h-8 w-8 text-emerald-700" aria-hidden /><div><h1 className="text-3xl">You're booked</h1><p className="text-ink/70">A copy is saved under Tickets in your account.</p></div></div>
      <TicketCard bookingId={bookingId} />
      <Link href="/dashboard/tickets" className="inline-block text-sm text-terracotta underline">Go to my tickets</Link>
    </div>);
  if (b.status !== "pending") return (<div className="space-y-4"><h1 className="text-3xl">This booking is {b.status}</h1><p className="text-ink/70">{b.status === "expired" ? "The 10-minute payment hold ended and the seats were released." : "No payment is due."}</p><Link href={`/destinations/${x.slug}`} className="inline-block rounded-lg bg-forest px-4 py-2 text-ivory">Book again</Link></div>);

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
      {dialog}
      <div className="space-y-5">
        <h1 className="text-3xl">{t("pay.title")}</h1>
        {left !== null && <p role="timer" className={`flex items-center gap-2 text-sm ${left < 120 ? "text-red-700" : "text-ink/70"}`}><Timer className="h-4 w-4" aria-hidden />Seats held for {Math.floor(left / 60)}:{String(left % 60).padStart(2, "0")}</p>}
        <Card className="p-5">
          {!live && <fieldset><legend className="mb-3 font-medium">Payment method</legend>
            <div className="grid gap-2 sm:grid-cols-3">{METHODS.map((m) => <label key={m.id} className={`flex cursor-pointer items-center gap-2 rounded-lg border p-3 text-sm ${method === m.id ? "border-forest bg-forest-50 ring-1 ring-forest" : "border-forest/20"}`}><input type="radio" name="m" className="accent-forest" checked={method === m.id} onChange={() => setMethod(m.id)} /><m.icon className="h-4 w-4" aria-hidden />{m.label}</label>)}</div>
          </fieldset>}
          {live ? <p className="rounded-lg bg-forest-50 p-3 text-sm">You'll complete payment in Razorpay's secure window. HeritageHub never sees your card or bank details.</p> : <>
          <p className="mt-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">Test mode: this is a simulated gateway. No card or bank details are collected and no money moves.</p>
          <label className="mt-3 flex items-center gap-2 text-sm"><input type="checkbox" className="accent-terracotta" checked={fail} onChange={(e) => setFail(e.target.checked)} />Simulate a failed payment (to test retry)</label></>}
          {b.paymentStatus === "failed" && <p role="alert" className="mt-3 text-sm text-red-700">The last payment attempt failed. You can try again while your seats are held.</p>}
          <div className="mt-5 flex flex-wrap gap-2"><Button variant="accent" size="lg" loading={busy} disabled={left === 0} onClick={pay}>{t("pay.button")} {inr(b.totalMinor)}</Button><Button variant="outline" size="lg" onClick={cancel}>{t("pay.release")}</Button></div>
        </Card>
      </div>
      <Card className="h-fit p-5 text-sm">
        <h2 className="text-lg">{x.name}</h2>
        <p className="mt-1 text-ink/70">{fmtDate(b.date)}, {fmtTime(b.start)} to {fmtTime(b.end)}</p>
        <ul className="mt-3 space-y-1">{b.items.map((i: any) => <li key={i.name} className="flex justify-between gap-2"><span>{i.quantity} × {i.name}</span><span>{inr((i.unitPriceMinor + i.unitFeeMinor) * i.quantity)}</span></li>)}</ul>
        <div className="mt-3 space-y-1 border-t border-forest/15 pt-3"><div className="flex justify-between text-ink/70"><span>Convenience fee</span><span>{inr(b.feesMinor)}</span></div><div className="flex justify-between text-ink/70"><span>GST on fee</span><span>{inr(b.taxMinor)}</span></div><div className="flex justify-between text-base font-semibold"><span>Total</span><span>{inr(b.totalMinor)}</span></div></div>
        <p className="mt-3 text-xs text-ink/60">Reference {b.reference}</p>
      </Card>
    </div>
  );
}
