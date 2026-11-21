"use client";
import { useState } from "react";
import { toast } from "sonner";
import { CheckCircle2, DoorOpen, Lock, Smartphone, XCircle } from "lucide-react";
import { api, useApi } from "@/lib/hooks";
import { Badge, Button, Card, Field, Input, Select } from "@/components/ui";
import { cn } from "@/lib/utils";

/** Plain-language explanation of what a gate device is, for managers who have never set one up. */
export function GateExplainer() {
  return (
    <Card className="space-y-4 p-5 text-sm">
      <h2 className="text-lg">What is a gate device (turnstile)?</h2>
      <p className="max-w-3xl text-ink/85">A gate device is the physical gate at your entrance, such as a turnstile with a rotating arm or a boom barrier, with a small QR reader attached. It lets people in automatically, so staff don&apos;t have to check every ticket by hand.</p>
      <ol className="grid gap-3 md:grid-cols-4">
        {[[Smartphone, "1. Visitor scans", "They hold their ticket QR (from their phone or a printout) up to the reader."], [DoorOpen, "2. Gate asks this app", "The device sends the scanned code here and waits a moment for the answer."], [CheckCircle2, "3. App decides", "It checks the ticket is real, for today, for this site, not already used, and that entry isn't paused."], [Lock, "4. Gate obeys", "On “allow” the arm unlocks for one person (or the whole party). On “deny” it stays locked and the screen says why."]].map(([I, h, t]: any) => (
          <li key={h} className="rounded-xl border border-forest/10 bg-ivory-100 p-3"><I className="h-5 w-5 text-terracotta" aria-hidden /><p className="mt-1 font-medium">{h}</p><p className="mt-0.5 text-ink/75">{t}</p></li>))}
      </ol>
      <div className="grid gap-3 md:grid-cols-2">
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3"><p className="font-medium text-emerald-950">Do you need one?</p><p className="mt-1 text-emerald-950/85">Only if you have, or plan to buy, an automated gate. Without hardware, staff can scan tickets with a phone on the <strong>Scan</strong> page. That already works, and everything here is optional.</p></div>
        <div className="rounded-xl border border-forest/15 bg-white p-3"><p className="font-medium">What you do in this page</p><ul className="mt-1 list-disc space-y-0.5 pl-5 text-ink/85"><li>Register the device. You get a secret key to put in the gate controller.</li><li>Watch whether it is online and what it decided.</li><li>Try a scan below, without any hardware.</li></ul></div>
      </div>
    </Card>
  );
}

/** Run a scan through the real gate logic, and see the latest decisions. */
export function GateTester({ devices }: { devices: any[] }) {
  const ev = useApi<any>("/api/admin/devices/events", { poll: 10000 });
  const [deviceId, setDeviceId] = useState(""), [code, setCode] = useState(""), [dir, setDir] = useState<"in" | "out">("in"), [busy, setBusy] = useState(false), [res, setRes] = useState<any>(null);
  const dev = deviceId || devices.find((d) => d.active)?._id || "";
  async function run() {
    setBusy(true); setRes(null);
    try { setRes(await api("/api/admin/devices/test", { body: { deviceId: dev, code: code.trim(), direction: dir } })); ev.reload(); }
    catch (e: any) { toast.error(e.message); } finally { setBusy(false); }
  }
  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_1.2fr]">
      <Card className="space-y-4 p-5"><div><h2 className="text-lg">Test console</h2><p className="mt-1 text-sm text-ink/75">Try a scan exactly as a gate would. Paste the text from a ticket QR, or a booking reference.</p></div>
        {devices.length === 0 ? <p className="text-sm text-ink/70">Register a device first.</p> : <>
          <Field label="Device"><Select value={dev} onChange={(e) => setDeviceId(e.target.value)}>{devices.filter((d) => d.active).map((d) => <option key={d._id} value={d._id}>{d.name}</option>)}</Select></Field>
          <div className="grid gap-3 sm:grid-cols-[1fr_8rem]"><Field label="Scanned code or reference"><Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="HH1.… or HH-XXXX-XXXX" className="font-mono" autoComplete="off" /></Field><Field label="Direction"><Select value={dir} onChange={(e) => setDir(e.target.value as any)}><option value="in">Entry</option><option value="out">Exit</option></Select></Field></div>
          <Button loading={busy} disabled={!dev || code.trim().length < 4} onClick={run}>Run test scan</Button>
          <p className="rounded-lg bg-amber-50 p-2 text-xs text-amber-900">An “allow” records a real entry or exit, the same as a physical scan. Use a test booking.</p>
          {res && <div role="status" className={cn("rounded-xl border p-4", res.allow ? "border-emerald-300 bg-emerald-50" : "border-red-300 bg-red-50")}><p className="flex items-center gap-2 font-display text-xl">{res.allow ? <CheckCircle2 className="h-6 w-6 text-emerald-700" aria-hidden /> : <XCircle className="h-6 w-6 text-red-700" aria-hidden />}{res.allow ? "Gate would OPEN" : "Gate would STAY LOCKED"}</p>
            <p className="mt-1 font-mono text-sm">Screen shows: “{res.message}”</p>{!res.allow && <p className="mt-1 text-sm">Reason: {res.reason}</p>}{res.allow && res.occupancy != null && <p className="mt-1 text-sm">Inside now: {res.occupancy}</p>}</div>}</>}
      </Card>
      <Card className="overflow-hidden"><div className="flex items-center justify-between border-b border-forest/10 p-4"><h2 className="text-lg">Recent gate decisions</h2><span className="text-xs text-ink/60">Updates every 10 s</span></div>
        <div className="max-h-96 overflow-auto"><table className="w-full min-w-[420px] text-sm"><caption className="sr-only">Recent gate decisions</caption><thead className="sticky top-0 bg-forest-50 text-left"><tr><th className="p-3 font-medium">Time</th><th className="p-3 font-medium">Device</th><th className="p-3 font-medium">Result</th><th className="p-3 font-medium">Screen text</th></tr></thead>
          <tbody>{(ev.data?.items || []).length === 0 && <tr><td colSpan={4} className="p-6 text-center text-ink/60">No scans yet.</td></tr>}{(ev.data?.items || []).map((e: any) => <tr key={e._id} className="border-t border-forest/10"><td className="p-3 whitespace-nowrap">{new Date(e.at).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</td><td className="p-3">{e.device?.name || "Device"}<span className="block text-xs text-ink/55">{e.direction === "out" ? "Exit" : "Entry"}{e.source === "console" ? " · test" : ""}</span></td><td className="p-3">{e.allow ? <Badge className="bg-emerald-100 text-emerald-900">Allowed</Badge> : <Badge className="bg-red-100 text-red-900">Denied</Badge>}</td><td className="p-3 font-mono text-xs">{e.message}{!e.allow && <span className="block font-sans text-ink/60">{e.reason}</span>}</td></tr>)}</tbody></table></div></Card>
    </div>
  );
}
