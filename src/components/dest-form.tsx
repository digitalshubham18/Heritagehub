"use client";
import { useState } from "react";
import { toast } from "sonner";
import { Plus, Trash2, Upload } from "lucide-react";
import { api } from "@/lib/hooks";
import { Button, Field, Input, Select, Textarea } from "./ui";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const blank = {
  name: "", slug: "", city: "", state: "", type: "monument", shortDescription: "", history: "", significance: "",
  location: { lat: 0, lng: 0, address: "" }, hours: { open: "09:00", close: "17:00", closedDays: [] as number[] },
  slotDurationMin: 60, defaultSlotCapacity: 300, occupancyLimit: 1500, avgDailyVisitors: 2000,
  bookingPolicy: { maxTicketsPerBooking: 10, advanceDays: 60 }, cancellationPolicy: { freeUntilHours: 24, lateRefundPercent: 50, noRefundHours: 2 },
  crowdThresholds: { moderate: 40, high: 70, veryHigh: 90 }, alertThresholdPct: 85,
  categories: [{ name: "Indian citizen", audience: "indian", priceMinor: 5000, feeMinor: 0 }] as any[],
};
const lines = (a?: string[]) => (a || []).join("\n");
const split = (s: string) => s.split("\n").map((x) => x.trim()).filter(Boolean);

/** `heritage` is set when the form was opened from the heritage directory: the fields are prefilled from public records, and the person must confirm the hours and prices are the official ones before booking can open. */
export function DestForm({ initial, onSaved, onCancel, operators, heritage }: { initial?: { destination: any; categories: any[] }; onSaved: () => void; onCancel: () => void; operators?: any[]; heritage?: { slug: string; name: string } }) {
  const d = initial?.destination;
  const isEdit = !!d?._id; // a prefilled new destination has no _id yet
  const [confirmed, setConfirmed] = useState(false);
  const [v, setV] = useState<any>(d ? { ...blank, ...d, categories: initial!.categories.map((c) => ({ _id: c._id, name: c.name, audience: c.audience, priceMinor: c.priceMinor, feeMinor: c.feeMinor || 0, description: c.description })) } : blank);
  const [txt, setTxt] = useState({ images: lines(d?.images), guidelines: lines(d?.guidelines), facilities: lines(d?.facilities), accessibility: lines(d?.accessibility), faqs: (d?.faqs || []).map((f: any) => `${f.q} | ${f.a}`).join("\n") });
  const [errs, setErrs] = useState<any>({}); const [busy, setBusy] = useState(false);
  const set = (path: string, val: any) => setV((p: any) => { const n = structuredClone(p); const k = path.split("."); let o = n; k.slice(0, -1).forEach((x) => (o = o[x])); o[k[k.length - 1]] = val; return n; });
  const num = (path: string, val: string) => set(path, val === "" ? 0 : Number(val));

  async function upload(file?: File) {
    if (!file) return;
    const fd = new FormData(); fd.append("file", file);
    const r = await fetch("/api/admin/upload", { method: "POST", body: fd }); const j = await r.json();
    if (!r.ok) return toast.error(j.error);
    setTxt((t) => ({ ...t, images: (t.images ? t.images + "\n" : "") + j.url })); toast.success("Image added");
  }
  async function save(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setErrs({});
    const body: any = { ...v, images: split(txt.images), guidelines: split(txt.guidelines), facilities: split(txt.facilities), accessibility: split(txt.accessibility),
      faqs: split(txt.faqs).map((l) => { const [q, ...a] = l.split("|"); return { q: q.trim(), a: a.join("|").trim() }; }).filter((f) => f.q && f.a), slug: v.slug || undefined };
    if (heritage) body.heritageSlug = heritage.slug;
    if (heritage && !body.categories?.length) { setErrs({ categories: ["Add at least one ticket category with the official price"] }); setBusy(false); return toast.error("Add the official ticket prices first"); }
    delete body.operator; if (!body.operatorId) delete body.operatorId; delete body._id; delete body.__v; delete body.createdAt; delete body.updatedAt; delete body.rating; delete body.ratingCount; delete body.popularity; delete body.dataLabel;
    try {
      if (isEdit) await api(`/api/destinations/${d._id}`, { method: "PATCH", body }); else await api("/api/destinations", { body });
      toast.success(isEdit ? "Destination updated" : heritage ? "Online booking is now open for this site" : "Destination created"); onSaved();
    } catch (err: any) { setErrs(err.issues || {}); toast.error(err.message); } finally { setBusy(false); }
  }
  const E = (k: string) => errs[k]?.[0];
  return (
    <form onSubmit={save} className="space-y-6" noValidate>
      {heritage && (
        <div role="note" className="rounded-xl border border-terracotta/40 bg-terracotta/5 p-4 text-sm">
          <p className="font-medium">Opening online booking for {heritage.name}</p>
          <p className="mt-1 text-ink/80">Name, place, map position, description and photos came from public records. <strong>Opening hours, ticket prices, capacity per slot and average daily visitors are not known to us.</strong> Enter the official figures below. The values already in those boxes are only placeholders, and visitors will pay what you save here.</p>
          <label className="mt-3 flex items-start gap-2"><input type="checkbox" className="mt-1 accent-forest" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} /><span>I have checked the hours, ticket prices and capacity against the official source, and I am authorised to sell tickets for this site.</span></label>
        </div>
      )}
      <section className="grid gap-4 sm:grid-cols-2">
        <Field label="Name" error={E("name")}><Input value={v.name} onChange={(e) => set("name", e.target.value)} /></Field>
        <Field label="URL slug" error={E("slug")} hint="Leave blank to generate"><Input value={v.slug} onChange={(e) => set("slug", e.target.value)} disabled={isEdit} /></Field>
        <Field label="City" error={E("city")}><Input value={v.city} onChange={(e) => set("city", e.target.value)} /></Field>
        <Field label="State" error={E("state")}><Input value={v.state} onChange={(e) => set("state", e.target.value)} /></Field>
        {operators && operators.length > 0 && <Field label="Operator" hint="Who runs this site"><Select value={v.operatorId ?? (d?.operator || "")} onChange={(e) => set("operatorId", e.target.value)}><option value="">Unassigned</option>{operators.map((o) => <option key={o._id} value={o._id}>{o.name}</option>)}</Select></Field>}
        <Field label="Type"><Select value={v.type} onChange={(e) => set("type", e.target.value)}>{["monument", "fort", "museum", "temple", "archaeological", "palace"].map((t) => <option key={t}>{t}</option>)}</Select></Field>
        <Field label="Short description" error={E("shortDescription")} className="sm:col-span-2"><Textarea value={v.shortDescription} onChange={(e) => set("shortDescription", e.target.value)} maxLength={300} /></Field>
        <Field label="Historical background" className="sm:col-span-2"><Textarea value={v.history} onChange={(e) => set("history", e.target.value)} /></Field>
        <Field label="Cultural significance" className="sm:col-span-2"><Textarea value={v.significance} onChange={(e) => set("significance", e.target.value)} /></Field>
      </section>
      <section className="space-y-3"><h3 className="text-base">Images</h3>
        <Field label="Image URLs (one per line)"><Textarea value={txt.images} onChange={(e) => setTxt({ ...txt, images: e.target.value })} /></Field>
        <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-forest/30 px-3 py-2 text-sm text-forest hover:bg-forest-50"><Upload className="h-4 w-4" aria-hidden />Upload image (JPEG, PNG or WebP)<input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={(e) => upload(e.target.files?.[0])} /></label></section>
      <section className="grid gap-4 sm:grid-cols-3"><h3 className="text-base sm:col-span-3">Location and hours</h3>
        <Field label="Latitude" error={E("location")}><Input type="number" step="any" value={v.location.lat} onChange={(e) => num("location.lat", e.target.value)} /></Field>
        <Field label="Longitude"><Input type="number" step="any" value={v.location.lng} onChange={(e) => num("location.lng", e.target.value)} /></Field>
        <Field label="Address"><Input value={v.location.address} onChange={(e) => set("location.address", e.target.value)} /></Field>
        <Field label="Opens"><Input type="time" value={v.hours.open} onChange={(e) => set("hours.open", e.target.value)} /></Field>
        <Field label="Closes"><Input type="time" value={v.hours.close} onChange={(e) => set("hours.close", e.target.value)} /></Field>
        <fieldset><legend className="mb-1.5 text-sm font-medium">Weekly closed days</legend><div className="flex flex-wrap gap-2">{DAYS.map((n, i) => <label key={n} className="flex items-center gap-1 text-sm"><input type="checkbox" className="accent-forest" checked={v.hours.closedDays.includes(i)} onChange={(e) => set("hours.closedDays", e.target.checked ? [...v.hours.closedDays, i] : v.hours.closedDays.filter((x: number) => x !== i))} />{n}</label>)}</div></fieldset>
      </section>
      <section className="grid gap-4 sm:grid-cols-3"><h3 className="text-base sm:col-span-3">Capacity</h3>
        <Field label="Slot length (minutes)" error={E("slotDurationMin")}><Input type="number" value={v.slotDurationMin} onChange={(e) => num("slotDurationMin", e.target.value)} /></Field>
        <Field label="Capacity per slot" error={E("defaultSlotCapacity")}><Input type="number" value={v.defaultSlotCapacity} onChange={(e) => num("defaultSlotCapacity", e.target.value)} /></Field>
        <Field label="Max people inside at once"><Input type="number" value={v.occupancyLimit} onChange={(e) => num("occupancyLimit", e.target.value)} /></Field>
        <Field label="Average daily visitors" hint="Seeds the crowd model"><Input type="number" value={v.avgDailyVisitors} onChange={(e) => num("avgDailyVisitors", e.target.value)} /></Field>
        <Field label="Max tickets per booking"><Input type="number" value={v.bookingPolicy.maxTicketsPerBooking} onChange={(e) => num("bookingPolicy.maxTicketsPerBooking", e.target.value)} /></Field>
        <Field label="Bookable days ahead"><Input type="number" value={v.bookingPolicy.advanceDays} onChange={(e) => num("bookingPolicy.advanceDays", e.target.value)} /></Field>
      </section>
      <section className="grid gap-4 sm:grid-cols-3"><h3 className="text-base sm:col-span-3">Cancellation policy</h3>
        <Field label="Full refund until (hours before)"><Input type="number" value={v.cancellationPolicy.freeUntilHours} onChange={(e) => num("cancellationPolicy.freeUntilHours", e.target.value)} /></Field>
        <Field label="Late refund (% of tickets)"><Input type="number" value={v.cancellationPolicy.lateRefundPercent} onChange={(e) => num("cancellationPolicy.lateRefundPercent", e.target.value)} /></Field>
        <Field label="No cancellation within (hours)"><Input type="number" value={v.cancellationPolicy.noRefundHours} onChange={(e) => num("cancellationPolicy.noRefundHours", e.target.value)} /></Field>
      </section>
      <section className="space-y-3"><div className="flex items-center justify-between"><h3 className="text-base">Ticket categories (₹)</h3><Button type="button" size="sm" variant="outline" onClick={() => set("categories", [...v.categories, { name: "", audience: "indian", priceMinor: 0, feeMinor: 0 }])}><Plus className="h-4 w-4" aria-hidden />Add category</Button></div>
        {E("categories") && <p role="alert" className="text-xs text-red-700">{E("categories")}</p>}
        {v.categories.map((c: any, i: number) => (
          <div key={i} className="grid items-end gap-2 rounded-lg border border-forest/15 bg-white p-3 sm:grid-cols-[1fr_130px_100px_100px_auto]">
            <Field label="Name"><Input value={c.name} onChange={(e) => set(`categories.${i}.name`, e.target.value)} /></Field>
            <Field label="Audience"><Select value={c.audience} onChange={(e) => set(`categories.${i}.audience`, e.target.value)}>{["indian", "foreign", "child", "student"].map((a) => <option key={a}>{a}</option>)}</Select></Field>
            <Field label="Price"><Input type="number" min={0} value={c.priceMinor / 100} onChange={(e) => set(`categories.${i}.priceMinor`, Math.round(Number(e.target.value) * 100))} /></Field>
            <Field label="Extra fee"><Input type="number" min={0} value={(c.feeMinor || 0) / 100} onChange={(e) => set(`categories.${i}.feeMinor`, Math.round(Number(e.target.value) * 100))} /></Field>
            <Button type="button" variant="ghost" size="sm" aria-label={`Remove ${c.name || "category"}`} onClick={() => set("categories", v.categories.filter((_: any, j: number) => j !== i))}><Trash2 className="h-4 w-4" /></Button>
          </div>))}</section>
      <section className="grid gap-4 sm:grid-cols-2"><h3 className="text-base sm:col-span-2">Visitor information (one item per line)</h3>
        <Field label="Guidelines"><Textarea value={txt.guidelines} onChange={(e) => setTxt({ ...txt, guidelines: e.target.value })} /></Field>
        <Field label="Facilities"><Textarea value={txt.facilities} onChange={(e) => setTxt({ ...txt, facilities: e.target.value })} /></Field>
        <Field label="Accessibility"><Textarea value={txt.accessibility} onChange={(e) => setTxt({ ...txt, accessibility: e.target.value })} /></Field>
        <Field label="FAQs" hint="Format: Question | Answer"><Textarea value={txt.faqs} onChange={(e) => setTxt({ ...txt, faqs: e.target.value })} /></Field></section>
      <div className="flex justify-end gap-2 border-t border-forest/15 pt-4"><Button type="button" variant="outline" onClick={onCancel}>Cancel</Button><Button type="submit" loading={busy} disabled={!!heritage && !confirmed}>{isEdit ? "Save changes" : heritage ? "Open online booking" : "Create destination"}</Button></div>
    </form>
  );
}
