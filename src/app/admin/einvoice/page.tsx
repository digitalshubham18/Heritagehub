"use client";
import { useState } from "react";
import { toast } from "sonner";
import { api, useApi } from "@/lib/hooks";
import { Badge, Button, Card, Empty, ErrorState, Field, Input, PageSkeleton } from "@/components/ui";

const TONE: Record<string, string> = { pending: "bg-amber-100 text-amber-900", exported: "bg-sky-100 text-sky-900", registered: "bg-emerald-100 text-emerald-900" };
export default function EInvoice() {
  const { data, error, loading, reload } = useApi<any>("/api/admin/einvoice");
  const [sel, setSel] = useState<Record<string, boolean>>({}), [busy, setBusy] = useState(false);
  const [reg, setReg] = useState<{ id: string; type: string; irn: string; ackNo: string; ackDate: string } | null>(null);
  if (loading) return <PageSkeleton />;
  if (error) return <ErrorState message={error} onRetry={reload} />;
  const rows: any[] = data.rows, key = (r: any) => `${r.id}:${r.type}`;
  async function exportSel() {
    setBusy(true);
    try {
      const items = rows.filter((r) => sel[key(r)]).map((r) => ({ id: r.id, type: r.type }));
      const res = await fetch("/api/admin/einvoice", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "export", items }) });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Export failed");
      const skipped = Number(res.headers.get("X-Skipped") || 0);
      const url = URL.createObjectURL(await res.blob()); const a = document.createElement("a"); a.href = url; a.download = "einvoice-batch.json"; a.click(); URL.revokeObjectURL(url);
      toast.success(skipped ? `Downloaded. ${skipped} not ready were left out.` : "Downloaded"); setSel({}); reload();
    } catch (e: any) { toast.error(e.message); } finally { setBusy(false); }
  }
  async function save() {
    if (!reg) return; setBusy(true);
    try { await api("/api/admin/einvoice", { body: { action: "register", ...reg } }); toast.success("IRN recorded"); setReg(null); reload(); } catch (e: any) { toast.error(e.message); } finally { setBusy(false); }
  }
  return (
    <div className="space-y-5">
      <h1 className="text-3xl">E-invoices (IRN)</h1>
      <Card className="space-y-2 bg-amber-50 p-4 text-sm text-amber-950">
        <p><strong>Confirm with your accountant first.</strong> Only invoices to GST-registered businesses need an IRN, and only if your turnover is above the current e-invoicing threshold. Ordinary visitors never appear here.</p>
        <p>This page prepares the government's invoice file for upload to the Invoice Registration Portal (or your GSP's bulk upload) and keeps the IRN you get back. It does not connect to the portal. Try the first file in the portal's sandbox.</p>
        {!data.enabled && <p>Status: <strong>not switched on</strong>. Set <code>EINVOICE_ENABLED=true</code> once your accountant confirms it applies; until then the buyer's GST details are still collected and stored.</p>}
        {data.sellerSetup.length > 0 && <p>Seller details missing: {data.sellerSetup.join("; ")}.</p>}
      </Card>
      <div className="flex gap-3"><Button onClick={exportSel} loading={busy} disabled={!Object.values(sel).some(Boolean)}>Download selected (JSON)</Button></div>
      {rows.length === 0 ? <Empty title="No business invoices yet">When a buyer enters a GSTIN at checkout, their invoice appears here.</Empty> : (
        <Card className="overflow-x-auto"><table className="w-full min-w-[900px] text-sm"><caption className="sr-only">Business invoices and credit notes</caption>
          <thead className="text-left text-xs uppercase text-ink/60"><tr><th className="p-3"><span className="sr-only">Select</span></th><th>Document</th><th>Date</th><th>Buyer</th><th>Status</th><th>Notes</th><th /></tr></thead>
          <tbody className="divide-y divide-forest/10">{rows.map((r) => (
            <tr key={key(r)}>
              <td className="p-3"><input type="checkbox" aria-label={`Select ${r.docNo}`} disabled={r.status === "registered" || r.issues.length > 0} checked={!!sel[key(r)]} onChange={(e) => setSel({ ...sel, [key(r)]: e.target.checked })} /></td>
              <td><span className="font-mono text-xs">{r.docNo}</span><br /><span className="text-xs text-ink/60">{r.type === "INV" ? "Invoice" : "Credit note"} · {r.reference}</span></td>
              <td>{new Date(r.date).toLocaleDateString("en-IN")}</td><td>{r.buyer}<br /><span className="font-mono text-xs text-ink/60">{r.gstin}</span></td>
              <td><Badge className={TONE[r.status]}>{r.status}</Badge></td>
              <td className="max-w-xs text-xs text-ink/70">{r.status === "registered" ? <span className="font-mono break-all">IRN {r.irn?.slice(0, 16)}… Ack {r.ackNo}</span> : r.issues.join("; ") || "Ready"}</td>
              <td className="p-3 text-right">{r.status !== "registered" && <button className="text-xs text-terracotta underline" onClick={() => setReg({ id: r.id, type: r.type, irn: "", ackNo: "", ackDate: new Date().toISOString().slice(0, 10) })}>Enter IRN</button>}</td>
            </tr>))}</tbody></table></Card>
      )}
      {reg && (
        <Card className="space-y-3 p-4"><h2 className="text-lg">Record the IRN from the portal</h2>
          <Field label="IRN (64 characters)"><Input value={reg.irn} onChange={(e) => setReg({ ...reg, irn: e.target.value })} className="font-mono" /></Field>
          <div className="flex flex-wrap gap-3"><Field label="Ack no."><Input value={reg.ackNo} onChange={(e) => setReg({ ...reg, ackNo: e.target.value })} className="w-48" /></Field><Field label="Ack date"><Input type="date" value={reg.ackDate} onChange={(e) => setReg({ ...reg, ackDate: e.target.value })} /></Field></div>
          <div className="flex gap-2"><Button onClick={save} loading={busy}>Save</Button><Button variant="ghost" onClick={() => setReg(null)}>Cancel</Button></div></Card>
      )}
    </div>
  );
}
