import { describe, expect, it } from "vitest";
import { cleanCatalogue, fileNameFromUrl, guessType, isWholeSiteId, licenseOk, looksLikePhoto, parseAsiList, plain, stateFromAsiId } from "../scripts/heritage/parse";

// NOTE: this HTML is a hand-written fixture shaped like Wikipedia's list tables. It proves the parser logic, not that
// every live page has this exact layout; build-catalogue prints sample rows for a human check on the first run.
const HTML = `<table class="wikitable"><tr><th>Image</th><th>Identifier</th><th>Name</th><th>Location</th></tr>
<tr><td><img src="//upload.wikimedia.org/wikipedia/commons/thumb/b/bd/Qutb_Minar%2C_Delhi.jpg/120px-Qutb_Minar%2C_Delhi.jpg"></td><td>N-DL-1</td><td><a href="/wiki/Qutb_Minar">Qutb Minar</a> and its Monuments[1]</td><td>Mehrauli</td><td><span class="geo">28.5245; 77.1855</span></td></tr>
<tr><td></td><td>N-DL-77</td><td><a href="/wiki/Jantar_Mantar,_New_Delhi" class="new">Jantar Mantar</a></td><td>Connaught Place</td></tr>
<tr><td>no id here</td><td>Some Tomb</td></tr></table>`;

describe("ASI list parser", () => {
  const rows = parseAsiList(HTML, "Delhi");
  it("finds rows by ASI id and skips header and id-less rows", () => expect(rows.map((r) => r.asiId)).toEqual(["N-DL-1", "N-DL-77"]));
  it("extracts name (without footnote marks), location, article, coordinates and image file", () =>
    expect(rows[0]).toMatchObject({ name: "Qutb Minar and its Monuments", location: "Mehrauli", wikipediaTitle: "Qutb Minar", lat: 28.5245, lng: 77.1855, imageFile: "Qutb Minar, Delhi.jpg", state: "Delhi" }));
  it("ignores red links (articles that do not exist)", () => expect(rows[1].wikipediaTitle).toBeUndefined());
});

describe("helpers", () => {
  it("guesses a type from the name", () => { expect(guessType("Amer Fort")).toBe("fort"); expect(guessType("Brihadisvara Temple")).toBe("temple"); expect(guessType("National Museum")).toBe("museum"); expect(guessType("Ajanta Caves")).toBe("archaeological"); expect(guessType("Humayun's Tomb")).toBe("monument"); });
  it("reads the file name from thumb and original URLs", () => { expect(fileNameFromUrl("https://upload.wikimedia.org/wikipedia/commons/a/ab/Taj_Mahal.jpg")).toBe("Taj Mahal.jpg"); expect(fileNameFromUrl("https://example.com/x.jpg")).toBeNull(); });
  it("only accepts licences we can show with credit", () => {
    for (const ok of ["CC BY-SA 4.0", "CC BY 2.0", "CC0", "Public domain", "CC-BY-SA-3.0"]) expect(licenseOk(ok)).toBe(true);
    for (const bad of ["CC BY-NC 4.0", "CC BY-ND 2.0", "Fair use", "", undefined, "All rights reserved", "Unknown"]) expect(licenseOk(bad as any)).toBe(false);
  });
  it("cleans credit HTML", () => expect(plain('<a href="x">Jane &amp; Co</a> <span>2020</span>')).toBe("Jane & Co 2020"));
  it("filters out maps/logos/svg", () => { expect(looksLikePhoto("Taj Mahal.jpg")).toBe(true); expect(looksLikePhoto("Agra locator map.png")).toBe(false); expect(looksLikePhoto("Flag of India.svg")).toBe(false); });
});

describe("state and UNESCO id helpers", () => {
  it("reads the state from an ASI id", () => { expect(stateFromAsiId("N-TN-C1")).toBe("Tamil Nadu"); expect(stateFromAsiId("N-DL-77")).toBe("Delhi"); expect(stateFromAsiId("N-UP-A12")).toBe("Uttar Pradesh"); expect(stateFromAsiId("N-XX-1")).toBeUndefined(); });
  it("keeps whole-site UNESCO ids and drops parts of serial sites", () => { for (const ok of ["252", "1111bis", "26", "1321rev"]) expect(isWholeSiteId(ok)).toBe(true); for (const part of ["252-001", "1111-007", "ND", ""]) expect(isWholeSiteId(part)).toBe(false); });
});

describe("cleanCatalogue", () => {
  const mk = (o: any) => ({ slug: o.name, aliases: [], categories: [], state: "", summary: "", images: [], ...o });
  it("merges UNESCO 944 / 944bis / 944ter into one Mountain Railways entry", () => {
    const r = cleanCatalogue([mk({ name: "Mountain Railways of India", categories: ["unesco"], unesco: { id: "944bis" } }), mk({ name: "Mountain Railways of India", categories: ["unesco"], unesco: { id: "944" } }), mk({ name: "Mountain Railways of India", categories: ["unesco"], unesco: { id: "944ter" } })]);
    expect(r.sites).toHaveLength(1); expect(r.sites[0].unesco!.id).toBe("944"); expect(r.sites[0].state).toBe("Multiple states");
  });
  it("folds an ASI monument that is the same place into the UNESCO entry, keeping both ids", () => {
    const r = cleanCatalogue([mk({ name: "Humayun's Tomb", categories: ["unesco"], unesco: { id: "232" } }), mk({ name: "Humayun’s tomb", categories: ["asi"], asiId: "N-DL-120", state: "Delhi", images: [{ url: "u" }] }), mk({ name: "Purana Qila", categories: ["asi"], asiId: "N-DL-9" })]);
    expect(r.sites.map((s) => s.name)).toEqual(["Humayun's Tomb", "Purana Qila"]);
    expect(r.sites[0]).toMatchObject({ asiId: "N-DL-120", categories: ["unesco", "asi"], state: "Delhi" }); expect(r.sites[0].images).toHaveLength(1);
  });
  it("gives blank-state UNESCO sites their state, and leaves ordinary ones alone", () => {
    const r = cleanCatalogue([mk({ name: "Group of monuments at Mahabalipuram", categories: ["unesco"], unesco: { id: "249" } }), mk({ name: "Taj Mahal", categories: ["unesco"], unesco: { id: "252" }, state: "Uttar Pradesh" })]);
    expect(r.sites.map((s) => s.state)).toEqual(["Tamil Nadu", "Uttar Pradesh"]);
  });
  it("does not merge unrelated or very short names", () => { const r = cleanCatalogue([mk({ name: "Agra Fort", categories: ["unesco"], unesco: { id: "251" } }), mk({ name: "Fort", categories: ["asi"], asiId: "N-UP-1" })]); expect(r.sites).toHaveLength(2); });
});