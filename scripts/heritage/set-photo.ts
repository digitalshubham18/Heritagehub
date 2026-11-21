/**
 * Adds a specific Wikimedia Commons photo to one site, after checking its licence.
 *   npm run heritage:photo -- amber-fort "File:Amer Fort Jaipur.jpg"        (adds it as the main photo)
 * Use it for sites the report lists as having no photo. Refuses files that are missing, too small or not freely licensed.
 */
import mongoose from "mongoose";
import { connectDB } from "../../src/lib/db";
import { HeritageSite } from "../../src/models/heritage";
import { verifyCommonsFiles } from "./wiki";

(async () => {
  const [slug, file] = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  if (!slug || !file) { console.error('Usage: npm run heritage:photo -- <site-slug> "File:Name on Commons.jpg"'); process.exit(1); }
  const v = await verifyCommonsFiles([file]);
  const photo = [...v.values()][0];
  if (!photo) { console.error(`Rejected: "${file}" does not exist on Commons, is not a >=800px photo, or does not have a free licence we can credit.`); process.exit(1); }
  await connectDB();
  const site: any = await HeritageSite.findOne({ slug });
  if (!site) { console.error(`No site with slug "${slug}"`); process.exit(1); }
  site.images = [photo, ...site.images.filter((i: any) => i.url !== photo.url)].slice(0, 6);
  await site.save();
  console.log(`Added to ${site.name}: ${photo.license}, by ${photo.author}\n${photo.sourceUrl}`);
  await mongoose.disconnect();
})().catch((e) => { console.error(e); process.exit(1); });
