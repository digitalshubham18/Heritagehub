import { handle, ok } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { Pass } from "@/models";

/** Passes sold (scoped to the operator for operator managers). */
export const GET = handle(async () => {
  const me = await requireUser(["admin", "operator"]);
  const items: any[] = await Pass.find({ status: "active", ...(me.role === "operator" ? { operator: me.operator } : {}) }).sort({ createdAt: -1 }).limit(200).lean();
  return ok({ items: items.map((p) => ({ _id: p._id, reference: p.reference, holderName: p.holderName, validFrom: p.validFrom, validTo: p.validTo, destinationNames: p.destinationNames, totalEntries: p.totalEntries, totalMinor: p.totalMinor, invoiceNo: p.invoiceNo, inside: !!p.insideDestination })) });
});
export const dynamic = "force-dynamic";
