import crypto from "crypto";
import type { NextRequest } from "next/server";
import { Device } from "@/models";
import { ApiError } from "./api";
import { limit } from "./ratelimit";

export const hashKey = (k: string) => crypto.createHash("sha256").update(k).digest("hex");
/** The raw key is shown once at creation; only its SHA-256 hash is stored. */
export function newDeviceKey() { const raw = "hhd_" + crypto.randomBytes(24).toString("base64url"); return { raw, hash: hashKey(raw), hint: raw.slice(-4) }; }

export async function requireDevice(req: NextRequest) {
  const k = req.headers.get("x-device-key");
  if (!k) throw new ApiError(401, "Missing X-Device-Key header");
  const d: any = await Device.findOne({ keyHash: hashKey(k), active: true }).lean();
  if (!d) throw new ApiError(401, "Unknown or disabled device");
  await limit("device", [String(d._id)], 600, 60);
  await Device.updateOne({ _id: d._id }, { lastSeenAt: new Date() });
  return d;
}
/** A device acts as a staff member assigned to exactly its own destination. */
export const deviceActor = (d: any) => ({ _id: d._id, role: "staff", name: `Device ${d.name}`, assignedDestinations: [d.destination], isDevice: true });
export const deviceOnline = (d: any) => !!d.lastSeenAt && Date.now() - new Date(d.lastSeenAt).getTime() < 120000;
