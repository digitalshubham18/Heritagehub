import { Counter, Operator, SupportTicket, User } from "@/models";
import { sendEmail } from "./notify";

/**
 * Support reply targets. A ticket is "waiting on us" when it is open or in progress and the last message came from the visitor.
 * Its target is the operator's first-response time until staff have answered once, then the follow-up time.
 * Wall-clock hours (nights and holidays count), so set targets that you can meet on a quiet Sunday.
 */
export const DEFAULT_SLA = { firstResponseHours: 24, followUpHours: 48, digest: true };
export type SlaCfg = { firstResponseHours?: number; followUpHours?: number; digest?: boolean };
const HOUR = 3_600_000;

export function slaState(t: { status: string; lastFrom?: string; lastMessageAt: Date | string; messages?: { from: string }[] }, cfg: SlaCfg = {}, now = Date.now()) {
  const c = { ...DEFAULT_SLA, ...cfg };
  const waiting = ["open", "in_progress"].includes(t.status) && (t.lastFrom || "visitor") === "visitor";
  if (!waiting) return { waiting: false, overdue: false, kind: null as null | "first" | "followup", targetHours: 0, waitedHours: 0, dueAt: null as Date | null, overdueByHours: 0 };
  const answered = (t.messages || []).some((m) => m.from === "staff");
  const kind = answered ? "followup" as const : "first" as const;
  const targetHours = kind === "first" ? c.firstResponseHours : c.followUpHours;
  const since = new Date(t.lastMessageAt).getTime(), waitedHours = (now - since) / HOUR;
  return { waiting: true, overdue: waitedHours > targetHours, kind, targetHours, waitedHours: Math.round(waitedHours * 10) / 10, dueAt: new Date(since + targetHours * HOUR), overdueByHours: Math.max(0, Math.round((waitedHours - targetHours) * 10) / 10) };
}

/** Time from a ticket being opened to the first staff reply, in hours (null when nobody has replied). */
export const firstResponseHours = (t: { createdAt: Date | string; messages?: { from: string; at: Date | string }[] }) => {
  const m = (t.messages || []).find((x) => x.from === "staff");
  return m ? Math.max(0, (new Date(m.at).getTime() - new Date(t.createdAt).getTime()) / HOUR) : null;
};
const median = (xs: number[]) => { if (!xs.length) return null; const s = [...xs].sort((a, b) => a - b), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const r1 = (x: number | null) => (x == null ? null : Math.round(x * 10) / 10);

export async function operatorSla(): Promise<Map<string, SlaCfg>> {
  const ops: any[] = await Operator.find({}).select("supportSla").lean();
  return new Map(ops.map((o) => [String(o._id), o.supportSla || {}]));
}
export const cfgFor = (m: Map<string, SlaCfg>, operator?: unknown) => (operator ? m.get(String(operator)) || {} : {});

/** Adds `sla` to list items (which come without messages, so the "answered before" flag comes from the stored lastFrom/status mix). */
export async function attachSla(items: any[], now = Date.now()) {
  const cfgs = await operatorSla();
  const ids = items.map((i) => i._id);
  const answered = new Set((await SupportTicket.find({ _id: { $in: ids }, "messages.from": "staff" }).select("_id").lean() as any[]).map((x) => String(x._id)));
  return items.map((i) => ({ ...i, sla: slaState({ ...i, messages: answered.has(String(i._id)) ? [{ from: "staff" }] : [] }, cfgFor(cfgs, i.operator), now) }));
}

/** Report for a set of tickets (already scoped to what the caller may see). */
export async function slaReport(filter: any, days = 30, now = Date.now()) {
  const cfgs = await operatorSla();
  const since = new Date(now - days * 24 * HOUR);
  const open: any[] = await SupportTicket.find({ ...filter, status: { $in: ["open", "in_progress"] } }).populate("destination", "name").lean();
  const waiting = open.map((t) => ({ t, s: slaState(t, cfgFor(cfgs, t.operator), now) })).filter((x) => x.s.waiting);
  const overdue = waiting.filter((x) => x.s.overdue).sort((a, b) => b.s.overdueByHours - a.s.overdueByHours);
  const recent: any[] = await SupportTicket.find({ ...filter, createdAt: { $gte: since } }).lean();
  const frs = recent.map((t) => ({ t, h: firstResponseHours(t) }));
  const answered = frs.filter((x) => x.h != null);
  const within = answered.filter((x) => (x.h as number) <= (cfgFor(cfgs, x.t.operator).firstResponseHours ?? DEFAULT_SLA.firstResponseHours)).length;
  const neverAnswered = frs.filter((x) => x.h == null && ["open", "in_progress"].includes(x.t.status) && now - new Date(x.t.createdAt).getTime() > (cfgFor(cfgs, x.t.operator).firstResponseHours ?? DEFAULT_SLA.firstResponseHours) * HOUR).length;
  const decided = answered.length + neverAnswered; // tickets whose first-response target has already been tested
  const byCategory: Record<string, { tickets: number; overdue: number }> = {};
  for (const x of waiting) { const c = x.t.category || "other"; (byCategory[c] ||= { tickets: 0, overdue: 0 }).tickets++; if (x.s.overdue) byCategory[c].overdue++; }
  return {
    days, targets: { default: DEFAULT_SLA },
    summary: { waiting: waiting.length, overdue: overdue.length, oldestWaitingHours: waiting.length ? r1(Math.max(...waiting.map((x) => x.s.waitedHours))) : 0, ticketsInPeriod: recent.length, answeredInPeriod: answered.length, medianFirstResponseHours: r1(median(answered.map((x) => x.h as number))), withinTargetPct: decided ? Math.round(((within) / decided) * 100) : null },
    byCategory,
    overdue: overdue.slice(0, 50).map((x) => ({ id: x.t._id, reference: x.t.reference, subject: x.t.subject, category: x.t.category, destination: x.t.destination?.name || null, kind: x.s.kind, waitedHours: x.s.waitedHours, targetHours: x.s.targetHours, overdueByHours: x.s.overdueByHours })),
    rows: recent.map((t) => { const h = firstResponseHours(t); const s = slaState(t, cfgFor(cfgs, t.operator), now); return { reference: t.reference, createdAt: t.createdAt, category: t.category, status: t.status, firstResponseHours: r1(h), waitingOnUs: s.waiting, overdue: s.overdue, waitedHours: s.waiting ? s.waitedHours : "", targetHours: s.waiting ? s.targetHours : "" }; }),
  };
}

/** Daily digest of overdue tickets to each operator's managers (and platform-level tickets to admins). Sends at most once per day per recipient group. */
export async function sendSlaDigests(now = Date.now()) {
  const day = new Date(now + 5.5 * HOUR).toISOString().slice(0, 10);
  const sent: { to: string; overdue: number }[] = [];
  const groups: { key: string; filter: any; to: string[]; label: string }[] = [];
  for (const op of (await Operator.find({ active: true }).select("name supportSla").lean()) as any[]) {
    if (op.supportSla?.digest === false) continue;
    const to = ((await User.find({ role: "operator", operator: op._id, active: true }).select("email").lean()) as any[]).map((u) => u.email);
    groups.push({ key: `slad:${op._id}:${day}`, filter: { operator: op._id }, to, label: op.name });
  }
  groups.push({ key: `slad:platform:${day}`, filter: { operator: { $exists: false } }, to: ((await User.find({ role: "admin", active: true }).select("email").lean()) as any[]).map((u) => u.email), label: "Platform" });
  for (const g of groups) {
    if (!g.to.length) continue;
    const rep = await slaReport(g.filter, 30, now);
    if (!rep.overdue.length) continue;
    const c: any = await Counter.findOneAndUpdate({ key: g.key }, { $inc: { seq: 1 } }, { upsert: true, new: true }).lean();
    if (c.seq !== 1) continue; // already sent today
    const rows = rep.overdue.slice(0, 15).map((o) => `<li>${o.reference}: ${String(o.subject).replace(/[<>&]/g, "")} (waiting ${o.waitedHours}h, target ${o.targetHours}h)</li>`).join("");
    for (const to of g.to) { await sendEmail({ to, subject: `${rep.overdue.length} support ticket${rep.overdue.length > 1 ? "s are" : " is"} past the reply target (${g.label})`, html: `<p>These visitors have waited longer than your reply target:</p><ul>${rows}</ul><p><a href="${(process.env.APP_URL || "").replace(/\/$/, "")}/admin/support">Open support</a></p>` }); sent.push({ to, overdue: rep.overdue.length }); }
  }
  return sent;
}
