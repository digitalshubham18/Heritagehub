import { handle, ok, ApiError } from "@/lib/api";
import { canAccessDestination, requireUser, scopeIds } from "@/lib/auth";
import { Device, DeviceEvent } from "@/models";

/** Last gate decisions, for one device (?device=) or for everything the manager may see. */
export const GET = handle(async (req) => {
  const me = await requireUser(["admin", "operator"]);
  const id = req.nextUrl.searchParams.get("device");
  const f: any = {};
  if (id) { const d: any = await Device.findById(id).select("destination").lean(); if (!d || !canAccessDestination(me, d.destination)) throw new ApiError(404, "Device not found"); f.device = id; }
  else { const scope = scopeIds(me); if (scope) f.destination = { $in: scope }; }
  const items = await DeviceEvent.find(f).sort({ at: -1 }).limit(40).populate("device", "name kind direction").lean();
  return ok({ items });
});
export const dynamic = "force-dynamic";
