import { z } from "zod";
import { NextResponse } from "next/server";
import { handle, ok, ApiError } from "@/lib/api";
import { requireUser, scopeIds } from "@/lib/auth";
import { Operator } from "@/models";
import { DEFAULT_SLA, slaReport } from "@/lib/sla";
import { audit } from "@/lib/audit";
import { toCsv } from "@/lib/csv";

const scopeFilter = (me: any) => (me.role === "operator" ? { destination: { $in: scopeIds(me) || [] } } : {});
const opId = (me: any, given?: string | null) => { const id = me.role === "operator" ? String(me.operator) : given; if (!id) throw new ApiError(400, "Choose an operator"); return id; };

/** Reply-time report (waiting, overdue, median first response) for the tickets you can see. ?format=csv downloads one row per ticket. ?operator= (admin) also returns that operator's targets. */
export const GET = handle(async (req) => {
  const me = await requireUser(["admin", "operator"]);
  const sp = req.nextUrl.searchParams, days = Math.min(365, Math.max(1, Number(sp.get("days")) || 30));
  const rep = await slaReport(scopeFilter(me), days);
  if (sp.get("format") === "csv") {
    const csv = toCsv(rep.rows.map((r: any) => ({ reference: r.reference, opened: new Date(r.createdAt).toISOString(), category: r.category, status: r.status, first_response_hours: r.firstResponseHours ?? "", waiting_on_us: r.waitingOnUs ? "yes" : "no", overdue: r.overdue ? "yes" : "no", waited_hours: r.waitedHours, target_hours: r.targetHours })));
    return new NextResponse(csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="support-response-times.csv"` } });
  }
  const opIdWanted = me.role === "operator" ? String(me.operator) : sp.get("operator");
  const op: any = opIdWanted ? await Operator.findById(opIdWanted).select("name supportSla").lean() : null;
  const { rows, ...rest } = rep; void rows;
  return ok({ ...rest, operator: op ? { id: op._id, name: op.name } : null, targets: { ...DEFAULT_SLA, ...(op?.supportSla || {}) }, defaults: DEFAULT_SLA });
});

const schema = z.object({ operatorId: z.string().optional(), firstResponseHours: z.number().int().min(1).max(720), followUpHours: z.number().int().min(1).max(720), digest: z.boolean() });
export const PUT = handle(async (req) => {
  const me = await requireUser(["admin", "operator"]);
  const b = schema.parse(await req.json());
  const op = await Operator.findByIdAndUpdate(opId(me, b.operatorId), { supportSla: { firstResponseHours: b.firstResponseHours, followUpHours: b.followUpHours, digest: b.digest } }, { new: true }).lean();
  if (!op) throw new ApiError(404, "Operator not found");
  await audit(me, "support.sla", "Operator", (op as any)._id, `Support reply targets set to ${b.firstResponseHours}h first reply, ${b.followUpHours}h follow-up${b.digest ? "" : ", daily email off"}`);
  return ok({ ok: true });
});
export const dynamic = "force-dynamic";
