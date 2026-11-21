import crypto from "crypto";
import { LostFoundItem } from "@/models";

export const LF_CATEGORIES = ["bag", "phone", "wallet", "documents", "keys", "clothing", "jewellery", "child_item", "electronics", "other"] as const;
export const lfRef = () => `LF-${Array.from(crypto.randomBytes(5)).map((x) => "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"[x % 32]).join("")}`;
const STOP = new Set(["the", "a", "an", "and", "of", "with", "in", "on", "at", "near", "my", "i", "lost", "found", "black", "small", "big", "large"]);
const tokens = (s: string) => new Set(String(s || "").toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 2 && !STOP.has(w)));
/** 0 to 100: how likely a found item and a lost report describe the same thing (shared words, category, colour). Used only to suggest candidates; staff confirm. */
export function matchScore(a: { category?: string; description?: string; color?: string }, b: { category?: string; description?: string; color?: string }) {
  let score = 0;
  if (a.category && a.category === b.category && a.category !== "other") score += 35;
  if (a.color && b.color && a.color.trim().toLowerCase() === b.color.trim().toLowerCase()) score += 20;
  const ta = tokens(a.description || ""), tb = tokens(b.description || "");
  if (ta.size && tb.size) { let n = 0; ta.forEach((w) => tb.has(w) && n++); score += Math.min(45, Math.round((n / Math.min(ta.size, tb.size)) * 45)); }
  return Math.min(100, score);
}
export async function suggestMatches(item: any) {
  const other: any[] = await LostFoundItem.find({ destination: item.destination, kind: item.kind === "found" ? "lost" : "found", status: "open", _id: { $ne: item._id } }).sort({ createdAt: -1 }).limit(100).lean();
  return other.map((o) => ({ item: o, score: matchScore(item, o) })).filter((x) => x.score >= 40).sort((a, b) => b.score - a.score).slice(0, 5);
}
