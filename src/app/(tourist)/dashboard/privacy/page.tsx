"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Download, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { api, useApi } from "@/lib/hooks";
import { Button, Card, ErrorState, Field, Input, PageSkeleton, PasswordInput } from "@/components/ui";

export default function Privacy() {
  const router = useRouter();
  const { data, error, loading, reload } = useApi<any>("/api/me/data?preview=1");
  const [pw, setPw] = useState(""); const [confirm, setConfirm] = useState(""); const [busy, setBusy] = useState(false); const [err, setErr] = useState("");
  async function erase() {
    setBusy(true); setErr("");
    try { await api("/api/me/erase", { body: { password: pw, confirm } }); toast.success("Your account has been erased."); router.push("/"); router.refresh(); }
    catch (e: any) { setErr(e.message); setBusy(false); reload(); }
  }
  if (loading) return <PageSkeleton />;
  if (error) return <ErrorState message={error} onRetry={reload} />;
  const blockers: string[] = data.blockers || [];
  return (
    <div className="max-w-2xl space-y-5">
      <h1 className="text-3xl">Your data</h1>
      <Card className="space-y-3 p-5">
        <h2 className="text-xl">Download my data</h2>
        <p className="text-sm text-ink/80">A file with your profile, bookings, payments, passes, parking, loyalty points, reviews and support messages. Passwords are never included.</p>
        <a href="/api/me/data" className="inline-flex h-10 items-center gap-2 rounded-lg bg-forest px-4 text-sm text-ivory hover:bg-forest-700"><Download className="h-4 w-4" aria-hidden />Download (JSON)</a>
      </Card>
      <Card className="space-y-3 p-5">
        <h2 className="flex items-center gap-2 text-xl"><Trash2 className="h-5 w-5 text-terracotta" aria-hidden />Erase my account</h2>
        <p className="text-sm text-ink/80">We remove your name, email, phone, saved vehicles and companions, vehicle numbers, review text and support messages, and close the account. <strong>Loyalty points are lost.</strong> Payment amounts, GST and invoice numbers are kept without your details, because tax law requires us to keep accounting records. This can't be undone.</p>
        {blockers.length > 0 ? (
          <div role="status" className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900"><p className="font-medium">Not possible yet:</p><ul className="list-disc pl-5">{blockers.map((b) => <li key={b}>{b}</li>)}</ul></div>
        ) : (
          <div className="space-y-3">
            {err && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">{err}</p>}
            <Field label="Password"><PasswordInput autoComplete="current-password" value={pw} onChange={(e) => setPw(e.target.value)} /></Field>
            <Field label='Type ERASE to confirm'><Input value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="off" /></Field>
            <Button variant="outline" onClick={erase} loading={busy} disabled={!pw || confirm !== "ERASE"}>Erase my account</Button>
          </div>
        )}
      </Card>
    </div>
  );
}
