import { z } from "zod";
import { NextResponse } from "next/server";
import { ApiError } from "@/lib/api";
import { connectDB } from "@/lib/db";
import { requireDevice } from "@/lib/devices";
import { recordPlate } from "@/lib/plate";

const schema = z.object({ plate: z.string().min(3).max(24), confidence: z.number().min(0).max(1).optional(), direction: z.enum(["in", "out"]).optional() });

/**
 * Number-plate camera protocol. Auth: `X-Device-Key` (register the camera at /admin/devices). Body: { plate, confidence?, direction? }.
 * The plate is normalised, matched against monthly passes, today's reservations and vehicles already parked, logged, and shown to gate staff as a one-tap suggestion.
 * It does NOT open a barrier or admit a vehicle by itself. Answers 200 with { plate, match, ref } so a controller can show "PASS" or "PRE-BOOKED" on a display.
 */
export async function POST(req: Request & { headers: Headers; nextUrl?: any }) {
  try {
    await connectDB();
    const device: any = await requireDevice(req as any);
    const b = schema.parse(await req.json());
    const r = await recordPlate({ destinationId: device.destination, raw: b.plate, confidence: b.confidence, direction: b.direction || device.direction, source: "camera_device", device: device._id });
    return NextResponse.json({ plate: r.plate, match: r.match, ref: r.ref, detail: r.detail });
  } catch (e: any) {
    if (e instanceof ApiError) return NextResponse.json({ error: e.message }, { status: e.status, headers: e.headers });
    if (e?.name === "ZodError") return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    console.error(e); return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
export const dynamic = "force-dynamic";
