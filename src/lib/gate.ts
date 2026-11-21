import { ApiError } from "./api";
import { deviceActor } from "./devices";
import { recordAny } from "./scan";
import { Device, DeviceEvent } from "@/models";

export type GateDecision = { allow: boolean; relay: "open" | "hold"; message: string; reason: string; kind?: string; reference?: string; quantity?: number; occupancy?: number };

/**
 * The decision a gate controller (turnstile, boom barrier, QR reader) acts on. Every business-rule refusal is a clean
 * deny, never an error. Used by the real device endpoint and by the dashboard test console, so both behave identically.
 */
export async function decideScan(device: any, code: string, direction?: "in" | "out", source: "device" | "console" = "device"): Promise<GateDecision> {
  const dir = direction || device.direction;
  let out: GateDecision;
  try {
    const r: any = await recordAny(deviceActor(device), code, dir, { quantity: device.mode === "one" ? 1 : undefined, destinationId: String(device.destination) });
    await Device.updateOne({ _id: device._id }, { lastScanAt: new Date(), $inc: { scans: 1 } });
    const msg = r.kind === "pass" ? `PASS OK ${dir === "in" ? "WELCOME" : "BYE"}` : dir === "in" ? `WELCOME x${r.quantity}` : `THANK YOU x${r.quantity}`;
    out = { allow: true, relay: "open", message: msg.slice(0, 24), reason: "ok", kind: r.kind, reference: r.reference, quantity: r.quantity, occupancy: r.occupancy };
  } catch (e: any) {
    const wrongSite = e instanceof ApiError && e.status === 403;
    const reason = wrongSite ? "Ticket is for another site" : e?.message || "Denied";
    const paused = /entry is paused/i.test(reason);
    const message = wrongSite ? "WRONG SITE" : paused ? "ENTRY PAUSED" : reason.replace(/[^A-Za-z0-9 .,x/-]/g, "").slice(0, 24) || "DENIED";
    out = { allow: false, relay: "hold", message, reason };
  }
  // Keep a short event trail for the operator dashboard. The code is masked: only the reference part is kept.
  const masked = String(code).replace(/^(HH1|HP1)\.([A-Z0-9-]+)\..*$/i, "$1.$2.…").slice(0, 40);
  await DeviceEvent.create({ device: device._id, destination: device.destination, code: masked, direction: dir, allow: out.allow, message: out.message, reason: out.reason, source }).catch(() => {});
  return out;
}
