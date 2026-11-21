import { AuditLog } from "@/models";

/** Append-only record of administrator actions. Never throws: auditing must not break the action itself. */
export async function audit(actor: any, action: string, targetType: string, targetId: unknown, summary: string, meta?: unknown) {
  try { await AuditLog.create({ actor: actor._id, actorName: actor.name, operator: actor.operator, action, targetType, targetId: String(targetId ?? ""), summary, meta }); }
  catch (e) { console.error("[audit] failed", e); }
}
