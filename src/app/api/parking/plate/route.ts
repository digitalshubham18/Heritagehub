import { z } from "zod";
import { handle, ok, ApiError } from "@/lib/api";
import { canAccessDestination, requireUser } from "@/lib/auth";
import { PlateRead } from "@/models";
import { readPlateImage, recordPlate } from "@/lib/plate";
import { limit } from "@/lib/ratelimit";

const schema = z.object({ destinationId: z.string().min(1), direction: z.enum(["in", "out"]).default("in"), image: z.string().max(8_000_000).optional(), text: z.string().max(30).optional() }).refine((b) => b.image || b.text, "Send a photo or the typed number");

/**
 * Staff camera reading. A photo goes to the configured plate-recognition service (ANPR_API_KEY); with none configured the endpoint says so and staff type the number.
 * Either way the result is only a SUGGESTION: staff confirm the number before anyone is admitted or charged.
 */
export const POST = handle(async (req) => {
  const me = await requireUser(["staff", "admin", "operator"]);
  await limit("plate", [String(me._id)], 120, 60);
  const b = schema.parse(await req.json());
  if (!canAccessDestination(me, b.destinationId)) throw new ApiError(403, "Not assigned to this destination");
  let raw = b.text || "", confidence: number | undefined, source: "staff_camera" | "provider" = "staff_camera";
  if (!raw && b.image) {
    const r = await readPlateImage(b.image);
    if (!r) throw new ApiError(501, "Automatic plate reading isn't set up for this deployment (no ANPR service key). Type the number instead.");
    raw = r.plate; confidence = r.confidence; source = "provider";
  }
  return ok(await recordPlate({ destinationId: b.destinationId, raw, confidence, direction: b.direction, source, by: me._id }));
});

/** Recent sightings at a site (from gate cameras and staff photos), newest first, for the parking console. */
export const GET = handle(async (req) => {
  const me = await requireUser(["staff", "admin", "operator"]);
  const d = req.nextUrl.searchParams.get("destination");
  if (!d) throw new ApiError(400, "destination is required");
  if (!canAccessDestination(me, d)) throw new ApiError(403, "Not assigned to this destination");
  const items = await PlateRead.find({ destination: d, at: { $gte: new Date(Date.now() - 3 * 3600000) }, used: false }).sort({ at: -1 }).limit(15).lean();
  return ok({ items });
});
export const dynamic = "force-dynamic";
