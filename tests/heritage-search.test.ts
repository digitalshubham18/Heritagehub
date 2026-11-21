import { describe, expect, it } from "vitest";
import { buildSearchKey, editDistance, fold, norm, rank, scoreSite, slugify } from "@/lib/heritage-search";

const S = (name: string, extra: any = {}) => ({ name, ...extra });
const SITES = [
  S("Taj Mahal", { city: "Agra", state: "Uttar Pradesh", type: "monument", categories: ["unesco"], popularity: 100 }),
  S("Agra Fort", { city: "Agra", state: "Uttar Pradesh", type: "fort", categories: ["unesco"], popularity: 82 }),
  S("Red Fort (Lal Qila)", { city: "New Delhi", state: "Delhi", type: "fort", aliases: ["Lal Qila", "Lal Quila"], categories: ["unesco"], popularity: 90 }),
  S("Amber Fort", { city: "Jaipur", state: "Rajasthan", type: "fort", aliases: ["Amer Fort", "Amer Palace", "Amber Palace"], categories: ["unesco"] }),
  S("Qutb Minar", { city: "New Delhi", state: "Delhi", type: "archaeological", aliases: ["Qutub Minar", "Kutub Minar"], categories: ["unesco"] }),
  S("Hampi Group of Monuments", { city: "Hampi", state: "Karnataka", type: "archaeological", categories: ["unesco"] }),
  S("Humayun's Tomb", { city: "New Delhi", state: "Delhi", type: "monument", categories: ["unesco"] }),
  S("Jantar Mantar, Delhi", { city: "New Delhi", state: "Delhi", type: "archaeological", categories: ["asi"], asiId: "N-DL-77" }),
  S("Purana Qila", { city: "New Delhi", state: "Delhi", type: "fort", categories: ["asi"] }),
];
const top = (q: string) => rank(q, SITES, 5).items.map((s) => s.name);

describe("normalisation", () => {
  it("folds accents, case and punctuation", () => expect(norm("Qutb Minār (Delhi)")).toBe("qutb minar delhi"));
  it("folds common spelling variants together", () => { expect(fold("Qutub")).toBe(fold("Kutub")); expect(fold("Khajuraho")).toBe(fold("Kajuraho")); });
  it("slugifies", () => expect(slugify("Humayun's Tomb, Delhi")).toBe("humayun-s-tomb-delhi"));
  it("edit distance respects the cap", () => { expect(editDistance("amber", "amer", 2)).toBe(1); expect(editDistance("abcdef", "uvwxyz", 2)).toBeGreaterThan(2); });
});

describe("search finds the exact heritage", () => {
  it("exact name wins", () => expect(top("taj mahal")[0]).toBe("Taj Mahal"));
  it("old/alternate spellings find the site (the 'Amer' vs 'Amber' miss)", () => { expect(top("amer fort")[0]).toBe("Amber Fort"); expect(top("amber palace")[0]).toBe("Amber Fort"); });
  it("spelling variants of Qutb Minar all work", () => { for (const q of ["qutub minar", "kutub minar", "qutb minar", "Qutab Minar"]) expect(top(q)[0]).toBe("Qutb Minar"); });
  it("Hindi-style name via alias", () => expect(top("lal qila")[0]).toBe("Red Fort (Lal Qila)"));
  it("one-letter typo", () => expect(top("humayun tomb")[0]).toBe("Humayun's Tomb"));
  it("partial typing still finds it", () => expect(top("qut")[0]).toBe("Qutb Minar"));
  it("single word brand name", () => expect(top("hampi")[0]).toBe("Hampi Group of Monuments"));
  it("every word must match: 'red fort delhi' does not return every fort", () => { const r = top("red fort delhi"); expect(r[0]).toBe("Red Fort (Lal Qila)"); expect(r).not.toContain("Agra Fort"); });
  it("matches by city and by ASI id", () => { expect(top("agra").sort()).toEqual(["Agra Fort", "Taj Mahal"]); expect(top("N-DL-77")[0]).toBe("Jantar Mantar, Delhi"); });
  it("unrelated text returns nothing rather than junk", () => expect(top("zzzz qwerty")).toEqual([]));
  it("flags an exact match for 'did you mean' UI", () => { expect(rank("taj mahal", SITES).exact?.name).toBe("Taj Mahal"); expect(rank("fort", SITES).exact).toBeNull(); });
  it("search key contains aliases", () => expect(buildSearchKey(SITES[3])).toContain("amer palace"));
  it("empty query scores zero", () => expect(scoreSite("  ", SITES[0])).toBe(0));
});

import { sizeThumb } from "@/lib/heritage-search";
describe("sizeThumb", () => {
  it("asks Wikimedia for a smaller rendition for cards", () => expect(sizeThumb("https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/Taj.jpg/1280px-Taj.jpg", 640)).toBe("https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/Taj.jpg/640px-Taj.jpg"));
  it("leaves other URLs and empty values alone", () => { expect(sizeThumb("https://example.com/1280px-x.jpg", 640)).toBe("https://example.com/1280px-x.jpg"); expect(sizeThumb(undefined, 640)).toBeUndefined(); });
});
