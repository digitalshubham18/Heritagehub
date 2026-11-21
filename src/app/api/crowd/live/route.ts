import { handle, ok, ApiError } from "@/lib/api";
import { canAccessDestination, currentUser } from "@/lib/auth";
import { Destination } from "@/models";
import { loadDestination } from "@/lib/destinations";
import { crowdSummary } from "@/lib/crowd";
import { liveSnapshot } from "@/lib/live";
import { todayIST } from "@/lib/utils";

/**
 * Live crowd from the real headcount (people-counters / staff counts) when reporting, else gate check-ins and exits.
 * Visitors get the people-inside number and limit when the site has `publicHeadcount` on (the default); when a site
 * turns it off they get only percentage, level, trend and wait. Staff and managers can always pass ?detail=1.
 */
export const GET = handle(async (req) => {
  const sp = req.nextUrl.searchParams, date = todayIST();
  const one = sp.get("destination");
  const dests: any[] = one ? [await loadDestination(one)] : await Destination.find({ active: true }).sort({ popularity: -1 }).lean();
  let privileged = false;
  if (sp.get("detail") === "1") {
    const me = await currentUser();
    if (!me || !["staff", "admin", "operator"].includes(me.role)) throw new ApiError(403, "Headcounts are for site staff and managers");
    if (one && !canAccessDestination(me, dests[0]._id)) throw new ApiError(403, "Not assigned to this destination");
    privileged = true;
  }
  const items = await Promise.all(dests.map(async (d) => {
    const f: any = await crowdSummary(d, date);
    const v = await liveSnapshot(d, f.closed ? {} : { forecastLevel: f.level, forecastPct: f.densityPct });
    if (privileged) return v;
    const show = d.publicHeadcount !== false;
    return { ...v, occupancy: show ? v.occupancy : undefined, limit: show ? v.limit : undefined, ticketOccupancy: undefined, headcount: undefined };
  }));
  return ok({ items, at: new Date().toISOString() });
});
export const dynamic = "force-dynamic";
