"use client";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { api, useUser } from "@/lib/hooks";
import { Button, Card, Field, Input, PasswordInput, PageSkeleton, Select } from "@/components/ui";
import { SavedPanel } from "@/components/saved-panel";

export default function Profile() {
  const { user, loading, reload } = useUser();
  const [v, setV] = useState({ name: "", phone: "", nationality: "indian", currentPassword: "", newPassword: "" });
  const [errs, setErrs] = useState<any>({}); const [busy, setBusy] = useState(false);
  useEffect(() => { if (user) setV((p) => ({ ...p, name: user.name, phone: user.phone || "", nationality: user.nationality || "indian" })); }, [user]);
  if (loading) return <PageSkeleton />;
  async function save(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setErrs({});
    const body: any = { name: v.name, phone: v.phone, nationality: v.nationality };
    if (v.newPassword) { body.newPassword = v.newPassword; body.currentPassword = v.currentPassword; }
    try { await api("/api/profile", { method: "PATCH", body }); toast.success("Profile saved"); setV((p) => ({ ...p, currentPassword: "", newPassword: "" })); reload(); } catch (e: any) { setErrs(e.issues || {}); toast.error(e.message); } finally { setBusy(false); }
  }
  return (
    <div className="max-w-xl space-y-5"><h1 className="text-3xl">Profile</h1>
      <Card className="p-6"><form onSubmit={save} className="space-y-4" noValidate>
        <Field label="Email"><Input value={user?.email || ""} disabled /></Field>
        <Field label="Full name" error={errs.name?.[0]}><Input value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} /></Field>
        <Field label="Phone"><Input inputMode="tel" value={v.phone} onChange={(e) => setV({ ...v, phone: e.target.value })} /></Field>
        <Field label="Visitor type"><Select value={v.nationality} onChange={(e) => setV({ ...v, nationality: e.target.value })}><option value="indian">Indian citizen</option><option value="foreign">Foreign visitor</option></Select></Field>
        <fieldset className="space-y-4 border-t border-forest/15 pt-4"><legend className="font-medium">Change password</legend>
          <Field label="Current password"><PasswordInput autoComplete="current-password" value={v.currentPassword} onChange={(e) => setV({ ...v, currentPassword: e.target.value })} /></Field>
          <Field label="New password" error={errs.newPassword?.[0]} hint="At least 8 characters"><PasswordInput autoComplete="new-password" value={v.newPassword} onChange={(e) => setV({ ...v, newPassword: e.target.value })} /></Field></fieldset>
        <Button type="submit" loading={busy}>Save changes</Button>
      </form></Card>
      <SavedPanel />
    </div>
  );
}
