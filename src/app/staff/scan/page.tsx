"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Camera, CheckCircle2, CloudOff, LogIn, LogOut, RefreshCw, Wifi, XCircle } from "lucide-react";
import { api } from "@/lib/hooks";
import { Badge, Button, Card, Input, StatusBadge } from "@/components/ui";
import { fmtTime, todayIST } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";

type Result = { kind?: "booking" | "pass"; valid: boolean; reasons: string[]; warnings: string[]; booking: any; destination: any; pass?: any; offline?: boolean };
type Op = { id: string; code: string; action: "in" | "out"; quantity?: number; at: string };
type Entry = { d: string; dn: string; q: number; i: number; o: number; s: string; e: string; st: string; n: string };
type Manifest = { at: string; date: string; byRef: Record<string, Entry> };

const MK = "hh_manifest_v1", QK = "hh_scan_queue_v1", FK = "hh_scan_failed_v1";
const load = <T,>(k: string, d: T): T => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } };
const save = (k: string, v: unknown) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage full or blocked */ } };
const isNetworkError = (e: any) => !e?.status; // api() sets .status for HTTP errors; a thrown TypeError means no connection
const refOf = (code: string) => (code.startsWith("HH1.") ? code.split(".")[1] : code.trim().toUpperCase());

export default function Scan() {
  const { t } = useI18n();
  const [code, setCode] = useState("");
  useEffect(() => { const c = new URLSearchParams(window.location.search).get("code"); if (c) setCode(c.toUpperCase()); }, []); // arriving from Visitor lookup
  const [res, setRes] = useState<Result | null>(null);
  const [busy, setBusy] = useState(false);
  const [cam, setCam] = useState(false);
  const [log, setLog] = useState<string[]>([]);
  const [qty, setQty] = useState<number | "">("");
  const [online, setOnline] = useState(true);
  const [pending, setPending] = useState(0);
  const [failed, setFailed] = useState<(Op & { error: string })[]>([]);
  const [mAt, setMAt] = useState<string | null>(null);
  const [sites, setSites] = useState<{ id: string; name: string }[]>([]);
  const [siteId, setSiteId] = useState("");
  const video = useRef<HTMLVideoElement>(null);
  const syncing = useRef(false);
  const supported = typeof window !== "undefined" && "BarcodeDetector" in window;

  /* ---------- offline store ---------- */
  const refreshManifest = useCallback(async () => {
    try {
      const sites = (await api<any>("/api/entries")).items as { id: string; name: string }[];
      setSites(sites); setSiteId((cur) => cur || sites[0]?.id || "");
      const byRef: Manifest["byRef"] = {}; let date = todayIST();
      for (const s of sites) {
        const m = await api<any>(`/api/entries/manifest?destination=${s.id}`); date = m.date;
        for (const it of m.items) byRef[it.r] = { d: s.id, dn: s.name, q: it.q, i: it.i, o: it.o, s: it.s, e: it.e, st: it.st, n: it.n };
      }
      const mf: Manifest = { at: new Date().toISOString(), date, byRef }; save(MK, mf); setMAt(mf.at);
    } catch { /* offline or no access: keep what we have */ }
  }, []);
  const applyLocal = (ref: string, action: "in" | "out", q: number) => {
    const mf = load<Manifest | null>(MK, null); const e = mf?.byRef[ref]; if (!mf || !e) return;
    if (action === "in") e.i += q; else { e.o += q; if (e.o >= e.q) e.st = "completed"; }
    save(MK, mf);
  };
  const syncQueue = useCallback(async () => {
    if (syncing.current) return; const queue = load<Op[]>(QK, []); if (!queue.length) return;
    syncing.current = true;
    try {
      const r = await api<any>("/api/entries/sync", { body: { ops: queue.slice(0, 200) } });
      const okIds = new Set(r.results.filter((x: any) => x.ok).map((x: any) => x.id));
      const bad = r.results.filter((x: any) => !x.ok);
      const rest = queue.filter((o) => !okIds.has(o.id) && !bad.some((b: any) => b.id === o.id));
      save(QK, rest); setPending(rest.length);
      if (bad.length) { const f = [...load<any[]>(FK, []), ...bad.map((b: any) => ({ ...queue.find((o) => o.id === b.id)!, error: b.error }))]; save(FK, f); setFailed(f); }
      toast[bad.length ? "warning" : "success"](`Synced ${r.synced} scan(s)${bad.length ? `, ${bad.length} need review` : ""}`);
      refreshManifest();
    } catch (e: any) { if (!isNetworkError(e)) toast.error(e.message); } finally { syncing.current = false; }
  }, [refreshManifest]);

  useEffect(() => {
    setOnline(navigator.onLine); setPending(load<Op[]>(QK, []).length); setFailed(load(FK, [])); setMAt(load<Manifest | null>(MK, null)?.at ?? null);
    const on = () => { setOnline(true); syncQueue(); }, off = () => setOnline(false);
    window.addEventListener("online", on); window.addEventListener("offline", off);
    refreshManifest().then(syncQueue);
    const t5 = setInterval(() => navigator.onLine && refreshManifest(), 300000);
    return () => { window.removeEventListener("online", on); window.removeEventListener("offline", off); clearInterval(t5); };
  }, [refreshManifest, syncQueue]);

  /* ---------- verify ---------- */
  function verifyOffline(c: string) {
    const mf = load<Manifest | null>(MK, null); const e = mf?.byRef[refOf(c)];
    const reasons: string[] = [], warnings = ["Offline: the QR signature is checked when this scan syncs. Make sure the ticket looks genuine."];
    if (!mf) reasons.push("No offline list saved yet. Connect once to download today's bookings.");
    else if (!e) reasons.push("Not in today's offline list. It may be a new sale or another day. Reconnect to check.");
    else {
      if (mf.date !== todayIST()) reasons.push("The offline list is from another day. Reconnect to refresh it.");
      if (e.st !== "confirmed" && e.st !== "completed") reasons.push(`Booking is ${e.st}`);
    }
    const booking = e && { reference: refOf(c), quantity: e.q, status: e.st, start: e.s, end: e.e, date: mf!.date, checkedInCount: e.i, checkedOutCount: e.o, visitors: [], contact: { name: e.n } };
    return { valid: reasons.length === 0, reasons, warnings, booking, destination: e && { name: e.dn }, offline: true } as Result;
  }
  async function verify(c = code) {
    if (!c.trim()) return; setBusy(true); setCode(c.trim());
    try { setRes(await api<Result>("/api/tickets/verify", { body: { code: c.trim(), destinationId: siteId || undefined } })); }
    catch (e: any) { if (isNetworkError(e)) { if (c.trim().startsWith("HP1.")) { setRes(null); toast.error("Season passes need a connection to check."); } else setRes(verifyOffline(c.trim())); } else { setRes(null); toast.error(e.message); } }
    finally { setBusy(false); }
  }

  /* ---------- record ---------- */
  async function record(action: "in" | "out") {
    setBusy(true);
    const q = qty === "" ? undefined : qty;
    try {
      const r = await api("/api/entries", { body: { code, action, quantity: q, destinationId: siteId || undefined } });
      if (r.kind !== "pass") applyLocal(refOf(code), action, r.quantity);
      toast.success(r.kind === "pass" ? `Pass ${action === "in" ? "admitted" : "checked out"}: ${r.holderName}. Inside now: ${r.occupancy}` : `${action === "in" ? "Checked in" : "Checked out"} ${r.quantity} visitor(s). Inside now: ${r.occupancy}`);
      finish(action, r.reference, r.quantity); await verify(code);
    } catch (e: any) {
      if (!isNetworkError(e)) { toast.error(e.message); }
      else {
        const mf = load<Manifest | null>(MK, null); const en = mf?.byRef[refOf(code)];
        if (!en) { toast.error("Can't save offline: this ticket isn't in the offline list."); }
        else {
          const room = action === "in" ? en.q - en.i : en.i - en.o; const n = q ?? room;
          if (n < 1 || n > room) { toast.error(action === "in" ? `Only ${room} visitor(s) left to check in` : `Only ${room} visitor(s) are inside`); }
          else {
            const queue = load<Op[]>(QK, []); queue.push({ id: crypto.randomUUID(), code, action, quantity: n, at: new Date().toISOString() }); save(QK, queue); setPending(queue.length);
            applyLocal(refOf(code), action, n); toast.warning(`Saved offline (${n} visitor(s)). It will sync when you're back online.`);
            finish(action, refOf(code), n, true); setRes(verifyOffline(code));
          }
        }
      }
    } finally { setBusy(false); }
  }
  const finish = (action: "in" | "out", ref: string, n: number, off = false) => { setQty(""); setLog((l) => [`${new Date().toLocaleTimeString("en-IN")}  ${action === "in" ? "IN " : "OUT"}  ${ref}  x${n}${off ? "  (offline)" : ""}`, ...l].slice(0, 10)); };

  useEffect(() => {
    if (!cam) return;
    let stream: MediaStream | undefined, stop = false;
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
        if (video.current) { video.current.srcObject = stream; await video.current.play(); }
        const det = new (window as any).BarcodeDetector({ formats: ["qr_code"] });
        const tick = async () => { if (stop || !video.current) return; try { const f = await det.detect(video.current); if (f[0]?.rawValue) { setCam(false); verify(f[0].rawValue); return; } } catch { /* keep scanning */ } setTimeout(tick, 350); };
        tick();
      } catch { toast.error("Camera unavailable. Type the code instead."); setCam(false); }
    })();
    return () => { stop = true; stream?.getTracks().forEach((x) => x.stop()); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cam]);

  const b = res?.booking;
  const toEnter = b ? b.quantity - (b.checkedInCount || 0) : 0;
  const inside = b ? (b.checkedInCount || 0) - (b.checkedOutCount || 0) : 0;
  const base = !!b && b.status === "confirmed";
  const canIn = base && !!res?.valid && toEnter > 0;
  const canOut = base && inside > 0 && (res?.reasons || []).every((r) => r.startsWith("Outside slot window"));
  const maxQ = Math.max(toEnter, inside, 1);
  const good = (res?.valid && toEnter > 0) || canOut;

  return (
    <div className="max-w-2xl space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-3xl">{t("scan.title")}</h1>
        <div className="flex flex-wrap items-center gap-2 text-sm" role="status" aria-live="polite">
          {online ? <Badge className="bg-emerald-100 text-emerald-900"><Wifi className="h-3.5 w-3.5" aria-hidden />Online</Badge> : <Badge className="bg-amber-100 text-amber-900"><CloudOff className="h-3.5 w-3.5" aria-hidden />Offline mode</Badge>}
          {pending > 0 && <Badge className="bg-terracotta-50 text-terracotta-600">{pending} waiting to sync</Badge>}
          {pending > 0 && online && <Button size="sm" variant="outline" onClick={syncQueue}><RefreshCw className="h-3.5 w-3.5" aria-hidden />Sync now</Button>}
        </div>
      </div>
      {!online && <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">No connection. Scans use today's saved list{mAt ? ` (updated ${new Date(mAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })})` : ""} and are saved on this device. Keep this page open, and it syncs automatically when the connection returns.</p>}

      <Card className="space-y-3 p-5">
        {sites.length > 1 && <label className="flex items-center gap-2 text-sm"><span className="text-ink/70">Scanning at</span><select value={siteId} onChange={(e) => setSiteId(e.target.value)} className="h-9 rounded-lg border border-forest/25 bg-white px-2">{sites.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></label>}
        <form onSubmit={(e) => { e.preventDefault(); verify(); }} className="flex gap-2"><label className="sr-only" htmlFor="code">Ticket code or booking reference</label><Input id="code" value={code} onChange={(e) => setCode(e.target.value)} placeholder={t("scan.placeholder")} autoFocus autoComplete="off" /><Button type="submit" loading={busy}>{t("scan.verify")}</Button></form>
        <div className="flex flex-wrap items-center gap-2"><Button variant="outline" size="sm" onClick={() => setCam(!cam)} disabled={!supported}><Camera className="h-4 w-4" aria-hidden />{cam ? "✕" : t("scan.camera")}</Button>{!supported && <span className="text-xs text-ink/60">Camera scanning isn't supported in this browser. Use a USB scanner or type the reference.</span>}</div>
        {cam && <video ref={video} muted playsInline className="w-full rounded-lg bg-black" aria-label="Camera preview" />}
      </Card>

      {res?.kind === "pass" && res.pass && (() => { const p = res.pass; const canPassIn = res.valid && !p.inside && p.entriesToday < p.maxEntriesPerDay; const canPassOut = res.reasons.length === 0 && p.inside; const ok = canPassIn || canPassOut; return (
        <Card className={`space-y-3 border-2 p-5 ${ok ? "border-emerald-600" : "border-red-600"}`} aria-live="polite">
          <div className="flex items-center gap-2 text-lg font-medium">{ok ? <CheckCircle2 className="h-6 w-6 text-emerald-700" aria-hidden /> : <XCircle className="h-6 w-6 text-red-700" aria-hidden />}Season pass: {ok ? (canPassOut ? "holder is inside" : "valid for entry") : "not valid for entry"}</div>
          {res.reasons.length > 0 && <ul className="list-disc pl-5 text-sm text-red-800">{res.reasons.map((r) => <li key={r}>{r}</li>)}</ul>}
          {!res.reasons.length && !canPassIn && !canPassOut && <p className="rounded bg-amber-50 p-2 text-sm text-amber-900">{p.inside ? "Holder is already inside." : `Daily entry limit reached (${p.maxEntriesPerDay} per day).`}</p>}
          <dl className="grid gap-2 text-sm sm:grid-cols-2"><div><dt className="text-ink/60">Holder</dt><dd className="font-medium">{p.holderName}</dd></div><div><dt className="text-ink/60">Reference</dt><dd className="font-mono">{p.reference}</dd></div><div><dt className="text-ink/60">Valid</dt><dd>{p.validFrom} to {p.validTo}</dd></div><div><dt className="text-ink/60">Today</dt><dd>{p.entriesToday} of {p.maxEntriesPerDay} entries used{p.inside ? ", currently inside" : ""}</dd></div><div className="sm:col-span-2"><dt className="text-ink/60">Covers</dt><dd>{p.destinations.join(", ")}</dd></div></dl>
          <div className="flex gap-3"><Button disabled={!canPassIn} loading={busy} onClick={() => record("in")}><LogIn className="h-4 w-4" aria-hidden />{t("scan.checkin")}</Button><Button variant="outline" disabled={!canPassOut} loading={busy} onClick={() => record("out")}><LogOut className="h-4 w-4" aria-hidden />{t("scan.checkout")}</Button></div>
        </Card>); })()}

      {res && res.kind !== "pass" && (
        <Card className={`space-y-3 border-2 p-5 ${good ? "border-emerald-600" : "border-red-600"}`} aria-live="polite">
          <div className="flex items-center gap-2 text-lg font-medium">{good ? <CheckCircle2 className="h-6 w-6 text-emerald-700" aria-hidden /> : <XCircle className="h-6 w-6 text-red-700" aria-hidden />}{res.valid && toEnter > 0 ? t("scan.valid") : canOut ? t("scan.inside") : t("scan.invalid")}{res.offline && <Badge className="bg-amber-100 text-amber-900">offline check</Badge>}</div>
          {res.reasons.length > 0 && <ul className="list-disc pl-5 text-sm text-red-800">{res.reasons.map((r) => <li key={r}>{r}</li>)}</ul>}
          {base && toEnter === 0 && inside === 0 && <p className="rounded bg-sky-50 p-2 text-sm text-sky-900">All visitors on this booking have already entered and left.</p>}
          {res.warnings.map((w) => <p key={w} className="rounded bg-amber-50 p-2 text-sm text-amber-900">{w}</p>)}
          {b && <dl className="grid gap-2 text-sm sm:grid-cols-2"><div><dt className="text-ink/60">Reference</dt><dd className="font-mono">{b.reference}</dd></div><div><dt className="text-ink/60">Destination</dt><dd>{res.destination?.name}</dd></div><div><dt className="text-ink/60">Date and slot</dt><dd>{b.date}, {fmtTime(b.start)} to {fmtTime(b.end)}</dd></div><div><dt className="text-ink/60">Visitors</dt><dd>{b.quantity}{b.visitors?.length ? `: ${b.visitors.map((v: any) => v.name).join(", ")}` : ""}</dd></div><div><dt className="text-ink/60">Entered / inside now</dt><dd>{b.checkedInCount || 0} of {b.quantity} entered, {inside} inside</dd></div><div><dt className="text-ink/60">Status</dt><dd><StatusBadge s={b.status} /></dd></div><div><dt className="text-ink/60">Lead booker</dt><dd>{b.contact?.name}</dd></div></dl>}
          <div className="flex flex-wrap items-end gap-3">{(canIn || canOut) && b.quantity > 1 && <label className="text-sm">{t("scan.people")}<input type="number" min={1} max={maxQ} value={qty} placeholder="all" onChange={(e) => setQty(e.target.value === "" ? "" : Math.max(1, Math.min(maxQ, Number(e.target.value))))} className="ml-2 h-10 w-20 rounded-lg border border-forest/25 px-2" /></label>}<Button disabled={!canIn} loading={busy} onClick={() => record("in")}><LogIn className="h-4 w-4" aria-hidden />{t("scan.checkin")}</Button><Button variant="outline" disabled={!canOut} loading={busy} onClick={() => record("out")}><LogOut className="h-4 w-4" aria-hidden />{t("scan.checkout")}</Button></div>
        </Card>)}

      {failed.length > 0 && (
        <Card className="space-y-2 border-red-300 p-4"><h2 className="text-base">Offline scans that need review</h2>
          <ul className="space-y-1 text-sm">{failed.map((f) => <li key={f.id} className="flex items-start justify-between gap-2"><span><span className="font-mono">{refOf(f.code)}</span> {f.action === "in" ? "entry" : "exit"} x{f.quantity ?? "all"} at {new Date(f.at).toLocaleTimeString("en-IN")}: <span className="text-red-800">{f.error}</span></span></li>)}</ul>
          <Button size="sm" variant="outline" onClick={() => { save(FK, []); setFailed([]); }}>Mark as reviewed</Button></Card>)}
      {log.length > 0 && <Card className="p-4"><h2 className="text-base">This session</h2><pre className="mt-2 overflow-x-auto text-xs">{log.join("\n")}</pre></Card>}
    </div>
  );
}
