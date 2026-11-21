import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { _size, clearApiCache, dedupe, peek, put, ttlFor } from "@/lib/api-cache";

beforeEach(() => { vi.useFakeTimers(); clearApiCache(); });
afterEach(() => vi.useRealTimers());

describe("api cache", () => {
  it("returns a stored copy while it is fresh, and flags it stale after its time limit", () => {
    put("/api/destinations?x=1", { a: 1 });
    expect(peek("/api/destinations?x=1")).toEqual({ data: { a: 1 }, fresh: true });
    vi.advanceTimersByTime(61_000);
    expect(peek("/api/destinations?x=1")?.fresh).toBe(false);
  });
  it("uses short limits for availability and live data, a long one for the session", () => {
    expect(ttlFor("/api/slots?destination=x&date=2026-12-01")).toBe(15_000);
    expect(ttlFor("/api/crowd?destination=x")).toBe(15_000);
    expect(ttlFor("/api/auth/me")).toBe(300_000);
    expect(ttlFor("/api/heritage?q=taj")).toBe(60_000);
  });
  it("shares one request between simultaneous callers", async () => {
    const fetcher = vi.fn(async () => { await new Promise((r) => setTimeout(r, 10)); return "ok"; });
    const all = Promise.all([dedupe("/u", fetcher), dedupe("/u", fetcher), dedupe("/u", fetcher)]);
    vi.advanceTimersByTime(20);
    expect(await all).toEqual(["ok", "ok", "ok"]);
    expect(fetcher).toHaveBeenCalledTimes(1);
    const again = dedupe("/u", fetcher); // finished, so a new call fetches again
    await vi.advanceTimersByTimeAsync(20); await again;
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it("a failed request is not remembered, so a retry actually retries", async () => {
    await expect(dedupe("/f", async () => { throw new Error("boom"); })).rejects.toThrow("boom");
    expect(await dedupe("/f", async () => "recovered")).toBe("recovered");
  });
  it("clearing (what any login, logout or edit does) removes everything", () => { put("/a", 1); put("/b", 2); clearApiCache(); expect(peek("/a")).toBeNull(); expect(_size()).toBe(0); });
  it("is bounded so a long session cannot grow without limit", () => { for (let i = 0; i < 500; i++) put(`/u${i}`, i); expect(_size()).toBeLessThanOrEqual(200); expect(peek("/u499")).not.toBeNull(); expect(peek("/u0")).toBeNull(); });
  it("peek on null url is a no-op", () => expect(peek(null)).toBeNull());
});
