import { describe, expect, it } from "vitest";
import { parseCsv, parseClosedDays, rowToDestination } from "../scripts/heritage/booking-rows";

const SITE = { slug: "amber-fort", name: "Amber Fort", city: "Jaipur", state: "Rajasthan", type: "fort", summary: "A hilltop fort of red sandstone and marble above Maota Lake.", location: { lat: 26.9855, lng: 75.8513 }, images: [{ url: "https://upload.wikimedia.org/a.jpg", thumbUrl: "https://upload.wikimedia.org/a-1280.jpg" }] };
const ROW = { slug: "amber-fort", open: "8:00", close: "17:30", closed_days: "", indian_price: "100", foreign_price: "500", child_price: "", capacity_per_slot: "400" };

describe("csv", () => {
  it("reads quoted fields, embedded commas and newlines, and CRLF", () => {
    const r = parseCsv('slug,name,state\r\namber-fort,"Amber, Fort ""Amer""","Rajasthan"\r\n\r\nx,"two\nlines",Delhi\r\n');
    expect(r).toEqual([{ slug: "amber-fort", name: 'Amber, Fort "Amer"', state: "Rajasthan" }, { slug: "x", name: "two\nlines", state: "Delhi" }]);
  });
  it("ignores a BOM from Excel", () => expect(parseCsv("\uFEFFslug,open\na,9:00")[0].slug).toBe("a"));
});
describe("closed days", () => {
  it("accepts names, numbers and separators", () => { expect(parseClosedDays("Fri")).toEqual([5]); expect(parseClosedDays("Mon; Tuesday")).toEqual([1, 2]); expect(parseClosedDays("0,6")).toEqual([0, 6]); expect(parseClosedDays("none")).toEqual([]); expect(parseClosedDays("")).toEqual([]); });
  it("rejects nonsense", () => { expect(parseClosedDays("Funday")).toBeNull(); expect(parseClosedDays("9")).toBeNull(); });
});
describe("row to destination", () => {
  it("builds a valid destination in paise, with the directory's details", () => {
    const r = rowToDestination(ROW, SITE); expect(r.ok).toBe(true); if (!r.ok) return;
    expect(r.data).toMatchObject({ slug: "amber-fort", hours: { open: "08:00", close: "17:30", closedDays: [] }, defaultSlotCapacity: 400, occupancyLimit: 2000, heritageSlug: "amber-fort", location: { lat: 26.9855, lng: 75.8513 } });
    expect(r.data.categories).toEqual([{ name: "Indian citizen", audience: "indian", priceMinor: 10000, feeMinor: 0 }, { name: "Foreign visitor", audience: "foreign", priceMinor: 50000, feeMinor: 0 }]);
    expect(r.data.images).toEqual(["https://upload.wikimedia.org/a-1280.jpg"]);
  });
  it("accepts a free site (price 0) and rupee signs", () => { const r = rowToDestination({ ...ROW, indian_price: "₹0", foreign_price: "" }, SITE); expect(r.ok && r.data.categories).toHaveLength(1); });
  it("never invents the numbers that matter: price, hours and capacity are required", () => {
    for (const k of ["indian_price", "open", "close", "capacity_per_slot"]) { const r = rowToDestination({ ...ROW, [k]: "" }, SITE); expect(r.ok, k).toBe(false); }
  });
  it("rejects bad input with a readable reason", () => {
    expect(rowToDestination({ ...ROW, open: "18:00" }, SITE)).toMatchObject({ ok: false, error: expect.stringContaining("later") });
    expect(rowToDestination({ ...ROW, indian_price: "abc" }, SITE).ok).toBe(false);
    expect(rowToDestination({ ...ROW, capacity_per_slot: "0" }, SITE).ok).toBe(false);
    expect(rowToDestination({ ...ROW, closed_days: "Blursday" }, SITE).ok).toBe(false);
    expect(rowToDestination({ ...ROW, indian_price: "-5" }, SITE).ok).toBe(false);
  });
  it("needs a map position, from the directory or from lat/lng columns", () => {
    const noLoc = { ...SITE, location: undefined };
    expect(rowToDestination(ROW, noLoc)).toMatchObject({ ok: false, error: expect.stringContaining("map position") });
    expect(rowToDestination({ ...ROW, lat: "26.98", lng: "75.85" }, noLoc).ok).toBe(true);
  });
});
