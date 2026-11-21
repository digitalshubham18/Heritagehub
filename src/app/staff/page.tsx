"use client";
import { useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { CarFront, PauseCircle, PlayCircle, QrCode, Search, Siren, Ticket, Wallet } from "lucide-react";
import { api, useApi } from "@/lib/hooks";
import { Button, Card, Empty, ErrorState, Field, Input, Modal, PageSkeleton, Select, Textarea } from "@/components/ui";
import { CrowdRibbon, DensityBar } from "@/components/crowd";
import { LiveTag, TrendChip, useLive } from "@/components/live";
import { cn, fmtTime, todayIST, classify } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";

const SEV_STYLE: Record<string, string> = { info: "border-sky-200 bg-sky-50 text-sky-950", warning: "border-amber-300 bg-amber-50 text-amber-950", critical: "border-red-300 bg-red-50 text-red-950" };

function Site({ s, onReport, onPause }: { s: any; onReport: (id: string) => void; onPause: (s: any) => void }) {
  const { t } = useI18n();
  const slots = useApi<any>(`/api/slots?destination=${s.slug}&date=${todayIST()}`, { poll: 30000 });
  const live = useLive(s.slug, { detail: true }).items[0];
  const lvl = classify(s.pct);
  return (
    <Card className="space-y-4 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-xl">{s.name}</h2><p className="text-sm text-ink/70">{s.checkedInToday} {t("staff.checkedin")}</p></div>
        <div className="flex flex-wrap gap-2"><Button size="sm" variant={s.entryPaused ? "accent" : "outline"} onClick={() => onPause(s)}>{s.entryPaused ? <><PlayCircle className="h-4 w-4" aria-hidden />Resume entry</> : <><PauseCircle className="h-4 w-4" aria-hidden />Pause entry</>}</Button><Button size="sm" variant="outline" onClick={() => onReport(s.id)}><Siren className="h-4 w-4" aria-hidden />{t("staff.report")}</Button></div></div>
      {s.entryPaused && <p role="alert" className="flex items-center gap-2 rounded-lg bg-red-50 p-3 text-sm text-red-900"><PauseCircle className="h-5 w-5 shrink-0" aria-hidden /><span><strong>Entry is paused</strong>{s.entryPausedReason ? `: ${s.entryPausedReason}` : ""}. Gate scans are being refused; exits still work.</span></p>}
      <div><div className="mb-1 flex flex-wrap items-center justify-between gap-2 text-sm"><span>{t("staff.inside")}: <strong>{s.occupancy}</strong> / {s.limit}</span><span className="flex items-center gap-3">{live && <><LiveTag quiet={live.quiet} /><TrendChip trend={live.trend} /></>}<span>{s.pct}%</span></span></div><DensityBar pct={s.pct} level={lvl} />
        {live && <p className="mt-1 text-xs text-ink/65">Last 15 min: {live.entriesLast15} in, {live.exitsLast15} out{live.waitMin > 0 ? ` · about ${live.waitMin} min queue expected` : ""}</p>}
        {s.overThreshold && !s.entryPaused && <p role="alert" className="mt-2 rounded bg-red-50 p-2 text-sm text-red-800">Occupancy is above the alert threshold. Slow entry at the gate, or pause entry until it eases.</p>}</div>
      {slots.data && !slots.data.closed && <><CrowdRibbon slots={slots.data.slots} /><div className="max-h-56 overflow-y-auto"><table className="w-full text-sm"><thead className="text-left text-ink/60"><tr><th className="py-1 font-medium">Slot</th><th className="py-1 font-medium">Booked</th><th className="py-1 font-medium">Capacity</th></tr></thead><tbody>{slots.data.slots.map((p: any) => <tr key={p.start} className="border-t border-forest/10"><td className="py-1">{fmtTime(p.start)}</td><td>{p.booked}</td><td>{p.capacity}{p.closed && " (closed)"}</td></tr>)}</tbody></table></div></>}
      {slots.data?.closed && <p className="text-sm text-ink/60">No slots today (closed).</p>}
    </Card>
  );
}

const QUICK = [{ href: "/staff/scan", label: "Scan tickets", icon: QrCode }, { href: "/staff/counter", label: "Counter sale", icon: Ticket }, { href: "/staff/parking", label: "Parking", icon: CarFront }, { href: "/staff/lookup", label: "Find a visitor", icon: Search }, { href: "/staff/shift", label: "Shift and cash", icon: Wallet }];
const CATS = [["medical", "Medical emergency"], ["lost_child", "Lost child or person"], ["security", "Security concern"], ["crowd", "Crowd problem"], ["maintenance", "Maintenance or facilities"], ["other", "Something else"]] as const;

export default function StaffHome() {
  const { t } = useI18n();
  const { data, loading, error, reload } = useApi<any>("/api/entries", { poll: 10000 });
  const notices = useApi<any>("/api/announcements?audience=staff", { poll: 60000 });
  const [rep, setRep] = useState<string | null>(null), [msg, setMsg] = useState(""), [sev, setSev] = useState("warning"), [cat, setCat] = useState("other"), [busy, setBusy] = useState(false);
  const [pause, setPause] = useState<any>(null), [reason, setReason] = useState("");
  async function send() {
    setBusy(true);
    try { await api("/api/incidents", { body: { destinationId: rep, category: cat, severity: sev, message: msg } }); toast.success("Reported to managers"); setRep(null); setMsg(""); setCat("other"); }
    catch (e: any) { toast.error(e.message); } finally { setBusy(false); }
  }
  async function doPause() {
    setBusy(true);
    try { await api("/api/staff/pause", { body: { destinationId: pause.id, paused: !pause.entryPaused, reason: pause.entryPaused ? undefined : reason } }); toast.success(pause.entryPaused ? "Entry resumed" : "Entry paused"); setPause(null); setReason(""); reload(); }
    catch (e: any) { toast.error(e.message); } finally { setBusy(false); }
  }
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3"><h1 className="text-3xl">{t("staff.today")}</h1><Link href="/staff/scan" className="rounded-lg bg-terracotta px-4 py-2 text-sm font-medium text-white hover:bg-terracotta-600">{t("scan.title")}</Link></div>
      {(notices.data?.items || []).length > 0 && <section aria-label="Notices from managers" className="space-y-2">{notices.data.items.map((a: any) => <div key={a._id} role={a.severity === "critical" ? "alert" : "note"} className={cn("rounded-xl border p-3 text-sm", SEV_STYLE[a.severity])}><p className="font-medium">{a.title}</p>{a.body && <p className="mt-0.5">{a.body}</p>}</div>)}</section>}
      <nav aria-label="Quick actions" className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">{QUICK.map((q) => <Link key={q.href} href={q.href} className="flex flex-col items-center gap-2 rounded-xl border border-forest/15 bg-white p-4 text-center text-sm font-medium shadow-card hover:border-terracotta"><q.icon className="h-6 w-6 text-terracotta" aria-hidden />{q.label}</Link>)}</nav>
      {error ? <ErrorState message={error} onRetry={reload} /> : loading ? <PageSkeleton /> : !data.items.length ? <Empty title="No sites assigned">Ask an administrator to assign you to a destination.</Empty> : <div className="grid gap-5 xl:grid-cols-2">{data.items.map((s: any) => <Site key={s.id} s={s} onReport={setRep} onPause={(x) => { setPause(x); setReason(""); }} />)}</div>}
      <Modal open={!!rep} onClose={() => setRep(null)} title="Report an incident">
        <div className="space-y-4">
          <p className="rounded-lg bg-red-50 p-3 text-sm text-red-900">For a medical emergency or a missing child, also alert the on-site response team directly. This report notifies managers immediately.</p>
          <Field label="What kind of incident?"><Select value={cat} onChange={(e) => setCat(e.target.value)}>{CATS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Select></Field>
          {["other", "maintenance", "crowd"].includes(cat) && <Field label="How urgent?"><Select value={sev} onChange={(e) => setSev(e.target.value)}><option value="warning">Needs attention</option><option value="critical">Urgent</option></Select></Field>}
          <Field label="What is happening, and where?"><Textarea value={msg} onChange={(e) => setMsg(e.target.value)} maxLength={500} placeholder="e.g. Elderly visitor unwell near the east gate, needs a wheelchair" /></Field>
          <div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setRep(null)}>Cancel</Button><Button loading={busy} disabled={msg.trim().length < 5} onClick={send}>Send report</Button></div></div>
      </Modal>
      <Modal open={!!pause} onClose={() => setPause(null)} title={pause?.entryPaused ? "Resume entry?" : "Pause entry?"}>
        {pause && <div className="space-y-4">
          {pause.entryPaused ? <p className="text-sm">Gates at <strong>{pause.name}</strong> will accept ticket and pass scans again.</p> : <>
            <p className="text-sm">While paused, every entry scan at <strong>{pause.name}</strong> is refused (tickets and passes) and visitors see the reason. Exits are never blocked. Managers are notified.</p>
            <Field label="Reason" hint="Shown to visitors who check the site"><Input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={120} placeholder="e.g. Crowd surge at the main gate" /></Field></>}
          <div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setPause(null)}>Cancel</Button><Button variant={pause.entryPaused ? "primary" : "danger"} loading={busy} disabled={!pause.entryPaused && reason.trim().length < 3} onClick={doPause}>{pause.entryPaused ? "Resume entry" : "Pause entry"}</Button></div></div>}
      </Modal>
    </div>
  );
}
