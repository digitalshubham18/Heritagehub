export type HeritageRow = { slug: string; name: string; aliases: string[]; city: string; state: string; type: string; categories: string[]; asiId?: string; unescoYear?: number; summary: string; popularity: number; bookableSlug?: string; image?: any };
const box = globalThis as unknown as { _hh?: { at: number; rows: HeritageRow[] | null } };
export const store = (box._hh ??= { at: 0, rows: null });
/** Call after the directory changes (e.g. a site becomes bookable) so the next search sees it immediately. */
export function clearHeritageCache() { store.at = 0; store.rows = null; }
