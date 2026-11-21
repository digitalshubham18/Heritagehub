import { z } from "zod";
import { NextResponse } from "next/server";
import { ApiError } from "@/lib/api";
import { connectDB } from "@/lib/db";
import { requireDevice } from "@/lib/devices";
import { decideScan } from "@/lib/gate";

const schema = z.object({ code: z.string().min(4).max(120), direction: z.enum(["in", "out"]).optional() });

/**
 * Gate-controller protocol. Auth: `X-Device-Key`. Body: { code, direction? }.
 * Always answers 200 with a machine-readable decision so a controller can drive a relay without parsing errors:
 *   { allow: true|false, relay: "open"|"hold", message: "<=24 chars for an LCD", reason, quantity?, remaining? }
 * HTTP 401 means the key is bad; 429 means the device is polling too fast.
 */
export async function POST(req: Request & { headers: Headers; nextUrl?: any }) {
  try {
    await connectDB();
    const device: any = await requireDevice(req as any);
    const { code, direction } = schema.parse(await req.json());
    return NextResponse.json(await decideScan(device, code, direction, "device"));
  } catch (e: any) {
    if (e instanceof ApiError) return NextResponse.json({ error: e.message }, { status: e.status, headers: e.headers });
    if (e?.name === "ZodError") return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    console.error(e); return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
export const dynamic = "force-dynamic";
