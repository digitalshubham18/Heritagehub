import mongoose from "mongoose";
import { connectDB } from "../../src/lib/db";
import { Destination } from "../../src/models";
import { HeritageSite } from "../../src/models/heritage";

(async () => {
  const [destSlug, herSlug] = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  if (!destSlug || !herSlug) { console.error("Usage: link-booking.ts <destination-slug> <heritage-slug> [--keep-destination-photos]"); process.exit(1); }
  await connectDB();
  const dest: any = await Destination.findOne({ slug: destSlug });
  if (!dest) { console.error(`No destination with slug "${destSlug}". Your destinations: ${(await Destination.find({}).select("slug").lean() as any[]).map((d) => d.slug).join(", ")}`); process.exit(1); }
  const site: any = await HeritageSite.findOne({ slug: herSlug, active: true });
  if (!site) { console.error(`No heritage entry "${herSlug}". Find it with: npx tsx scripts/heritage/find.ts "<name>"`); process.exit(1); }
  if (site.bookableSlug && site.bookableSlug !== destSlug) { console.error(`"${site.name}" is already linked to destination "${site.bookableSlug}".`); process.exit(1); }
  await HeritageSite.updateMany({ bookableSlug: destSlug, slug: { $ne: herSlug } }, { $unset: { bookableSlug: 1 } });
  site.bookableSlug = destSlug; site.popularity = 100; await site.save();
  let msg = `Linked "${dest.name}" -> "${site.name}" (${site.slug}).`;
  if (!process.argv.includes("--keep-destination-photos") && site.images?.length) {
    dest.images = site.images.map((i: any) => i.thumbUrl || i.url);
    dest.imageCredits = site.images.map((i: any) => ({ url: i.thumbUrl || i.url, author: i.author, license: i.license, licenseUrl: i.licenseUrl, sourceUrl: i.sourceUrl }));
    await dest.save(); msg += ` ${site.images.length} verified photo(s) applied.`;
  } else if (!site.images?.length) msg += " That entry has no verified photo, so the destination's own images were left alone.";
  console.log(msg + "\nThe website's search list refreshes within 5 minutes (or restart the server).");
  await mongoose.disconnect();
})().catch((e) => { console.error(e); process.exit(1); });