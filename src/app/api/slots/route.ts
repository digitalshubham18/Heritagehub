import { handle, ok, ApiError } from "@/lib/api";
import { canAccessDestination, requireUser } from "@/lib/auth";
import { slotCreateSchema } from "@/lib/validators";
import { TimeSlot } from "@/models";
import { loadDestination } from "@/lib/destinations";
import { ensureSlots } from "@/lib/slots";
import { getCalibration, predictDay } from "@/lib/crowd";
import { releaseExpired } from "@/lib/booking";
import { audit } from "@/lib/audit";
import { rulesFor, slotAdjust } from "@/lib/dynamic-pricing";
import { istParts, toMin, todayIST } from "@/lib/utils";

export const GET = handle(async (req) => {
  const sp = req.nextUrl.searchParams;
  const dest = await loadDestination(sp.get("destination") || "");
  const date = sp.get("date") || todayIST();
  await releaseExpired();
  const slots = await ensureSlots(dest, date);
  const preds = predictDay(dest, date, slots, await getCalibration(dest));
  const { date: today, minutes } = istParts();
  const rules = await rulesFor(dest._id);
  return ok({
    date, closed: slots.length === 0,
    slots: preds.map((p) => ({
      id: p._id, start: p.start, end: p.end, capacity: p.capacity, booked: p.booked, remaining: Math.max(0, p.capacity - p.booked),
      closed: p.closed, closedReason: p.closedReason, past: date === today && toMin(p.end) <= minutes,
      level: p.level, densityPct: p.densityPct, waitMin: p.waitMin, expected: p.expected,
      adjust: rules.length ? slotAdjust(rules, { date, start: p.start, booked: p.booked, capacity: p.capacity }) : undefined, // dynamic pricing % per ticket audience
    })),
  });
});

export const POST = handle(async (req) => {
  const me = await requireUser(["admin", "operator"]);
  const b = slotCreateSchema.parse(await req.json());
  if (!canAccessDestination(me, b.destinationId)) throw new ApiError(403, "Not your destination");
  if (toMin(b.end) <= toMin(b.start)) throw new ApiError(400, "End time must be after start time");
  try {
    const s = await TimeSlot.create({ destination: b.destinationId, date: b.date, start: b.start, end: b.end, capacity: b.capacity });
    await audit(me, "slot.create", "TimeSlot", s._id, `Custom slot ${b.date} ${b.start}-${b.end}, capacity ${b.capacity}`);
    return ok({ slot: s }, 201);
  } catch (e: any) { if (e?.code === 11000) throw new ApiError(409, "A slot already starts at that time"); throw e; }
});

export const dynamic = "force-dynamic";
