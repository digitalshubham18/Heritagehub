import { handle, ok } from "@/lib/api";
import { requireDevice } from "@/lib/devices";
import { Destination } from "@/models";
import { liveOccupancy } from "@/lib/headcount";

/** Controllers call this every ~30 s. It marks the device online and returns the live headcount for display. */
export const POST = handle(async (req) => {
  const d = await requireDevice(req);
  const dest: any = await Destination.findById(d.destination).select("name occupancyLimit entryPaused").lean();
  return ok({ ok: true, device: d.name, destination: dest?.name, occupancy: (await liveOccupancy(d.destination)).occupancy, limit: dest?.occupancyLimit, entryPaused: !!dest?.entryPaused, serverTime: new Date().toISOString() });
});
export const dynamic = "force-dynamic";
