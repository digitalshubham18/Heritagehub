"use client";
import { useState } from "react";
import { toast } from "sonner";
import { api, useApi, useUser } from "@/lib/hooks";
import { Badge, Button, Card, ErrorState, Field, Input, PasswordInput, Modal, PageSkeleton, Select } from "@/components/ui";

export default function AdminUsers() {
  const [role, setRole] = useState("");
  const { data, loading, error, reload } = useApi<any>(`/api/admin/users${role ? `?role=${role}` : ""}`);
  const me = useUser();
  const ops = useApi<any>(me.user?.role === "admin" ? "/api/admin/operators" : null);
  const [open, setOpen] = useState(false);
  const [edit, setEdit] = useState<any>(null);
  const [nu, setNu] = useState({ name: "", email: "", password: "", role: "staff", assignedDestinations: [] as string[] });
  const [errs, setErrs] = useState<any>({});
  const patch = async (body: any) => { try { await api("/api/admin/users", { method: "PATCH", body }); toast.success("Saved"); reload(); } catch (e: any) { toast.error(e.message); } };
  async function create() { try { await api("/api/admin/users", { body: nu }); toast.success("User created"); setOpen(false); setNu({ name: "", email: "", password: "", role: "staff", assignedDestinations: [] }); reload(); } catch (e: any) { setErrs(e.issues || {}); toast.error(e.message); } }
  const dn = (id: string) => data?.destinations?.find((d: any) => d._id === id)?.name || "";
  const Assign = ({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) => (<fieldset><legend className="mb-1 text-sm font-medium">Assigned destinations</legend><div className="max-h-40 space-y-1 overflow-y-auto">{data?.destinations?.map((d: any) => <label key={d._id} className="flex items-center gap-2 text-sm"><input type="checkbox" className="accent-forest" checked={value.includes(d._id)} onChange={(e) => onChange(e.target.checked ? [...value, d._id] : value.filter((x) => x !== d._id))} />{d.name}</label>)}</div></fieldset>);
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3"><h1 className="text-3xl">Users and staff</h1><div className="flex gap-2">{data?.canCreateRoles?.length > 1 && <Select className="w-40" aria-label="Filter by role" value={role} onChange={(e) => setRole(e.target.value)}><option value="">All roles</option><option value="staff">Staff</option><option value="operator">Operator managers</option><option value="tourist">Tourists</option><option value="admin">Admins</option></Select>}<Button onClick={() => setOpen(true)}>Add user</Button></div></div>
      {error ? <ErrorState message={error} onRetry={reload} /> : loading ? <PageSkeleton /> : (
        <Card className="overflow-x-auto"><table className="w-full min-w-[720px] text-sm"><thead className="bg-forest-50 text-left"><tr>{["Name", "Role", "Assigned sites", "Status", ""].map((h) => <th key={h} className="p-3 font-medium">{h}</th>)}</tr></thead><tbody>{data.items.map((u: any) => (
          <tr key={u.id} className="border-t border-forest/10"><td className="p-3"><p className="font-medium">{u.name}</p><p className="text-xs text-ink/60">{u.email}</p></td>
            <td className="p-3">{data.canCreateRoles?.length > 1 ? <Select aria-label={`Role for ${u.name}`} className="h-8 w-32" value={u.role} onChange={(e) => patch({ id: u.id, role: e.target.value })}><option>tourist</option><option>staff</option><option>operator</option><option>admin</option></Select> : <Badge className="bg-forest-50 text-forest">{u.role}</Badge>}</td>
            <td className="p-3">{u.role === "staff" ? (u.assignedDestinations.map(dn).join(", ") || <span className="text-ink/50">None</span>) : <span className="text-ink/50">{u.role === "operator" ? (ops.data?.items?.find((o: any) => o._id === u.operator)?.name || "operator") : "n/a"}</span>}{u.role === "staff" && <button className="ml-2 text-xs text-terracotta underline" onClick={() => setEdit({ id: u.id, name: u.name, assigned: u.assignedDestinations })}>Edit</button>}</td>
            <td className="p-3">{u.active ? <Badge className="bg-emerald-100 text-emerald-900">Active</Badge> : <Badge className="bg-stone-200">Deactivated</Badge>}</td>
            <td className="p-3 text-right"><Button size="sm" variant="ghost" onClick={() => patch({ id: u.id, active: !u.active })}>{u.active ? "Deactivate" : "Reactivate"}</Button></td></tr>))}</tbody></table></Card>)}
      <Modal open={open} onClose={() => setOpen(false)} title="Add user"><div className="space-y-3">
        <Field label="Name" error={errs.name?.[0]}><Input value={nu.name} onChange={(e) => setNu({ ...nu, name: e.target.value })} /></Field><Field label="Email" error={errs.email?.[0]}><Input type="email" value={nu.email} onChange={(e) => setNu({ ...nu, email: e.target.value })} /></Field>
        <Field label="Temporary password" error={errs.password?.[0]} hint="At least 8 characters"><PasswordInput value={nu.password} onChange={(e) => setNu({ ...nu, password: e.target.value })} /></Field>
        {data?.canCreateRoles?.length > 1 ? <Field label="Role"><Select value={nu.role} onChange={(e) => setNu({ ...nu, role: e.target.value })}><option>staff</option><option>operator</option><option>admin</option><option>tourist</option></Select></Field> : <p className="text-sm text-ink/70">New accounts are staff for your sites.</p>}
        {nu.role === "operator" && <Field label="Operator"><Select value={(nu as any).operatorId || ""} onChange={(e) => setNu({ ...nu, operatorId: e.target.value } as any)}><option value="">Choose…</option>{ops.data?.items?.map((o: any) => <option key={o._id} value={o._id}>{o.name}</option>)}</Select></Field>}
        {nu.role === "staff" && <Assign value={nu.assignedDestinations} onChange={(v) => setNu({ ...nu, assignedDestinations: v })} />}
        <div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button><Button onClick={create}>Create user</Button></div></div></Modal>
      <Modal open={!!edit} onClose={() => setEdit(null)} title={`Sites for ${edit?.name || ""}`}>{edit && <div className="space-y-3"><Assign value={edit.assigned} onChange={(v) => setEdit({ ...edit, assigned: v })} /><div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setEdit(null)}>Cancel</Button><Button onClick={async () => { await patch({ id: edit.id, assignedDestinations: edit.assigned }); setEdit(null); }}>Save</Button></div></div>}</Modal>
    </div>
  );
}
