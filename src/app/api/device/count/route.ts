import { z } from "zod";
import { NextResponse } from "next/server";
import { ApiError } from "@/lib/api";
import { connectDB } from "@/lib/db";
import { requireDevice } from "@/lib/devices";
import { recordHeadcount } from "@/lib/headcount";

const schema = z.object({
  in: z.number().int().min(0).max(5000).optional(),
  out: z.number().int().min(0).max(5000).optional(),
  inside: z.number().int().min(0).max(200000).optional(), // absolute "people inside now" (camera snapshot), re-baselines the total
  gate: z.string().max(40).optional(),
}).refine((b) => b.inside != null || (b.in ?? 0) > 0 || (b.out ?? 0) > 0, "Send in, out, or inside");

/**
 * People-counter protocol (door sensor, thermal/camera counter, clicker bridge). Auth: `X-Device-Key`.
 * Body: { in?: n, out?: n, gate? }  counts since the last report (send deltas every few seconds), or
 *       { inside: n }               the absolute number inside right now (use for camera snapshots / drift correction).
 * Counts people through the door whether or not they hold a ticket, and drives the live crowd numbers.
 */
export async function POST(req: Request & { headers: Headers; nextUrl?: any }) {
  try {
    await connectDB();
    const device: any = await requireDevice(req as any);
    const b = schema.parse(await req.json());
    const r = await recordHeadcount(device.destination, { in: b.in, out: b.out, inside: b.inside, source: "sensor", deviceId: device._id, gate: b.gate });
    return NextResponse.json({ ok: true, occupancy: r.occupancy, limit: r.limit, source: r.source });
  } catch (e: any) {
    if (e instanceof ApiError) return NextResponse.json({ error: e.message }, { status: e.status, headers: e.headers });
    if (e?.name === "ZodError") return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    console.error(e); return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
export const dynamic = "force-dynamic";
