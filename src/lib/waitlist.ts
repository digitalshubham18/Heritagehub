import { TimeSlot, Waitlist } from "@/models";
import { notifyWaitlist } from "./notify";
import { todayIST } from "./utils";

/** Moves matching entries out of the "waiting" state, freeing the per-user/slot unique key so they can rejoin later. */
export async function closeWaitlist(filter: Record<string, unknown>, status: "notified" | "fulfilled" | "cancelled") {
  const docs: any[] = await Waitlist.find(filter).select("_id").lean();
  for (const d of docs) await Waitlist.updateOne({ _id: d._id }, { status, slotKey: `done:${d._id}`, ...(status === "notified" ? { notifiedAt: new Date() } : {}) });
}

/** Called whenever seats come back (cancellation, expiry, capacity increase, reopen). First come, first served. */
export async function processWaitlist(slotId: any) {
  const slot: any = await TimeSlot.findById(slotId).lean();
  if (!slot || slot.closed || slot.date < todayIST()) return;
  let remaining = slot.capacity - slot.booked;
  if (remaining <= 0) return;
  const waiting: any[] = await Waitlist.find({ slot: slotId, status: "waiting" }).sort({ createdAt: 1 }).lean();
  for (const w of waiting) {
    if (w.quantity > remaining) continue;
    const claimed = await Waitlist.findOneAndUpdate({ _id: w._id, status: "waiting" }, { status: "notified", slotKey: `done:${w._id}`, notifiedAt: new Date() });
    if (!claimed) continue;
    remaining -= w.quantity;
    await notifyWaitlist(w, slot);
  }
}
