"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { api } from "@/lib/hooks";
import { Button, Field, Input, PasswordInput, Select } from "@/components/ui";
import { AuthLink, AuthShell } from "@/components/auth-shell";

export default function Register() {
  const router = useRouter();
  const [v, setV] = useState({ name: "", email: "", password: "", phone: "", nationality: "indian" });
  const [errs, setErrs] = useState<any>({}); const [busy, setBusy] = useState(false); const [err, setErr] = useState("");
  async function go(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setErrs({}); setErr("");
    try { await api("/api/auth/register", { body: v }); toast.success("Account created"); router.push("/dashboard"); router.refresh(); }
    catch (e: any) { setErrs(e.issues || {}); setErr(e.issues ? "" : e.message); setBusy(false); }
  }
  return (
    <AuthShell title="Create your account" subtitle="Book tickets, keep QR tickets in one place, save the sites you love." art="amber-fort" footer={<p>Already registered? <AuthLink href="/login">Sign in</AuthLink></p>}>
      <form onSubmit={go} className="space-y-4" noValidate>
        {err && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">{err}</p>}
        <Field label="Full name" error={errs.name?.[0]}><Input autoComplete="name" value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} /></Field>
        <Field label="Email" error={errs.email?.[0]}><Input type="email" autoComplete="email" value={v.email} onChange={(e) => setV({ ...v, email: e.target.value })} /></Field>
        <div className="grid gap-4 sm:grid-cols-2"><Field label="Phone (optional)" error={errs.phone?.[0]}><Input inputMode="tel" autoComplete="tel" value={v.phone} onChange={(e) => setV({ ...v, phone: e.target.value })} /></Field>
        <Field label="Visitor type"><Select value={v.nationality} onChange={(e) => setV({ ...v, nationality: e.target.value })}><option value="indian">Indian citizen</option><option value="foreign">Foreign visitor</option></Select></Field></div>
        <Field label="Password" error={errs.password?.[0]} hint="At least 8 characters"><PasswordInput autoComplete="new-password" value={v.password} onChange={(e) => setV({ ...v, password: e.target.value })} /></Field>
        <Button type="submit" size="lg" className="w-full" loading={busy}>Create account</Button>
      </form>
    </AuthShell>
  );
}
