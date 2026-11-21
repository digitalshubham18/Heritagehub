import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { remindExpiringPasses } from "@/lib/parking-passes";

/**
 * Daily trigger for monthly-pass expiry reminders (email and SMS to holders whose pass ends within 7 days and who haven't renewed). Each pass is reminded once.
 *   GET /api/cron/pass-reminders   with   Authorization: Bearer $CRON_SECRET
 * Managers can also send them from Admin → Parking → Monthly passes.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await connectDB();
  return NextResponse.json(await remindExpiringPasses());
}
export const dynamic = "force-dynamic";
