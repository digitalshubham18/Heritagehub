import { ApiError, handle, ok } from "@/lib/api";
import { HeritageSite } from "@/models/heritage";
import { clearHeritageCache } from "@/lib/heritage-cache";
import { currentUser, requireUser } from "@/lib/auth";
import { Operator } from "@/models";
import { destinationSchema } from "@/lib/validators";
import { Destination, TicketCategory } from "@/models";
import { crowdSummary } from "@/lib/crowd";
import { escapeRe, todayIST, istParts, toMin, dow, Level } from "@/lib/utils";
import { slugify, syncCategories } from "@/lib/destinations";
import { audit } from "@/lib/audit";

const ORDER: Record<Level, number> = { low: 0, moderate: 1, high: 2, very_high: 3 };

export const GET = handle(async (req) => {
  const sp = req.nextUrl.searchParams;
  const filter: any = { active: true };
  const q = sp.get("q")?.trim();
  if (q) filter.$or = ["name", "city", "state", "type"].map((f) => ({ [f]: { $regex: escapeRe(q), $options: "i" } }));
  if (sp.get("type")) filter.type = sp.get("type");
  if (sp.get("accessible") === "true") filter["accessibility.0"] = { $exists: true };
  if (sp.get("all") === "1") { // only the admin view needs to know who is asking; public requests skip the user lookup entirely
    const viewer = await currentUser();
    if (viewer?.role === "admin") delete filter.active;
    if (viewer?.role === "operator") { delete filter.active; filter.operator = viewer.operator; }
  }
  if (sp.get("operator")) filter.operator = sp.get("operator");
  const dests: any[] = await Destination.find(filter).sort({ popularity: -1 }).lean();
  const [ops, cats]: [any[], any[]] = await Promise.all([
    Operator.find({ _id: { $in: dests.map((d) => d.operator).filter(Boolean) } }).select("name").lean(),
    TicketCategory.find({ destination: { $in: dests.map((d) => d._id) }, active: true }).lean(),
  ]);
  const date = sp.get("date") || todayIST();
  const { date: today, minutes } = istParts();

  let items = await Promise.all(dests.map(async (d) => {
    const mine = cats.filter((c) => String(c.destination) === String(d._id));
    const total = (c: any) => c.priceMinor + (c.feeMinor || 0);
    const indian = mine.filter((c) => c.audience === "indian" && total(c) > 0).map(total);
    const foreign = mine.filter((c) => c.audience === "foreign").map(total);
    const openNow = today === date && !d.hours.closedDays.includes(dow(date)) && minutes >= toMin(d.hours.open) && minutes < toMin(d.hours.close);
    return {
      _id: d._id, slug: d.slug, name: d.name, operator: d.operator, operatorName: ops.find((o) => String(o._id) === String(d.operator))?.name, city: d.city, state: d.state, type: d.type, shortDescription: d.shortDescription,
      image: d.images?.[0], hours: d.hours, rating: d.rating, ratingCount: d.ratingCount, popularity: d.popularity,
      accessible: (d.accessibility || []).length > 0, location: d.location, openNow,
      fromPriceMinor: indian.length ? Math.min(...indian) : mine.length ? Math.min(...mine.map(total)) : 0,
      foreignPriceMinor: foreign.length ? Math.min(...foreign) : null,
      crowd: await crowdSummary(d, date), dataLabel: d.dataLabel, active: d.active, defaultSlotCapacity: d.defaultSlotCapacity, crowdThresholds: d.crowdThresholds, alertThresholdPct: d.alertThresholdPct, cancellationPolicy: d.cancellationPolicy, bookingPolicy: d.bookingPolicy, occupancyLimit: d.occupancyLimit, publicHeadcount: d.publicHeadcount !== false,
    };
  }));
  const maxPrice = sp.get("maxPrice"), level = sp.get("crowd");
  if (maxPrice) items = items.filter((i) => i.fromPriceMinor <= Number(maxPrice) * 100);
  if (level) items = items.filter((i) => !i.crowd.closed && (i.crowd as any).level === level);
  if (sp.get("openNow") === "true") items = items.filter((i) => i.openNow);
  const sort = sp.get("sort");
  if (sort === "price") items.sort((a, b) => a.fromPriceMinor - b.fromPriceMinor);
  else if (sort === "crowd") items.sort((a, b) => (a.crowd.closed ? 9 : ORDER[(a.crowd as any).level as Level]) - (b.crowd.closed ? 9 : ORDER[(b.crowd as any).level as Level]));
  return ok({ items });
});

export const POST = handle(async (req) => {
  const me = await requireUser(["admin", "operator"]);
  const { categories, operatorId, heritageSlug, ...data } = destinationSchema.parse(await req.json());
  const slug = data.slug || (heritageSlug ? heritageSlug : slugify(data.name));
  const site: any = heritageSlug ? await HeritageSite.findOne({ slug: heritageSlug, active: true }).lean() : null;
  if (heritageSlug && !site) throw new ApiError(404, "That heritage directory entry no longer exists");
  if (site?.bookableSlug) throw new ApiError(409, "Online booking is already set up for this heritage site");
  if (await Destination.exists({ slug })) throw new ApiError(409, "A destination with this URL already exists. Change the URL slug.");
  // Photos copied from the directory keep their photographer and licence credit.
  const credits = site ? (site.images || []).filter((i: any) => data.images.includes(i.thumbUrl || i.url) || data.images.includes(i.url)).map((i: any) => ({ url: i.thumbUrl || i.url, author: i.author, license: i.license, licenseUrl: i.licenseUrl, sourceUrl: i.sourceUrl })) : [];
  const d = await Destination.create({ ...data, slug, imageCredits: credits, operator: me.role === "operator" ? me.operator : operatorId || undefined });
  if (categories?.length) await syncCategories(d._id, categories);
  if (site) { await HeritageSite.updateOne({ slug: heritageSlug }, { $set: { bookableSlug: d.slug, popularity: 100 } }); clearHeritageCache(); }
  await audit(me, "destination.create", "Destination", d._id, `Created ${d.name}${site ? ` from heritage directory entry ${heritageSlug}` : ""}`);
  return ok({ destination: d }, 201);
});

export const dynamic = "force-dynamic";
