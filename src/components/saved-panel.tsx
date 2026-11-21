"use client";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import { api, useApi } from "@/lib/hooks";
import { Button, Card, Input, Select } from "./ui";

type V = { label: string; number: string; type: string }; type P = { name: string; age?: number };
/** Saved vehicles (used for parking) and frequent travel companions (used to fill names when booking). */
export function SavedPanel() {
  const { data, reload } = useApi<any>("/api/me/saved");
  const [vehicles, setVehicles] = useState<V[]>([]), [people, setPeople] = useState<P[]>([]), [busy, setBusy] = useState(false);
  useEffect(() => { if (data) { setVehicles(data.vehicles || []); setPeople(data.savedVisitors || []); } }, [data]);
  async function save() {
    setBusy(true);
    try { await api("/api/me/saved", { method: "PUT", body: { vehicles: vehicles.filter((v) => v.number.trim()), savedVisitors: people.filter((p) => p.name.trim()).map((p) => ({ name: p.name, age: p.age || undefined })) } }); toast.success("Saved"); reload(); }
    catch (e: any) { toast.error(e.message); } finally { setBusy(false); }
  }
  return (
    <Card className="space-y-6 p-6"><div><h2 className="text-xl">My vehicles and travel companions</h2><p className="mt-1 text-sm text-ink/70">Saved here so parking reservations and group bookings take one tap.</p></div>
      <fieldset className="space-y-3"><legend className="font-medium">Vehicles</legend>
        {vehicles.map((v, i) => <div key={i} className="grid grid-cols-[1fr_1fr_auto] gap-2 sm:grid-cols-[1fr_1fr_1fr_auto]"><Input aria-label="Nickname" placeholder="Nickname" value={v.label} onChange={(e) => setVehicles(vehicles.map((x, j) => j === i ? { ...x, label: e.target.value } : x))} /><Input aria-label="Vehicle number" placeholder="UP80 AB 1234" className="font-mono" value={v.number} onChange={(e) => setVehicles(vehicles.map((x, j) => j === i ? { ...x, number: e.target.value.toUpperCase() } : x))} />
          <Select aria-label="Vehicle type" className="col-span-2 sm:col-span-1" value={v.type} onChange={(e) => setVehicles(vehicles.map((x, j) => j === i ? { ...x, type: e.target.value } : x))}><option value="car">Car</option><option value="two_wheeler">Two-wheeler</option><option value="bus">Bus or coach</option></Select>
          <Button type="button" variant="ghost" aria-label="Remove vehicle" onClick={() => setVehicles(vehicles.filter((_, j) => j !== i))}><Trash2 className="h-4 w-4" /></Button></div>)}
        {vehicles.length < 8 && <Button type="button" variant="outline" size="sm" onClick={() => setVehicles([...vehicles, { label: "", number: "", type: "car" }])}><Plus className="h-4 w-4" aria-hidden />Add a vehicle</Button>}</fieldset>
      <fieldset className="space-y-3"><legend className="font-medium">Travel companions</legend>
        {people.map((p, i) => <div key={i} className="grid grid-cols-[1fr_5rem_auto] gap-2"><Input aria-label="Name" placeholder="Full name" value={p.name} onChange={(e) => setPeople(people.map((x, j) => j === i ? { ...x, name: e.target.value } : x))} /><Input aria-label="Age" placeholder="Age" inputMode="numeric" value={p.age ?? ""} onChange={(e) => setPeople(people.map((x, j) => j === i ? { ...x, age: e.target.value ? Number(e.target.value.replace(/\D/g, "")) : undefined } : x))} /><Button type="button" variant="ghost" aria-label="Remove companion" onClick={() => setPeople(people.filter((_, j) => j !== i))}><Trash2 className="h-4 w-4" /></Button></div>)}
        {people.length < 12 && <Button type="button" variant="outline" size="sm" onClick={() => setPeople([...people, { name: "" }])}><Plus className="h-4 w-4" aria-hidden />Add a companion</Button>}</fieldset>
      <Button loading={busy} onClick={save}>Save</Button></Card>
  );
}
