import { Destination, Incident, Operator, User } from "@/models";
import { normalizePhone, sendSms } from "./notify";

export const DEFAULT_ESCALATION = { enabled: true, firstAfterMin: 10, secondAfterMin: 25 };
export type EscCfg = { enabled?: boolean; firstAfterMin?: number; secondAfterMin?: number };

/**
 * Which escalation level an incident has reached. Critical incidents use the configured times; warnings wait twice as long.
 * Returns the NEXT level to send (1 or 2) or 0 when nothing is due. Only incidents nobody has acknowledged escalate.
 */
export function nextEscalationLevel(inc: { status: string; severity: string; createdAt: Date | string; escalationLevel?: number }, cfg: EscCfg = {}, now = Date.now()): 0 | 1 | 2 {
  const c = { ...DEFAULT_ESCALATION, ...cfg };
  if (c.enabled === false || inc.status !== "open") return 0;
  const mult = inc.severity === "critical" ? 1 : 2, mins = (now - new Date(inc.createdAt).getTime()) / 60000, lvl = inc.escalationLevel || 0;
  if (lvl < 1 && mins >= (c.firstAfterMin ?? 10) * mult) return 1;
  if (lvl < 2 && mins >= (c.secondAfterMin ?? 25) * mult) return 2;
  return 0;
}
const CAT: Record<string, string> = { medical: "Medical", lost_child: "Lost child", security: "Security", crowd: "Crowd", maintenance: "Maintenance", other: "Incident" };
export const escalationText = (inc: any, siteName: string, mins: number) => `HeritageHub ALERT: ${CAT[inc.category] || "Incident"} at ${siteName} unacknowledged for ${Math.round(mins)} min: "${String(inc.message).slice(0, 80)}". Open ${(process.env.APP_URL || "").replace(/\/$/, "")}/admin/incidents`;

async function recipients(op: any, level: 1 | 2) {
  const phones = new Set<string>();
  const add = (p?: string) => { const n = normalizePhone(p); if (n) phones.add(n); };
  const mgrs: any[] = op ? await User.find({ role: "operator", operator: op._id, active: true }).select("phone").lean() : [];
  mgrs.forEach((m) => add(m.phone)); (op?.escalation?.phones || []).forEach(add);
  if (level === 2 || !op) {
    const admins: any[] = await User.find({ role: "admin", active: true }).select("phone").lean();
    admins.forEach((m) => add(m.phone)); (process.env.ESCALATE_ADMIN_PHONES || "").split(",").forEach((p) => add(p.trim()));
  }
  return [...phones];
}

/** Sends due escalation SMS. Each level fires once per incident: the level is advanced with a conditional update before sending. */
export async function escalateIncidents(now = Date.now()) {
  const open: any[] = await Incident.find({ status: "open" }).limit(200).lean();
  const ops = new Map<string, any>(); const sent: { id: string; level: number; to: number }[] = [];
  for (const inc of open) {
    const key = String(inc.operator || "");
    if (!ops.has(key)) ops.set(key, inc.operator ? await Operator.findById(inc.operator).lean() : null);
    const op = ops.get(key), lvl = nextEscalationLevel(inc, op?.escalation, now);
    if (!lvl) continue;
    const claimed = await Incident.findOneAndUpdate({ _id: inc._id, status: "open", escalationLevel: inc.escalationLevel || 0 }, { escalationLevel: lvl, lastEscalatedAt: new Date(now) }, { new: true }).lean();
    if (!claimed) continue; // another request got there first
    const dest: any = await Destination.findById(inc.destination).select("name").lean();
    const to = await recipients(op, lvl as 1 | 2), text = escalationText(inc, dest?.name || "a site", (now - new Date(inc.createdAt).getTime()) / 60000);
    let okCount = 0;
    for (const n of to) { try { if (await sendSms(n, text)) okCount++; } catch (e) { console.error("[escalate] sms failed", e); } }
    await Incident.updateOne({ _id: inc._id }, { $push: { history: { at: new Date(now), event: `escalated (level ${lvl})`, by: "system", note: to.length ? `SMS to ${to.length} number(s), ${okCount} delivered` : "No phone numbers are configured for escalation" } } });
    sent.push({ id: String(inc._id), level: lvl, to: to.length });
  }
  return sent;
}
let lastRun = 0;
/** Cheap opportunistic trigger for dashboards and incident APIs, in addition to the cron endpoint. */
export async function maybeEscalate() { if (Date.now() - lastRun < 60000) return; lastRun = Date.now(); try { await escalateIncidents(); } catch (e) { console.error("[escalate]", e); } }
