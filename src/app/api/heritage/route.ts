import { handle, ok } from "@/lib/api";
import { HeritageSite } from "@/models/heritage";
import { norm, rank } from "@/lib/heritage-search";

import { HeritageRow as Row, store } from "@/lib/heritage-cache";

// The directory can hold ~4,000 sites; a trimmed copy lives in memory for a few minutes so search can rank and tolerate typos without a DB round trip per keystroke.
const TTL = 5 * 60_000;
async function rows(): Promise<Row[]> {
  if (store.rows && Date.now() - store.at < TTL) return store.rows;
  const docs: any[] = await HeritageSite.find({ active: true }).select("slug name aliases city state type categories asiId unesco.year summary popularity bookableSlug images").lean();
  const rs = docs.map((d) => {
    const im = d.images?.[0];
    return { slug: d.slug, name: d.name, aliases: d.aliases || [], city: d.city || "", state: d.state || "", type: d.type, categories: d.categories || [], asiId: d.asiId, unescoYear: d.unesco?.year, summary: (d.summary || "").slice(0, 220), popularity: d.popularity || 0, bookableSlug: d.bookableSlug,
      image: im ? { url: im.thumbUrl || im.url, author: im.author, license: im.license, licenseUrl: im.licenseUrl, sourceUrl: im.sourceUrl } : undefined };
  });
  store.rows = rs; store.at = Date.now();
  return rs;
}

export const GET = handle(async (req) => {
  const sp = req.nextUrl.searchParams;
  const q = sp.get("q")?.trim().slice(0, 100) || "";
  const state = sp.get("state"), type = sp.get("type"), category = sp.get("category");
  const page = Math.max(1, parseInt(sp.get("page") || "1", 10) || 1);
  const limit = Math.min(60, Math.max(1, parseInt(sp.get("limit") || "24", 10) || 24));

  let list = await rows();
  if (state) list = list.filter((r) => norm(r.state) === norm(state));
  if (type) list = list.filter((r) => r.type === type);
  if (category) list = list.filter((r) => r.categories.includes(category));
  if (sp.get("hasPhoto") === "true") list = list.filter((r) => r.image);

  let matches: Row[], exact: Row | null = null;
  if (q) { const r = rank(q, list, 500); matches = r.items; exact = r.exact; }
  else matches = [...list].sort((a, b) => Number(b.categories.includes("unesco")) - Number(a.categories.includes("unesco")) || b.popularity - a.popularity || a.name.localeCompare(b.name));

  const out: any = { items: matches.slice((page - 1) * limit, page * limit), total: matches.length, page, pages: Math.max(1, Math.ceil(matches.length / limit)), exactSlug: exact?.slug || null };
  if (sp.get("facets") === "1") {
    const all = await rows(), by = new Map<string, number>();
    for (const r of all) if (r.state) by.set(r.state, (by.get(r.state) || 0) + 1);
    out.facets = { states: [...by.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([name, count]) => ({ name, count })), totalSites: all.length, unesco: all.filter((r) => r.categories.includes("unesco")).length, withPhoto: all.filter((r) => r.image).length };
  }
  return ok(out);
});

export const dynamic = "force-dynamic";
