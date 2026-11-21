import { NextResponse } from "next/server";
import { handle } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { limit } from "@/lib/ratelimit";
import { exportUserData, linkedRecords } from "@/lib/privacy";

/** GET: download everything linked to the signed-in account as JSON. ?preview=1 returns just what would block erasure. */
export const GET = handle(async (req) => {
  const me = await requireUser();
  if (req.nextUrl.searchParams.get("preview") === "1") return NextResponse.json({ blockers: (await linkedRecords(me._id)).blockers, role: me.role });
  await limit("data-export", [String(me._id)], 5, 3600);
  const data = await exportUserData(me._id);
  return new NextResponse(JSON.stringify(data, null, 2), { headers: { "Content-Type": "application/json; charset=utf-8", "Content-Disposition": `attachment; filename="heritagehub-my-data.json"`, "Cache-Control": "no-store" } });
});
export const dynamic = "force-dynamic";
