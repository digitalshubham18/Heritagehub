import { z } from "zod";
import { handle, ok, ApiError } from "@/lib/api";
import { canAccessDestination, requireUser, scopeIds } from "@/lib/auth";
import { Destination, Incident, Notification } from "@/models";
import { audit } from "@/lib/audit";
import { maybeEscalate } from "@/lib/escalation";
import { csvResponse } from "@/lib/csv";

const create = z.object({ destinationId: z.string().min(1), category: z.enum(["medical", "lost_child", "security", "crowd", "maintenance", "other"]).default("other"), severity: z.enum(["warning", "critical"]).default("warning"), message: z.string().trim().min(5, "Describe what is happening (at least 5 characters)").max(600) });
const CAT: Record<string, string> = { medical: "Medical", lost_child: "Lost child or person", security: "Security", crowd: "Crowd", maintenance: "Maintenance", other: "Other" };

/** Staff raise an incident at a site they are assigned to. Medical, lost-child and security reports are always urgent. */
export const POST = handle(async (req) => {
  const me = await requireUser(["staff", "admin", "operator"]);
  const b = create.parse(await req.json());
  if (!canAccessDestination(me, b.destinationId)) throw new ApiError(403, "Not assigned to this destination");
  const d: any = await Destination.findById(b.destinationId).select("name operator").lean();
  if (!d) throw new ApiError(404, "Destination not found");
  const severity = ["medical", "lost_child", "security"].includes(b.category) ? "critical" : b.severity;
  const inc = await Incident.create({ destination: d._id, operator: d.operator, reportedBy: me._id, reporterName: me.name, category: b.category, severity, message: b.message, history: [{ event: "reported", by: me.name }] });
  await Notification.create({ destination: d._id, user: me._id, type: "issue", severity, message: `${CAT[b.category]}: ${b.message}`.slice(0, 500), meta: { incidentId: String(inc._id) } });
  return ok({ incident: inc }, 201);
});

/** Staff: incidents at their sites. Managers: all incidents in their scope. ?status=open|acknowledged|resolved|active (default active). */
export const GET = handle(async (req) => {
  const me = await requireUser(["staff", "admin", "operator"]);
  const st = req.nextUrl.searchParams.get("status") || "active";
  const f: any = {};
  if (me.role === "staff") f.destination = { $in: me.assignedDestinations || [] };
  else { const sc = scopeIds(me); if (sc) f.destination = { $in: sc }; }
  if (st === "active") f.status = { $in: ["open", "acknowledged"] }; else if (["open", "acknowledged", "resolved"].includes(st)) f.status = st; else if (st === "all") f.status = { $in: ["open", "acknowledged", "resolved"] };
  await maybeEscalate();
  if (req.nextUrl.searchParams.get("format") === "csv") {
    if (me.role === "staff") throw new ApiError(403, "Managers only");
    const all: any[] = await Incident.find(st === "all" ? { ...f, status: { $in: ["open", "acknowledged", "resolved"] } } : f).sort({ createdAt: -1 }).limit(5000).populate("destination", "name").lean();
    const ist = (d: any) => (d ? new Date(d).toLocaleString("en-CA", { timeZone: "Asia/Kolkata", hour12: false }) : "");
    return csvResponse(`heritagehub-incidents-${new Date().toISOString().slice(0, 10)}.csv`, all.map((i) => ({ reported: ist(i.createdAt), site: i.destination?.name, category: i.category, severity: i.severity, status: i.status, message: i.message, reporter: i.reporterName, escalation_level: i.escalationLevel || 0, acknowledged_after_min: (i.history || []).find((h: any) => h.event === "acknowledged") ? Math.round((new Date(i.history.find((h: any) => h.event === "acknowledged").at).getTime() - new Date(i.createdAt).getTime()) / 60000) : "", resolved: ist(i.resolvedAt), resolution: i.resolutionNote })), ["reported", "site", "category", "severity", "status", "message", "reporter", "escalation_level", "acknowledged_after_min", "resolved", "resolution"]);
  }
  const items = await Incident.find(f).sort({ status: 1, severity: 1, createdAt: -1 }).limit(100).populate("destination", "name").lean();
  return ok({ items });
});

const patch = z.object({ id: z.string().min(1), status: z.enum(["acknowledged", "resolved", "open"]), note: z.string().trim().max(300).optional() });
export const PATCH = handle(async (req) => {
  const me = await requireUser(["admin", "operator"]);
  const b = patch.parse(await req.json());
  const inc: any = await Incident.findById(b.id).lean();
  if (!inc || !canAccessDestination(me, inc.destination)) throw new ApiError(404, "Incident not found");
  if (b.status === "resolved" && (b.note || "").length < 3) throw new ApiError(400, "Add a short resolution note");
  const upd = await Incident.findOneAndUpdate({ _id: b.id }, { status: b.status, handledBy: me._id, ...(b.status === "resolved" ? { resolvedAt: new Date(), resolutionNote: b.note } : {}), $push: { history: { event: b.status, by: me.name, note: b.note } } }, { new: true }).lean();
  await audit(me, "incident." + b.status, "Incident", b.id, `Incident ${b.status}`);
  return ok({ incident: upd });
});
export const dynamic = "force-dynamic";
