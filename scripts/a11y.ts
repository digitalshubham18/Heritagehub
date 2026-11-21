/**
 * Automated accessibility scan (axe-core on server-rendered HTML via jsdom) of key pages.
 * It catches labels, landmarks, headings, names, ARIA misuse, lang and similar. It does NOT check colour contrast,
 * keyboard flow or screen-reader behaviour; those need a real browser and manual testing.
 *   BASE_URL=http://localhost:3000 npm run test:a11y
 */
import axe from "axe-core";
import { JSDOM } from "jsdom";

const BASE = process.env.BASE_URL || "http://localhost:3000";
const PAGES = ["/", "/destinations", "/destinations/taj-mahal", "/plan", "/crowd-status", "/passes", "/groups", "/operators", "/login", "/register", "/contact", "/about"];

(async () => {
  let violations = 0;
  for (const p of PAGES) {
    const html = await (await fetch(BASE + p)).text();
    const dom = new JSDOM(html, { runScripts: "outside-only", pretendToBeVisual: true });
    dom.window.eval(axe.source);
    const res: any = await (dom.window as any).axe.run(dom.window.document, { rules: { "color-contrast": { enabled: false }, region: { enabled: true } } });
    console.log(`${res.violations.length ? "FAIL" : "ok  "} ${p}  (${res.passes.length} rules passed)`);
    for (const v of res.violations) { violations++; console.log(`     - [${v.impact}] ${v.id}: ${v.help}\n       ${v.nodes.slice(0, 2).map((n: any) => n.target.join(" ")).join(" | ")}`); }
  }
  console.log(violations ? `\n${violations} violation(s)` : "\nNo automated violations found (contrast and keyboard/screen-reader behaviour not covered).");
  process.exit(violations ? 1 : 0);
})();
