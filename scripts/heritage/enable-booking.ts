/**
 * Opens online booking for many heritage sites at once, from a spreadsheet of OFFICIAL hours and prices.
 *
 *   npm run heritage:booking -- --template > data/booking.csv            list UNESCO sites to fill in (add --state "Rajasthan" or --all for every site)
 *   npm run heritage:booking -- data/booking.csv                         DRY RUN: validates every row, writes nothing
 *   npm run heritage:booking -- data/booking.csv --apply                 creates the bookable destinations
 *
 * Columns: slug, open, close, closed_days, indian_price, foreign_price, child_price, capacity_per_slot, daily_visitors,
 * max_inside, address, lat, lng. Required: slug, open, close, indian_price, capacity_per_slot. We never fill in prices, hours or
 * capacity ourselves. Visitors pay exactly what is in this file, and you must be authorised to sell tickets for each site.
 */
import fs from "fs";
import mongoose from "mongoose";
import { connectDB } from "../../src/lib/db";
import { Destination } from "../../src/models";
import { HeritageSite } from "../../src/models/heritage";
import { syncCategories } from "../../src/lib/destinations";
import { parseCsv, rowToDestination } from "./booking-rows";

const args = process.argv.slice(2);
const val = (n: string) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : undefined; };

(async () => {
  await connectDB();
  if (args.includes("--template")) {
    const filter: any = { active: true, bookableSlug: { $exists: false } };
    if (!args.includes("--all")) filter.categories = "unesco";
    if (val("state")) filter.state = val("state");
    const sites: any[] = await HeritageSite.find(filter).sort({ state: 1, name: 1 }).select("slug name state").lean();
    const q = (x: string) => `"${String(x).replace(/"/g, '""')}"`;
    console.log("slug,name,state,open,close,closed_days,indian_price,foreign_price,child_price,capacity_per_slot,daily_visitors,max_inside,address,lat,lng");
    for (const s of sites) console.log(`${s.slug},${q(s.name)},${q(s.state)},,,,,,,,,,,,`);
    console.error(`${sites.length} sites listed. The name and state columns are for your reference only; fill in the rest from the official source.`);
    return mongoose.disconnect();
  }
  const file = args.find((a) => !a.startsWith("--") && a !== val("state"));
  if (!file || !fs.existsSync(file)) { console.error("Usage: npm run heritage:booking -- <file.csv> [--apply]   or   -- --template"); process.exit(1); }
  const apply = args.includes("--apply");
  const rows = parseCsv(fs.readFileSync(file, "utf8")).filter((r) => r.slug && (r.open || r.close || r.indian_price || r.capacity_per_slot)); // untouched template rows are skipped
  console.log(`${rows.length} filled-in rows. ${apply ? "APPLYING" : "DRY RUN (add --apply to write)"}\n`);
  let ok = 0, bad = 0;
  for (const r of rows) {
    const site: any = await HeritageSite.findOne({ slug: r.slug, active: true }).lean();
    const fail = (m: string) => { bad++; console.log(`  ✗ ${r.slug}: ${m}`); };
    if (!site) { fail("no such heritage site"); continue; }
    if (site.bookableSlug) { fail("already bookable"); continue; }
    if (await Destination.exists({ slug: site.slug })) { fail("a destination with this slug already exists"); continue; }
    const res = rowToDestination(r, site);
    if (!res.ok) { fail(res.error); continue; }
    if (apply) {
      const { categories, heritageSlug, ...data } = res.data;
      const d = await Destination.create({ ...data, imageCredits: (site.images || []).map((i: any) => ({ url: i.thumbUrl || i.url, author: i.author, license: i.license, licenseUrl: i.licenseUrl, sourceUrl: i.sourceUrl })) });
      await syncCategories(d._id, categories);
      await HeritageSite.updateOne({ slug: site.slug }, { $set: { bookableSlug: d.slug, popularity: 100 } });
    }
    ok++; console.log(`  ✓ ${r.slug}${apply ? " is now bookable" : " looks valid"}`);
  }
  console.log(`\n${ok} ok, ${bad} with problems.${!apply && ok ? " Re-run with --apply to create them." : ""}`);
  await mongoose.disconnect();
})().catch((e) => { console.error("FAILED:", e); process.exit(1); });
