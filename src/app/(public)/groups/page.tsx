"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ClipboardList, CreditCard, UsersRound } from "lucide-react";
import { api, useApi, useUser } from "@/lib/hooks";
import { Reveal } from "@/components/reveal";
import { Button, Card, Field, Input, Select, Textarea } from "@/components/ui";
import { addDays, inr, todayIST } from "@/lib/utils";

const STEPS = [[ClipboardList, "Send a request", "Tell us the site, date, group size and who you are. Requests start at 10 people."], [UsersRound, "The site confirms", "A manager picks a slot that fits everyone and can apply a school or group concession."], [CreditCard, "Pay once", "You get an email with a payment link. Seats are held for you while you pay."]] as const;

export default function Groups() {
  const router = useRouter();
  const { user } = useUser();
  const dests = useApi<any>("/api/destinations");
  const [f, setF] = useState<any>({ destinationSlug: "", organisation: "", orgType: "school", size: 30, categoryId: "", date: addDays(todayIST(), 7), preferredStart: "10:00", notes: "", name: "", email: "", phone: "" });
  const dest = dests.data?.items?.find((d: any) => d.slug === f.destinationSlug) || dests.data?.items?.[0];
  const detail = useApi<any>(dest ? `/api/destinations/${dest.slug}` : null);
  const cats: any[] = (detail.data?.categories || []).filter((c: any) => c.audience !== "foreign");
  const [errs, setErrs] = useState<any>({}); const [busy, setBusy] = useState(false); const [done, setDone] = useState(false);
  useEffect(() => { if (user) setF((p: any) => ({ ...p, name: p.name || user.name, email: p.email || user.email, phone: p.phone || user.phone || "" })); }, [user]);
  useEffect(() => { if (cats.length && !cats.some((c) => c._id === f.categoryId)) setF((p: any) => ({ ...p, categoryId: cats[0]._id })); }, [cats, f.categoryId]);
  const set = (k: string, v: any) => setF((p: any) => ({ ...p, [k]: v }));

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!user) { toast.info("Sign in to send a group request"); router.push("/login?next=/groups"); return; }
    setBusy(true); setErrs({});
    try { await api("/api/groups", { body: { destinationId: dest._id, organisation: f.organisation, orgType: f.orgType, size: Number(f.size), categoryId: f.categoryId, date: f.date, preferredStart: f.preferredStart || undefined, notes: f.notes || undefined, contact: { name: f.name, email: f.email, phone: f.phone } } }); setDone(true); toast.success("Request sent"); }
    catch (err: any) { setErrs(err.issues || {}); toast.error(err.message); } finally { setBusy(false); }
  }
  const unit = cats.find((c) => c._id === f.categoryId);
  return (
    <div className="mx-auto max-w-6xl px-4 py-12">
      <Reveal><h1 className="text-4xl sm:text-5xl">Group and school visits</h1><p className="mt-3 max-w-2xl text-lg text-ink/80">One request for the whole party. The site's team confirms a slot and any concession, then you pay once and everyone enters on a single booking.</p></Reveal>
      <div className="mt-10 grid gap-10 lg:grid-cols-[1fr_1.1fr]">
        <ol className="space-y-6">{STEPS.map(([Icon, h, d], i) => <Reveal as="li" key={h} delay={i * 80} className="flex gap-4"><span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-terracotta-50 text-terracotta"><Icon className="h-5 w-5" aria-hidden /></span><div><h2 className="text-lg">{h}</h2><p className="mt-1 text-sm leading-relaxed text-ink/80">{d}</p></div></Reveal>)}
          <li className="rounded-2xl bg-forest-50 p-4 text-sm text-ink/80">Entering together: staff can admit your group in parts, for example the first coach and then the second, using the same QR.</li></ol>
        <Card className="p-6 sm:p-8">
          {done ? <div role="status" className="space-y-3 text-center"><h2 className="text-2xl">Request sent</h2><p className="text-ink/80">We'll email you when the site responds. You can track it under your group requests.</p><Link href="/dashboard/groups" className="inline-block rounded-xl bg-forest px-5 py-2.5 text-ivory">View my requests</Link></div> : (
            <form onSubmit={send} className="space-y-4" noValidate>
              <Field label="Destination"><Select value={dest?.slug || ""} onChange={(e) => set("destinationSlug", e.target.value)}>{dests.data?.items?.map((d: any) => <option key={d.slug} value={d.slug}>{d.name}</option>)}</Select></Field>
              <div className="grid gap-4 sm:grid-cols-2"><Field label="School or organisation" error={errs.organisation?.[0]}><Input value={f.organisation} onChange={(e) => set("organisation", e.target.value)} /></Field>
                <Field label="Type"><Select value={f.orgType} onChange={(e) => set("orgType", e.target.value)}><option value="school">School</option><option value="tour_operator">Tour operator</option><option value="corporate">Corporate</option><option value="other">Other</option></Select></Field></div>
              <div className="grid gap-4 sm:grid-cols-3"><Field label="Group size" error={errs.size?.[0]}><Input type="number" min={10} max={1000} value={f.size} onChange={(e) => set("size", e.target.value)} /></Field>
                <Field label="Visit date" hint="3 days' notice"><Input type="date" min={addDays(todayIST(), 3)} value={f.date} onChange={(e) => set("date", e.target.value)} /></Field>
                <Field label="Preferred time"><Input type="time" value={f.preferredStart} onChange={(e) => set("preferredStart", e.target.value)} /></Field></div>
              <Field label="Ticket type for the group" hint={unit ? `${inr(unit.priceMinor + (unit.feeMinor || 0))} each before any concession` : undefined}><Select value={f.categoryId} onChange={(e) => set("categoryId", e.target.value)}>{cats.map((c) => <option key={c._id} value={c._id}>{c.name}</option>)}</Select></Field>
              <div className="grid gap-4 sm:grid-cols-3"><Field label="Contact name" error={errs.contact?.[0]}><Input value={f.name} onChange={(e) => set("name", e.target.value)} /></Field><Field label="Email"><Input type="email" value={f.email} onChange={(e) => set("email", e.target.value)} /></Field><Field label="Phone"><Input inputMode="tel" value={f.phone} onChange={(e) => set("phone", e.target.value)} /></Field></div>
              <Field label="Anything the site should know? (optional)"><Textarea value={f.notes} onChange={(e) => set("notes", e.target.value)} maxLength={600} /></Field>
              <Button type="submit" size="lg" variant="accent" className="w-full" loading={busy}>Send request</Button>
            </form>)}
        </Card>
      </div>
    </div>
  );
}
