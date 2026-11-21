/** Pure helpers for the heritage importer (no network), so they can be unit-tested. */
import { parse } from "node-html-parser";
import { norm, rank, scoreSite, SearchableSite } from "../../src/lib/heritage-search";

export const STATES = ["Andhra Pradesh","Arunachal Pradesh","Assam","Bihar","Chhattisgarh","Goa","Gujarat","Haryana","Himachal Pradesh","Jharkhand","Karnataka","Kerala","Madhya Pradesh","Maharashtra","Manipur","Meghalaya","Mizoram","Nagaland","Odisha","Punjab","Rajasthan","Sikkim","Tamil Nadu","Telangana","Tripura","Uttar Pradesh","Uttarakhand","West Bengal","Andaman and Nicobar Islands","Chandigarh","Dadra and Nagar Haveli and Daman and Diu","Delhi","Jammu and Kashmir","Ladakh","Lakshadweep","Puducherry"];

export type Type = "monument" | "fort" | "museum" | "temple" | "archaeological" | "palace";
export function guessType(name: string): Type {
  const n = name.toLowerCase();
  if (/\b(museum|gallery)\b/.test(n)) return "museum";
  if (/\b(fort|qila|quila|garh|durg|fortress|bastion|citadel)\b/.test(n)) return "fort";
  if (/\b(palace|mahal|haveli|mansion|kothi|darbar)\b/.test(n)) return "palace";
  if (/\b(temple|mandir|mandapa|gopuram|devalaya|shrine|church|cathedral|mosque|masjid|dargah|gurudwara)\b/.test(n)) return "temple";
  if (/\b(cave|caves|stupa|buddhist|excavat|ruins|rock|inscription|site|mound|megalith|settlement|remains|group)\b/.test(n)) return "archaeological";
  return "monument";
}

/** ASI ids look like N-TN-C1, N-UP-A12, N-DL-77, N-KA-S103. */
export const ASI_ID = /\bN-[A-Z]{1,4}-[A-Za-z]?\d+(?:[-\/]\d+)*/;

/** The Commons file name inside an upload.wikimedia.org URL (thumb or original), decoded. */
export function fileNameFromUrl(url?: string | null): string | null {
  const m = (url || "").match(/\/wikipedia\/commons\/(?:thumb\/)?[0-9a-f]\/[0-9a-f]{2}\/([^\/?#]+)/i);
  if (!m) return null;
  try { return decodeURIComponent(m[1]).replace(/_/g, " "); } catch { return m[1].replace(/_/g, " "); }
}

export type AsiRow = { asiId: string; name: string; location: string; state: string; wikipediaTitle?: string; lat?: number; lng?: number; imageFile?: string };

/**
 * Parses one "List of Monuments of National Importance in <State>" page. Column layout differs between pages, so rows
 * are found by their ASI id and the name is the first meaningful text cell. build-catalogue prints sample rows so a
 * human can eyeball the result before importing.
 */
export function parseAsiList(html: string, state: string): AsiRow[] {
  const root = parse(html), out: AsiRow[] = [];
  for (const tr of root.querySelectorAll("tr")) {
    const tds = tr.querySelectorAll("td");
    if (tds.length < 2) continue;
    const idMatch = tds.map((td) => td.text.replace(/\s+/g, " ").trim().match(ASI_ID)).find(Boolean); // per cell: row.text would glue neighbouring cells together
    if (!idMatch) continue;
    const asiId = idMatch[0].trim();
    const textCells = tds.filter((td) => { const t = td.text.replace(/\s+/g, " ").trim(); return t.length >= 3 && !ASI_ID.test(t) && !/^[\d.,\s;°′″NESW-]+$/.test(t) && !td.querySelector(".geo") ; });
    const nameCell = textCells[0]; if (!nameCell) continue;
    const name = nameCell.text.replace(/\[[^\]]*\]/g, "").replace(/\s+/g, " ").trim();
    if (!name) continue;
    const loc = (textCells[1]?.text || "").replace(/\[[^\]]*\]/g, "").replace(/\s+/g, " ").trim();
    let wikipediaTitle: string | undefined;
    for (const a of nameCell.querySelectorAll("a")) {
      const href = a.getAttribute("href") || "";
      if (!href.startsWith("/wiki/") || /^\/wiki\/[A-Za-z_]+:/.test(href) || (a.getAttribute("class") || "").includes("new")) continue;
      try { wikipediaTitle = decodeURIComponent(href.slice(6).split("#")[0]).replace(/_/g, " "); } catch { /* ignore */ } break;
    }
    const geo = tr.querySelector(".geo")?.text.match(/(-?\d+(?:\.\d+)?)\s*;\s*(-?\d+(?:\.\d+)?)/);
    const img = tr.querySelector("img")?.getAttribute("src");
    out.push({ asiId, name, location: loc, state, wikipediaTitle, lat: geo ? +geo[1] : undefined, lng: geo ? +geo[2] : undefined, imageFile: fileNameFromUrl(img) || undefined });
  }
  return out;
}

/** Strips HTML from Commons "Artist"/"Credit" metadata. */
export const plain = (h?: string) => (h || "").replace(/<[^>]*>/g, " ").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&[a-z]+;/g, " ").replace(/\s+/g, " ").trim();

/** Only free licences we can legally show with attribution. Rejects NC/ND, fair use and unknown licences. */
export function licenseOk(short?: string): boolean {
  const l = (short || "").trim();
  if (!l) return false;
  if (/\b(NC|ND)\b|non-?commercial|no derivatives|fair use|copyrighted|all rights reserved/i.test(l)) return false;
  return /^(CC[ -]BY|CC0|Public domain|PD\b|Attribution|FAL|GFDL|OGL)/i.test(l);
}

/** Skip non-photographs when picking a fallback picture from an article. */
export const looksLikePhoto = (file: string) => /\.(jpe?g|png|webp)$/i.test(file) && !/(icon|logo|map|flag|symbol|locator|plan\b|diagram|sketch|drawing|painting|emblem|coat of arms|commons-|wikidata|stamp|signature|chart|svg)/i.test(file);

/** ASI ids carry a state/UT code: N-TN-C1 is Tamil Nadu. Used when a list page is organised by ASI "circle" rather than by state. */
const CODE: Record<string, string> = { AP: "Andhra Pradesh", AR: "Arunachal Pradesh", AS: "Assam", BR: "Bihar", CG: "Chhattisgarh", CH: "Chandigarh", DL: "Delhi", GA: "Goa", GJ: "Gujarat", HP: "Himachal Pradesh", HR: "Haryana", JH: "Jharkhand", JK: "Jammu and Kashmir", KA: "Karnataka", KL: "Kerala", LA: "Ladakh", MH: "Maharashtra", ML: "Meghalaya", MN: "Manipur", MP: "Madhya Pradesh", MZ: "Mizoram", NL: "Nagaland", OD: "Odisha", OR: "Odisha", PB: "Punjab", PY: "Puducherry", RJ: "Rajasthan", SK: "Sikkim", TN: "Tamil Nadu", TR: "Tripura", TS: "Telangana", TG: "Telangana", UK: "Uttarakhand", UT: "Uttarakhand", UP: "Uttar Pradesh", WB: "West Bengal", AN: "Andaman and Nicobar Islands" };
export const stateFromAsiId = (id: string) => CODE[(id.match(/^N-([A-Z]{1,4})-/) || [])[1] || ""];
/** UNESCO ids for whole sites are plain numbers ("252", "1111bis"). Wikidata also tags individual parts with ids like "252-001". */
export const isWholeSiteId = (id: string) => /^\d+(bis|ter|rev)?$/i.test(id.trim());

/**
 * Corrections for UNESCO sites whose Wikidata record has no usable state, and extra names people search for.
 * A rule applies only when BOTH the UNESCO number and the name match, so a wrong number can never mislabel another site.
 */
const UNESCO_RULES: { id: string; name: RegExp; state?: string; aliases?: string[] }[] = [
  { id: "231", name: /red fort/i, state: "Delhi", aliases: ["Lal Qila", "Lal Quila"] },
  { id: "232", name: /humayun/i, state: "Delhi" },
  { id: "233", name: /qutb|qutub/i, state: "Delhi", aliases: ["Qutub Minar", "Qutb Minar", "Kutub Minar"] },
  { id: "249", name: /mahabalipuram/i, state: "Tamil Nadu", aliases: ["Mamallapuram", "Shore Temple"] },
  { id: "1678", name: /hoysala/i, state: "Karnataka", aliases: ["Belur", "Halebidu", "Somanathapura"] },
  { id: "1480", name: /mumbai/i, state: "Maharashtra", aliases: ["Victorian Gothic Mumbai", "Art Deco Mumbai"] },
  { id: "944", name: /mountain railways/i, state: "Multiple states", aliases: ["Darjeeling Himalayan Railway", "Nilgiri Mountain Railway", "Kalka Shimla Railway"] },
  { id: "247", name: /hill forts/i, state: "Rajasthan" }, // the six forts have their own entries, so they are not aliases of this one
  { id: "1321", name: /le corbusier/i, state: "Chandigarh", aliases: ["Capitol Complex Chandigarh"] },
];

type Cat = { slug: string; name: string; aliases: string[]; categories: string[]; state: string; unesco?: { id: string; year?: number }; asiId?: string; images: any[]; location?: { lat: number; lng: number }; summary: string };

/**
 * Cleans the merged catalogue:
 *  1. UNESCO ids "944", "944bis", "944ter" are one listing (Mountain Railways of India): keep one entry.
 *  2. An ASI monument that is the same place as a UNESCO site (same name or alias, e.g. Humayun's Tomb) becomes one entry
 *     carrying both the UNESCO and ASI details, instead of two search results.
 *  3. UNESCO sites with no state get one.
 */
export function cleanCatalogue<T extends Cat>(sites: T[]): { sites: T[]; merged: string[] } {
  const merged: string[] = [], drop = new Set<T>();
  const absorb = (to: T, from: T) => {
    to.aliases = [...new Set([...(to.aliases || []), ...(from.aliases || []), from.name].filter((a) => a && norm(a) !== norm(to.name)))].slice(0, 14);
    for (const c of from.categories) if (!to.categories.includes(c)) to.categories.push(c);
    to.asiId ??= from.asiId;
    to.location ??= from.location;
    if (!to.summary) to.summary = from.summary;
    if (!to.state && from.state) to.state = from.state;
    for (const im of from.images || []) if (!(to.images || []).some((x: any) => x.url === im.url)) (to.images ||= []).push(im);
    drop.add(from);
  };
  const unesco = sites.filter((x) => x.unesco);
  const byBase = new Map<string, T[]>();
  for (const u of unesco) { const b = u.unesco!.id.replace(/(bis|ter)$/i, ""); byBase.set(b, [...(byBase.get(b) || []), u]); }
  for (const [base, group] of byBase) {
    const primary = group.find((g) => g.unesco!.id === base) || group[0];
    primary.unesco!.id = base;
    for (const g of group) if (g !== primary) { absorb(primary, g); merged.push(`${g.name} (${g.unesco!.id}) merged into ${primary.name}`); }
  }
  const index = new Map<string, T>();
  for (const u of unesco.filter((x) => !drop.has(x))) for (const n of [u.name, ...(u.aliases || [])]) if (norm(n).length >= 5 && !index.has(norm(n))) index.set(norm(n), u);
  for (const a of sites) {
    if (a.unesco || drop.has(a)) continue;
    const u = index.get(norm(a.name));
    if (u) { absorb(u, a); merged.push(`ASI ${a.asiId} "${a.name}" merged into UNESCO "${u.name}"`); }
  }
  for (const u of unesco) {
    if (drop.has(u)) continue;
    const num = u.unesco!.id.replace(/\D.*$/, "");
    for (const r of UNESCO_RULES) if (r.id === num && r.name.test(u.name)) {
      if (!u.state && r.state) u.state = r.state;
      u.aliases = [...new Set([...(u.aliases || []), ...(r.aliases || [])])].slice(0, 20);
    }
  }
  return { sites: sites.filter((x) => !drop.has(x)), merged };
}

/**
 * Finds the directory entry for one of our bookable destinations. Links automatically only when exactly ONE entry has
 * exactly that name or alias (also trying the name without "(...)" and without a ", place" suffix); otherwise returns suggestions.
 */
export function linkTarget<T extends SearchableSite>(name: string, sites: T[]): { match?: T; candidates: T[] } {
  const stripped = name.replace(/\(.*?\)/g, "").split(",")[0].trim();
  for (const q of [name, stripped]) {
    if (!norm(q)) continue;
    const exact = sites.filter((x) => scoreSite(q, x) >= 100);
    if (exact.length === 1) return { match: exact[0], candidates: [] };
  }
  const c = rank(stripped || name, sites, 3).items;
  return { candidates: c.length ? c : rank(name, sites, 3).items };
}