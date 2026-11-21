import { handle, ok } from "@/lib/api";
import { currentUser } from "@/lib/auth";
import { Announcement, Destination } from "@/models";

/**
 * Active notices. Visitors (no sign-in needed) get notices for audience "visitors" or "all", optionally for one destination.
 * ?audience=staff returns the notices for site staff (signed-in staff and managers only), scoped to their sites.
 */
export const GET = handle(async (req) => {
  const sp = req.nextUrl.searchParams, now = new Date();
  const base: any = { active: true, startsAt: { $lte: now }, $or: [{ endsAt: null }, { endsAt: { $exists: false } }, { endsAt: { $gt: now } }] };
  let dests: any[] = [];
  if (sp.get("audience") === "staff") {
    const me = await currentUser();
    if (!me || !["staff", "admin", "operator"].includes(me.role)) return ok({ items: [] });
    base.audience = { $in: ["staff", "all"] };
    if (me.role !== "admin") dests = (me.assignedDestinations || []).map(String);
    const rows: any[] = await Announcement.find(base).sort({ severity: -1, createdAt: -1 }).limit(20).populate("destinations", "name").lean();
    const ops = me.role === "admin" ? null : me.operator ? String(me.operator) : null;
    return ok({ items: rows.filter((a) => me.role === "admin" || !a.operator || String(a.operator) === ops).filter((a) => me.role === "admin" || !a.destinations?.length || a.destinations.some((d: any) => dests.includes(String(d._id)))) });
  }
  base.audience = { $in: ["visitors", "all"] };
  const slug = sp.get("destination");
  let dest: any = null;
  if (slug) dest = await Destination.findOne(/^[a-f\d]{24}$/i.test(slug) ? { _id: slug } : { slug }).select("operator").lean();
  const rows: any[] = await Announcement.find(base).sort({ severity: -1, createdAt: -1 }).limit(30).populate("destinations", "name slug").lean();
  const items = rows.filter((a) => {
    if (!slug) return true;
    if (!dest) return false;
    if (a.operator && String(a.operator) !== String(dest.operator)) return false;
    return !a.destinations?.length || a.destinations.some((d: any) => String(d._id) === String(dest._id));
  }).slice(0, 8);
  return ok({ items });
});
export const dynamic = "force-dynamic";
