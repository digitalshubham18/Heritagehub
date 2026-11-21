/**
 * Loads data/heritage-catalogue.json into MongoDB (collection: heritagesites) and links it to the bookable
 * destinations. Safe to re-run: sites are upserted by slug, nothing is deleted.  npm run heritage:import
 *
 * For each bookable Destination (Taj Mahal, Agra Fort, ...) it finds the matching directory entry with the same search
 * the website uses, records the link, and replaces the destination's photos with the verified, credited ones.
 * Destinations it cannot match with confidence are listed, never guessed. Pass --keep-destination-photos to skip that step.
 */
import fs from "fs";
import path from "path";
import mongoose from "mongoose";
import { connectDB } from "../../src/lib/db";
import { Destination } from "../../src/models";
import { HeritageSite } from "../../src/models/heritage";
import { buildSearchKey } from "../../src/lib/heritage-search";
import { linkTarget } from "./parse";

(async () => {
  const file = path.resolve(process.cwd(), "data/heritage-catalogue.json");
  if (!fs.existsSync(file)) { console.error("data/heritage-catalogue.json not found. Run: npm run heritage:build"); process.exit(1); }
  const { sites, counts } = JSON.parse(fs.readFileSync(file, "utf8"));
  await connectDB();
  console.log(`Importing ${sites.length} sites`, counts);

  let ops: any[] = [], done = 0;
  const flush = async () => { if (ops.length) { await HeritageSite.bulkWrite(ops, { ordered: false }); done += ops.length; ops = []; process.stdout.write(`\r  ${done}/${sites.length}`); } };
  for (const s of sites) {
    const doc = { name: s.name, aliases: s.aliases || [], searchKey: buildSearchKey({ name: s.name, aliases: s.aliases, city: s.city, state: s.state, type: s.type, categories: s.categories, asiId: s.asiId }), categories: s.categories, type: s.type, city: s.city || "", state: s.state || "", summary: s.summary || "", unesco: s.unesco, asiId: s.asiId, location: s.location, wikipediaTitle: s.wikipediaTitle, wikidataId: s.wikidataId, images: s.images || [], dataSource: s.dataSource, active: true };
    ops.push({ updateOne: { filter: { slug: s.slug }, update: { $set: doc, $setOnInsert: { popularity: s.categories.includes("unesco") ? 50 : 0 } }, upsert: true } });
    if (ops.length >= 500) await flush();
  }
  await flush(); console.log("\nSites imported.");
  if (process.argv.includes("--prune")) { // hide entries from an older import that are no longer in the catalogue (e.g. duplicates that were merged)
    const r = await HeritageSite.updateMany({ slug: { $nin: sites.map((x: any) => x.slug) }, active: true }, { $set: { active: false } });
    console.log(`Hid ${r.modifiedCount} entries that are not in this catalogue.`);
  }

  // Link bookable destinations using the same ranking the site search uses.
  const all: any[] = await HeritageSite.find({ active: true }).select("slug name aliases city state type categories images").lean();
  const unlinked: string[] = [];
  for (const d of await Destination.find({}).lean() as any[]) {
    const { match, candidates } = linkTarget(d.name, all);
    if (!match) {
      unlinked.push(`${d.slug} ("${d.name}")` + (candidates.length ? `\n      closest: ${candidates.map((a: any) => `${a.slug} [${a.name}]`).join("  |  ")}\n      if one of these is right: npx tsx --env-file=.env.local scripts/heritage/link-booking.ts ${d.slug} <its-slug>` : "\n      no close match in the directory"));
      continue;
    }
    const e: any = match;
    await HeritageSite.updateMany({ bookableSlug: d.slug, slug: { $ne: e.slug } }, { $unset: { bookableSlug: 1 } }); // a destination points at one entry only
    await HeritageSite.updateOne({ slug: e.slug }, { $set: { bookableSlug: d.slug, popularity: 100 } });
    let msg = `  linked ${d.slug} -> ${e.slug}`;
    if (!process.argv.includes("--keep-destination-photos") && e.images?.length) {
      await Destination.updateOne({ _id: d._id }, { $set: { images: e.images.map((i: any) => i.thumbUrl || i.url), imageCredits: e.images.map((i: any) => ({ url: i.thumbUrl || i.url, author: i.author, license: i.license, licenseUrl: i.licenseUrl, sourceUrl: i.sourceUrl })) } });
      msg += ` (${e.images.length} verified photo${e.images.length > 1 ? "s" : ""} applied)`;
    } else if (!e.images?.length) msg += " (no verified photo; existing images left as they were)";
    console.log(msg);
  }
  if (unlinked.length) console.log("\nCould not match these destinations to a directory entry (set bookableSlug by hand or add an alias):\n  " + unlinked.join("\n  "));
  console.log("\nDone."); await mongoose.disconnect();
})().catch((e) => { console.error("FAILED:", e); process.exit(1); });