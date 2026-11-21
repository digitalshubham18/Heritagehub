import { ApiError, handle, ok } from "@/lib/api";
import { HeritageSite } from "@/models/heritage";

export const GET = handle(async (_req, { params }) => {
  const slug = String(params.slug || "").toLowerCase().slice(0, 120);
  const site: any = await HeritageSite.findOne({ slug, active: true }).select("-searchKey -__v").lean();
  if (!site) throw new ApiError(404, "We could not find that heritage site");
  const near = await HeritageSite.find({ active: true, _id: { $ne: site._id }, ...(site.city ? { city: site.city } : { state: site.state }) })
    .sort({ popularity: -1 }).limit(6).select("slug name city state type categories unesco.year summary images bookableSlug").lean();
  return ok({ site, nearby: near.map((d: any) => ({ slug: d.slug, name: d.name, city: d.city, state: d.state, type: d.type, categories: d.categories, unescoYear: d.unesco?.year, summary: (d.summary || "").slice(0, 160), bookableSlug: d.bookableSlug, image: d.images?.[0] ? { url: d.images[0].thumbUrl || d.images[0].url, author: d.images[0].author, license: d.images[0].license } : undefined })) });
});
export const dynamic = "force-dynamic";
