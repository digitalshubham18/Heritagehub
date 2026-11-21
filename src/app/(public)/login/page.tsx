"use client";
import Link from "next/link";
import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { api } from "@/lib/hooks";
import { Button, Field, Input, PasswordInput } from "@/components/ui";
import { AuthLink, AuthShell } from "@/components/auth-shell";

function Login() {
  const router = useRouter(); const next = useSearchParams().get("next");
  const [v, setV] = useState({ email: "", password: "" }); const [busy, setBusy] = useState(false); const [err, setErr] = useState("");
  function finish(r: any) {
    const home = r.user.role === "admin" || r.user.role === "operator" ? "/admin" : r.user.role === "staff" ? "/staff" : "/dashboard";
    const dest = next || home;
    toast.success(`Welcome back, ${r.user.name.split(" ")[0]}`); router.push(dest); router.refresh();
  }
  async function go(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setErr("");
    try {
      finish(await api("/api/auth/login", { body: v }));
    } catch (e: any) { setErr(e.message); setBusy(false); }
  }
  return (
<AuthShell
  title="Welcome back"
  subtitle="Sign in to see your tickets, bookings and passes."
  slideshow
  footer={
    <p>
      New here? <AuthLink href="/register">Create an account</AuthLink>
    </p>
  }
>      <form onSubmit={go} className="space-y-4" noValidate>
        {err && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">{err}</p>}
        <Field label="Email"><Input type="email" autoComplete="email" value={v.email} onChange={(e) => setV({ ...v, email: e.target.value })} required /></Field>
        <Field label="Password"><PasswordInput autoComplete="current-password" value={v.password} onChange={(e) => setV({ ...v, password: e.target.value })} required /></Field>
        <Button type="submit" size="lg" className="w-full" loading={busy}>Sign in</Button>
        <p className="text-center text-sm"><AuthLink href="/forgot-password">Forgot your password?</AuthLink></p>
      </form>
      {/* <details className="mt-6 rounded-xl bg-ivory-100 p-3 text-xs text-ink/70"> */}
      {/* <summary className="cursor-pointer font-medium">Demo accounts (after seeding)</summary><ul className="mt-2 space-y-0.5 font-mono"><li>admin@heritagehub.test / Admin@123</li><li>operator1@heritagehub.test / Operator@123</li><li>staff@heritagehub.test / Staff@123</li><li>tourist@heritagehub.test / Tourist@123</li></ul></details> */}
    </AuthShell>
  );
}
export default function Page() { return <Suspense><Login /></Suspense>; }