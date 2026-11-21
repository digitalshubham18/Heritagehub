import { z } from "zod";
import { handle, ok, ApiError } from "@/lib/api";
import { canAccessDestination, requireUser } from "@/lib/auth";
import { Destination, Notification } from "@/models";
import { audit } from "@/lib/audit";
import { clearLiveCache } from "@/lib/live";

const schema = z.object({ destinationId: z.string().min(1), paused: z.boolean(), reason: z.string().trim().max(120).optional() });
/** Gate staff hold or resume entry at their site (crowd surge, incident). Scans of tickets and passes are refused while paused; exits are never blocked. */
export const POST = handle(async (req) => {
  const me = await requireUser(["staff", "admin", "operator"]);
  const b = schema.parse(await req.json());
  if (!canAccessDestination(me, b.destinationId)) throw new ApiError(403, "Not assigned to this destination");
  if (b.paused && (b.reason || "").length < 3) throw new ApiError(400, "Give a short reason so visitors and managers know why");
  const upd = await Destination.updateOne({ _id: b.destinationId }, b.paused ? { entryPaused: true, entryPausedReason: b.reason, entryPausedAt: new Date() } : { entryPaused: false, $unset: { entryPausedReason: 1, entryPausedAt: 1 } });
  const d: any = upd.matchedCount ? await Destination.findById(b.destinationId).select("name entryPaused entryPausedReason").lean() : null;
  if (!d) throw new ApiError(404, "Destination not found");
  clearLiveCache();
  await Notification.create({ destination: d._id, user: me._id, type: "crowd_alert", severity: b.paused ? "critical" : "info", message: b.paused ? `${d.name}: entry PAUSED by ${me.name} (${b.reason})` : `${d.name}: entry resumed by ${me.name}` });
  if (me.role !== "staff") await audit(me, b.paused ? "entry.pause" : "entry.resume", "Destination", d._id, `${b.paused ? "Paused" : "Resumed"} entry at ${d.name}`);
  return ok({ paused: !!d.entryPaused, reason: d.entryPausedReason });
});
export const dynamic = "force-dynamic";
