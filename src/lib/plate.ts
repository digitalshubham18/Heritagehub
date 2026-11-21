import { ParkingReservation, ParkingTicket, PlateRead } from "@/models";
import { ApiError } from "./api";
import { activePassFor, normalizeVehicle } from "./parking";
import { todayIST } from "./utils";

const L2D: Record<string, string> = { O: "0", Q: "0", D: "0", I: "1", L: "1", Z: "2", S: "5", B: "8", G: "6" };
const D2L: Record<string, string> = { "0": "O", "1": "I", "2": "Z", "5": "S", "8": "B", "6": "G" };
/**
 * Normalises a camera reading of an Indian plate (e.g. "UP80 AB 1234"). OCR confuses look-alike characters, so when the text has the
 * standard shape (2 letters, 2 digits, 1 to 3 letters, 4 digits) each position is corrected towards a letter or a digit. Anything else is only cleaned.
 */
export function normalizePlate(raw: string) {
  const s = normalizeVehicle(raw);
  const m = /^([A-Z0-9]{2})([A-Z0-9]{2})([A-Z0-9]{1,3})([A-Z0-9]{4})$/.exec(s);
  if (!m) return s;
  const letters = (x: string) => x.split("").map((c) => D2L[c] || c).join(""), digits = (x: string) => x.split("").map((c) => L2D[c] || c).join("");
  return letters(m[1]) + digits(m[2]) + letters(m[3]) + digits(m[4]);
}

export type PlateMatch = { match: "pass" | "reservation" | "parked" | "none"; ref?: string; detail?: string };
/** What the system already knows about a plate at a site: a monthly pass, a reservation for today, or a vehicle already parked. */
export async function matchPlate(destinationId: any, plate: string): Promise<PlateMatch> {
  const parked: any = await ParkingTicket.findOne({ destination: destinationId, vehicleNumber: plate, status: "parked" }).select("ticketNo").lean();
  if (parked) return { match: "parked", ref: parked.ticketNo, detail: "Already parked: this is an exit" };
  const res: any = await ParkingReservation.findOne({ destination: destinationId, date: todayIST(), status: "reserved", vehicleNumber: plate }).select("reference").lean();
  if (res) return { match: "reservation", ref: res.reference, detail: "Pre-booked for today" };
  const pass = await activePassFor(destinationId, plate);
  if (pass) return { match: "pass", ref: pass.reference, detail: `Monthly pass valid to ${pass.validTo}` };
  return { match: "none" };
}

export async function recordPlate(o: { destinationId: any; raw: string; confidence?: number; direction?: "in" | "out"; source: "camera_device" | "staff_camera" | "provider"; device?: any; by?: any }) {
  const plate = normalizePlate(o.raw);
  if (plate.length < 4 || plate.length > 12) throw new ApiError(422, "That doesn't look like a vehicle number");
  const m = await matchPlate(o.destinationId, plate);
  const row = await PlateRead.create({ destination: o.destinationId, device: o.device, by: o.by, plate, raw: o.raw, confidence: o.confidence, direction: o.direction || "in", source: o.source, match: m.match, matchRef: m.ref });
  return { read: row.toObject(), ...m, plate };
}

/** Sends a photo to a plate-recognition service (Plate Recognizer compatible). Returns null when no provider is configured. */
export async function readPlateImage(base64: string): Promise<{ plate: string; confidence: number } | null> {
  const key = process.env.ANPR_API_KEY;
  if (!key) return null;
  if (base64.length > 6_000_000) throw new ApiError(413, "Photo is too large. Move closer or lower the camera resolution.");
  const fd = new FormData();
  fd.set("upload", base64.replace(/^data:image\/\w+;base64,/, "")); fd.set("regions", process.env.ANPR_REGIONS || "in");
  const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), 8000);
  try {
    const r = await fetch(process.env.ANPR_API_URL || "https://api.platerecognizer.com/v1/plate-reader/", { method: "POST", headers: { Authorization: `Token ${key}` }, body: fd, signal: ctl.signal });
    if (!r.ok) throw new ApiError(502, "The plate-reading service refused the photo. Type the number instead.");
    const j: any = await r.json();
    const top = j?.results?.[0];
    if (!top?.plate) throw new ApiError(422, "No plate found in the photo. Try again closer, or type the number.");
    return { plate: String(top.plate).toUpperCase(), confidence: Number(top.score ?? 0) };
  } catch (e: any) {
    if (e instanceof ApiError) throw e;
    throw new ApiError(502, "The plate-reading service didn't respond. Type the number instead.");
  } finally { clearTimeout(t); }
}
