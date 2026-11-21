"use client";
import { useState } from "react";
import { toast } from "sonner";
import { Building2, Plus } from "lucide-react";
import { api, useApi } from "@/lib/hooks";
import { Badge, Button, Card, Empty, ErrorState, Field, Input, PasswordInput, Modal, PageSkeleton } from "@/components/ui";

export default function Operators() {
  const { data, loading, error, reload } = useApi<any>("/api/admin/operators");
  const [open, setOpen] = useState(false); const [busy, setBusy] = useState(false); const [errs, setErrs] = useState<any>({});
  const [f, setF] = useState({ name: "", gstin: "", commissionPct: 2, mName: "", mEmail: "", mPassword: "" });
  async function create() {
    setBusy(true); setErrs({});
    try { await api("/api/admin/operators", { body: { name: f.name, gstin: f.gstin || undefined, commissionPct: Number(f.commissionPct), manager: f.mEmail ? { name: f.mName, email: f.mEmail, password: f.mPassword } : undefined } }); toast.success("Operator created"); setOpen(false); setF({ name: "", gstin: "", commissionPct: 2, mName: "", mEmail: "", mPassword: "" }); reload(); }
    catch (e: any) { setErrs(e.issues || {}); toast.error(e.message); } finally { setBusy(false); }
  }
  async function patch(id: string, body: any) { try { await api("/api/admin/operators", { method: "PATCH", body: { id, ...body } }); toast.success("Saved"); reload(); } catch (e: any) { toast.error(e.message); } }
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3"><div><h1 className="text-3xl">Operators</h1><p className="mt-1 text-sm text-ink/70">Organisations that run one or more sites. Each manager only sees their own operator's data.</p></div><Button onClick={() => setOpen(true)}><Plus className="h-4 w-4" aria-hidden />Onboard operator</Button></div>
      {error ? <ErrorState message={error} onRetry={reload} /> : loading ? <PageSkeleton /> : !data.items.length ? <Empty title="No operators yet" /> : (
        <div className="grid gap-5 lg:grid-cols-2">{data.items.map((o: any) => (
          <Card key={o._id} className="p-6"><div className="flex items-start justify-between gap-3"><div className="flex items-center gap-3"><span className="flex h-11 w-11 items-center justify-center rounded-full bg-forest-50 text-forest"><Building2 className="h-5 w-5" aria-hidden /></span><div><h2 className="text-xl leading-tight">{o.name}</h2><p className="text-xs text-ink/60">{o.gstin ? `GSTIN ${o.gstin}` : "No GSTIN on file"}</p></div></div>{o.active ? <Badge className="bg-emerald-100 text-emerald-900">Active</Badge> : <Badge className="bg-stone-200">Suspended</Badge>}</div>
            <dl className="mt-4 grid grid-cols-3 gap-3 text-sm"><div><dt className="text-ink/60">Sites</dt><dd className="font-display text-2xl">{o.destinations.length}</dd></div><div><dt className="text-ink/60">Managers</dt><dd className="font-display text-2xl">{o.managers}</dd></div><div><dt className="text-ink/60">Staff</dt><dd className="font-display text-2xl">{o.staff}</dd></div></dl>
            <p className="mt-4 text-sm text-ink/80">{o.destinations.length ? o.destinations.map((d: any) => d.name).join(", ") : "No destinations assigned yet. Assign them when editing a destination."}</p>
            <div className="mt-4 flex flex-wrap items-end gap-3 border-t border-forest/10 pt-4"><Field label="Commission %" className="w-28"><Input type="number" min={0} max={100} step={0.5} defaultValue={o.commissionPct} onBlur={(e) => Number(e.target.value) !== o.commissionPct && patch(o._id, { commissionPct: Number(e.target.value) })} /></Field>
              <Button size="sm" variant="ghost" onClick={() => patch(o._id, { active: !o.active })}>{o.active ? "Suspend" : "Reactivate"}</Button></div></Card>))}</div>)}
      <Modal open={open} onClose={() => setOpen(false)} title="Onboard an operator"><div className="space-y-3">
        <Field label="Operator name" error={errs.name?.[0]}><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
        <div className="grid gap-3 sm:grid-cols-2"><Field label="GSTIN (optional)"><Input value={f.gstin} onChange={(e) => setF({ ...f, gstin: e.target.value })} /></Field><Field label="Platform commission %" hint="On net online ticket value"><Input type="number" min={0} max={100} step={0.5} value={f.commissionPct} onChange={(e) => setF({ ...f, commissionPct: e.target.value as any })} /></Field></div>
        <fieldset className="space-y-3 rounded-xl bg-ivory-100 p-4"><legend className="px-1 text-sm font-medium">First manager (optional)</legend>
          <Field label="Name"><Input value={f.mName} onChange={(e) => setF({ ...f, mName: e.target.value })} /></Field><Field label="Email"><Input type="email" value={f.mEmail} onChange={(e) => setF({ ...f, mEmail: e.target.value })} /></Field><Field label="Temporary password" hint="At least 8 characters"><PasswordInput value={f.mPassword} onChange={(e) => setF({ ...f, mPassword: e.target.value })} /></Field></fieldset>
        <div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button><Button loading={busy} onClick={create}>Create operator</Button></div></div></Modal>
    </div>
  );
}
