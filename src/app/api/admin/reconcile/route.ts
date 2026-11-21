import { z } from "zod";
import { NextResponse } from "next/server";
import { handle, ok, ApiError } from "@/lib/api";
import { requireUser, scopeIds } from "@/lib/auth";
import { Destination, ReconRun } from "@/models";
import { parseStatement, reconcile, recordedUpi } from "@/lib/reconcile";
import { limit } from "@/lib/ratelimit";
import { audit } from "@/lib/audit";
import { toCsv } from "@/lib/csv";
import { addDays } from "@/lib/utils";

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const body = z.object({ csv: z.string().min(20).max(3_000_000), fileName: z.string().max(200).optional(), from: date, to: date, destinationId: z.string().optional() });
const MAX_DAYS = 31;

async function allowedDestinations(me: any, only?: string) {
  const scope = scopeIds(me);
  const f: any = scope ? { _id: { $in: scope } } : {};
  if (only) { if (scope && !scope.includes(only)) throw new ApiError(403, "That site isn't yours"); f._id = only; }
  return (await Destination.find(f).select("name operator").lean()) as any[];
}

/** Upload a bank statement CSV for a date range. Compares it with the UPI payments staff recorded at your sites and stores the result. */
export const POST = handle(async (req) => {
  const me = await requireUser(["admin", "operator"]);
  await limit("recon", [String(me._id)], 20, 3600);
  const b = body.parse(await req.json());
  if (b.to < b.from) throw new ApiError(400, "The end date is before the start date");
  if (addDays(b.from, MAX_DAYS) < b.to) throw new ApiError(400, `Choose a range of ${MAX_DAYS} days or less`);
  const dests = await allowedDestinations(me, b.destinationId);
  if (!dests.length) throw new ApiError(404, "No sites to reconcile");
  const st = parseStatement(b.csv);
  const bank = st.credits.filter((c) => c.date >= b.from && c.date <= addDays(b.to, 1)); // a payment at 11:58 pm can post the next day
  const recorded = await recordedUpi(dests.map((d) => String(d._id)), b.from, b.to);
  const { items, totals } = reconcile(recorded, bank);
  const operator = me.role === "operator" ? me.operator : dests[0]?.operator;
  const run = await ReconRun.create({ operator, destinations: dests.map((d) => d._id), from: b.from, to: b.to, by: me._id, byName: me.name, fileName: b.fileName, statementRows: st.rowsRead, totals: { ...totals, ignoredOutsideRange: st.credits.length - bank.length, unreadableRows: st.skipped }, items: items.slice(0, 3000) });
  await audit(me, "reconcile.run", "ReconRun", run._id, `UPI reconciliation ${b.from} to ${b.to}: ${totals.unmatchedRecorded} unmatched of ${totals.recorded} recorded`);
  return ok({ id: run._id, totals: run.totals, items: run.items }, 201);
});

const scopeRuns = (me: any) => (me.role === "operator" ? { operator: me.operator } : {});
export const GET = handle(async (req) => {
  const me = await requireUser(["admin", "operator"]);
  const id = req.nextUrl.searchParams.get("id");
  if (id) {
    const run: any = await ReconRun.findOne({ _id: id, ...scopeRuns(me) }).lean();
    if (!run) throw new ApiError(404, "Run not found");
    if (req.nextUrl.searchParams.get("format") === "csv") {
      const rows = run.items.filter((i: any) => i.kind !== "matched").map((i: any) => ({ result: i.kind.replace(/_/g, " "), site: i.destinationName || "", staff: i.staffName || "", what: i.source || "", reference: i.ref || "", amount_rs: (i.amountMinor / 100).toFixed(2), recorded_at: i.at ? new Date(i.at).toISOString() : "", bank_date: i.bankDate || "", bank_narration: i.bankLine || "", note: i.note || i.match || "", resolved: i.resolved ? "yes" : "no" }));
      return new NextResponse(toCsv(rows), { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="upi-reconciliation-${run.from}-to-${run.to}.csv"` } });
    }
    return ok({ run });
  }
  const runs = await ReconRun.find(scopeRuns(me)).sort({ createdAt: -1 }).limit(30).select("from to byName fileName totals createdAt").lean();
  return ok({ runs });
});

/** Mark an exception explained (for example "customer paid cash, staff tapped UPI by mistake; cash banked"), with a note. */
export const PATCH = handle(async (req) => {
  const me = await requireUser(["admin", "operator"]);
  const { runId, itemId, resolved, note } = z.object({ runId: z.string(), itemId: z.string(), resolved: z.boolean(), note: z.string().trim().max(300).optional() }).parse(await req.json());
  const r = await ReconRun.updateOne({ _id: runId, ...scopeRuns(me), "items._id": itemId }, { $set: { "items.$.resolved": resolved, "items.$.note": note || "" } });
  if (!r.matchedCount) throw new ApiError(404, "Item not found");
  await audit(me, "reconcile.resolve", "ReconRun", runId, `${resolved ? "Explained" : "Reopened"} a reconciliation exception${note ? `: ${note}` : ""}`);
  return ok({ ok: true });
});

/** The stored statement lines contain payer names from your bank narrations. Delete a run when you no longer need it. */
export const DELETE = handle(async (req) => {
  const me = await requireUser(["admin", "operator"]);
  const id = req.nextUrl.searchParams.get("id");
  const r = await ReconRun.deleteOne({ _id: id, ...scopeRuns(me) });
  if (!r.deletedCount) throw new ApiError(404, "Run not found");
  await audit(me, "reconcile.delete", "ReconRun", id, "Deleted a reconciliation run");
  return ok({ ok: true });
});
export const dynamic = "force-dynamic";
