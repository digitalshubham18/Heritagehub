import { handle, ok, ApiError } from "@/lib/api";
import { Destination } from "@/models";
import { fetchForecast } from "@/lib/weather";
import { clientIp, limit } from "@/lib/ratelimit";

/** Forecast for a destination (?slug=, optional ?date=YYYY-MM-DD for that day's detail). Public; cached 15 minutes; fails soft. */
export const GET = handle(async (req) => {
  await limit("weather", [clientIp(req)], 120, 600);
  const sp = req.nextUrl.searchParams, slug = sp.get("slug");
  if (!slug) throw new ApiError(400, "slug is required");
  const d: any = await Destination.findOne({ slug, active: true }).select("location name").lean();
  if (!d || typeof d.location?.lat !== "number" || typeof d.location?.lng !== "number") throw new ApiError(404, "Destination not found");
  const f = await fetchForecast(d.location.lat, d.location.lng);
  if (!f) return ok({ available: false, days: [] });
  const date = sp.get("date");
  return ok({ available: true, current: f.current, day: date ? f.days.find((x) => x.date === date) || null : null, days: date ? [] : f.days.slice(0, 7) });
});
export const dynamic = "force-dynamic";
