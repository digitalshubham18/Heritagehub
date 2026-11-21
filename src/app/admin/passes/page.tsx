"use client";
import { useState } from "react";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { api, useApi } from "@/lib/hooks";
import { Badge, Button, Card, Empty, ErrorState, Field, Input, Modal, PageSkeleton, Textarea } from "@/components/ui";
import { inr } from "@/lib/utils";

const blank = { name: "", description: "", destinations: [] as string[], validityDays: 3, price: 0, maxEntriesPerDay: 1 };
export default function AdminPasses() {
  const types = useApi<any>("/api/admin/pass-types");
  const sold = useApi<any>("/api/admin/passes");
  const [edit, setEdit] = useState<any>(null); const [busy, setBusy] = useState(false); const [errs, setErrs] = useState<any>({});
  const open = (t?: any) => { setErrs({}); setEdit(t ? { id: t._id, name: t.name, description: t.description || "", destinations: t.destinations.map(String), validityDays: t.validityDays, price: t.priceMinor / 100, maxEntriesPerDay: t.maxEntriesPerDay } : { ...blank }); };
  async function save() {
    setBusy(true); setErrs({});
    const body = { name: edit.name, description: edit.description || undefined, destinations: edit.destinations, validityDays: Number(edit.validityDays), priceMinor: Math.round(Number(edit.price) * 100), maxEntriesPerDay: Number(edit.maxEntriesPerDay) };
    try { if (edit.id) await api("/api/admin/pass-types", { method: "PATCH", body: { id: edit.id, ...body } }); else await api("/api/admin/pass-types", { body }); toast.success("Pass saved"); setEdit(null); types.reload(); }
    catch (e: any) { setErrs(e.issues || {}); toast.error(e.message); } finally { setBusy(false); }
  }
  async function toggle(t: any) { try { await api("/api/admin/pass-types", { method: "PATCH", body: { id: t._id, active: !t.active } }); toast.success(t.active ? "Pass withdrawn from sale" : "Pass on sale"); types.reload(); } catch (e: any) { toast.error(e.message); } }
  const dn = (id: string) => types.data?.destinations?.find((d: any) => d._id === String(id))?.name || "";
  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-3"><h1 className="text-3xl">Season passes</h1><Button onClick={() => open()}><Plus className="h-4 w-4" aria-hidden />New pass</Button></div>
      {types.error ? <ErrorState message={types.error} onRetry={types.reload} /> : types.loading ? <PageSkeleton /> : !types.data.items.length ? <Empty title="No passes yet">Create a pass that covers one or more of your sites.</Empty> : (
        <Card className="overflow-x-auto"><table className="w-full min-w-[720px] text-sm"><caption className="sr-only">Pass types</caption><thead className="bg-forest-50 text-left"><tr>{["Pass", "Sites", "Validity", "Per day", "Price", "Status", ""].map((h) => <th key={h} className="p-3 font-medium">{h}</th>)}</tr></thead>
          <tbody>{types.data.items.map((t: any) => <tr key={t._id} className="border-t border-forest/10"><td className="p-3 font-medium">{t.name}</td><td className="p-3 text-ink/80">{t.destinations.map(dn).join(", ")}</td><td className="p-3">{t.validityDays} days</td><td className="p-3">{t.maxEntriesPerDay}</td><td className="p-3">{inr(t.priceMinor)}</td><td className="p-3">{t.active ? <Badge className="bg-emerald-100 text-emerald-900">On sale</Badge> : <Badge className="bg-stone-200">Withdrawn</Badge>}</td><td className="space-x-1 p-3 text-right whitespace-nowrap"><Button size="sm" variant="outline" onClick={() => open(t)}>Edit</Button><Button size="sm" variant="ghost" onClick={() => toggle(t)}>{t.active ? "Withdraw" : "Put on sale"}</Button></td></tr>)}</tbody></table></Card>)}
      <section><h2 className="text-xl">Passes sold</h2>
        {sold.loading ? <PageSkeleton /> : !sold.data?.items?.length ? <p className="mt-3 text-sm text-ink/60">No passes sold yet.</p> : (
          <Card className="mt-3 overflow-x-auto"><table className="w-full min-w-[720px] text-sm"><caption className="sr-only">Passes sold</caption><thead className="bg-forest-50 text-left"><tr>{["Reference", "Holder", "Valid", "Sites", "Entries", "Paid", "Invoice"].map((h) => <th key={h} className="p-3 font-medium">{h}</th>)}</tr></thead>
            <tbody>{sold.data.items.map((p: any) => <tr key={p._id} className="border-t border-forest/10"><td className="p-3 font-mono text-xs">{p.reference}{p.inside && <Badge className="ml-2 bg-sky-100 text-sky-900">inside</Badge>}</td><td className="p-3">{p.holderName}</td><td className="p-3">{p.validFrom} to {p.validTo}</td><td className="p-3 text-ink/80">{p.destinationNames.join(", ")}</td><td className="p-3">{p.totalEntries}</td><td className="p-3">{inr(p.totalMinor)}</td><td className="p-3 font-mono text-xs">{p.invoiceNo}</td></tr>)}</tbody></table></Card>)}</section>
      <Modal open={!!edit} onClose={() => setEdit(null)} title={edit?.id ? "Edit pass" : "New season pass"}>{edit && <div className="space-y-3">
        <Field label="Name" error={errs.name?.[0]}><Input value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></Field>
        <Field label="Description (shown to visitors)"><Textarea value={edit.description} onChange={(e) => setEdit({ ...edit, description: e.target.value })} maxLength={400} /></Field>
        <fieldset><legend className="mb-1 text-sm font-medium">Covers these sites</legend>{errs.destinations && <p role="alert" className="text-xs text-red-700">{errs.destinations[0]}</p>}<div className="max-h-40 space-y-1 overflow-y-auto">{types.data?.destinations?.map((d: any) => <label key={d._id} className="flex items-center gap-2 text-sm"><input type="checkbox" className="accent-forest" checked={edit.destinations.includes(d._id)} onChange={(e) => setEdit({ ...edit, destinations: e.target.checked ? [...edit.destinations, d._id] : edit.destinations.filter((x: string) => x !== d._id) })} />{d.name}</label>)}</div></fieldset>
        <div className="grid gap-3 sm:grid-cols-3"><Field label="Valid for (days)"><Input type="number" min={1} value={edit.validityDays} onChange={(e) => setEdit({ ...edit, validityDays: e.target.value })} /></Field><Field label="Price (₹)"><Input type="number" min={0} value={edit.price} onChange={(e) => setEdit({ ...edit, price: e.target.value })} /></Field><Field label="Entries/site/day"><Input type="number" min={1} max={20} value={edit.maxEntriesPerDay} onChange={(e) => setEdit({ ...edit, maxEntriesPerDay: e.target.value })} /></Field></div>
        <div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setEdit(null)}>Cancel</Button><Button loading={busy} onClick={save}>Save pass</Button></div></div>}</Modal>
    </div>
  );
}
