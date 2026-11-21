import { handle, ok } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { syncSchema } from "@/lib/validators";
import { recordEntry } from "@/lib/booking";
import { limit } from "@/lib/ratelimit";

/**
 * Replays scans queued while offline, in order. Each op is fully re-validated (including the QR signature) at the
 * time it was recorded (`at`, accepted only within the last 36 hours and never in the future). Failures are returned
 * per op so staff can review them; they never block the rest of the queue.
 */
export const POST = handle(async (req) => {
  const me = await requireUser(["staff", "admin", "operator"]);
  await limit("scan-sync", [String(me._id)], 30, 60);
  const { ops } = syncSchema.parse(await req.json());
  const now = Date.now();
  const results: { id: string; ok: boolean; error?: string; occupancy?: number }[] = [];
  for (const op of ops) {
    const at = new Date(op.at);
    if (isNaN(at.getTime()) || at.getTime() > now + 60000 || at.getTime() < now - 36 * 3600000) { results.push({ id: op.id, ok: false, error: "Timestamp out of range" }); continue; }
    if (op.code.trim().startsWith("HP1.")) { results.push({ id: op.id, ok: false, error: "Season-pass scans need a connection" }); continue; }
    try {
      const r = await recordEntry(me, op.code, op.action, op.quantity, { at, note: "recorded offline, synced later" });
      results.push({ id: op.id, ok: true, occupancy: r.occupancy });
    } catch (e: any) { results.push({ id: op.id, ok: false, error: e.message || "Failed" }); }
  }
  return ok({ results, synced: results.filter((r) => r.ok).length, failed: results.filter((r) => !r.ok).length });
});

export const dynamic = "force-dynamic";
