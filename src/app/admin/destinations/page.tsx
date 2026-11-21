"use client";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { api, useApi, useUser } from "@/lib/hooks";
import { Badge, Button, Card, Empty, ErrorState, Modal, PageSkeleton, useConfirm } from "@/components/ui";
import { DestForm } from "@/components/dest-form";
import { fmtTime, inr } from "@/lib/utils";

function AdminDestinations() {
  const { data, loading, error, reload } = useApi<any>("/api/destinations?all=1");
  const me = useUser();
  const ops = useApi<any>(me.user?.role === "admin" ? "/api/admin/operators" : null);
  const [edit, setEdit] = useState<{ destination: any; categories: any[] } | "new" | null>(null);
  // Arriving from a heritage directory page (?heritage=slug) opens the form prefilled from that entry.
  const hslug = useSearchParams().get("heritage");
  const [heritage, setHeritage] = useState<{ slug: string; name: string } | null>(null);
  useEffect(() => {
    if (!hslug) return;
    api<any>(`/api/heritage/${hslug}`).then(({ site: s }) => {
      if (s.bookableSlug) return toast.info(`${s.name} already has online booking`);
      const short = (s.summary || `${s.name} in ${s.city || s.state}.`).replace(/\s+/g, " ").slice(0, 297);
      setHeritage({ slug: s.slug, name: s.name });
      setEdit({ destination: { name: s.name, slug: s.slug, city: s.city || s.state, state: s.state, type: s.type, shortDescription: short.length >= 10 ? short : `${s.name}, ${s.state}.`, history: s.summary || "", images: (s.images || []).map((i: any) => i.thumbUrl || i.url), location: { lat: s.location?.lat ?? 0, lng: s.location?.lng ?? 0, address: [s.city, s.state].filter(Boolean).join(", ") } }, categories: [] });
    }).catch((e) => toast.error(e.message));
  }, [hslug]);
  const { confirm, dialog } = useConfirm();
  async function open(id: string) { try { setEdit(await api(`/api/destinations/${id}`)); } catch (e: any) { toast.error(e.message); } }
  async function toggle(d: any) {
    if (d.active && !(await confirm({ title: `Deactivate ${d.name}?`, body: "It disappears from the public site and new bookings stop. Existing bookings and history are kept.", confirmLabel: "Deactivate", danger: true }))) return;
    try { await api(`/api/destinations/${d._id}`, { method: d.active ? "DELETE" : "PATCH", body: d.active ? undefined : { active: true } }); toast.success(d.active ? "Deactivated" : "Reactivated"); reload(); } catch (e: any) { toast.error(e.message); }
  }
  return (
    <div className="space-y-5">{dialog}
      <div className="flex items-center justify-between"><h1 className="text-3xl">Destinations</h1><Button onClick={() => setEdit("new")}><Plus className="h-4 w-4" aria-hidden />Add destination</Button></div>
      {error ? <ErrorState message={error} onRetry={reload} /> : loading ? <PageSkeleton /> : !data.items.length ? <Empty title="No destinations yet" /> : (
        <Card className="overflow-x-auto"><table className="w-full min-w-[720px] text-sm"><thead className="bg-forest-50 text-left"><tr><th className="p-3 font-medium">Name</th><th className="p-3 font-medium">Hours</th><th className="p-3 font-medium">From</th><th className="p-3 font-medium">Slot capacity</th><th className="p-3 font-medium">Status</th><th className="p-3" /></tr></thead>
          <tbody>{data.items.map((d: any) => <tr key={d._id} className="border-t border-forest/10"><td className="p-3"><p className="font-medium">{d.name}</p><p className="text-xs text-ink/60">{d.city}, {d.state}{d.operatorName ? ` · ${d.operatorName}` : ""}</p></td><td className="p-3">{fmtTime(d.hours.open)} to {fmtTime(d.hours.close)}</td><td className="p-3">{inr(d.fromPriceMinor)}</td><td className="p-3">{d.defaultSlotCapacity}</td><td className="p-3">{d.active ? <Badge className="bg-emerald-100 text-emerald-900">Active</Badge> : <Badge className="bg-stone-200">Inactive</Badge>}</td>
            <td className="space-x-1 p-3 text-right whitespace-nowrap"><a href={`/destinations/${d.slug}`} target="_blank" rel="noreferrer" className="text-xs text-terracotta underline">View</a><Button size="sm" variant="outline" onClick={() => open(d._id)}>Edit</Button><Button size="sm" variant="ghost" onClick={() => toggle(d)}>{d.active ? "Deactivate" : "Reactivate"}</Button></td></tr>)}</tbody></table></Card>)}
      <Modal wide open={!!edit} onClose={() => { setEdit(null); setHeritage(null); }} title={heritage ? "Open online booking" : edit === "new" ? "Add destination" : "Edit destination"}>
        {edit && <div className="max-h-[75vh] overflow-y-auto pr-2"><DestForm operators={ops.data?.items} heritage={heritage || undefined} initial={edit === "new" ? undefined : edit} onCancel={() => { setEdit(null); setHeritage(null); }} onSaved={() => { setEdit(null); setHeritage(null); reload(); }} /></div>}
      </Modal>
    </div>
  );
}
export default function Page() { return <Suspense><AdminDestinations /></Suspense>; }
