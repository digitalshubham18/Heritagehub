"use client";
import { useState } from "react";
import { toast } from "sonner";
import { api } from "@/lib/hooks";
import { useI18n } from "@/lib/i18n";
import { Button, Field, Input, Modal } from "@/components/ui";

/** Offer tickets to another HeritageHub visitor. They must accept within 48 hours; on acceptance the QR code is replaced, so your copy stops working. */
export function TransferDialog({ booking, open, onClose, onDone }: { booking: any; open: boolean; onClose: () => void; onDone: () => void }) {
  const { t: tr } = useI18n();
  const [email, setEmail] = useState(""), [msg, setMsg] = useState(""), [busy, setBusy] = useState(false);
  const [names, setNames] = useState<string[]>(() => Array.from({ length: booking.quantity }, () => ""));
  async function send() {
    setBusy(true);
    try { await api("/api/transfers", { body: { bookingId: booking._id, toEmail: email, visitors: names.map((name) => ({ name })), message: msg || undefined } }); toast.success(tr("xf.ok")); onDone(); onClose(); }
    catch (e: any) { toast.error(e.issues?.[0]?.message || e.message); } finally { setBusy(false); }
  }
  return (
    <Modal open={open} onClose={onClose} title={tr("xf.dlg")}>
      <div className="space-y-3">
        <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-950">{tr("xf.warn")}</p>
        <Field label={tr("xf.email")} hint={tr("xf.emailhint")}><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="off" /></Field>
        <fieldset><legend className="mb-1 text-sm font-medium">{tr("xf.who")}</legend><div className="space-y-2">{names.map((n, i) => <Input key={i} aria-label={tr("xf.visitor", { n: i + 1 })} placeholder={tr("xf.visitor", { n: i + 1 })} value={n} onChange={(e) => setNames(names.map((x, j) => (j === i ? e.target.value : x)))} />)}</div></fieldset>
        <Field label={tr("xf.msg")}><Input value={msg} maxLength={200} onChange={(e) => setMsg(e.target.value)} /></Field>
        <div className="flex justify-end gap-2"><Button variant="outline" onClick={onClose}>{tr("xf.cancel")}</Button><Button loading={busy} disabled={!/^\S+@\S+\.\S+$/.test(email) || names.some((n) => n.trim().length < 2)} onClick={send}>{tr("xf.sendoffer")}</Button></div>
      </div>
    </Modal>
  );
}
