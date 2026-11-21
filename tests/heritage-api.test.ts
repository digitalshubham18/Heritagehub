import { beforeAll, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

// Only the database layer is mocked; the route's real filtering, ranking, paging and facet code runs.
const docs = [
  { slug: "taj-mahal", name: "Taj Mahal", aliases: [], city: "Agra", state: "Uttar Pradesh", type: "monument", categories: ["unesco", "asi"], unesco: { year: 1983 }, summary: "Ivory-white marble mausoleum.", popularity: 100, bookableSlug: "taj-mahal", images: [{ url: "https://upload.wikimedia.org/a.jpg", thumbUrl: "https://upload.wikimedia.org/a-1280.jpg", author: "Jane", license: "CC BY-SA 4.0" }] },
  { slug: "amber-fort", name: "Amber Fort", aliases: ["Amer Fort", "Amer Palace"], city: "Jaipur", state: "Rajasthan", type: "fort", categories: ["unesco"], unesco: { year: 2013 }, summary: "", popularity: 80, images: [] },
  { slug: "qutb-minar", name: "Qutb Minar", aliases: ["Qutub Minar"], city: "New Delhi", state: "Delhi", type: "archaeological", categories: ["unesco", "asi"], popularity: 90, images: [] },
  { slug: "purana-qila", name: "Purana Qila", aliases: [], city: "New Delhi", state: "Delhi", type: "fort", categories: ["asi"], popularity: 0, images: [{ url: "https://upload.wikimedia.org/p.jpg" }] },
  ...Array.from({ length: 30 }, (_, i) => ({ slug: `tomb-${i}`, name: `Village Tomb ${i}`, aliases: [], city: "Hisar", state: "Haryana", type: "monument", categories: ["asi"], popularity: 0, images: [] })),
];
vi.mock("@/lib/db", () => ({ connectDB: async () => ({}) }));
vi.mock("@/lib/monitor", () => ({ reportError: async () => {} }));
vi.mock("@/models/heritage", () => ({ HeritageSite: { find: () => ({ select: () => ({ lean: async () => docs }) }) } }));

let GET: (req: NextRequest, ctx?: any) => Promise<Response>;
beforeAll(async () => { GET = (await import("@/app/api/heritage/route")).GET as any; });
const call = async (qs: string) => { const r = await GET(new NextRequest(`http://x/api/heritage?${qs}`), {}); return { status: r.status, body: await r.json() }; };

describe("GET /api/heritage", () => {
  it("finds 'Amer Fort' even though the site is stored as Amber Fort", async () => { const { body } = await call("q=amer%20fort"); expect(body.items[0].slug).toBe("amber-fort"); expect(body.exactSlug).toBe("amber-fort"); });
  it("finds Qutub Minar by an alternate spelling", async () => expect((await call("q=qutub%20minar")).body.items[0].slug).toBe("qutb-minar"));
  it("returns the photo credit with each result", async () => { const it = (await call("q=taj")).body.items[0]; expect(it.image).toMatchObject({ url: "https://upload.wikimedia.org/a-1280.jpg", author: "Jane", license: "CC BY-SA 4.0" }); expect(it.unescoYear).toBe(1983); expect(it.bookableSlug).toBe("taj-mahal"); });
  it("lists UNESCO sites first when there is no query", async () => expect((await call("limit=3")).body.items.map((i: any) => i.slug)).toEqual(["taj-mahal", "qutb-minar", "amber-fort"]));
  it("filters by state, category and photo availability", async () => {
    expect((await call("state=delhi")).body.items.map((i: any) => i.slug).sort()).toEqual(["purana-qila", "qutb-minar"]);
    expect((await call("category=unesco")).body.total).toBe(3);
    expect((await call("hasPhoto=true")).body.items.map((i: any) => i.slug).sort()).toEqual(["purana-qila", "taj-mahal"]);
  });
  it("paginates and caps the page size", async () => { const p2 = (await call("category=asi&limit=10&page=2")).body; expect(p2.items).toHaveLength(10); expect(p2.pages).toBe(4); expect((await call("limit=9999")).body.items.length).toBeLessThanOrEqual(34); });
  it("returns facets (states, counts) on request", async () => { const f = (await call("limit=1&facets=1")).body.facets; expect(f).toMatchObject({ totalSites: 34, unesco: 3, withPhoto: 2 }); expect(f.states.find((s: any) => s.name === "Haryana").count).toBe(30); });
  it("returns an empty list, not an error, for no match", async () => { const r = await call("q=zzzz%20qqqq"); expect(r.status).toBe(200); expect(r.body.items).toEqual([]); expect(r.body.total).toBe(0); });
  it("survives junk input", async () => { for (const qs of ["page=-4&limit=abc", "q=%00%27%24ne", "q=" + "a".repeat(5000)]) expect((await call(qs)).status).toBe(200); });
});
