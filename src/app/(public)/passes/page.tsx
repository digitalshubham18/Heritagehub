"use client";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { CalendarDays, MapPin, Repeat } from "lucide-react";
import { api, useApi, useUser } from "@/lib/hooks";
import { HeritageArt } from "@/components/art";
import { Reveal } from "@/components/reveal";
import { Button, Empty, ErrorState, Field, Input, Modal, Skeleton } from "@/components/ui";
import { addDays, fmtDate, inr, todayIST } from "@/lib/utils";

export default function Passes() {
  const router = useRouter();
  const { user } = useUser();
  const { data, loading, error, reload } = useApi<any>("/api/passes");
  const [sel, setSel] = useState<any>(null);
  const [name, setName] = useState(""); const [start, setStart] = useState(todayIST()); const [fail, setFail] = useState(false); const [busy, setBusy] = useState(false);
  const key = useRef(crypto.randomUUID());
  const open = (p: any) => { if (!user) { toast.info("Sign in to buy a pass"); router.push("/login?next=/passes"); return; } setSel(p); setName(user.name); setStart(todayIST()); key.current = crypto.randomUUID(); };
  async function buy() {
    setBusy(true);
    try { await api("/api/passes", { body: { passTypeId: sel._id, holderName: name, startDate: start, idempotencyKey: key.current, simulateFailure: fail || undefined } }); toast.success("Pass ready. Your QR is in My passes."); router.push("/dashboard/passes"); }
    catch (e: any) { toast.error(e.message); key.current = crypto.randomUUID(); setBusy(false); }
  }
  return (
    <div className="mx-auto max-w-6xl px-4 py-12">
      <Reveal><h1 className="text-4xl sm:text-5xl">Season passes</h1><p className="mt-3 max-w-xl text-lg text-ink/80">Visit as often as the pass allows within its dates. One QR works at every site the pass covers, and you skip choosing a time slot.</p></Reveal>
      {error ? <div className="mt-8"><ErrorState message={error} onRetry={reload} /></div> : loading ? <div className="mt-8 grid gap-6 md:grid-cols-2 lg:grid-cols-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-96" />)}</div> : !data.items.length ? <div className="mt-8"><Empty title="No passes on sale right now" /></div> : (
        <div className="mt-10 grid gap-6 md:grid-cols-2 lg:grid-cols-3">{data.items.map((p: any, i: number) => {
          const first = p.destinationInfo[0];
          return (
            <Reveal key={p._id} delay={(i % 3) * 80} className="card-lift flex flex-col overflow-hidden rounded-3xl border border-forest/10 bg-white shadow-card hover:shadow-lift">
              <div className="relative h-40"><HeritageArt slug={first?.slug || p.name} type={first?.type} variant={i % 3} className="absolute inset-0 h-full w-full" /><div className="absolute inset-0 bg-gradient-to-t from-black/55 to-transparent" /><p className="absolute bottom-3 left-5 right-5 font-display text-xl leading-tight text-white">{p.name}</p></div>
              <div className="flex flex-1 flex-col p-5">
                <p className="text-sm text-ink/80">{p.description}</p>
                <ul className="mt-4 space-y-1.5 text-sm"><li className="flex items-center gap-2"><MapPin className="h-4 w-4 text-terracotta" aria-hidden />{p.destinationInfo.map((d: any) => d.name).join(", ")}</li><li className="flex items-center gap-2"><CalendarDays className="h-4 w-4 text-terracotta" aria-hidden />Valid for {p.validityDays} day{p.validityDays > 1 ? "s" : ""} from your start date</li><li className="flex items-center gap-2"><Repeat className="h-4 w-4 text-terracotta" aria-hidden />{p.maxEntriesPerDay} entr{p.maxEntriesPerDay > 1 ? "ies" : "y"} per site per day</li></ul>
                <div className="mt-auto flex items-end justify-between pt-5"><div><p className="text-xs text-ink/60">Price (plus 2% fee and GST on the fee)</p><p className="font-display text-3xl leading-none">{inr(p.priceMinor)}</p></div><Button variant="accent" onClick={() => open(p)}>Buy pass</Button></div>
                {p.operatorName && <p className="mt-3 text-xs text-ink/55">Offered by {p.operatorName}</p>}
              </div>
            </Reveal>);
        })}</div>)}
      <p className="mt-6 text-xs text-ink/60">Prices and passes are sample data. Payment is simulated.</p>
      <Modal open={!!sel} onClose={() => setSel(null)} title={sel ? `Buy: ${sel.name}` : ""}>
        {sel && <div className="space-y-4">
          <Field label="Name of the pass holder" hint="Shown to staff when the pass is scanned"><Input value={name} onChange={(e) => setName(e.target.value)} /></Field>
          <Field label="Start date" hint={`Valid until ${fmtDate(addDays(start, sel.validityDays - 1))}`}><Input type="date" min={todayIST()} max={addDays(todayIST(), 90)} value={start} onChange={(e) => e.target.value && setStart(e.target.value)} /></Field>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="accent-terracotta" checked={fail} onChange={(e) => setFail(e.target.checked)} />Simulate a failed payment (test mode)</label>
          <div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setSel(null)}>Cancel</Button><Button variant="accent" loading={busy} disabled={name.trim().length < 2} onClick={buy}>Pay {inr(Math.round(sel.priceMinor * 1.0236))}</Button></div>
          <p className="text-xs text-ink/60">Total includes the 2% convenience fee and 18% GST on that fee. Test mode: no money moves.</p>
        </div>}
      </Modal>
    </div>
  );
}
