/**
 * Builds data/heritage-catalogue.json: every UNESCO World Heritage Site in India (from Wikidata) plus every ASI
 * "Monument of National Importance" (from Wikipedia's per-state lists), each with a licence-verified Commons photo
 * where one exists. Needs internet. Run:  npm run heritage:build            (full, ~15-40 min, resumable)
 *                                         npm run heritage:build -- --limit 3   (trial: 3 state lists only)
 * Nothing is invented: a site with no verifiable free photo simply has no photo, and says so in the report.
 */
import fs from "fs";
import path from "path";
import { slugify } from "../../src/lib/heritage-search";
import { chunk, getJson, Photo, verifyCommonsFiles, WP } from "./wiki";
import { cleanCatalogue, guessType, isWholeSiteId, looksLikePhoto, parseAsiList, stateFromAsiId, STATES, AsiRow } from "./parse";

const args = process.argv.slice(2);
const flag = (n: string) => args.includes(`--${n}`);
const val = (n: string) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : undefined; };
const LIMIT = val("limit") ? parseInt(val("limit")!, 10) : Infinity;
const DATA = path.resolve(process.cwd(), "data"); fs.mkdirSync(DATA, { recursive: true });
const CACHE_FILE = path.join(DATA, ".heritage-cache.json");
const cache: Record<string, any> = fs.existsSync(CACHE_FILE) ? JSON.parse(fs.readFileSync(CACHE_FILE, "utf8")) : {};
const saveCache = () => fs.writeFileSync(CACHE_FILE, JSON.stringify(cache));
const log = (...a: any[]) => console.log(new Date().toISOString().slice(11, 19), ...a);

type Rec = { slug: string; name: string; aliases: string[]; categories: string[]; type: string; city: string; state: string; summary: string; unesco?: { id: string; year?: number }; asiId?: string; location?: { lat: number; lng: number }; wikipediaTitle?: string; wikidataId?: string; images: Photo[]; dataSource: string; _imageFile?: string; _extra?: boolean };
const recs: Rec[] = [];
const byTitle = new Map<string, Rec>();
const tkey = (t: string) => t.replace(/_/g, " ").toLowerCase();

/* 1. UNESCO World Heritage Sites in India, from Wikidata (P757 = UNESCO WHS id, P17 = country, Q668 = India) */
async function unesco() {
  log("UNESCO: querying Wikidata");
  const states = STATES.map((s) => `"${s}"@en`).join(",");
  const sparql = `SELECT ?item ?itemLabel ?whs ?coord ?article ?start ?stateLabel ?adminLabel WHERE {
    ?item wdt:P757 ?whs ; wdt:P17 wd:Q668 .
    OPTIONAL { ?item wdt:P625 ?coord }
    OPTIONAL { ?article schema:about ?item ; schema:isPartOf <https://en.wikipedia.org/> }
    OPTIONAL { ?item p:P1435 ?st . ?st ps:P1435 wd:Q9259 . OPTIONAL { ?st pq:P580 ?start } }
    OPTIONAL { ?item wdt:P131 ?admin }
    OPTIONAL { ?item wdt:P131* ?stt . ?stt rdfs:label ?stateLabel . FILTER(LANG(?stateLabel) = "en" && ?stateLabel IN (${states})) }
    SERVICE wikibase:label { bd:serviceParam wikibase:language "en" . } }`;
  const j = await getJson<any>(`https://query.wikidata.org/sparql?format=json&query=${encodeURIComponent(sparql)}`);
  const groups = new Map<string, any[]>();
  for (const b of j.results.bindings) { const id = b.whs.value; groups.set(id, [...(groups.get(id) || []), b]); }
  // Keep only whole sites. Parts of serial sites carry ids like "252-001" and would otherwise appear as separate "sites".
  const parts = [...groups.keys()].filter((id) => !isWholeSiteId(id));
  parts.forEach((id) => groups.delete(id));
  log(`UNESCO: ignored ${parts.length} part/component ids (e.g. ${parts.slice(0, 4).join(", ") || "none"})`);
  for (const [id, allRows] of groups) {
    // If several Wikidata items share one id, prefer the one that has a Wikipedia article.
    const itemIds = [...new Set(allRows.map((r) => r.item.value))];
    const best = itemIds.find((i) => allRows.some((r) => r.item.value === i && r.article)) || itemIds[0];
    const rows = allRows.filter((r) => r.item.value === best);
    const r0 = rows[0];
    const years = rows.map((r) => r.start && new Date(r.start.value).getUTCFullYear()).filter(Boolean) as number[];
    const states = [...new Set(rows.map((r) => r.stateLabel?.value).filter(Boolean))] as string[];
    const m = r0.coord?.value.match(/Point\(([-\d.]+) ([-\d.]+)\)/); // WKT is "Point(lon lat)"
    const title = r0.article ? decodeURIComponent(r0.article.value.split("/wiki/")[1]).replace(/_/g, " ") : undefined;
    const name = r0.itemLabel.value;
    const rec: Rec = { slug: "", name, aliases: [], categories: ["unesco"], type: guessType(name), city: rows.find((r) => r.adminLabel)?.adminLabel.value || "", state: states.length > 1 ? "Multiple states" : states[0] || "", summary: "", unesco: { id, year: years.length ? Math.min(...years) : undefined }, location: m ? { lat: +m[2], lng: +m[1] } : undefined, wikipediaTitle: title, wikidataId: r0.item.value.split("/").pop(), images: [], dataSource: "UNESCO World Heritage List via Wikidata" };
    recs.push(rec); if (title) byTitle.set(tkey(title), rec);
  }
  log(`UNESCO: ${groups.size} sites`);
  if (groups.size < 35 || groups.size > 60) console.warn(`\n  !! India has about 44 UNESCO World Heritage Sites but ${groups.size} were found. Do not import yet; send this output for review.\n`);
}

/* 1b. Well-known sites that are PARTS of a UNESCO listing, so people can search for them by their own name (Amer Fort, not just "Hill Forts of Rajasthan") */
const EXTRA = [
  { title: "Amer Fort", city: "Jaipur", state: "Rajasthan", type: "fort" }, { title: "Chittorgarh Fort", city: "Chittorgarh", state: "Rajasthan", type: "fort" },
  { title: "Kumbhalgarh", city: "Rajsamand", state: "Rajasthan", type: "fort" }, { title: "Ranthambore Fort", city: "Sawai Madhopur", state: "Rajasthan", type: "fort" },
  { title: "Jaisalmer Fort", city: "Jaisalmer", state: "Rajasthan", type: "fort" }, { title: "Gagron Fort", city: "Jhalawar", state: "Rajasthan", type: "fort" },
];
function extras() {
  for (const e of EXTRA) {
    if (byTitle.has(tkey(e.title))) continue;
    const rec: Rec = { slug: "", name: e.title, aliases: [], categories: ["unesco"], type: e.type, city: e.city, state: e.state, summary: "", wikipediaTitle: e.title, images: [], dataSource: "Part of the UNESCO World Heritage Site Hill Forts of Rajasthan", _extra: true };
    recs.push(rec); byTitle.set(tkey(e.title), rec);
  }
}

/* 2. ASI Monuments of National Importance, from Wikipedia's state lists */
async function asi() {
  const PREFIX = "List of Monuments of National Importance in";
  const ps = await getJson<any>(WP({ action: "query", list: "prefixsearch", pssearch: PREFIX, pslimit: 100 }));
  const pages: string[] = (ps.query?.prefixsearch || []).map((x: any) => x.title as string).filter((t: string) => t.startsWith(PREFIX + " ")).slice(0, LIMIT);
  log(`ASI: ${pages.length} list pages`);
  let n = 0, sample: AsiRow[] = [];
  const seen = new Set<string>();
  for (const title of pages) {
    const pageState = title.slice(PREFIX.length + 1).replace(/\s*\(.*\)$/, "").trim();
    const j = await getJson<any>(WP({ action: "parse", page: title, prop: "text", disabletoc: 1 }));
    // Some pages are per ASI "circle" (e.g. Chennai circle), not per state; for those the state comes from each monument's id code.
    const rows = parseAsiList(j.parse?.text || "", pageState).map((r) => ({ ...r, state: STATES.includes(pageState) ? pageState : stateFromAsiId(r.asiId) || pageState }));
    if (!rows.length) log(`  ! ${title}: parsed 0 rows (layout differs?)`);
    if (sample.length < 6) sample.push(...rows.slice(0, 2));
    for (const r of rows) {
      if (seen.has(r.asiId)) continue; seen.add(r.asiId);
      const hit = r.wikipediaTitle && byTitle.get(tkey(r.wikipediaTitle));
      if (hit) { hit.asiId ??= r.asiId; if (!hit.categories.includes("asi")) hit.categories.push("asi"); hit._imageFile ??= r.imageFile; if (!hit.city) hit.city = r.location; continue; }
      const rec: Rec = { slug: "", name: r.name, aliases: [], categories: ["asi"], type: guessType(r.name), city: r.location, state: r.state, summary: "", asiId: r.asiId, location: r.lat != null && r.lng != null ? { lat: r.lat, lng: r.lng } : undefined, wikipediaTitle: r.wikipediaTitle, images: [], dataSource: "Archaeological Survey of India list via Wikipedia", _imageFile: r.imageFile };
      recs.push(rec); n++;
      if (r.wikipediaTitle) byTitle.set(tkey(r.wikipediaTitle), rec);
    }
    log(`  ${title}: ${rows.length} rows`);
  }
  log(`ASI: ${n} monuments added`);
  console.log("\nSAMPLE PARSED ROWS (check these look right before importing):"); console.table(sample.slice(0, 6).map((r) => ({ id: r.asiId, name: r.name.slice(0, 40), location: r.location.slice(0, 30), article: r.wikipediaTitle || "-", coords: r.lat ? "yes" : "-", img: r.imageFile ? "yes" : "-" })));
}

/** Runs a Wikipedia query and merges continuation pages by pageid. */
async function queryAll(params: Record<string, string | number>) {
  const pages = new Map<number, any>(); let cont: any = {}, normalized: any[] = [], redirects: any[] = [];
  for (let i = 0; i < 20; i++) {
    const j = await getJson<any>(WP({ action: "query", ...params, ...cont }));
    normalized.push(...(j.query?.normalized || [])); redirects.push(...(j.query?.redirects || []));
    for (const p of j.query?.pages || []) { const e = pages.get(p.pageid ?? p.title) || {}; for (const [k, v] of Object.entries(p)) e[k] = Array.isArray(v) ? [...(e[k] || []), ...v] : v; pages.set(p.pageid ?? p.title, e); }
    if (!j.continue) break; cont = j.continue;
  }
  return { pages: [...pages.values()], normalized, redirects };
}

/* 3. Enrich from each article: summary, alternate names (redirects), coordinates, lead image */
async function enrich() {
  const withTitle = recs.filter((r) => r.wikipediaTitle);
  log(`Enriching ${withTitle.length} articles`);
  let done = 0;
  for (const batch of chunk(withTitle, 20)) {
    const need = batch.filter((r) => !cache[`wp:${r.wikipediaTitle}`]);
    if (need.length) {
      const titles = need.map((r) => r.wikipediaTitle!);
      const { pages, normalized, redirects } = await queryAll({ prop: "pageimages|extracts|redirects|pageprops|coordinates", piprop: "name", exintro: 1, explaintext: 1, exsentences: 3, exlimit: 20, rdlimit: "max", rdnamespace: 0, ppprop: "wikibase_item", coprimary: "primary", redirects: 1, titles: titles.join("|") });
      const resolve = (t: string) => { const a = normalized.find((x) => x.from === t)?.to || t; return redirects.find((x) => x.from === a)?.to || a; };
      for (const r of need) {
        const pg = pages.find((p) => p.title === resolve(r.wikipediaTitle!));
        cache[`wp:${r.wikipediaTitle}`] = pg ? { summary: pg.extract || "", aliases: (pg.redirects || []).map((x: any) => x.title), qid: pg.pageprops?.wikibase_item, lat: pg.coordinates?.[0]?.lat, lng: pg.coordinates?.[0]?.lon, pageimage: pg.pageimage } : { missing: true };
      }
      saveCache();
    }
    for (const r of batch) {
      const c = cache[`wp:${r.wikipediaTitle}`]; if (!c || c.missing) continue;
      r.summary = (c.summary || "").replace(/\s+/g, " ").trim();
      r.wikidataId ??= c.qid;
      r.aliases = [...new Set<string>((c.aliases as string[]).filter((a) => a.length >= 3 && a.length <= 60 && !/disambiguation|^List of|:/i.test(a) && a.toLowerCase() !== r.name.toLowerCase()))].slice(0, 12);
      if (!r.location && c.lat != null) r.location = { lat: c.lat, lng: c.lng };
      if (c.pageimage) r._imageFile = c.pageimage;
    }
    done += batch.length; if (done % 200 === 0 || done === withTitle.length) log(`  enriched ${done}/${withTitle.length}`);
  }
}

/* 4. Photos: verify on Commons (exists, real photo, >=800px, free licence), falling back to other pictures in the article */
async function photos() {
  const cands = recs.filter((r) => r._imageFile).map((r) => r._imageFile!);
  log(`Verifying ${new Set(cands).size} lead photos on Commons`);
  const ok = new Map<string, Photo>();
  for (const batch of chunk([...new Set(cands)], 200)) { const v = await verifyCommonsFiles(batch); v.forEach((p, k) => ok.set(k, p)); }
  for (const r of recs) { const p = r._imageFile && ok.get(r._imageFile.replace(/_/g, " ")); if (p) r.images.push(p); }

  const need = recs.filter((r) => r.wikipediaTitle && (r.images.length === 0 || r.categories.includes("unesco")));
  log(`Looking for ${need.length} more photos inside articles (all UNESCO sites get up to 3)`);
  let n = 0;
  for (const batch of chunk(need, 20)) {
    const { pages, normalized, redirects } = await queryAll({ prop: "images", imlimit: "max", redirects: 1, titles: batch.map((r) => r.wikipediaTitle!).join("|") });
    const resolve = (t: string) => { const a = normalized.find((x) => x.from === t)?.to || t; return redirects.find((x) => x.from === a)?.to || a; };
    const files = new Map<Rec, string[]>();
    for (const r of batch) { const pg = pages.find((p) => p.title === resolve(r.wikipediaTitle!)); files.set(r, (pg?.images || []).map((i: any) => String(i.title).replace(/^File:/, "")).filter(looksLikePhoto).slice(0, 25)); }
    const v = await verifyCommonsFiles([...files.values()].flat());
    for (const [r, fl] of files) {
      const want = r.categories.includes("unesco") ? 3 : 1;
      for (const f of fl) { if (r.images.length >= want) break; const p = v.get(f.replace(/_/g, " ")); if (p && !r.images.some((x) => x.url === p.url)) r.images.push(p); }
    }
    n += batch.length; if (n % 200 === 0) log(`  ${n}/${need.length}`);
  }
}

/* 5. Slugs, output, report */
function finish() {
  const cleaned = cleanCatalogue(recs as any[]);
  recs.splice(0, recs.length, ...(cleaned.sites as Rec[]));
  log(`Cleaned: ${cleaned.merged.length} duplicate entries merged`); cleaned.merged.slice(0, 15).forEach((m) => console.log("   ", m));
  const used = new Set<string>();
  for (const r of recs.sort((a, b) => Number(b.categories.includes("unesco")) - Number(a.categories.includes("unesco")) || a.name.localeCompare(b.name))) {
    for (const cand of [slugify(r.name), slugify(`${r.name} ${r.state}`), slugify(`${r.name} ${r.asiId || r.unesco?.id}`)]) if (!used.has(cand)) { r.slug = cand; break; }
    if (!r.slug) r.slug = slugify(`${r.name} ${r.asiId || r.unesco?.id}`) + "-" + used.size;
    used.add(r.slug);
    delete r._imageFile; delete r._extra;
  }
  const out = { generatedAt: new Date().toISOString(), counts: { total: recs.length, unesco: recs.filter((r) => r.categories.includes("unesco")).length, asi: recs.filter((r) => r.categories.includes("asi")).length, withPhoto: recs.filter((r) => r.images.length).length }, sites: recs };
  fs.writeFileSync(path.join(DATA, "heritage-catalogue.json"), JSON.stringify(out, null, 1));
  const missing = recs.filter((r) => !r.images.length);
  const odd = recs.filter((r) => !STATES.includes(r.state) && r.state !== "Multiple states");
  fs.writeFileSync(path.join(DATA, "heritage-report.txt"), [
    `Generated ${out.generatedAt}`, JSON.stringify(out.counts), "",
    `== ${missing.length} sites WITHOUT a verified free photo (they show an illustration until one is added; use npm run heritage:photo) ==`, ...missing.map((r) => `${r.slug}\t${r.name}\t${r.state}${r.wikipediaTitle ? "" : "\t(no Wikipedia article)"}`), "",
    `== ${odd.length} sites whose state is blank or not a recognised state/UT (check) ==`, ...odd.map((r) => `${r.slug}\t${r.name}\tstate="${r.state}"`),
  ].join("\n"));
  log("DONE", out.counts, "\nWrote data/heritage-catalogue.json and data/heritage-report.txt");
}

(async () => {
  await unesco();
  if (!flag("skip-asi")) await asi();
  extras();
  await enrich();
  for (const r of [...recs]) if (r._extra && !r.summary) { recs.splice(recs.indexOf(r), 1); log(`  (skipped ${r.name}: no Wikipedia article found)`); }
  await photos();
  finish();
})().catch((e) => { console.error("\nFAILED:", e.message); process.exit(1); });