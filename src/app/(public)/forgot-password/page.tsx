"use client";
import { useState } from "react";
import { api } from "@/lib/hooks";
import { Button, Field, Input } from "@/components/ui";
import { AuthLink, AuthShell } from "@/components/auth-shell";

export default function ForgotPassword() {
  const [email, setEmail] = useState(""); const [busy, setBusy] = useState(false); const [done, setDone] = useState(""); const [err, setErr] = useState("");
  async function go(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setErr("");
    try { const r = await api("/api/auth/forgot", { body: { email } }); setDone(r.message); } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  }
  return (
    <AuthShell title="Reset your password" subtitle="Enter the email you signed up with and we'll send a link." footer={<p><AuthLink href="/login">Back to sign in</AuthLink></p>}>
      {done ? <p role="status" className="rounded-lg bg-forest-50 p-3 text-sm text-forest">{done}</p> : (
        <form onSubmit={go} className="space-y-4" noValidate>
          {err && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">{err}</p>}
          <Field label="Email"><Input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></Field>
          <Button type="submit" size="lg" className="w-full" loading={busy}>Send reset link</Button>
        </form>
      )}
    </AuthShell>
  );
}
