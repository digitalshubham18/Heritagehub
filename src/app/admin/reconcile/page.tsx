"use client";
import { useState } from "react";
import { toast } from "sonner";
import { api, useApi } from "@/lib/hooks";
import { Badge, Button, Card, Empty, ErrorState, Field, Input, Stat } from "@/components/ui";

const inr = (m: number) => "₹" + (m / 100).toLocaleString("en-IN", { minimumFractionDigits: m % 100 ? 2 : 0 });
const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());
const daysAgo = (n: number) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date(Date.now() - n * 86400000));
const LABEL: Record<string, string> = { unmatched_recorded: "Not on statement", amount_mismatch: "Amount differs", unmatched_bank: "Not recorded by staff", matched: "Matched" };
const TONE: Record<string, string> = { unmatched_recorded: "bg-red-100 text-red-900", amount_mismatch: "bg-amber-100 text-amber-900", unmatched_bank: "bg-sky-100 text-sky-900", matched: "bg-emerald-100 text-emerald-900" };

export default function Reconcile() {
  const [from, setFrom] = useState(daysAgo(7)), [to, setTo] = useState(today());
  const [file, setFile] = useState<{ name: string; text: string } | null>(null), [busy, setBusy] = useState(false), [err, setErr] = useState("");
  const [run, setRun] = useState<any>(null), [show, setShow] = useState("problems");
  const runs = useApi<any>("/api/admin/reconcile");

  async function pick(f?: File) { if (!f) return; if (f.size > 2_500_000) return setErr("That file is too large. Export one month at a time."); setFile({ name: f.name, text: await f.text() }); setErr(""); }
  async function go() {
    if (!file) return; setBusy(true); setErr("");
    try { const r = await api("/api/admin/reconcile", { body: { csv: file.text, fileName: file.name, from, to } }); setRun({ id: r.id, totals: r.totals, items: r.items, from, to }); runs.reload(); }
    catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  }
  async function open(id: string) { try { const r = await api(`/api/admin/reconcile?id=${id}`); setRun({ id, totals: r.run.totals, items: r.run.items, from: r.run.from, to: r.run.to }); } catch (e: any) { toast.error(e.message); } }
  async function resolve(it: any) {
    const note = it.resolved ? "" : window.prompt("What happened? (for example: customer paid cash, UPI tapped by mistake)") ;
    if (note === null) return;
    try { await api("/api/admin/reconcile", { method: "PATCH", body: { runId: run.id, itemId: it._id, resolved: !it.resolved, note: note || undefined } }); setRun({ ...run, items: run.items.map((x: any) => (x._id === it._id ? { ...x, resolved: !it.resolved, note: note || "" } : x)) }); } catch (e: any) { toast.error(e.message); }
  }
  async function del(id: string) { if (!window.confirm("Delete this run and the statement lines stored with it?")) return; await api(`/api/admin/reconcile?id=${id}`, { method: "DELETE" }); if (run?.id === id) setRun(null); runs.reload(); }

  const t = run?.totals;
  const items: any[] = (run?.items || []).filter((i: any) => (show === "all" ? true : show === "problems" ? i.kind !== "matched" : i.kind === show));
  return (
    <div className="space-y-5">
      <h1 className="text-3xl">UPI reconciliation</h1>
      <p className="max-w-3xl text-sm text-ink/75">Staff tap "UPI received" when a visitor pays, but the app cannot see your bank. Upload your bank statement (CSV from net banking) and we compare it with what staff recorded, so a payment confirmed by mistake shows up. Statements are read only for credits; nothing is sent anywhere else.</p>
      <Card className="space-y-4 p-5">
        <div className="flex flex-wrap items-end gap-3">
          <Field label="From"><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
          <Field label="To"><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></Field>
          <Field label="Bank statement (CSV)"><input type="file" accept=".csv,text/csv,.txt" onChange={(e) => pick(e.target.files?.[0])} className="block text-sm" /></Field>
          <Button onClick={go} loading={busy} disabled={!file}>Compare</Button>
        </div>
        {err && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">{err}</p>}
        <p className="text-xs text-ink/60">Up to 31 days at a time. Use the statement of the account your UPI QR pays into.</p>
      </Card>

      {t && (
        <section className="space-y-4" aria-label="Result">
          <div className="grid gap-3 sm:grid-cols-4">
            <Stat label="Recorded by staff" value={t.recorded} sub={inr(t.recordedMinor)} />
            <Stat label="Matched" value={t.matched} sub={t.matchedWeak ? `${t.matchedWeak} by amount and day only` : inr(t.matchedMinor)} />
            <Stat label="Not on the statement" value={t.unmatchedRecorded + t.mismatch} sub={inr(t.unmatchedRecordedMinor)} tone={t.unmatchedRecorded + t.mismatch ? "warn" : undefined} />
            <Stat label="Bank credits unaccounted" value={t.unmatchedBank} sub={inr(t.unmatchedBankMinor)} />
          </div>
          {t.byStaff?.length > 0 && (
            <Card className="p-4"><h2 className="text-lg">By staff member</h2><ul className="mt-2 divide-y divide-forest/10 text-sm">{t.byStaff.map((s: any) => <li key={s.staffName} className="flex justify-between py-1.5"><span>{s.staffName}</span><span>{s.unmatched} of {s.recorded} not found · {inr(s.unmatchedMinor)}</span></li>)}</ul></Card>
          )}
          <p className="max-w-3xl text-xs text-ink/65">Matches "by amount and day only" cannot tell which of two equal payments is missing, so check the staff members above rather than one ticket. A payment can also be genuinely missing from a statement that hasn't posted yet: re-run after the next working day. Bank credits that staff never recorded are often online or other receipts; they are listed for your information.</p>
          <div className="flex flex-wrap items-center gap-3">
            {[["problems", "Needs a look"], ["unmatched_recorded", "Not on statement"], ["amount_mismatch", "Amount differs"], ["unmatched_bank", "Not recorded"], ["all", "Everything"]].map(([k, l]) => <button key={k} onClick={() => setShow(k)} className={`rounded-full px-3 py-1 text-sm ${show === k ? "bg-forest text-ivory" : "bg-forest/10"}`}>{l}</button>)}
            <a className="ml-auto text-sm text-terracotta underline" href={`/api/admin/reconcile?id=${run.id}&format=csv`}>Download exceptions (CSV)</a>
          </div>
          {items.length === 0 ? <Empty title="Nothing to show">{show === "problems" ? "Every UPI payment staff recorded was found on the statement." : "No rows in this view."}</Empty> : (
            <Card className="overflow-x-auto"><table className="w-full min-w-[820px] text-sm"><caption className="sr-only">Reconciliation results</caption>
              <thead className="text-left text-xs uppercase text-ink/60"><tr><th className="p-3">Result</th><th>Site / staff</th><th>Reference</th><th className="text-right">Amount</th><th className="pl-4">Detail</th><th /></tr></thead>
              <tbody className="divide-y divide-forest/10">{items.map((i: any, n: number) => (
                <tr key={i._id || n} className={i.resolved ? "opacity-60" : ""}>
                  <td className="p-3"><Badge className={TONE[i.kind]}>{LABEL[i.kind]}</Badge></td>
                  <td>{i.destinationName || "—"}<br /><span className="text-xs text-ink/60">{i.staffName || ""}</span></td>
                  <td className="font-mono text-xs">{i.ref || "—"}<br /><span className="font-sans text-ink/60">{i.at ? new Date(i.at).toLocaleString("en-IN") : i.bankDate}</span></td>
                  <td className="text-right">{inr(i.amountMinor)}</td>
                  <td className="pl-4 text-xs text-ink/75">{i.match}{i.bankLine ? <><br />{i.bankLine}</> : null}{i.note ? <><br /><em>Note: {i.note}</em></> : null}</td>
                  <td className="p-3 text-right">{i.kind !== "matched" && i._id && <button className="text-xs text-terracotta underline" onClick={() => resolve(i)}>{i.resolved ? "Reopen" : "Explain"}</button>}</td>
                </tr>))}</tbody></table></Card>
          )}
        </section>
      )}

      <Card className="p-4"><h2 className="text-lg">Earlier runs</h2>
        {runs.error ? <ErrorState message={runs.error} onRetry={runs.reload} /> : !runs.data?.runs?.length ? <p className="mt-2 text-sm text-ink/60">None yet.</p> : (
          <ul className="mt-2 divide-y divide-forest/10 text-sm">{runs.data.runs.map((r: any) => <li key={r._id} className="flex flex-wrap items-center justify-between gap-2 py-2"><span>{r.from} to {r.to} · {r.totals?.unmatchedRecorded ?? 0} not found of {r.totals?.recorded ?? 0} <span className="text-ink/60">· {r.byName}</span></span><span className="flex gap-3"><button className="text-terracotta underline" onClick={() => open(r._id)}>Open</button><button className="text-ink/60 underline" onClick={() => del(r._id)}>Delete</button></span></li>)}</ul>)}
      </Card>
    </div>
  );
}
