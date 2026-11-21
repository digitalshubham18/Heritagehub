import { TimeSlot } from "@/models";
import { dow, toMin, toHHMM } from "./utils";

export type SlotView = { _id: string | null; start: string; end: string; capacity: number; booked: number; closed: boolean; closedReason?: string };

/** Slots implied by the destination's opening hours and slot duration. Empty on closed days / closures. */
export function slotTemplate(dest: any, date: string) {
  if (dest.hours.closedDays?.includes(dow(date)) || dest.closures?.some((c: any) => c.date === date)) return [];
  const step = dest.slotDurationMin || 60;
  const out: { start: string; end: string }[] = [];
  for (let s = toMin(dest.hours.open); s + step <= toMin(dest.hours.close); s += step) out.push({ start: toHHMM(s), end: toHHMM(s + step) });
  return out;
}

/** Read-only view: template merged with persisted state. Never writes. */
export async function readSlots(dest: any, date: string): Promise<SlotView[]> {
  const tpl = slotTemplate(dest, date);
  const docs = await TimeSlot.find({ destination: dest._id, date }).lean();
  const byStart = new Map<string, any>(docs.map((d: any) => [d.start, d]));
  const out: SlotView[] = tpl.map((t) => {
    const d = byStart.get(t.start);
    return d
      ? { _id: String(d._id), start: d.start, end: d.end, capacity: d.capacity, booked: d.booked, closed: d.closed, closedReason: d.closedReason }
      : { _id: null, ...t, capacity: dest.defaultSlotCapacity, booked: 0, closed: false };
  });
  // admin-created custom slots outside the template
  if (tpl.length || docs.length) for (const d of docs) if (!tpl.some((t) => t.start === d.start)) out.push({ _id: String(d._id), start: d.start, end: d.end, capacity: d.capacity, booked: d.booked, closed: d.closed, closedReason: d.closedReason });
  return out.sort((a, b) => a.start.localeCompare(b.start));
}

/** Persists the template as TimeSlot documents (idempotent upsert) so slots have ids that can be booked. */
export async function ensureSlots(dest: any, date: string) {
  const tpl = slotTemplate(dest, date);
  if (tpl.length) {
    await TimeSlot.bulkWrite(tpl.map((t) => ({
      updateOne: {
        filter: { destination: dest._id, date, start: t.start },
        update: { $setOnInsert: { destination: dest._id, date, start: t.start, end: t.end, capacity: dest.defaultSlotCapacity, booked: 0, closed: false } },
        upsert: true,
      },
    })));
  }
  return readSlots(dest, date);
}
