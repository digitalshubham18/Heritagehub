/**
 * Minimal error reporting to Sentry over HTTPS (no SDK). Set SENTRY_DSN to enable; otherwise errors are only logged.
 * Best-effort: reporting failures never affect the request.
 */
import crypto from "crypto";

export async function reportError(err: unknown, ctx: Record<string, unknown> = {}) {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) return;
  try {
    const u = new URL(dsn);
    const project = u.pathname.replace(/^\//, "");
    const e = err instanceof Error ? err : new Error(String(err));
    const id = crypto.randomUUID().replace(/-/g, "");
    const event = {
      event_id: id, timestamp: Date.now() / 1000, platform: "node", level: "error", environment: process.env.VERCEL_ENV || process.env.NODE_ENV,
      exception: { values: [{ type: e.name, value: e.message, stacktrace: { frames: (e.stack || "").split("\n").slice(1, 15).reverse().map((l) => ({ filename: l.trim() })) } }] },
      extra: ctx,
    };
    const body = [JSON.stringify({ event_id: id, sent_at: new Date().toISOString(), dsn }), JSON.stringify({ type: "event" }), JSON.stringify(event)].join("\n");
    await fetch(`${u.protocol}//${u.host}/api/${project}/envelope/?sentry_key=${u.username}&sentry_version=7`, {
      method: "POST", headers: { "Content-Type": "application/x-sentry-envelope" }, body, signal: AbortSignal.timeout(3000),
    });
  } catch { /* ignore */ }
}
