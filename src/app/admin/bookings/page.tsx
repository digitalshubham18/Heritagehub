"use client";
import { useState } from "react";
import { toast } from "sonner";
import { api, useApi } from "@/lib/hooks";
import { Button, Card, Empty, ErrorState, Field, Input, Modal, PageSkeleton, Select, StatusBadge, useConfirm } from "@/components/ui";
import { fmtTime, inr } from "@/lib/utils";

export default function AdminBookings() {
  const [f, setF] = useState({ q: "", status: "", date: "", destination: "" });
  const qs = new URLSearchParams(Object.entries(f).filter(([, v]) => v) as [string, string][]).toString();
  const { data, loading, error, reload } = useApi<any>(`/api/bookings?${qs}`);
  const dests = useApi<any>("/api/destinations?all=1");
  const [view, setView] = useState<any>(null);
  const { confirm, dialog } = useConfirm();
  async function show(id: string) { try { setView(await api(`/api/bookings/${id}`)); } catch (e: any) { toast.error(e.message); } }
  async function cancel(b: any) {
    if (!(await confirm({ title: `Cancel ${b.reference}?`, body: "Administrator cancellations refund the full amount in test mode and release the seats.", confirmLabel: "Cancel and refund", danger: true }))) return;
    try { await api(`/api/bookings/${b._id}`, { method: "DELETE" }); toast.success("Booking cancelled"); setView(null); reload(); } catch (e: any) { toast.error(e.message); }
  }
  return (
    <div className="space-y-5">{dialog}
      <h1 className="text-3xl">Bookings</h1>
      <Card className="grid gap-3 p-4 sm:grid-cols-4">
        <Field label="Search"><Input placeholder="Reference, name or email" value={f.q} onChange={(e) => setF({ ...f, q: e.target.value })} /></Field>
        <Field label="Destination"><Select value={f.destination} onChange={(e) => setF({ ...f, destination: e.target.value })}><option value="">All</option>{dests.data?.items?.map((d: any) => <option key={d._id} value={d._id}>{d.name}</option>)}</Select></Field>
        <Field label="Status"><Select value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })}><option value="">All</option>{["pending", "confirmed", "completed", "cancelled", "expired"].map((s) => <option key={s}>{s}</option>)}</Select></Field>
        <Field label="Visit date"><Input type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></Field>
      </Card>
      {error ? <ErrorState message={error} onRetry={reload} /> : loading ? <PageSkeleton /> : !data.items.length ? <Empty title="No bookings match">Change the filters to see more.</Empty> : (
        <Card className="overflow-x-auto"><table className="w-full min-w-[820px] text-sm"><thead className="bg-forest-50 text-left"><tr>{["Reference", "Destination", "Visit", "Tickets", "Total", "Status", "Payment", ""].map((h) => <th key={h} className="p-3 font-medium">{h}</th>)}</tr></thead>
          <tbody>{data.items.map((b: any) => <tr key={b._id} className="border-t border-forest/10"><td className="p-3 font-mono text-xs">{b.reference}</td><td className="p-3">{b.destinationInfo?.name}</td><td className="p-3">{b.date}<br /><span className="text-xs text-ink/60">{fmtTime(b.start)}</span></td><td className="p-3">{b.quantity}</td><td className="p-3">{inr(b.totalMinor)}</td><td className="p-3"><StatusBadge s={b.status} /></td><td className="p-3"><StatusBadge s={b.paymentStatus} /></td><td className="p-3 text-right"><Button size="sm" variant="outline" onClick={() => show(b._id)}>Details</Button></td></tr>)}</tbody></table></Card>)}
      <Modal wide open={!!view} onClose={() => setView(null)} title={view ? `Booking ${view.booking.reference}` : ""}>
        {view && <div className="space-y-4 text-sm">
          <div className="grid gap-3 sm:grid-cols-2"><p><span className="text-ink/60">Contact:</span> {view.booking.contact?.name}, {view.booking.contact?.email}, {view.booking.contact?.phone}</p><p><span className="text-ink/60">Visitors:</span> {view.booking.visitors.map((v: any) => v.name).join(", ")}</p><p><span className="text-ink/60">Items:</span> {view.booking.items.map((i: any) => `${i.quantity} × ${i.name}`).join("; ")}</p><p><span className="text-ink/60">Refunded:</span> {inr(view.booking.refundMinor || 0)}</p><p><span className="text-ink/60">Channel:</span> {view.booking.channel === "counter" ? "Counter sale" : "Online"}</p><p><span className="text-ink/60">Invoice:</span> {view.booking.invoiceNo ? <a className="text-terracotta underline" href={`/invoice/${view.booking._id}`} target="_blank" rel="noreferrer">{view.booking.invoiceNo}</a> : "none yet"}</p></div>
          <div><h3 className="text-base">Payments</h3>{view.payments.length ? <ul className="mt-1 space-y-1">{view.payments.map((p: any) => <li key={p._id}>{p.type} {inr(p.amountMinor)}, {p.status}{p.failureReason ? ` (${p.failureReason})` : ""} <span className="text-xs text-ink/60">{p.providerRef}</span></li>)}</ul> : <p className="text-ink/60">None</p>}</div>
          <div><h3 className="text-base">Audit trail</h3><ol className="mt-1 space-y-1">{view.booking.history.map((h: any, i: number) => <li key={i} className="text-xs"><span className="text-ink/60">{new Date(h.at).toLocaleString("en-IN")}</span> {h.event}{h.note ? `: ${h.note}` : ""}</li>)}</ol></div>
          {view.booking.status === "confirmed" && !view.booking.checkedInAt && <Button variant="danger" onClick={() => cancel(view.booking)}>Cancel booking</Button>}
        </div>}
      </Modal>
    </div>
  );
}
