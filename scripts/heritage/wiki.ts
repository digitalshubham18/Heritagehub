/** Small, polite Wikimedia client. Wikimedia asks every client to send a descriptive User-Agent with contact details. */
import { licenseOk, looksLikePhoto, plain } from "./parse";

const CONTACT = process.env.HERITAGE_CONTACT || "";
if (!CONTACT) { console.error("Set HERITAGE_CONTACT in .env.local to your email or website (Wikimedia requires a contact in the User-Agent), e.g. HERITAGE_CONTACT=you@example.com"); process.exit(1); }
const UA = `HeritageHub-importer/1.0 (${CONTACT}) node-fetch`;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
let last = 0;

export async function getJson<T = any>(url: string, tries = 4): Promise<T> {
  for (let i = 0; i < tries; i++) {
    const wait = 180 - (Date.now() - last); if (wait > 0) await sleep(wait); last = Date.now();
    try {
      const r = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/json" } });
      if (r.status === 429 || r.status >= 500) { await sleep(1500 * (i + 1) * (r.status === 429 ? 3 : 1)); continue; }
      if (!r.ok) throw new Error(`HTTP ${r.status} for ${url.slice(0, 120)}`);
      return (await r.json()) as T;
    } catch (e) { if (i === tries - 1) throw e; await sleep(1000 * (i + 1)); }
  }
  throw new Error("unreachable");
}
export const chunk = <T,>(a: T[], n: number) => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n));
const qs = (o: Record<string, string | number>) => new URLSearchParams(Object.fromEntries(Object.entries(o).map(([k, v]) => [k, String(v)]))).toString();
export const WP = (o: Record<string, string | number>) => `https://en.wikipedia.org/w/api.php?${qs({ format: "json", formatversion: 2, ...o })}`;
export const COMMONS = (o: Record<string, string | number>) => `https://commons.wikimedia.org/w/api.php?${qs({ format: "json", formatversion: 2, ...o })}`;

export type Photo = { url: string; thumbUrl: string; file: string; author: string; license: string; licenseUrl?: string; sourceUrl: string; width: number; height: number };

/** Looks up Commons files (50 per request) and returns only those that exist, are real photos, are wide enough and carry a free licence. */
export async function verifyCommonsFiles(files: string[]): Promise<Map<string, Photo>> {
  const out = new Map<string, Photo>();
  const uniq = [...new Set(files.map((f) => f.replace(/^File:/i, "").replace(/_/g, " ")))].filter(looksLikePhoto);
  for (const batch of chunk(uniq, 50)) {
    const j = await getJson(COMMONS({ action: "query", titles: batch.map((f) => `File:${f}`).join("|"), prop: "imageinfo", iiprop: "url|size|mime|extmetadata", iiurlwidth: 1280, iiextmetadatafilter: "LicenseShortName|LicenseUrl|Artist|Credit|AttributionRequired|Restrictions" }));
    for (const pg of j.query?.pages || []) {
      const ii = pg.imageinfo?.[0]; if (!ii || pg.missing) continue;
      const m = ii.extmetadata || {};
      const license = plain(m.LicenseShortName?.value);
      if (!/^image\/(jpeg|png|webp)$/.test(ii.mime || "") || !licenseOk(license) || (ii.width || 0) < 800) continue;
      const author = plain(m.Artist?.value) || plain(m.Credit?.value) || "Unknown author (see Commons page)";
      const title = String(pg.title).replace(/^File:/, "");
      out.set(title, { url: ii.url, thumbUrl: ii.thumburl || ii.url, file: pg.title, author: author.slice(0, 160), license, licenseUrl: m.LicenseUrl?.value, sourceUrl: ii.descriptionurl || `https://commons.wikimedia.org/wiki/${encodeURIComponent(String(pg.title).replace(/ /g, "_"))}`, width: ii.width, height: ii.height });
    }
  }
  return out;
}
