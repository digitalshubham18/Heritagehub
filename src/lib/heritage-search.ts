/**
 * Search helpers for the heritage directory (pure functions, no DB).
 *
 * Goals: a visitor typing "qutub minar", "Kutb Minar", "amer fort", "hampi" or "taj" finds the exact site, whichever
 * spelling they use. We do that with (1) accent/punctuation folding, (2) a light Indian-English spelling fold,
 * (3) aliases (old names, alternate spellings, Wikipedia redirects) and (4) a small typo tolerance.
 */

export type SearchableSite = {
  name: string; aliases?: string[]; city?: string; state?: string; type?: string; categories?: string[]; asiId?: string;
};

const STOP = new Set(["the", "of", "and", "in", "at", "a", "to"]);

/** Lowercase, strip accents and punctuation, collapse spaces. "Qutb Minār (Delhi)" -> "qutb minar delhi". */
export function norm(s: string): string {
  return (s || "")
    .normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");
}

/** Folds common Indian-English spelling variation so "qutub"/"qutb"/"kutub" and "mahal"/"mehal" land close together. */
export function fold(s: string): string {
  return norm(s)
    .replace(/q/g, "k").replace(/ck/g, "k").replace(/ph/g, "f").replace(/w/g, "v").replace(/z/g, "j")
    .replace(/ee/g, "i").replace(/oo/g, "u").replace(/aa/g, "a").replace(/ou/g, "u")
    .replace(/(.)\1+/g, "$1")          // double letters: "stuppa" -> "stupa"
    .replace(/(?<=[a-z])h(?=[ ]|$)/g, "") // trailing h: "durgah" -> "durga", "mahalh" no-op
    .replace(/([bcdfgjklmnprstv])h/g, "$1"); // "bh","dh","kh","th","gh" -> plain consonant: "khajuraho" -> "kajuraho"
}

export const tokens = (s: string) => fold(s).split(" ").filter((t) => t && !STOP.has(t));

/** Levenshtein distance, bailing out early once it exceeds `max`. */
export function editDistance(a: string, b: string, max = 2): number {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i]; let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (cur[j] < rowMin) rowMin = cur[j];
    }
    if (rowMin > max) return max + 1;
    prev = cur;
  }
  return prev[b.length];
}

/** Text we index per site: everything a person might type to find it. */
export function buildSearchKey(s: SearchableSite): string {
  return [s.name, ...(s.aliases || []), s.city, s.state, s.type, ...(s.categories || []), s.asiId].filter(Boolean).map((x) => norm(String(x))).join(" | ");
}

function tokenScore(qt: string, words: string[], nameWords: string[]): number {
  if (nameWords.includes(qt)) return 6;                       // whole word in the name
  if (words.includes(qt)) return 4;                           // whole word in an alias / place / type
  if (qt.length >= 3 && nameWords.some((w) => w.startsWith(qt))) return 3.5; // typing in progress: "qut" -> "qutb"
  if (qt.length >= 3 && words.some((w) => w.startsWith(qt))) return 2.5;
  if (qt.length >= 4 && words.some((w) => w.includes(qt))) return 1.5;
  const tol = qt.length >= 8 ? 2 : qt.length >= 4 ? 1 : 0;      // typo tolerance, scaled to word length
  if (tol) {
    let best = tol + 1;
    for (const w of words) { const d = editDistance(qt, w, tol); if (d < best) best = d; }
    if (best <= tol) return best === 1 ? 2 : 1;
  }
  return 0;
}

/**
 * Scores one site against a query. Every query word must match something (AND), otherwise 0, so "red fort delhi"
 * never returns every fort. Exact name or alias matches rank far above partial ones.
 */
export function scoreSite(query: string, s: SearchableSite): number {
  const qt = tokens(query);
  if (!qt.length) return 0;
  const names = [s.name, ...(s.aliases || [])];
  const nameWords = names.flatMap(tokens);
  const words = [...nameWords, ...[s.city, s.state, s.type, s.asiId, ...(s.categories || [])].filter(Boolean).flatMap((x) => tokens(String(x)))];
  let total = 0;
  for (const t of qt) { const sc = tokenScore(t, words, nameWords); if (!sc) return 0; total += sc; }
  const qf = fold(query), exact = names.some((n) => fold(n) === qf);
  if (exact) total += 100;
  else if (names.some((n) => fold(n).startsWith(qf))) total += 10;
  else if (names.some((n) => fold(n).includes(qf))) total += 5;
  return total;
}

export function rank<T extends SearchableSite & { popularity?: number }>(query: string, sites: T[], limit = 50): { items: T[]; exact: T | null } {
  const scored = sites.map((s) => ({ s, sc: scoreSite(query, s) })).filter((x) => x.sc > 0);
  scored.sort((a, b) => b.sc - a.sc || (b.s.popularity || 0) - (a.s.popularity || 0) || a.s.name.localeCompare(b.s.name));
  const top = scored[0];
  return { items: scored.slice(0, limit).map((x) => x.s), exact: top && top.sc >= 100 ? top.s : null };
}

export const slugify = (s: string) => norm(s).replace(/ /g, "-").slice(0, 80) || "site";

/**
 * Wikimedia thumbnail URLs end in "/1280px-File.jpg". Cards are only ~400px wide, so ask for a smaller rendition
 * (roughly a quarter of the bytes). Only Wikimedia's standard sizes are used, which is what its servers expect.
 */
export function sizeThumb(url: string | undefined, width: 320 | 640 | 800 | 1280): string | undefined {
  if (!url) return url;
  return /\/\d+px-[^/]+$/.test(url) && url.includes("upload.wikimedia.org") ? url.replace(/\/\d+px-([^/]+)$/, `/${width}px-$1`) : url;
}
