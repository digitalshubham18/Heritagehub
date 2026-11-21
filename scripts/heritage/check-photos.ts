/**
 * Re-checks every stored photo URL still loads (Commons files get renamed or deleted). Broken photos are listed;
 * with --fix they are removed so the site shows an illustration instead of a broken image.  npm run heritage:check [-- --fix]
 */
import mongoose from "mongoose";
import { connectDB } from "../../src/lib/db";
import { HeritageSite } from "../../src/models/heritage";

const CONTACT = process.env.HERITAGE_CONTACT || "";
const UA = `HeritageHub-photo-check/1.0 (${CONTACT || "no-contact-set"})`;
async function alive(url: string) { try { const r = await fetch(url, { method: "HEAD", headers: { "User-Agent": UA }, redirect: "follow" }); return r.ok && (r.headers.get("content-type") || "").startsWith("image/"); } catch { return false; } }

(async () => {
  await connectDB();
  const fix = process.argv.includes("--fix");
  const sites: any[] = await HeritageSite.find({ "images.0": { $exists: true } }).select("slug name images").lean();
  let bad = 0, checked = 0;
  for (const s of sites) {
    const keep: any[] = [];
    for (const im of s.images) { checked++; if (await alive(im.thumbUrl || im.url)) keep.push(im); else { bad++; console.log(`BROKEN ${s.slug}: ${im.thumbUrl || im.url}`); } await new Promise((r) => setTimeout(r, 120)); }
    if (fix && keep.length !== s.images.length) await HeritageSite.updateOne({ _id: s._id }, { $set: { images: keep } });
  }
  console.log(`\nChecked ${checked} photos on ${sites.length} sites: ${bad} broken${fix ? " (removed)" : bad ? " (run with --fix to remove)" : ""}.`);
  await mongoose.disconnect();
})().catch((e) => { console.error(e); process.exit(1); });
