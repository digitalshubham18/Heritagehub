import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { sendSlaDigests } from "@/lib/sla";

/** Once a day (any hour), with "Authorization: Bearer $CRON_SECRET": emails each operator's managers the tickets past their reply target. Safe to call more often; it sends once per day. */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await connectDB();
  const sent = await sendSlaDigests();
  return NextResponse.json({ emails: sent.length, sent });
}
export const dynamic = "force-dynamic";
