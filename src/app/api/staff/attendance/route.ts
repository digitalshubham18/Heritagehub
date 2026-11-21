import { z } from "zod";
import { handle, ok } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { attendanceStatus, clockIn, clockOut } from "@/lib/attendance";

/** Am I clocked in, and what are my shifts today? */
export const GET = handle(async () => ok(await attendanceStatus(await requireUser(["staff"]))));
const schema = z.object({ action: z.enum(["in", "out"]), destinationId: z.string().optional() });
export const POST = handle(async (req) => {
  const me = await requireUser(["staff"]);
  const b = schema.parse(await req.json());
  if (b.action === "out") return ok({ attendance: await clockOut(me) });
  if (!b.destinationId) throw new (await import("@/lib/api")).ApiError(400, "Choose the site you're at");
  return ok(await clockIn(me, b.destinationId), 201);
});
export const dynamic = "force-dynamic";
