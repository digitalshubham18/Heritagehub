"use client";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Copy, Cpu, Plus } from "lucide-react";
import { api, useApi } from "@/lib/hooks";
import { GateExplainer, GateTester } from "./extras";
import { Badge, Button, Card, Empty, ErrorState, Field, Input, Modal, PageSkeleton, Select, useConfirm } from "@/components/ui";

const KINDS: [string, string][] = [["turnstile", "Turnstile / gate controller"], ["scanner", "QR scanner"], ["kiosk", "Self-service kiosk"], ["plate_camera", "Number-plate camera (ANPR)"], ["people_counter", "People counter (door sensor / camera)"], ["printer", "Receipt printer"]];
export default function Devices() {
  const { data, loading, error, reload } = useApi<any>("/api/admin/devices", { poll: 15000 });
  const [open, setOpen] = useState(false); const [busy, setBusy] = useState(false);
  const [f, setF] = useState({ name: "", destinationId: "", kind: "turnstile", direction: "in", mode: "one" });
  const [key, setKey] = useState<string | null>(null);
  const { confirm, dialog } = useConfirm();
  const dest = f.destinationId || data?.destinations?.[0]?._id || "";
  async function create() {
    setBusy(true);
    try { const r = await api("/api/admin/devices", { body: { ...f, destinationId: dest } }); setOpen(false); setKey(r.key); setF({ ...f, name: "" }); reload(); }
    catch (e: any) { toast.error(e.message); } finally { setBusy(false); }
  }
  async function rotate(d: any) { if (!(await confirm({ title: `Rotate the key for ${d.name}?`, body: "The old key stops working immediately. Update the device before the next scan.", confirmLabel: "Rotate key", danger: true }))) return; try { const r = await api("/api/admin/devices", { method: "PATCH", body: { id: d._id, rotate: true } }); setKey(r.key); reload(); } catch (e: any) { toast.error(e.message); } }
  async function toggle(d: any) { try { await api("/api/admin/devices", { method: "PATCH", body: { id: d._id, active: !d.active } }); reload(); } catch (e: any) { toast.error(e.message); } }
  const [base, setBase] = useState("https://your-domain");
  useEffect(() => setBase(location.origin), []); // set after mount so server and browser render the same HTML first
  const copy = (t: string) => navigator.clipboard?.writeText(t).then(() => toast.success("Copied"), () => toast.error("Copy failed"));
  return (
    <div className="space-y-6">{dialog}
      <div className="flex flex-wrap items-center justify-between gap-3"><div><h1 className="text-3xl">Gate devices</h1><p className="mt-1 max-w-2xl text-sm text-ink/70">Register turnstile controllers, QR readers and receipt printers. Each gets its own secret key and can only act on its own site.</p></div><Button onClick={() => setOpen(true)}><Plus className="h-4 w-4" aria-hidden />Register device</Button></div>
      {error ? <ErrorState message={error} onRetry={reload} /> : loading ? <PageSkeleton /> : !data.items.length ? <Empty title="No devices registered">Register a device to get an API key for your gate controller.</Empty> : (
        <Card className="overflow-x-auto"><table className="w-full min-w-[760px] text-sm"><caption className="sr-only">Registered devices</caption><thead className="bg-forest-50 text-left"><tr>{["Device", "Site", "Mode", "Status", "Last seen", "Scans", ""].map((h) => <th key={h} className="p-3 font-medium">{h}</th>)}</tr></thead>
          <tbody>{data.items.map((d: any) => <tr key={d._id} className="border-t border-forest/10"><td className="p-3"><p className="flex items-center gap-2 font-medium"><Cpu className="h-4 w-4 text-forest" aria-hidden />{d.name}</p><p className="text-xs text-ink/60">{d.kind} · key …{d.keyHint}</p></td><td className="p-3">{d.destinationName}</td><td className="p-3">{d.direction === "in" ? "Entry" : "Exit"} · {d.mode === "one" ? "one per scan" : "whole booking"}</td>
            <td className="p-3">{!d.active ? <Badge className="bg-stone-200">Disabled</Badge> : d.online ? <Badge className="bg-emerald-100 text-emerald-900">Online</Badge> : <Badge className="bg-amber-100 text-amber-900">Offline</Badge>}</td><td className="p-3 text-ink/70">{d.lastSeenAt ? new Date(d.lastSeenAt).toLocaleString("en-IN") : "Never"}</td><td className="p-3">{d.scans}</td>
            <td className="space-x-1 p-3 text-right whitespace-nowrap"><Button size="sm" variant="outline" onClick={() => rotate(d)}>Rotate key</Button><Button size="sm" variant="ghost" onClick={() => toggle(d)}>{d.active ? "Disable" : "Enable"}</Button></td></tr>)}</tbody></table></Card>)}
      <GateExplainer />
      <GateTester devices={data?.items || []} />
      <Card className="p-5 text-sm"><h2 className="text-lg">Controller protocol</h2>
        <p className="mt-2 text-ink/80">Send each scan over HTTPS. The reply is always a clear decision your controller can act on.</p>
        <pre className="mt-3 overflow-x-auto rounded-xl bg-forest-900 p-4 text-xs leading-relaxed text-ivory">{`POST ${base}/api/device/scan
X-Device-Key: hhd_…
{ "code": "<scanned QR text>" }

200 { "allow": true,  "relay": "open", "message": "WELCOME x1", "occupancy": 412 }
200 { "allow": false, "relay": "hold", "message": "ALREADY CHECKED IN", "reason": "…" }
401 bad key · 429 too many requests

POST ${base}/api/device/heartbeat      (every ~30 s, shows Online here)
GET  ${base}/api/device/receipt/<ref>?format=escpos   (printer devices)`}</pre></Card>
      <Modal open={open} onClose={() => setOpen(false)} title="Register a device"><div className="space-y-3">
        <Field label="Name" hint="For example: Gate A turnstile"><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
        <Field label="Site"><Select value={dest} onChange={(e) => setF({ ...f, destinationId: e.target.value })}>{data?.destinations?.map((d: any) => <option key={d._id} value={d._id}>{d.name}</option>)}</Select></Field>
        <div className="grid gap-3 sm:grid-cols-2"><Field label="Type"><Select value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value, mode: e.target.value === "turnstile" ? "one" : f.mode })}>{KINDS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Select></Field><Field label="Direction"><Select value={f.direction} onChange={(e) => setF({ ...f, direction: e.target.value })}><option value="in">Entry</option><option value="out">Exit</option></Select></Field></div>
        <Field label="Visitors admitted per scan" hint="Turnstiles admit one person per scan"><Select value={f.mode} onChange={(e) => setF({ ...f, mode: e.target.value })}><option value="one">One person</option><option value="all">Everyone on the booking</option></Select></Field>
        <div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button><Button loading={busy} disabled={f.name.trim().length < 2} onClick={create}>Register</Button></div></div></Modal>
      <Modal open={!!key} onClose={() => setKey(null)} title="Copy the device key now"><div className="space-y-4">
        <p className="text-sm text-ink/80">This key is shown only once. Store it in the device's configuration. We keep only a hash, so it can't be shown again (rotate it if lost).</p>
        <div className="flex items-center gap-2 rounded-xl bg-ivory-100 p-3"><code className="flex-1 break-all text-sm">{key}</code><Button size="sm" variant="outline" onClick={() => key && copy(key)}><Copy className="h-4 w-4" aria-hidden />Copy</Button></div>
        <div className="flex justify-end"><Button onClick={() => setKey(null)}>I've saved it</Button></div></div></Modal>
    </div>
  );
}
