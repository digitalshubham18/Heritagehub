"use client";
import { useState } from "react";
import { toast } from "sonner";
import { api } from "@/lib/hooks";
import Link from "next/link";
import { Button, Field, Input, Textarea } from "@/components/ui";

export default function Contact() {
  const [v, setV] = useState({ name: "", email: "", message: "" });
  const [errs, setErrs] = useState<any>({});
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState<false | { reference?: string }>(false);
  async function send(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setErrs({});
    try { const r = await api("/api/contact", { body: v }); setSent({ reference: r.reference }); toast.success("Message sent"); } catch (err: any) { setErrs(err.issues || {}); toast.error(err.message); } finally { setBusy(false); }
  }
  return (
    <div className="mx-auto max-w-xl px-4 py-12">
      <h1 className="text-4xl">Contact us</h1>
      {sent ? <p role="status" className="mt-6 rounded-lg bg-emerald-50 p-4 text-emerald-900">Thanks, we have your message and will reply by email.{sent.reference && <> Your request is <strong>{sent.reference}</strong>: follow the conversation under <Link className="underline" href="/dashboard/support">Support in your account</Link>.</>}</p> : (
        <form onSubmit={send} className="mt-6 space-y-4" noValidate>
          <Field label="Name" error={errs.name?.[0]}><Input value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} autoComplete="name" /></Field>
          <Field label="Email" error={errs.email?.[0]}><Input type="email" value={v.email} onChange={(e) => setV({ ...v, email: e.target.value })} autoComplete="email" /></Field>
          <Field label="How can we help?" error={errs.message?.[0]} hint="At least 10 characters"><Textarea value={v.message} onChange={(e) => setV({ ...v, message: e.target.value })} /></Field>
          <Button type="submit" loading={busy}>Send message</Button>
        </form>)}
    </div>
  );
}
