/**
 * Real, photo-based 3D models (photogrammetry scans, exported as .glb) for specific sites.
 * Put the file in /public/models/ and add one entry here; the site's 3D card then shows the real model instead of the
 * procedural one, with the crowd layer on top. Sites without an entry (or whose file fails to load) keep the procedural model.
 *
 * Only add models whose licence lets you host and show them (CC0, CC BY, or your own scan) and fill in `credit`; it is
 * shown under the 3D card. Export WITHOUT Draco compression (Meshopt-compressed files are fine).
 * Keep files small for phones: aim for under about 15 MB (decimate to 100-300k triangles, 2048px textures).
 */
export type SiteModel = { url: string; credit: string; licence: string; sourceUrl?: string; /** rotate around the vertical axis, in degrees, so the front faces the gate */ rotateY?: number };

export const SITE_MODELS: Record<string, SiteModel> = {
  // Example (uncomment after adding public/models/taj-mahal.glb and filling in the real credit and licence):
  // "taj-mahal": { url: "/models/taj-mahal.glb", credit: "Scan by <author>", licence: "CC BY 4.0", sourceUrl: "https://...", rotateY: 0 },
};
export const modelFor = (slug?: string | null) => (slug && SITE_MODELS[slug]) || null;
