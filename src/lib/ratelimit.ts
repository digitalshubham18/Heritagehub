/**
 * Fixed-window rate limiting stored in MongoDB, so it works across serverless instances.
 * Portable: uses only atomic conditional updates and a unique key (no TTL or partial indexes).
 * Set RATE_LIMIT_DISABLED=true to turn it off (e.g. for load tests).
 */
import type { NextRequest } from "next/server";
import { RateLimit } from "@/models";
import { ApiError } from "./api";

export const clientIp = (req: NextRequest) => (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || req.headers.get("x-real-ip") || "unknown";

/** Counts one hit in the current window and returns the new count and the window end. */
export async function hit(key: string, windowSec: number, now = Date.now()) {
  const resetAt = new Date(now + windowSec * 1000);
  for (let i = 0; i < 3; i++) {
    const live: any = await RateLimit.findOneAndUpdate({ key, resetAt: { $gt: new Date(now) } }, { $inc: { count: 1 } }, { new: true }).lean();
    if (live) return { count: live.count as number, resetAt: live.resetAt as Date };
    const reopened: any = await RateLimit.findOneAndUpdate({ key, resetAt: { $lte: new Date(now) } }, { $set: { count: 1, resetAt } }, { new: true }).lean();
    if (reopened) return { count: 1, resetAt };
    try { await RateLimit.create({ key, count: 1, resetAt }); return { count: 1, resetAt }; } catch (e: any) { if (e?.code !== 11000) throw e; }
  }
  return { count: 1, resetAt };
}

/** Throws a 429 (with Retry-After) when any of the identifiers exceeds `max` hits within `windowSec`. */
export async function limit(name: string, ids: string[], max: number, windowSec: number) {
  if (process.env.RATE_LIMIT_DISABLED === "true") return;
  for (const id of ids) {
    const { count, resetAt } = await hit(`${name}:${id}`, windowSec);
    if (count > max) {
      const secs = Math.max(1, Math.ceil((resetAt.getTime() - Date.now()) / 1000));
      throw new ApiError(429, `Too many attempts. Please try again in ${secs > 90 ? `${Math.ceil(secs / 60)} minutes` : `${secs} seconds`}.`, { "Retry-After": String(secs) });
    }
  }
}
export const clearLimit = (name: string, id: string) => RateLimit.deleteOne({ key: `${name}:${id}` });
