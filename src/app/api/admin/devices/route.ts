import { z } from "zod";
import { handle, ok, ApiError } from "@/lib/api";
import { canAccessDestination, requireUser, scopeIds } from "@/lib/auth";
import { Destination, Device } from "@/models";
import { audit } from "@/lib/audit";
import { deviceOnline, newDeviceKey } from "@/lib/devices";

const create = z.object({ name: z.string().trim().min(2).max(60), destinationId: z.string(), kind: z.enum(["scanner", "turnstile", "kiosk", "printer", "plate_camera", "people_counter"]), direction: z.enum(["in", "out"]).default("in"), mode: z.enum(["one", "all"]).default("one") });

export const GET = handle(async () => {
  const me = await requireUser(["admin", "operator"]);
  const scope = scopeIds(me);
  const items: any[] = await Device.find(scope ? { destination: { $in: scope } } : {}).sort({ createdAt: -1 }).select("-keyHash").lean();
  const dests: any[] = await Destination.find(scope ? { _id: { $in: scope } } : {}).select("name").lean();
  return ok({ items: items.map((d) => ({ ...d, online: deviceOnline(d), destinationName: dests.find((x) => String(x._id) === String(d.destination))?.name })), destinations: dests });
});

/** Returns the device key ONCE. Only its hash is stored. */
export const POST = handle(async (req) => {
  const me = await requireUser(["admin", "operator"]);
  const b = create.parse(await req.json());
  if (!canAccessDestination(me, b.destinationId)) throw new ApiError(403, "Not your destination");
  const dest: any = await Destination.findById(b.destinationId).select("operator").lean();
  const k = newDeviceKey();
  const d: any = await Device.create({ name: b.name, destination: b.destinationId, operator: dest?.operator, kind: b.kind, direction: b.direction, mode: b.mode, keyHash: k.hash, keyHint: k.hint });
  await audit(me, "device.create", "Device", d._id, `Registered ${b.kind} "${b.name}"`);
  return ok({ device: { _id: d._id, name: d.name }, key: k.raw }, 201);
});

export const PATCH = handle(async (req) => {
  const me = await requireUser(["admin", "operator"]);
  const { id, active, rotate } = await req.json();
  const d: any = await Device.findById(id).lean();
  if (!d || !canAccessDestination(me, d.destination)) throw new ApiError(404, "Device not found");
  const set: any = {}; let key: string | undefined;
  if (typeof active === "boolean") set.active = active;
  if (rotate) { const k = newDeviceKey(); set.keyHash = k.hash; set.keyHint = k.hint; key = k.raw; }
  await Device.updateOne({ _id: id }, { $set: set });
  await audit(me, rotate ? "device.rotate" : "device.update", "Device", id, `${rotate ? "Rotated key for" : "Updated"} ${d.name}`);
  return ok({ ok: true, key });
});
export const dynamic = "force-dynamic";
