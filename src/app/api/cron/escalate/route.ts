import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { escalateIncidents } from "@/lib/escalation";

/**
 * Scheduled trigger for incident SMS escalation. Point a scheduler at it every minute or two (Vercel Cron on a paid plan, GitHub Actions, cron-job.org):
 *   GET /api/cron/escalate   with   Authorization: Bearer $CRON_SECRET
 * Open dashboards also trigger it opportunistically, but only a scheduler works when nobody is logged in.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await connectDB();
  const sent = await escalateIncidents();
  return NextResponse.json({ escalated: sent.length, sent });
}
export const dynamic = "force-dynamic";
