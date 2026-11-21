"use client";
import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { api } from "@/lib/hooks";
import { Button, Field, PasswordInput } from "@/components/ui";
import { AuthLink, AuthShell } from "@/components/auth-shell";

function Reset() {
  const router = useRouter(); const token = useSearchParams().get("token") || "";
  const [pw, setPw] = useState(""); const [pw2, setPw2] = useState(""); const [busy, setBusy] = useState(false); const [err, setErr] = useState("");
  async function go(e: React.FormEvent) {
    e.preventDefault(); setErr("");
    if (pw.length < 8) return setErr("Use at least 8 characters");
    if (pw !== pw2) return setErr("The two passwords don't match");
    setBusy(true);
    try { await api("/api/auth/reset", { body: { token, password: pw } }); toast.success("Password changed. Please sign in."); router.push("/login"); }
    catch (e: any) { setErr(e.message); setBusy(false); }
  }
  return (
    <AuthShell title="Choose a new password" subtitle="You'll be signed out everywhere and asked to sign in again." footer={<p><AuthLink href="/forgot-password">Need a new link?</AuthLink></p>}>
      {!token ? <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">This link is incomplete. Open the link from your email again, or ask for a new one.</p> : (
        <form onSubmit={go} className="space-y-4" noValidate>
          {err && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">{err}</p>}
          <Field label="New password" hint="At least 8 characters"><PasswordInput autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} required /></Field>
          <Field label="Repeat new password"><PasswordInput autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} required /></Field>
          <Button type="submit" size="lg" className="w-full" loading={busy}>Change password</Button>
        </form>
      )}
    </AuthShell>
  );
}
export default function Page() { return <Suspense><Reset /></Suspense>; }
