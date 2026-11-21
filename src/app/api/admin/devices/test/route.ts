import { z } from "zod";
import { handle, ok, ApiError } from "@/lib/api";
import { canAccessDestination, requireUser } from "@/lib/auth";
import { Device } from "@/models";
import { decideScan } from "@/lib/gate";
import { audit } from "@/lib/audit";
import { limit } from "@/lib/ratelimit";

const schema = z.object({ deviceId: z.string().min(1), code: z.string().trim().min(4).max(120), direction: z.enum(["in", "out"]).optional() });
/**
 * Test console: runs a scan through the exact decision logic a physical gate uses, without needing the device key.
 * This DOES record a real entry or exit when the answer is "allow", just like a real scan, so use a test booking.
 */
export const POST = handle(async (req) => {
  const me = await requireUser(["admin", "operator"]);
  await limit("devtest", [String(me._id)], 60, 60);
  const b = schema.parse(await req.json());
  const device: any = await Device.findById(b.deviceId).lean();
  if (!device || !canAccessDestination(me, device.destination)) throw new ApiError(404, "Device not found");
  if (!device.active) throw new ApiError(409, "This device is disabled");
  const d = await decideScan(device, b.code, b.direction, "console");
  await audit(me, "device.test", "Device", device._id, `Test scan on ${device.name}: ${d.allow ? "allowed" : "denied"}`);
  return ok(d);
});
export const dynamic = "force-dynamic";
