import { handle, ok } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { verifySchema } from "@/lib/validators";
import { verifyAny } from "@/lib/scan";
import { limit } from "@/lib/ratelimit";

export const POST = handle(async (req) => {
  const me = await requireUser(["staff", "admin", "operator"]);
  await limit("scan", [String(me._id)], 240, 60);
  const { code, destinationId } = verifySchema.parse(await req.json());
  const v: any = await verifyAny(me, code, { destinationId });
  if (v.kind === "pass") return ok({ kind: "pass", valid: v.valid, reasons: v.reasons, warnings: v.warnings, destination: v.dest && { id: v.dest._id, name: v.dest.name }, pass: v.pass && { reference: v.pass.reference, holderName: v.pass.holderName, validFrom: v.pass.validFrom, validTo: v.pass.validTo, destinations: v.pass.destinationNames, inside: v.pass.inside, entriesToday: v.pass.entriesToday, maxEntriesPerDay: v.pass.maxEntriesPerDay, status: v.pass.status } });
  return ok({ kind: "booking", valid: v.valid, reasons: v.reasons, warnings: v.warnings,
    booking: v.booking && { id: v.booking._id, reference: v.booking.reference, date: v.booking.date, start: v.booking.start, end: v.booking.end, quantity: v.booking.quantity, status: v.booking.status, contact: v.booking.contact, items: v.booking.items, visitors: v.booking.visitors, checkedInAt: v.booking.checkedInAt, checkedOutAt: v.booking.checkedOutAt, checkedInCount: v.booking.checkedInCount || 0, checkedOutCount: v.booking.checkedOutCount || 0 },
    destination: v.dest && { id: v.dest._id, name: v.dest.name } });
});

export const dynamic = "force-dynamic";
