import fs from "fs";
import path from "path";
import { rank } from "../../src/lib/heritage-search";

const file = path.resolve(process.cwd(), "data/heritage-catalogue.json");
if (!fs.existsSync(file)) { console.error("data/heritage-catalogue.json not found. Run: npm run heritage:build"); process.exit(1); }
const sites: any[] = JSON.parse(fs.readFileSync(file, "utf8")).sites;
const args = process.argv.slice(2);
const line = (s: any) => `${s.slug}\t${s.name}\t${s.state || "-"}${s.unesco ? `\tUNESCO ${s.unesco.id}${s.unesco.year ? ` (${s.unesco.year})` : ""}` : ""}${s.images?.length ? "" : "\t(no photo)"}`;
if (args.includes("--unesco")) {
  const u = sites.filter((s) => s.unesco).sort((a, b) => Number(a.unesco.id.replace(/\D/g, "")) - Number(b.unesco.id.replace(/\D/g, "")));
  u.forEach((s) => console.log(line(s))); console.log(`\n${u.length} UNESCO sites`);
} else {
  const q = args.filter((a) => !a.startsWith("--")).join(" ");
  if (!q) { console.error('Usage: npx tsx scripts/heritage/find.ts "red fort"  |  --unesco'); process.exit(1); }
  const { items } = rank(q, sites, 8);
  if (!items.length) console.log("No match. Try fewer words, or another spelling.");
  items.forEach((s) => console.log(line(s)));
}