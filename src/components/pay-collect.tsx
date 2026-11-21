"use client";
import { Banknote, CreditCard, ExternalLink, Smartphone } from "lucide-react";
import { Field, Input, Select } from "./ui";
import { useTx } from "@/lib/i18n";
import { cn, inr } from "@/lib/utils";

export type PayMethod = "cash" | "upi" | "card";
export type PayValue = { method: PayMethod; upiRef: string; tendered: string; card: { network: string; type: string; last4: string; authCode: string; rrn: string } };
export const emptyPay = (): PayValue => ({ method: "cash", upiRef: "", tendered: "", card: { network: "visa", type: "debit", last4: "", authCode: "", rrn: "" } });
const METHODS = [{ id: "cash", label: "Cash", icon: Banknote }, { id: "upi", label: "UPI", icon: Smartphone }, { id: "card", label: "Card", icon: CreditCard }] as const;
const toMinor = (rupees: string) => Math.round(Number(rupees || 0) * 100);

/** The `details` object the API expects, for the chosen method. */
export function payDetails(v: PayValue) {
  if (v.method === "card") return { card: { ...v.card, rrn: v.card.rrn || undefined } };
  if (v.method === "upi") return v.upiRef ? { upiRef: v.upiRef } : {};
  return v.tendered ? { tenderedMinor: toMinor(v.tendered) } : {};
}
/** Why the "payment received" button should stay disabled, or null when the details are complete. */
export function payProblem(v: PayValue, dueMinor: number): string | null {
  if (dueMinor <= 0) return null;
  if (v.method === "card") { if (!/^\d{4}$/.test(v.card.last4)) return "Enter the last 4 card digits"; if (!/^[A-Za-z0-9]{4,12}$/.test(v.card.authCode)) return "Enter the approval code from the POS slip"; if (v.card.rrn && !/^\d{6,14}$/.test(v.card.rrn)) return "RRN should be 6 to 14 digits"; }
  if (v.method === "cash" && v.tendered && toMinor(v.tendered) < dueMinor) return "Cash received is less than the amount due";
  if (v.method === "upi" && v.upiRef && !/^[A-Za-z0-9]{4,22}$/.test(v.upiRef)) return "UPI reference should be 4 to 22 letters or digits";
  return null;
}

export type UpiQr = { qr: string; uri: string; payee: { vpa: string; name: string }; demo: boolean } | null;

/** Cash (tender and change), UPI (QR for the exact amount) and card (POS slip details). The app records payments; it does not process them. */
export function PaymentCollector({ amountMinor, value, onChange, upi, upiLoading, idPrefix = "pc" }: { amountMinor: number; value: PayValue; onChange: (v: PayValue) => void; upi?: UpiQr; upiLoading?: boolean; idPrefix?: string }) {
  const tx = useTx();
  const set = (p: Partial<PayValue>) => onChange({ ...value, ...p });
  const setCard = (p: Partial<PayValue["card"]>) => onChange({ ...value, card: { ...value.card, ...p } });
  const tendered = toMinor(value.tendered), change = Math.max(0, tendered - amountMinor);
  return (
    <fieldset className="space-y-3">
      <legend className="mb-2 text-sm font-medium">{tx("How is the visitor paying?")}</legend>
      <div role="radiogroup" className="grid grid-cols-3 gap-2">{METHODS.map((m) => <label key={m.id} className={cn("flex cursor-pointer items-center justify-center gap-2 rounded-lg border p-3 text-sm", value.method === m.id ? "border-forest bg-forest-50 ring-1 ring-forest" : "border-forest/20")}><input type="radio" name={`${idPrefix}-m`} className="sr-only" checked={value.method === m.id} onChange={() => set({ method: m.id })} /><m.icon className="h-4 w-4" aria-hidden />{m.label}</label>)}</div>

      {value.method === "cash" && <div className="space-y-2 rounded-xl bg-ivory-100 p-3">
        <p className="text-sm">{tx("Collect")} <strong className="font-display text-xl">{inr(amountMinor)}</strong> {tx("in cash.")}</p>
        <Field label={tx("Cash received (optional)")} hint={tx("Enter what the visitor hands over to see the change to return")}><Input inputMode="decimal" value={value.tendered} onChange={(e) => set({ tendered: e.target.value.replace(/[^\d.]/g, "") })} placeholder={(amountMinor / 100).toFixed(0)} /></Field>
        <div className="flex flex-wrap gap-1.5">{[amountMinor, 10000, 20000, 50000, 200000].filter((x, i, a) => x >= amountMinor && a.indexOf(x) === i).slice(0, 4).map((x) => <button key={x} type="button" onClick={() => set({ tendered: String(x / 100) })} className="rounded-full border border-forest/25 px-2.5 py-1 text-xs hover:bg-forest-50">{x === amountMinor ? "Exact" : inr(x)}</button>)}</div>
        {tendered > 0 && <p aria-live="polite" className={cn("rounded-lg p-2 text-sm font-medium", tendered < amountMinor ? "bg-red-50 text-red-900" : "bg-emerald-50 text-emerald-900")}>{tendered < amountMinor ? `Short by ${inr(amountMinor - tendered)}` : `Return change: ${inr(change)}`}</p>}
      </div>}

      {value.method === "upi" && <div className="space-y-3 rounded-xl bg-ivory-100 p-3 text-center">
        <p className="text-sm">{tx("Ask the visitor to scan this QR with any UPI app and pay exactly")} <strong className="font-display text-xl">{inr(amountMinor)}</strong>.</p>
        {upiLoading || !upi ? <div className="skeleton mx-auto h-56 w-56 rounded-xl" aria-label={tx("Preparing QR")} /> : <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={upi.qr} alt={`UPI QR code for ${inr(amountMinor)}`} className="mx-auto h-56 w-56 rounded-xl border border-forest/15 bg-white p-2" />
          <p className="text-xs text-ink/70">{tx("Paying to")} <strong>{upi.payee.name}</strong> ({upi.payee.vpa})</p>
          <a href={upi.uri} className="inline-flex items-center gap-1 text-xs text-terracotta underline"><ExternalLink className="h-3 w-3" aria-hidden />{tx("Open in a UPI app on this device")}</a>
          {upi.demo && <p role="note" className="rounded-lg bg-amber-50 p-2 text-xs text-amber-900">{tx("Demo payee shown. The operator has not set a UPI ID yet (Parking, then Payments), so this QR will not reach a real account.")}</p>}
        </>}
        <Field label={tx("UPI reference / UTR (optional)")} hint={tx("From the visitor's success screen or your SMS. Helps reconciliation.")}><Input value={value.upiRef} onChange={(e) => set({ upiRef: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "") })} autoComplete="off" /></Field>
        <p className="text-xs text-ink/65">{tx("Only tap Payment received after the money shows in your UPI app, soundbox or SMS. The app cannot confirm a UPI payment by itself.")}</p>
      </div>}

      {value.method === "card" && <div className="space-y-3 rounded-xl bg-ivory-100 p-3">
        <p className="text-sm">{tx("Charge")} <strong className="font-display text-xl">{inr(amountMinor)}</strong> {tx("on your card terminal, then copy these details from the slip.")}</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={tx("Card network")}><Select value={value.card.network} onChange={(e) => setCard({ network: e.target.value })}><option value="visa">Visa</option><option value="mastercard">Mastercard</option><option value="rupay">RuPay</option><option value="amex">American Express</option><option value="other">{tx("Other")}</option></Select></Field>
          <Field label={tx("Card type")}><Select value={value.card.type} onChange={(e) => setCard({ type: e.target.value })}><option value="debit">{tx("Debit")}</option><option value="credit">{tx("Credit")}</option></Select></Field>
          <Field label={tx("Last 4 digits")}><Input inputMode="numeric" maxLength={4} value={value.card.last4} onChange={(e) => setCard({ last4: e.target.value.replace(/\D/g, "") })} autoComplete="off" /></Field>
          <Field label={tx("Approval code")}><Input maxLength={12} value={value.card.authCode} onChange={(e) => setCard({ authCode: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "") })} autoComplete="off" /></Field>
          <Field label={tx("RRN (optional)")} className="sm:col-span-2"><Input inputMode="numeric" maxLength={14} value={value.card.rrn} onChange={(e) => setCard({ rrn: e.target.value.replace(/\D/g, "") })} autoComplete="off" /></Field>
        </div>
        <p className="text-xs text-ink/65">{tx("Never type the full card number, expiry or CVV here. We only store the last 4 digits and the approval code.")}</p>
      </div>}
    </fieldset>
  );
}
