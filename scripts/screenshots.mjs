/**
 * Optional visual review: renders key pages to PNGs with a local Chrome/Chromium.
 *   npm i -D puppeteer-core && CHROME_PATH=/path/to/chrome BASE_URL=http://localhost:3000 node scripts/screenshots.mjs
 * Output goes to ./screenshots. Signs in as the demo accounts (seed first).
 */
import fs from "fs";
import puppeteer from "puppeteer-core";

const BASE = process.env.BASE_URL || "http://localhost:3000";
const exe = process.env.CHROME_PATH; if (!exe) { console.error("Set CHROME_PATH to a Chrome/Chromium binary"); process.exit(2); }
const acct = { admin: ["admin@heritagehub.test", "Admin@123"], staff: ["staff@heritagehub.test", "Staff@123"], tourist: ["tourist@heritagehub.test", "Tourist@123"] };
const shots = [["home", "/"], ["destination", "/destinations/taj-mahal"], ["passes", "/passes"], ["groups", "/groups"], ["tickets", "/dashboard/tickets", "tourist"], ["parking", "/staff/parking", "staff"], ["admin", "/admin", "admin"], ["devices", "/admin/devices", "admin"]];
fs.mkdirSync("screenshots", { recursive: true });
const browser = await puppeteer.launch({ executablePath: exe, headless: "new", args: ["--no-sandbox"] });
const cookies = {};
for (const [name, path, role] of shots) {
  const page = await browser.newPage(); await page.setViewport({ width: 1366, height: 860 });
  if (role) { if (!cookies[role]) { const r = await fetch(BASE + "/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: acct[role][0], password: acct[role][1] }) }); cookies[role] = r.headers.getSetCookie().find((c) => c.startsWith("hh_session=")).split(";")[0].split("=")[1]; } await page.setCookie({ name: "hh_session", value: cookies[role], url: BASE }); }
  await page.goto(BASE + path, { waitUntil: "networkidle2" });
  await page.waitForFunction(() => !document.querySelector(".skeleton, .animate-pulse"), { timeout: 30000 }).catch(() => {});
  await page.screenshot({ path: `screenshots/${name}.png` }); console.log("saved", name); await page.close();
}
await browser.close();
