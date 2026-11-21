"use client";
import { useState } from "react";
import { toast } from "sonner";
import { Plus, Search } from "lucide-react";
import { api, useApi } from "@/lib/hooks";
import { Badge, Button, Card, Empty, Field, Input, Modal, Select, Textarea } from "@/components/ui";

const CATS = [["bag", "Bag or backpack"], ["phone", "Phone"], ["wallet", "Wallet or purse"], ["documents", "Documents or ID"], ["keys", "Keys"], ["clothing", "Clothing"], ["jewellery", "Jewellery or watch"], ["child_item", "Child's item"], ["electronics", "Camera or electronics"], ["other", "Something else"]] as const;
const when = (d?: string) => (d ? new Date(d).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "");
const tone: Record<string, string> = { open: "bg-amber-100 text-amber-900", matched: "bg-sky-100 text-sky-900", returned: "bg-emerald-100 text-emerald-900", disposed: "bg-stone-100 text-stone-700" };

/** Shared by the staff page (one site) and the manager page (all sites in scope). */
export function LostFoundBoard({ siteId, canLog }: { siteId?: string; canLog?: boolean }) {
  const [q, setQ] = useState(""), [status, setStatus] = useState("open"), [logOpen, setLogOpen] = useState(false), [ret, setRet] = useState<any>(null);
  const list = useApi<any>(`/api/staff/lost-found?status=${status}${siteId ? `&destination=${siteId}` : ""}${q.trim().length >= 2 ? `&q=${encodeURIComponent(q.trim())}` : ""}`);
  const blank = { kind: "found", category: "bag", description: "", location: "", color: "", contactName: "", contactPhone: "" };
  const [f, setF] = useState<any>(blank), [busy, setBusy] = useState(false), [r, setR] = useState({ name: "", phone: "", idType: "aadhaar", idLast4: "" });
  async function log() {
    setBusy(true);
    try { const res = await api("/api/staff/lost-found", { body: { destinationId: siteId, ...f } }); toast.success(`Logged as ${res.item.reference}`); if (res.suggestions?.length) toast.info(`${res.suggestions.length} possible match${res.suggestions.length > 1 ? "es" : ""}: ${res.suggestions[0].reference}`, { duration: 9000 }); setLogOpen(false); setF(blank); list.reload(); }
    catch (e: any) { toast.error(e.issues?.[0]?.message || e.message); } finally { setBusy(false); }
  }
  async function patch(body: any, ok: string) { try { await api("/api/staff/lost-found", { method: "PATCH", body }); toast.success(ok); setRet(null); list.reload(); } catch (e: any) { toast.error(e.issues?.[0]?.message || e.message); } }
  const items: any[] = list.data?.items || [];
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative"><Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-ink/45" aria-hidden /><label className="sr-only" htmlFor="lfq">Search items</label><Input id="lfq" className="h-9 w-64 pl-8 text-sm" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search description, code, name, phone" /></div>
        <Select aria-label="Status" className="h-9 w-40" value={status} onChange={(e) => setStatus(e.target.value)}><option value="open">Open</option><option value="returned">Returned</option><option value="disposed">Disposed</option><option value="all">All</option></Select>
        {canLog && siteId && <Button size="sm" className="ml-auto" onClick={() => setLogOpen(true)}><Plus className="h-4 w-4" aria-hidden />Log an item</Button>}
        {!siteId && <a href="/api/admin/export?report=lost-found&range=90" className="ml-auto text-sm text-terracotta underline">Export CSV (90 days)</a>}
      </div>
      {list.error && <p role="alert" className="text-sm text-red-800">{list.error}</p>}
      {list.data && items.length === 0 && <Empty title="Nothing here">No {status === "all" ? "" : status} items{q ? " match that search" : ""}.</Empty>}
      <div className="grid gap-3 md:grid-cols-2">{items.map((i) => (
        <Card key={i._id} className="p-4">
          <div className="flex items-start justify-between gap-2"><div><p className="font-mono text-sm font-medium">{i.reference}</p><p className="text-xs text-ink/60">{i.destination?.name} · {when(i.createdAt)} · logged by {i.loggedByName}</p></div><span className="flex gap-1"><Badge className={i.kind === "found" ? "bg-forest-50 text-forest" : "bg-terracotta/10 text-terracotta"}>{i.kind === "found" ? "Found" : "Reported lost"}</Badge><Badge className={tone[i.status]}>{i.status}</Badge></span></div>
          <p className="mt-2 text-sm">{i.description}</p>
          <p className="text-xs text-ink/65">{CATS.find((c) => c[0] === i.category)?.[1]}{i.color ? ` · ${i.color}` : ""}{i.location ? ` · ${i.location}` : ""}</p>
          {i.kind === "lost" && <p className="mt-1 text-sm">Contact: {i.contactName}, <a className="underline" href={`tel:${i.contactPhone}`}>{i.contactPhone}</a></p>}
          {i.returnedTo && <p className="mt-1 text-sm text-emerald-900">Returned to {i.returnedTo.name} ({i.returnedTo.idType} ending {i.returnedTo.idLast4}) on {when(i.returnedTo.at)} by {i.returnedTo.byName}</p>}
          {i.suggestions?.length > 0 && <div className="mt-2 rounded-lg bg-sky-50 p-2 text-xs text-sky-950"><p className="font-medium">Possible matches</p>{i.suggestions.map((m: any) => <p key={m.id} className="flex items-center justify-between gap-2"><span>{m.reference} · {m.description.slice(0, 50)} ({m.score}%)</span>{canLog && <button className="underline" onClick={() => patch({ id: i._id, action: "match", matchId: m.id }, "Marked as matched")}>Match</button>}</p>)}</div>}
          {canLog && ["open", "matched"].includes(i.status) && <div className="mt-3 flex flex-wrap gap-2">{i.kind === "found" && <Button size="sm" onClick={() => { setRet(i); setR({ name: "", phone: "", idType: "aadhaar", idLast4: "" }); }}>Hand back</Button>}{i.status === "matched" && <Button size="sm" variant="ghost" onClick={() => patch({ id: i._id, action: "reopen" }, "Reopened")}>Unmatch</Button>}{i.kind === "found" && <Button size="sm" variant="ghost" onClick={() => { const note = prompt("How was it disposed of? (e.g. handed to police, donated)"); if (note) patch({ id: i._id, action: "dispose", note }, "Marked as disposed"); }}>Dispose</Button>}</div>}
        </Card>))}</div>

      <Modal open={logOpen} onClose={() => setLogOpen(false)} title="Log an item">
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Kind">{[["found", "Found item (handed in)"], ["lost", "Visitor reports lost"]].map(([k, l]) => <label key={k} className={`cursor-pointer rounded-lg border p-3 text-center text-sm ${f.kind === k ? "border-forest bg-forest-50 ring-1 ring-forest" : "border-forest/20"}`}><input type="radio" name="lfk" className="sr-only" checked={f.kind === k} onChange={() => setF({ ...f, kind: k })} />{l}</label>)}</div>
          <div className="grid gap-3 sm:grid-cols-2"><Field label="What is it?"><Select value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}>{CATS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select></Field><Field label="Colour"><Input value={f.color} onChange={(e) => setF({ ...f, color: e.target.value })} maxLength={30} /></Field></div>
          <Field label="Description" hint="Brand, size, marks, what is inside. Keep a detail back to check the owner's claim."><Textarea value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} maxLength={500} /></Field>
          <Field label={f.kind === "found" ? "Where was it found?" : "Where was it lost?"}><Input value={f.location} onChange={(e) => setF({ ...f, location: e.target.value })} maxLength={160} placeholder="e.g. near the east gate" /></Field>
          <div className="grid gap-3 sm:grid-cols-2"><Field label={f.kind === "found" ? "Handed in by (optional)" : "Visitor's name"}><Input value={f.contactName} onChange={(e) => setF({ ...f, contactName: e.target.value })} /></Field><Field label={f.kind === "found" ? "Phone (optional)" : "Visitor's phone"}><Input inputMode="tel" value={f.contactPhone} onChange={(e) => setF({ ...f, contactPhone: e.target.value })} /></Field></div>
          <div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setLogOpen(false)}>Cancel</Button><Button loading={busy} disabled={f.description.trim().length < 5 || (f.kind === "lost" && (!f.contactName.trim() || f.contactPhone.trim().length < 7))} onClick={log}>Save</Button></div>
        </div>
      </Modal>
      <Modal open={!!ret} onClose={() => setRet(null)} title={`Hand back ${ret?.reference || ""}`}>
        <div className="space-y-3"><p className="text-sm text-ink/75">{ret?.description}</p><p className="text-sm font-medium">Ask the owner to describe it, and check their ID before handing it over.</p>
          <div className="grid gap-3 sm:grid-cols-2"><Field label="Collected by"><Input value={r.name} onChange={(e) => setR({ ...r, name: e.target.value })} /></Field><Field label="Phone"><Input inputMode="tel" value={r.phone} onChange={(e) => setR({ ...r, phone: e.target.value })} /></Field>
            <Field label="ID checked"><Select value={r.idType} onChange={(e) => setR({ ...r, idType: e.target.value })}><option value="aadhaar">Aadhaar</option><option value="driving_licence">Driving licence</option><option value="passport">Passport</option><option value="voter_id">Voter ID</option><option value="pan">PAN</option><option value="other">Other</option></Select></Field>
            <Field label="Last 4 characters of the ID" hint="Never record the full number"><Input value={r.idLast4} maxLength={4} className="font-mono" onChange={(e) => setR({ ...r, idLast4: e.target.value })} /></Field></div>
          <div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setRet(null)}>Cancel</Button><Button variant="accent" disabled={r.name.trim().length < 2 || r.idLast4.length !== 4} onClick={() => patch({ id: ret._id, action: "return", returnedTo: { name: r.name, phone: r.phone || undefined, idType: r.idType, idLast4: r.idLast4 } }, "Recorded as returned")}>Confirm hand-back</Button></div></div>
      </Modal>
    </div>
  );
}
